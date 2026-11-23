"use client";

// Questionnaire template admin. Templates are versioned: the ACTIVE one is
// read-only; changes are made on a cloned DRAFT and take effect when it is
// activated (the previous version retires). Applications keep the snapshot
// of the version they were opened on, so editing never rescores old ones.

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { csmFetch, fmtDate, label, type CsmMeta, type Question, type Section, type Template } from "@/lib/csm/api";
import { EmptyRow, ErrorBox, Field, Pill } from "./shared";

export function TemplatesView({ meta }: { meta: CsmMeta | null }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await csmFetch<{ items: Template[] }>("/api/csm/templates")).items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load templates");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function open(t: Template) {
    try {
      setEditing(await csmFetch<Template>(`/api/csm/templates/${t.id}`));
    } catch (e: any) {
      toast({ variant: "error", title: "Could not open", description: e?.message });
    }
  }

  async function post(path: string, json: unknown, ok: string) {
    try {
      const r = await csmFetch<Template>(path, { method: "POST", json });
      toast({ variant: "success", title: ok });
      await load();
      return r;
    } catch (e: any) {
      toast({ variant: "error", title: "Request failed", description: e?.message });
      return null;
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-600">The active questionnaire is used for every new application and renewal. Editing needs corporate (all-plant) CSM rights.</p>
        <Button size="sm" className="ml-auto" onClick={() => setEditing({ id: "", code: "", version: 0, name: "", description: "", status: "DRAFT", passScore: 70, conditionalScore: 55,
          validityMonths: 12, conditionalValidityMonths: 6, sectionCount: 0, questionCount: 0, activatedAt: null, updatedAt: null, sections: [] })}>
          <Plus size={14} /> New questionnaire
        </Button>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[900px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow><TableHead>Questionnaire</TableHead><TableHead>Version</TableHead><TableHead>Status</TableHead><TableHead>Sections / questions</TableHead><TableHead>Pass / conditional</TableHead><TableHead>Validity</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell><div className="font-medium">{t.name}</div><div className="text-[11px] text-slate-500">{t.code}</div></TableCell>
                <TableCell>v{t.version}</TableCell>
                <TableCell><Pill value={t.status} />{t.activatedAt && <div className="text-[11px] text-slate-500">{fmtDate(t.activatedAt)}</div>}</TableCell>
                <TableCell className="tabular-nums">{t.sectionCount} / {t.questionCount}</TableCell>
                <TableCell className="tabular-nums">{t.passScore} / {t.conditionalScore}</TableCell>
                <TableCell className="text-xs">{t.validityMonths} mo (conditional {t.conditionalValidityMonths} mo)</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => open(t)}>{t.status === "DRAFT" ? "Edit" : "View"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => post("/api/csm/templates", { name: `${t.name}`, cloneFromId: t.id }, "New draft version created")}><Copy size={13} /> New version</Button>
                    {t.status === "DRAFT" && (
                      <Button size="sm" onClick={async () => {
                        if (await confirmDialog({ title: `Activate ${t.name} v${t.version}?`, description: "New applications will use it; the current active version of this questionnaire retires." }))
                          post(`/api/csm/templates/${t.id}/activate`, null, "Activated");
                      }}>Activate</Button>
                    )}
                    {t.status === "ACTIVE" && (
                      <Button size="sm" variant="ghost" className="text-rose-700" onClick={async () => {
                        if (await confirmDialog({ title: `Retire ${t.name} v${t.version}?`, description: "With no active questionnaire, contractors cannot be registered.", destructive: true }))
                          post(`/api/csm/templates/${t.id}/retire`, null, "Retired");
                      }}>Retire</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !error && <EmptyRow text="No questionnaires. Run prisma/apply-csm-ddl.ts to seed the default steel-plant one." />}
      </div>
      {editing && <TemplateEditor t={editing} meta={meta} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

const bandsToText = (b?: { max: number | null; score: number }[]) => (b ?? []).map((x) => `${x.max === null ? "*" : x.max}:${x.score}`).join("; ");
function textToBands(s: string): { max: number | null; score: number }[] | undefined {
  const parts = s.split(";").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return undefined;
  return parts.map((p) => {
    const [m, sc] = p.split(":").map((x) => x.trim());
    return { max: m === "*" || m === "" ? null : Number(m), score: Number(sc) };
  });
}

function TemplateEditor({ t, meta, onClose, onSaved }: { t: Template; meta: CsmMeta | null; onClose: () => void; onSaved: () => void }) {
  const readOnly = t.status !== "DRAFT";
  const [head, setHead] = useState({ name: t.name, description: t.description ?? "", passScore: String(t.passScore), conditionalScore: String(t.conditionalScore),
                                     validityMonths: String(t.validityMonths), conditionalValidityMonths: String(t.conditionalValidityMonths) });
  const [sections, setSections] = useState<Section[]>(() => JSON.parse(JSON.stringify(t.sections ?? [])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = sections.reduce((s, x) => s + Number(x.weight || 0), 0);

  const upd = (si: number, patch: Partial<Section>) => setSections(sections.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  const updQ = (si: number, qi: number, patch: Partial<Question>) =>
    upd(si, { questions: sections[si].questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) });
  const move = <T,>(arr: T[], i: number, d: number) => { const a = [...arr]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); return a; };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const json = { name: head.name, description: head.description || null, sections, passScore: Number(head.passScore), conditionalScore: Number(head.conditionalScore),
                     validityMonths: Number(head.validityMonths), conditionalValidityMonths: Number(head.conditionalValidityMonths) };
      await csmFetch(t.id ? `/api/csm/templates/${t.id}` : "/api/csm/templates", { method: t.id ? "PUT" : "POST", json });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t.id ? `${t.name} v${t.version}` : "New questionnaire"} {readOnly && <Pill value={t.status} className="ml-2" />}</DialogTitle>
          <DialogDescription>
            Section weights add up to the score (now {total}). Within a section, question weights share the section. Weight 0 = asked but not scored.
            Number bands: <code>max:score</code> pairs from best to worst, <code>*</code> = anything else (e.g. <code>0.5:1; 1:0.8; *:0</code>).
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[68vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-2"><Field label="Name" required><Input disabled={readOnly} value={head.name} onChange={(e) => setHead({ ...head, name: e.target.value })} /></Field></div>
            <Field label="Pass score"><Input disabled={readOnly} type="number" value={head.passScore} onChange={(e) => setHead({ ...head, passScore: e.target.value })} /></Field>
            <Field label="Conditional score"><Input disabled={readOnly} type="number" value={head.conditionalScore} onChange={(e) => setHead({ ...head, conditionalScore: e.target.value })} /></Field>
            <Field label="Validity (months)"><Input disabled={readOnly} type="number" value={head.validityMonths} onChange={(e) => setHead({ ...head, validityMonths: e.target.value })} /></Field>
            <Field label="Conditional validity"><Input disabled={readOnly} type="number" value={head.conditionalValidityMonths} onChange={(e) => setHead({ ...head, conditionalValidityMonths: e.target.value })} /></Field>
            <div className="md:col-span-6"><Field label="Description"><Textarea disabled={readOnly} rows={2} value={head.description} onChange={(e) => setHead({ ...head, description: e.target.value })} /></Field></div>
          </div>

          {sections.map((s, si) => (
            <div key={si} className="rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 bg-slate-50 p-3">
                <Field label="Code"><Input disabled={readOnly} className="h-8 w-36" value={s.code} onChange={(e) => upd(si, { code: e.target.value.toUpperCase() })} /></Field>
                <div className="min-w-[240px] flex-1"><Field label="Section title"><Input disabled={readOnly} className="h-8" value={s.title} onChange={(e) => upd(si, { title: e.target.value })} /></Field></div>
                <Field label="Weight"><Input disabled={readOnly} type="number" className="h-8 w-20" value={String(s.weight ?? 0)} onChange={(e) => upd(si, { weight: Number(e.target.value) })} /></Field>
                {!readOnly && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={si === 0} onClick={() => setSections(move(sections, si, -1))} aria-label="Move up"><ArrowUp size={13} /></Button>
                    <Button size="sm" variant="ghost" disabled={si === sections.length - 1} onClick={() => setSections(move(sections, si, 1))} aria-label="Move down"><ArrowDown size={13} /></Button>
                    <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => setSections(sections.filter((_, i) => i !== si))} aria-label="Remove section"><Trash2 size={13} /></Button>
                  </div>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {s.questions.map((q, qi) => (
                  <div key={qi} className="grid gap-2 p-3 md:grid-cols-12">
                    <div className="md:col-span-2"><Input disabled={readOnly} className="h-8 text-xs" placeholder="CODE" value={q.code} onChange={(e) => updQ(si, qi, { code: e.target.value.toUpperCase() })} /></div>
                    <div className="md:col-span-5"><Textarea disabled={readOnly} rows={2} className="text-xs" placeholder="Question text" value={q.text} onChange={(e) => updQ(si, qi, { text: e.target.value })} /></div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Select disabled={readOnly} value={q.answerType} onValueChange={(v) => updQ(si, qi, { answerType: v })} className="h-8 text-xs">
                        {(meta?.answerTypes ?? []).map((a) => <SelectItem key={a} value={a}>{label(a)}</SelectItem>)}
                      </Select>
                      {q.answerType === "DOCUMENT_REQUIRED" && (
                        <Select disabled={readOnly} value={q.docType ?? ""} onValueChange={(v) => updQ(si, qi, { docType: v })} className="h-8 text-xs" placeholder="Document type">
                          {(meta?.docTypes ?? []).map((d) => <SelectItem key={d} value={d}>{label(d)}</SelectItem>)}
                        </Select>
                      )}
                      {q.answerType === "YES_NO" && (
                        <Select disabled={readOnly} value={q.preferredAnswer ?? "YES"} onValueChange={(v) => updQ(si, qi, { preferredAnswer: v })} className="h-8 text-xs">
                          <SelectItem value="YES">Good answer: Yes</SelectItem>
                          <SelectItem value="NO">Good answer: No</SelectItem>
                        </Select>
                      )}
                      {q.answerType === "NUMBER" && (
                        <Input disabled={readOnly} className="h-8 text-xs" placeholder="Bands e.g. 0:1; *:0" defaultValue={bandsToText(q.bands)}
                               onBlur={(e) => updQ(si, qi, { bands: textToBands(e.target.value) })} />
                      )}
                    </div>
                    <div className="flex items-start gap-2 md:col-span-3">
                      <Input disabled={readOnly} type="number" className="h-8 w-16 text-xs" title="Weight" value={String(q.weight ?? 0)} onChange={(e) => updQ(si, qi, { weight: Number(e.target.value) })} />
                      <div className="flex items-center gap-1.5 pt-1.5">
                        <Checkbox id={`crit-${si}-${qi}`} disabled={readOnly} checked={!!q.critical} onCheckedChange={(v) => updQ(si, qi, { critical: v === true })} />
                        <Label htmlFor={`crit-${si}-${qi}`} className="text-[11px] font-normal text-slate-600">Critical</Label>
                      </div>
                      {!readOnly && (
                        <Button size="sm" variant="ghost" className="ml-auto text-rose-700" aria-label="Remove question"
                                onClick={() => upd(si, { questions: s.questions.filter((_, i) => i !== qi) })}><Trash2 size={13} /></Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {!readOnly && (
                <div className="p-2">
                  <Button size="sm" variant="ghost" onClick={() => upd(si, { questions: [...s.questions, { code: "", text: "", answerType: "YES_NO", weight: 1 }] })}>
                    <Plus size={13} /> Question
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => setSections([...sections, { code: "", title: "", weight: 10, questions: [] }])}><Plus size={13} /> Section</Button>
          )}
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{readOnly ? "Close" : "Cancel"}</Button>
          {!readOnly && <Button onClick={save} disabled={busy || head.name.trim().length < 3}>{busy ? "Saving…" : "Save draft"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
