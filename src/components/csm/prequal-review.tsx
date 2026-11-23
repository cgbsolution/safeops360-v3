"use client";

// One prequalification application, through its whole workflow:
//   DRAFT (HSE enters, or the contractor fills by link) -> SUBMITTED ->
//   HSE_REVIEW (auto score, evaluator overrides with reasons) -> APPROVAL
//   (plant head / corporate HSE) -> QUALIFIED / CONDITIONAL / REJECTED.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { confirmDialog, promptDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  csmFetch, fmtDate, label, type Answer, type CsmDocument, type CsmMeta, type PrequalDetail, type Question,
} from "@/lib/csm/api";
import { DocumentUploadDialog } from "./document-upload";
import { InviteLinkBox } from "./invite-link";
import { QuestionnaireForm } from "./questionnaire-form";
import { ErrorBox, Field, KeyVal, LinkButton, Panel, Pill, ScoreText } from "./shared";

const OVERRIDE_STEPS = ["0", "0.25", "0.5", "0.75", "1"];

export function PrequalReview({ id, meta }: { id: string; meta: CsmMeta | null }) {
  const { toast } = useToast();
  const [d, setD] = useState<PrequalDetail | null>(null);
  const [draft, setDraft] = useState<Record<string, Answer>>({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadFor, setUploadFor] = useState<{ docType: string | null; questionCode: string | null } | null>(null);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [decideOpen, setDecideOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState<{ portalPath: string; expiresAt: string; contactEmail: string | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await csmFetch<PrequalDetail>(`/api/csm/prequalifications/${id}`);
      setD(r);
      setDraft(r.answers);
      setDirty(false);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load the application");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function act(path: string, json: unknown, ok: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await csmFetch<PrequalDetail>(`/api/csm/prequalifications/${id}/${path}`, { method: path === "answers" ? "PUT" : "POST", json });
      setD(r);
      setDraft(r.answers);
      setDirty(false);
      toast({ variant: "success", title: ok });
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const scoreByCode = useMemo(() => {
    const m: Record<string, { auto: number | null; final: number | null; overridden: boolean }> = {};
    d?.scoring.sections.forEach((s) => s.questions.forEach((q) => { m[q.code] = q; }));
    return m;
  }, [d]);

  if (!d) return <ErrorBox error={error ?? null} />;
  const editable = d.status === "DRAFT";
  const sections = d.template.sections;

  async function withReason(path: string, title: string, ok: string) {
    const reason = await promptDialog({ title, placeholder: "Reason" });
    if (reason === null) return;
    if (reason.trim().length < 3) {
      toast({ variant: "error", title: "Give a reason (at least 3 characters)" });
      return;
    }
    await act(path, { reason }, ok);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{d.applicationNo}</h2>
              <Pill value={d.status} />
              {d.isRenewal && <Pill value="DRAFT" text="Renewal" />}
              {d.isCurrent && <Pill value="QUALIFIED" text="Current qualification" />}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              <LinkButton href={`/csm/contractors/${d.contractorCompanyId}`}>{d.contractor?.name ?? "Contractor"}</LinkButton>
              {" · "}{d.plantName ?? ""} · {d.templateName} v{d.templateVersion}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><div className="text-[11px] uppercase text-slate-500">Auto</div><div className="text-xl"><ScoreText value={d.scoring.autoScore} /></div></div>
            <div><div className="text-[11px] uppercase text-slate-500">Final</div><div className="text-xl"><ScoreText value={d.finalScore ?? d.scoring.finalScore} /></div></div>
            <div><div className="text-[11px] uppercase text-slate-500">Suggests</div><div className="pt-1"><Pill value={d.scoring.autoRecommendation} /></div></div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          Pass {d.template.passScore} · conditional {d.template.conditionalScore} · a critical gap caps the result at conditional.
        </div>

        {d.scoring.criticalFailures.length > 0 && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} /> Critical gaps</div>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {d.scoring.criticalFailures.map((c) => <li key={c.code}>{c.section}: {c.text}</li>)}
            </ul>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {editable && (
            <>
              <Button size="sm" disabled={busy || !dirty} onClick={() => act("answers", { answers: draft }, "Answers saved")}>Save answers</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
                if (dirty && !(await act("answers", { answers: draft }, "Answers saved"))) return;
                if (await confirmDialog({ title: "Submit for HSE review?", description: "Answers are locked once submitted. HSE is entering this on the contractor's behalf." }))
                  await act("submit", {}, "Submitted for review");
              }}>Submit for review</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setInviteOpen(true)}>{d.portal.live ? "Re-issue contractor link" : "Issue contractor link"}</Button>
              {d.portal.live && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
                  if (await confirmDialog({ title: "Revoke the contractor link?", destructive: true })) {
                    await csmFetch(`/api/csm/prequalifications/${id}/invite/revoke`, { method: "POST" }).catch(() => null);
                    load();
                  }
                }}>Revoke link</Button>
              )}
            </>
          )}
          {d.status === "SUBMITTED" && (
            <>
              <Button size="sm" disabled={busy} onClick={() => act("start-review", {}, "HSE review started")}>Start HSE review</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => withReason("return", "Return to the contractor for more information", "Returned to draft")}>Return for information</Button>
            </>
          )}
          {d.status === "HSE_REVIEW" && (
            <>
              <Button size="sm" disabled={busy} onClick={() => setRecommendOpen(true)}>Recommend</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => withReason("return", "Return to the contractor for more information", "Returned to draft")}>Return for information</Button>
            </>
          )}
          {d.status === "APPROVAL" && (
            <>
              <Button size="sm" disabled={busy} onClick={() => setDecideOpen(true)}><ShieldCheck size={14} /> Decide</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => withReason("send-back", "Send back to HSE review", "Sent back to HSE")}>Send back to HSE</Button>
            </>
          )}
          {["DRAFT", "SUBMITTED"].includes(d.status) && (
            <Button size="sm" variant="ghost" className="text-rose-700" disabled={busy} onClick={() => withReason("withdraw", "Withdraw this application", "Application withdrawn")}>Withdraw</Button>
          )}
        </div>
        {d.portal.live && !invite && (
          <p className="mt-2 text-[11px] text-slate-500">
            Contractor link live until {fmtDate(d.portal.expiresAt)}{d.portal.contactEmail ? ` (${d.portal.contactEmail})` : ""}
            {d.portal.lastAccessedAt ? `, last opened ${fmtDate(d.portal.lastAccessedAt, true)}` : ", not opened yet"}.
          </p>
        )}
        {invite && <div className="mt-3"><InviteLinkBox {...invite} /></div>}
        <div className="mt-3"><ErrorBox error={error} /></div>
      </div>

      {(d.recommendation || d.decision) && (
        <div className="grid gap-4 md:grid-cols-2">
          {d.recommendation && (
            <Panel title="HSE recommendation">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2"><Pill value={d.recommendation} /><span className="text-xs text-slate-500">{d.recommendedByName ?? ""} · {fmtDate(d.recommendedAt)}</span></div>
                {d.reviewNotes && <p className="text-slate-700">{d.reviewNotes}</p>}
                {d.conditions && <p className="text-xs text-slate-600"><strong>Conditions:</strong> {d.conditions}</p>}
              </div>
            </Panel>
          )}
          {d.decision && (
            <Panel title="Decision">
              <div className="grid grid-cols-2 gap-3">
                <KeyVal k="Decision" v={<Pill value={d.decision} />} />
                <KeyVal k="By" v={`${d.decidedByName ?? "—"} · ${fmtDate(d.decidedAt)}`} />
                <KeyVal k="Valid from" v={fmtDate(d.validFrom)} />
                <KeyVal k="Valid until" v={fmtDate(d.validUntil)} />
              </div>
              {d.decisionNotes && <p className="mt-2 text-sm text-slate-700">{d.decisionNotes}</p>}
            </Panel>
          )}
        </div>
      )}

      <Tabs defaultValue="questionnaire">
        <TabsList>
          <TabsTrigger value="questionnaire">Questionnaire</TabsTrigger>
          <TabsTrigger value="score">Score breakdown</TabsTrigger>
          <TabsTrigger value="documents">Documents ({d.documents.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="questionnaire" className="mt-3">
          {editable && d.scoring.unanswered.length > 0 && (
            <p className="mb-2 text-xs text-amber-700">{d.scoring.unanswered.length} required question(s) still unanswered (highlighted).</p>
          )}
          <QuestionnaireForm
            sections={sections}
            answers={draft}
            readOnly={!editable}
            highlight={editable ? d.scoring.unanswered : []}
            onChange={(code, a) => { setDraft({ ...draft, [code]: a }); setDirty(true); }}
            documents={d.documents}
            onUpload={(q) => setUploadFor({ docType: q.docType ?? null, questionCode: q.code })}
            renderExtra={(q) => (
              <ScoreLine q={q} s={scoreByCode[q.code]} override={d.overrides[q.code]} canOverride={d.status === "HSE_REVIEW"}
                         onSave={(score, reason) => act("override", { questionCode: q.code, score, reason }, score === null ? "Override removed" : "Override recorded")} />
            )}
          />
        </TabsContent>
        <TabsContent value="score" className="mt-3">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <Table className="text-sm">
              <TableHeader className="bg-slate-50">
                <TableRow><TableHead>Section</TableHead><TableHead className="text-right">Weight</TableHead><TableHead className="text-right">Auto %</TableHead><TableHead className="text-right">Final %</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {d.scoring.sections.map((s) => (
                  <TableRow key={s.code}>
                    <TableCell>{s.title}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.weight}</TableCell>
                    <TableCell className="text-right"><ScoreText value={s.autoScore} /></TableCell>
                    <TableCell className="text-right"><ScoreText value={s.finalScore} /></TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-50 font-semibold">
                  <TableCell>Overall</TableCell><TableCell className="text-right">100</TableCell>
                  <TableCell className="text-right"><ScoreText value={d.scoring.autoScore} /></TableCell>
                  <TableCell className="text-right"><ScoreText value={d.scoring.finalScore} /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          {Object.keys(d.overrides).length > 0 && (
            <Panel title="Evaluator overrides" className="mt-3">
              <ul className="space-y-1.5 text-sm">
                {Object.entries(d.overrides).map(([code, o]) => (
                  <li key={code}><strong>{code}</strong> → {Math.round(o.score * 100)}% · {o.reason} <span className="text-xs text-slate-500">({o.byName ?? "—"}, {fmtDate(o.at)})</span></li>
                ))}
              </ul>
            </Panel>
          )}
        </TabsContent>
        <TabsContent value="documents" className="mt-3">
          <DocumentTable docs={d.documents} onUpload={() => setUploadFor({ docType: null, questionCode: null })} canUpload onChanged={load} />
        </TabsContent>
        <TabsContent value="history" className="mt-3">
          <Panel title="Workflow history">
            <ol className="space-y-2 text-sm">
              {d.history.map((h, i) => (
                <li key={i} className="flex flex-wrap gap-2">
                  <span className="w-36 shrink-0 text-xs text-slate-500">{fmtDate(h.at, true)}</span>
                  <span className="font-medium">{h.from ? `${label(h.from)} → ` : ""}{label(h.to)}</span>
                  <span className="text-slate-600">{h.note ?? ""}</span>
                  <span className="text-xs text-slate-500">{h.byName ?? ""}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </TabsContent>
      </Tabs>

      <DocumentUploadDialog
        open={!!uploadFor}
        onOpenChange={(v) => !v && setUploadFor(null)}
        docTypes={meta?.docTypes ?? ["OTHER"]}
        docType={uploadFor?.docType}
        questionCode={uploadFor?.questionCode ?? null}
        getUploadUrl={(file) => csmFetch("/api/csm/documents/upload-url", {
          method: "POST", json: { contractorCompanyId: d.contractorCompanyId, fileName: file.name, mimeType: file.type, fileSize: file.size },
        })}
        record={async (m) => {
          await csmFetch("/api/csm/documents", { method: "POST", json: { ...m, contractorCompanyId: d.contractorCompanyId, prequalificationId: d.id } });
        }}
        onDone={() => { toast({ variant: "success", title: "Document uploaded" }); load(); }}
      />
      <RecommendDialog open={recommendOpen} onOpenChange={setRecommendOpen} d={d} onSave={(json) => act("recommend", json, "Recommendation sent for approval")} />
      <DecideDialog open={decideOpen} onOpenChange={setDecideOpen} d={d} onSave={(json) => act("decide", json, "Decision recorded")} />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} defaultEmail={d.contractor?.contactEmail ?? d.contractor?.representativeEmail ?? ""}
                    onIssued={(r) => { setInvite(r); load(); }} id={id} />
    </div>
  );
}

function ScoreLine({ q, s, override, canOverride, onSave }: {
  q: Question; s?: { auto: number | null; final: number | null; overridden: boolean };
  override?: { score: number; reason: string; byName?: string | null };
  canOverride: boolean; onSave: (score: number | null, reason: string | null) => Promise<boolean>;
}) {
  const [val, setVal] = useState(override ? String(override.score) : "");
  const [reason, setReason] = useState(override?.reason ?? "");
  if (!s || s.auto === null) return null;
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
      <span>Weight {q.weight}{q.critical ? " · critical" : ""}</span>
      <span>· auto <strong className={cn(s.auto === 0 && "text-rose-700")}>{pct(s.auto)}</strong></span>
      {s.overridden && <span>· final <strong className="text-indigo-700">{pct(s.final)}</strong> ({override?.reason})</span>}
      {canOverride && (
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <Select value={val} onValueChange={setVal} className="h-7 w-28 text-xs" placeholder="Override">
            {OVERRIDE_STEPS.map((v) => <SelectItem key={v} value={v}>{Math.round(Number(v) * 100)}%</SelectItem>)}
          </Select>
          <Input className="h-7 w-56 text-xs" placeholder="Reason for override" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" variant="outline" className="h-7" disabled={val === "" || reason.trim().length < 5} onClick={() => onSave(Number(val), reason)}>Apply</Button>
          {s.overridden && <Button size="sm" variant="ghost" className="h-7" onClick={() => { setVal(""); setReason(""); onSave(null, null); }}>Clear</Button>}
        </span>
      )}
    </div>
  );
}

export function DocumentTable({ docs, onUpload, canUpload, onChanged }: { docs: CsmDocument[]; onUpload?: () => void; canUpload?: boolean; onChanged?: () => void }) {
  const { toast } = useToast();
  async function download(doc: CsmDocument) {
    try {
      const { url } = await csmFetch<{ url: string }>(`/api/csm/documents/${doc.id}/download`);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({ variant: "error", title: "Download failed", description: e?.message });
    }
  }
  async function verify(doc: CsmDocument) {
    try {
      await csmFetch(`/api/csm/documents/${doc.id}/verify`, { method: "POST" });
      onChanged?.();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not verify", description: e?.message });
    }
  }
  return (
    <Panel title="Documents" action={canUpload && onUpload ? <Button size="sm" variant="outline" onClick={onUpload}>Upload</Button> : null}>
      <div className="overflow-x-auto">
        <Table className="min-w-[760px] text-sm">
          <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Document</TableHead><TableHead>Valid until</TableHead><TableHead>Status</TableHead><TableHead>From</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {docs.map((doc) => (
              <TableRow key={doc.id} className={cn(doc.status !== "ACTIVE" && "opacity-60")}>
                <TableCell className="text-xs font-medium">{label(doc.docType)}</TableCell>
                <TableCell className="text-xs">{doc.title || doc.fileName}{doc.documentNo && <div className="text-[11px] text-slate-500">No. {doc.documentNo}</div>}</TableCell>
                <TableCell className="text-xs">{fmtDate(doc.expiresOn)} {doc.state && doc.state !== "OK" && <Pill value={doc.state} />}</TableCell>
                <TableCell><Pill value={doc.status} />{doc.verifiedAt && <div className="text-[11px] text-emerald-700">verified</div>}</TableCell>
                <TableCell className="text-xs">{label(doc.uploadedVia)}<div className="text-[11px] text-slate-500">{doc.uploadedByName ?? ""}</div></TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => download(doc)} aria-label="Download"><Download size={13} /></Button>
                  {!doc.verifiedAt && doc.status === "ACTIVE" && onChanged && <Button size="sm" variant="outline" onClick={() => verify(doc)}>Verify</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {docs.length === 0 && <p className="py-4 text-center text-xs text-slate-400">No documents yet.</p>}
      </div>
    </Panel>
  );
}

function RecommendDialog({ open, onOpenChange, d, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; d: PrequalDetail; onSave: (j: unknown) => Promise<boolean> }) {
  const [rec, setRec] = useState(d.scoring.autoRecommendation ?? "QUALIFIED");
  const [notes, setNotes] = useState("");
  const [conditions, setConditions] = useState("");
  useEffect(() => { if (open) { setRec(d.scoring.autoRecommendation ?? "QUALIFIED"); setNotes(""); setConditions(""); } }, [open, d.scoring.autoRecommendation]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>HSE recommendation</DialogTitle>
          <DialogDescription>Final score {d.scoring.finalScore ?? "—"}; the scores suggest {label(d.scoring.autoRecommendation)}. The plant head decides next.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Recommendation" required>
            <Select value={rec} onValueChange={setRec} className="w-full">
              {["QUALIFIED", "CONDITIONAL", "REJECTED"].map((v) => <SelectItem key={v} value={v}>{label(v)}</SelectItem>)}
            </Select>
          </Field>
          {rec === "CONDITIONAL" && (
            <Field label="Conditions" required hint="What must be closed, and by when."><Textarea rows={3} value={conditions} onChange={(e) => setConditions(e.target.value)} /></Field>
          )}
          <Field label="Review notes" required><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={notes.trim().length < 3 || (rec === "CONDITIONAL" && !conditions.trim())}
                  onClick={async () => { if (await onSave({ recommendation: rec, reviewNotes: notes, conditions: conditions || null })) onOpenChange(false); }}>
            Send for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DecideDialog({ open, onOpenChange, d, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; d: PrequalDetail; onSave: (j: unknown) => Promise<boolean> }) {
  const [decision, setDecision] = useState(d.recommendation ?? "QUALIFIED");
  const [conditions, setConditions] = useState(d.conditions ?? "");
  const [notes, setNotes] = useState("");
  const [months, setMonths] = useState("");
  useEffect(() => { if (open) { setDecision(d.recommendation ?? "QUALIFIED"); setConditions(d.conditions ?? ""); setNotes(""); setMonths(""); } }, [open, d.recommendation, d.conditions]);
  const deviates = !!d.recommendation && decision !== d.recommendation;
  const defMonths = decision === "CONDITIONAL" ? d.template.conditionalValidityMonths : d.template.validityMonths;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Approval decision</DialogTitle>
          <DialogDescription>HSE recommended {label(d.recommendation)}. The outcome is written onto the contractor and drives the work-order and gate checks.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Decision" required>
            <Select value={decision} onValueChange={setDecision} className="w-full">
              {["QUALIFIED", "CONDITIONAL", "REJECTED"].map((v) => <SelectItem key={v} value={v}>{label(v)}</SelectItem>)}
            </Select>
          </Field>
          {decision !== "REJECTED" && (
            <Field label="Validity">
              <Select value={months} onValueChange={setMonths} className="w-full">
                <SelectItem value="">Template default ({defMonths} months)</SelectItem>
                {["3", "6", "12", "24"].map((m) => <SelectItem key={m} value={m}>{m} months</SelectItem>)}
              </Select>
            </Field>
          )}
          {decision === "CONDITIONAL" && <Field label="Conditions" required><Textarea rows={3} value={conditions} onChange={(e) => setConditions(e.target.value)} /></Field>}
          <Field label="Notes" required={decision === "REJECTED" || deviates} hint={deviates ? "Your decision differs from the HSE recommendation: record why." : undefined}>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={decision === "REJECTED" ? "destructive" : "default"}
                  disabled={((decision === "REJECTED" || deviates) && !notes.trim()) || (decision === "CONDITIONAL" && !conditions.trim())}
                  onClick={async () => {
                    if (await onSave({ decision, conditions: conditions || null, decisionNotes: notes || null, validityMonths: months ? Number(months) : null })) onOpenChange(false);
                  }}>
            Record decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({ open, onOpenChange, defaultEmail, onIssued, id }: {
  open: boolean; onOpenChange: (v: boolean) => void; defaultEmail: string; id: string;
  onIssued: (r: { portalPath: string; expiresAt: string; contactEmail: string | null }) => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState("");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setEmail(defaultEmail); setName(""); setDays("30"); setError(null); } }, [open, defaultEmail]);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await csmFetch<{ portalPath: string; expiresAt: string; contactEmail: string | null }>(`/api/csm/prequalifications/${id}/invite`, {
        method: "POST", json: { contactEmail: email || null, contactName: name || null, ttlDays: Number(days) },
      });
      onIssued(r);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Could not issue the link");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Contractor link</DialogTitle>
          <DialogDescription>The contractor fills the questionnaire and uploads documents without an account. Issuing a new link cancels any earlier one.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Contact email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Contact name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Valid for">
            <Select value={days} onValueChange={setDays} className="w-full">
              {["7", "14", "30", "60", "90"].map((v) => <SelectItem key={v} value={v}>{v} days</SelectItem>)}
            </Select>
          </Field>
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Issuing…" : "Issue link"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
