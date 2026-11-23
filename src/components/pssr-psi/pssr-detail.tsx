"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Paperclip, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrintButton } from "@/components/ui/print-button";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { UserPicker } from "@/components/ui/user-picker";
import { EvidenceAttachment } from "@/components/evidence/EvidenceAttachment";
import { cn } from "@/lib/utils";
import {
  dateInputToIso, fmtDate, label, psFetch, toDateInput,
  type PssrDetail as Detail, type PssrItem, type PssrMeta, type SignoffRow,
} from "@/lib/pssr-psi/api";
import { EmptyRow, ErrorBox, Field, Stat, Tag } from "./shared";

const EDITABLE = ["DRAFT", "IN_PROGRESS"];
const RESPONSE_STYLE: Record<string, string> = {
  YES: "border-emerald-300 bg-emerald-600 text-white",
  NO: "border-rose-300 bg-rose-600 text-white",
  NA: "border-slate-300 bg-slate-500 text-white",
};
const EVIDENCE_CATEGORIES = [
  { value: "CHECK_EVIDENCE", label: "Check evidence" },
  { value: "TEST_CERTIFICATE", label: "Test certificate" },
  { value: "PHOTO", label: "Photo" },
  { value: "DRAWING", label: "Drawing" },
  { value: "PUNCH_CLOSURE", label: "Punch closure" },
  { value: "OTHER", label: "Other" },
];

export function PssrDetailView({ initial, meta }: { initial: Detail; meta: PssrMeta | null }) {
  const { toast } = useToast();
  const [d, setD] = useState<Detail>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidenceFor, setEvidenceFor] = useState<PssrItem | null>(null);
  const [closing, setClosing] = useState<PssrItem | null>(null);
  const [signing, setSigning] = useState<SignoffRow | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const editable = EDITABLE.includes(d.status) && d.permissions.canEdit;
  const punchWorkable = d.status !== "CLOSED" && d.permissions.canEdit;
  const disciplineLabel = (code: string) => meta?.disciplineLabels?.[code] ?? label(code);

  async function call(path: string, method: string, json: unknown, okMsg?: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const r = await psFetch<Detail>(path, { method, json });
      setD(r);
      if (okMsg) toast({ title: okMsg, variant: "success" });
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
      toast({ title: "Not saved", description: e?.message, variant: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const sections = useMemo(() => {
    const map = new Map<string, PssrItem[]>();
    for (const it of d.items) {
      const k = `${String(it.sectionOrder).padStart(3, "0")}|${it.section}`;
      map.set(k, [...(map.get(k) ?? []), it]);
    }
    return Array.from(map.entries()).map(([k, items]) => ({ title: k.split("|").slice(1).join("|"), items }));
  }, [d.items]);
  const punch = d.items.filter((i) => i.isPunch);
  const s = d.gate.summary;

  return (
    <div className="space-y-4">
      <GateBanner d={d} disciplineLabel={disciplineLabel} />

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {editable && (
          <Button size="sm" disabled={busy || d.submitBlockers.length > 0} onClick={() => call(`/api/pssr/reviews/${d.id}/submit`, "POST", {}, "Sent for sign-off")}
            title={d.submitBlockers.join("\n") || undefined}>
            Submit for sign-off
          </Button>
        )}
        {d.permissions.canManage && ["PENDING_APPROVAL", "NO_GO"].includes(d.status) && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setReopenOpen(true)}>Reopen checklist</Button>
        )}
        {d.permissions.canManage && d.status === "APPROVED_GO" && (
          <Button size="sm" variant="outline" disabled={busy || d.closeBlockers.length > 0} onClick={() => setCloseOpen(true)}
            title={d.closeBlockers.join("\n") || undefined}>
            Close review
          </Button>
        )}
        {d.permissions.canManage && !["APPROVED_GO", "CLOSED"].includes(d.status) && (
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Edit details</Button>
        )}
        <div className="ml-auto"><PrintButton label="Print PSSR" /></div>
      </div>
      {editable && d.submitBlockers.length > 0 && (
        <p className="text-xs text-slate-500 print:hidden">Before submitting: {d.submitBlockers.join(" ")}</p>
      )}
      <ErrorBox error={error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Review</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
            <Info k="Plant" v={d.plantName} />
            <Info k="Area / unit" v={[d.area, d.unit].filter(Boolean).join(" / ") || null} />
            <Info k="Trigger" v={label(d.trigger)} />
            <Info k="Linked MOC" v={d.mocId ? <Link href={`/moc/${d.mocId}`} className="text-primary-700 hover:underline">{d.mocNumber ?? "Open MOC"}</Link> : null} />
            <Info k="PHA / HAZOP study" v={d.phaStudyId} />
            <Info k="Planned start-up" v={fmtDate(d.plannedStartupDate)} />
            <Info k="Actual start-up" v={d.actualStartupDate ? fmtDate(d.actualStartupDate) : null} />
            <Info k="Leader" v={d.leaderName} />
            <Info k="Team" v={d.team.map((t) => t.name).join(", ") || null} />
            {d.scope && <div className="col-span-full"><Info k="Scope" v={<span className="whitespace-pre-line">{d.scope}</span>} /></div>}
            {d.lastReopenReason && (
              <div className="col-span-full text-xs text-slate-500">Reopened {d.reopenCount}x; last {fmtDate(d.lastReopenedAt)}: {d.lastReopenReason}</div>
            )}
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Answered" value={`${s.answered} / ${s.total}`} tone={s.unanswered ? undefined : "ok"} />
          <Stat label="NO answers" value={s.no} />
          <Stat label="Open punch A" value={s.punchAOpen} tone={s.punchAOpen ? "bad" : "ok"} />
          <Stat label="Open punch B" value={s.punchBOpen} tone={s.punchBOpen ? "warn" : undefined} />
        </div>
      </div>

      <Tabs defaultValue="checklist" className="print:hidden">
        <TabsList>
          <TabsTrigger value="checklist">Checklist ({s.answered}/{s.total})</TabsTrigger>
          <TabsTrigger value="punch">Punch list ({punch.length})</TabsTrigger>
          <TabsTrigger value="signoff">Sign-off matrix</TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="space-y-4">
          {sections.map((sec, si) => (
            <Card key={sec.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{si + 1}. {sec.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sec.items.map((it) => (
                  <ChecklistRow key={it.id} it={it} editable={editable} busy={busy} disciplineLabel={disciplineLabel}
                    plantId={d.plantId}
                    onAnswer={(response, remarks) => call(`/api/pssr/items/${it.id}`, "PUT", { response, remarks })}
                    onPunch={(patch) => call(`/api/pssr/items/${it.id}/punch`, "PATCH", patch)}
                    onEvidence={() => setEvidenceFor(it)} />
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="punch">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <Table className="min-w-[900px] text-sm">
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Punch item</TableHead><TableHead>Cat.</TableHead><TableHead>Owner</TableHead><TableHead>Due</TableHead>
                  <TableHead>Status</TableHead><TableHead>CAPA</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {punch.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      {i.question}
                      <div className="text-[11px] text-slate-500">{i.section}{i.punchDescription ? ` · ${i.punchDescription}` : ""}</div>
                      {i.punchClosureNote && <div className="text-[11px] text-emerald-700">Closed: {i.punchClosureNote} ({i.punchClosedByName ?? ""}, {fmtDate(i.punchClosedAt)})</div>}
                    </TableCell>
                    <TableCell><Tag code={i.punchCategory} /></TableCell>
                    <TableCell className="text-xs">{i.punchOwnerName ?? <span className="text-rose-600">Not set</span>}</TableCell>
                    <TableCell className="text-xs">{i.punchDueDate ? fmtDate(i.punchDueDate) : <span className="text-rose-600">Not set</span>} {i.punchOverdue && <Tag code="OVERDUE" text="Overdue" />}</TableCell>
                    <TableCell><Tag code={i.punchStatus} /></TableCell>
                    <TableCell className="text-xs">
                      {i.capaId ? <Link href={`/capa/${i.capaId}`} className="text-primary-700 hover:underline">{i.capaNumber ?? "CAPA"}</Link> : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEvidenceFor(i)}><Paperclip size={13} /></Button>
                        {i.punchStatus === "OPEN" && punchWorkable && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => setClosing(i)}>Close</Button>
                        )}
                        {i.punchStatus === "CLOSED" && punchWorkable && !["APPROVED_GO", "CLOSED"].includes(d.status) && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => call(`/api/pssr/items/${i.id}/punch/reopen`, "POST", {}, "Punch item reopened")}>Reopen</Button>
                        )}
                        {i.punchCategory === "B" && i.punchStatus === "OPEN" && !i.capaId && d.permissions.canManage && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => call(`/api/pssr/items/${i.id}/capa`, "POST", {}, "CAPA raised")}>Raise CAPA</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {punch.length === 0 && <EmptyRow text="No punch items: every answer so far is YES or N/A." />}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Category A must be closed before start-up; it holds the GO. Category B may close after start-up and can raise a CAPA; the review closes when the last B item closes.
          </p>
        </TabsContent>

        <TabsContent value="signoff">
          <SignoffMatrix d={d} busy={busy} onSign={setSigning} />
        </TabsContent>
      </Tabs>

      <PrintableView d={d} sections={sections} disciplineLabel={disciplineLabel} />

      {/* dialogs */}
      <Dialog open={!!evidenceFor} onOpenChange={(v) => !v && setEvidenceFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Evidence</DialogTitle></DialogHeader>
          {evidenceFor && (
            <>
              <p className="text-sm text-slate-600">{evidenceFor.question}</p>
              <EvidenceAttachment entityType="pssr_item" entityId={evidenceFor.id} categories={EVIDENCE_CATEGORIES}
                showDocumentCategory={false} canManage={d.permissions.canManage && d.status !== "CLOSED"} title="Evidence for this check" />
            </>
          )}
        </DialogContent>
      </Dialog>
      <ClosePunchDialog item={closing} onOpenChange={(v) => !v && setClosing(null)}
        onSubmit={async (note) => { if (closing && (await call(`/api/pssr/items/${closing.id}/punch/close`, "POST", { closureNote: note }, "Punch item closed"))) setClosing(null); }} busy={busy} />
      <SignDialog row={signing} onOpenChange={(v) => !v && setSigning(null)} busy={busy}
        onSubmit={async (decision, comment) => { if (signing && (await call(`/api/pssr/reviews/${d.id}/signoff`, "POST", { discipline: signing.discipline, decision, comment }, decision === "APPROVE" ? "Approved" : "Rejected"))) setSigning(null); }} />
      <ReasonDialog open={reopenOpen} onOpenChange={setReopenOpen} title="Reopen the checklist"
        help="All current sign-offs are retired; the team corrects the checklist and submits again." busy={busy}
        onSubmit={async (reason) => { if (await call(`/api/pssr/reviews/${d.id}/reopen`, "POST", { reason }, "Reopened")) setReopenOpen(false); }} />
      <CloseReviewDialog open={closeOpen} onOpenChange={setCloseOpen} busy={busy} initialDate={d.actualStartupDate}
        onSubmit={async (iso) => { if (await call(`/api/pssr/reviews/${d.id}/close`, "POST", { actualStartupDate: iso }, "Review closed")) setCloseOpen(false); }} />
      <EditDialog open={editOpen} onOpenChange={setEditOpen} d={d} meta={meta} busy={busy}
        onSubmit={async (patch) => { if (await call(`/api/pssr/reviews/${d.id}`, "PATCH", patch, "Saved")) setEditOpen(false); }} />
    </div>
  );
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{k}</div>
      <div className="text-slate-900">{v || "—"}</div>
    </div>
  );
}

function GateBanner({ d, disciplineLabel }: { d: Detail; disciplineLabel: (c: string) => string }) {
  if (d.status === "APPROVED_GO" || d.status === "CLOSED") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
        <ShieldCheck className="mt-0.5 shrink-0" size={22} />
        <div>
          <div className="text-base font-semibold">GO: approved for start-up{d.status === "CLOSED" ? " (review closed)" : ""}</div>
          <div className="text-sm">
            Decided {fmtDate(d.decidedAt, true)}. All category-A punch items closed and every required discipline approved.
            {d.gate.openB > 0 && ` ${d.gate.openB} category-B item(s) still open; the review closes when they do.`}
          </div>
        </div>
      </div>
    );
  }
  if (d.status === "NO_GO") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-900">
        <XCircle className="mt-0.5 shrink-0" size={22} />
        <div>
          <div className="text-base font-semibold">NO-GO: start-up not authorised</div>
          <div className="text-sm">{d.noGoReason ?? "A discipline rejected the review."}</div>
        </div>
      </div>
    );
  }
  const pending = d.status === "PENDING_APPROVAL";
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4", pending ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-800")}>
      {pending ? <ShieldAlert className="mt-0.5 shrink-0" size={22} /> : <AlertTriangle className="mt-0.5 shrink-0" size={22} />}
      <div>
        <div className="text-base font-semibold">{pending ? "Awaiting sign-off: not yet cleared for start-up" : "Not ready for start-up"}</div>
        {d.gate.blockers.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-sm">
            {d.gate.blockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
        )}
        {pending && d.gate.missingSignoffs.length > 0 && (
          <div className="mt-1 text-xs">Waiting for: {d.gate.missingSignoffs.map(disciplineLabel).join(", ")}</div>
        )}
      </div>
    </div>
  );
}

function ChecklistRow({
  it, editable, busy, onAnswer, onPunch, onEvidence, disciplineLabel, plantId,
}: {
  it: PssrItem; editable: boolean; busy: boolean; plantId: string;
  onAnswer: (response: string | null, remarks: string | null) => Promise<boolean>;
  onPunch: (patch: Record<string, unknown>) => Promise<boolean>;
  onEvidence: () => void;
  disciplineLabel: (c: string) => string;
}) {
  const [remarks, setRemarks] = useState(it.remarks ?? "");
  const [desc, setDesc] = useState(it.punchDescription ?? "");
  return (
    <div className={cn("rounded-lg border p-3", it.response === "NO" ? "border-rose-200 bg-rose-50/40" : "border-slate-200")}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[260px] flex-1">
          <div className="text-sm text-slate-900">{it.question}</div>
          {it.guidance && <div className="mt-0.5 text-[11px] text-slate-500">{it.guidance}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5">{disciplineLabel(it.discipline)}</span>
            <span>If NO: category {it.defaultPunchCategory}</span>
            {it.verifiedByName && <span>· checked by {it.verifiedByName}, {fmtDate(it.verifiedAt)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {["YES", "NO", "NA"].map((r) => (
            <Button key={r} variant="bare" type="button" disabled={!editable || busy}
              onClick={() => onAnswer(it.response === r ? null : r, remarks || null)}
              className={cn("rounded border px-3 py-1 text-xs font-semibold disabled:opacity-60",
                it.response === r ? RESPONSE_STYLE[r] : "border-slate-300 bg-white text-slate-600 hover:border-slate-400")}>
              {label(r)}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={onEvidence} aria-label="Evidence"><Paperclip size={14} /></Button>
        </div>
      </div>
      <div className="mt-2">
        <Textarea rows={1} value={remarks} disabled={!editable} placeholder="Remarks / evidence reference"
          onChange={(e) => setRemarks(e.target.value)}
          onBlur={() => { if (editable && remarks !== (it.remarks ?? "")) void onAnswer(it.response, remarks || null); }}
          className="min-h-[34px] text-xs" />
      </div>
      {it.isPunch && (
        <div className="mt-2 grid gap-2 rounded-md border border-rose-200 bg-white p-2 md:grid-cols-4">
          <Field label="Punch category">
            <Select value={it.punchCategory ?? "A"} disabled={!editable || busy} onValueChange={(v) => onPunch({ punchCategory: v })} className="h-9 w-full">
              <SelectItem value="A">A: close before start-up</SelectItem>
              <SelectItem value="B">B: may close after</SelectItem>
            </Select>
          </Field>
          <Field label="Owner" required>
            <UserPicker value={it.punchOwnerId} disabled={it.punchStatus === "CLOSED"} filter={{ plantId }}
              onChange={(id) => id && onPunch({ punchOwnerId: id })} />
          </Field>
          <Field label="Due" required>
            <Input type="date" value={toDateInput(it.punchDueDate)} disabled={it.punchStatus === "CLOSED"}
              onChange={(e) => e.target.value && onPunch({ punchDueDate: dateInputToIso(e.target.value) })} className="h-9" />
          </Field>
          <Field label="What must be done">
            <Input value={desc} disabled={it.punchStatus === "CLOSED"} onChange={(e) => setDesc(e.target.value)}
              onBlur={() => { if (desc !== (it.punchDescription ?? "")) void onPunch({ punchDescription: desc || null }); }} className="h-9" />
          </Field>
          <div className="col-span-full flex items-center gap-2 text-[11px]">
            <Tag code={it.punchStatus} />
            {!it.punchComplete && <span className="text-rose-700">Needs an owner and a due date.</span>}
            {it.capaNumber && <span>CAPA {it.capaNumber}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function SignoffMatrix({ d, busy, onSign }: { d: Detail; busy: boolean; onSign: (r: SignoffRow) => void }) {
  const canSign = d.permissions.canSignoff && d.status === "PENDING_APPROVAL";
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[760px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Discipline</TableHead><TableHead>Decision</TableHead><TableHead>Signed by</TableHead>
              <TableHead>Comment</TableHead><TableHead>When</TableHead><TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.signoffs.map((r) => (
              <TableRow key={r.discipline}>
                <TableCell className="font-medium">{r.label}{!r.required && <span className="ml-1 text-[11px] text-slate-400">(optional)</span>}</TableCell>
                <TableCell>{r.decision ? <Tag code={r.decision} /> : <span className="text-xs text-slate-400">Pending</span>}</TableCell>
                <TableCell className="text-xs">{r.userName ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.comment ?? "—"}</TableCell>
                <TableCell className="text-xs">{fmtDate(r.signedAt, true)}</TableCell>
                <TableCell className="text-right">
                  {canSign && <Button size="sm" variant="outline" disabled={busy} onClick={() => onSign(r)}>{r.decision ? "Re-sign" : "Sign"}</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!canSign && d.status !== "PENDING_APPROVAL" && (
        <p className="text-xs text-slate-500">Sign-off opens once the checklist is submitted (status Pending sign-off).</p>
      )}
      {d.signoffHistory.some((h) => !h.isCurrent) && (
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-700">Earlier decisions (retired by a re-sign or reopen)</div>
          <ul className="space-y-1 text-xs text-slate-600">
            {d.signoffHistory.filter((h) => !h.isCurrent).map((h) => (
              <li key={h.id}>{fmtDate(h.signedAt, true)} · {label(h.discipline)} · {label(h.decision)} by {h.userName ?? "—"}{h.comment ? `: ${h.comment}` : ""}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PrintableView({ d, sections, disciplineLabel }: { d: Detail; sections: { title: string; items: PssrItem[] }[]; disciplineLabel: (c: string) => string }) {
  return (
    <div className="hidden space-y-4 text-xs print:block">
      <h2 className="text-base font-semibold">Checklist</h2>
      {sections.map((sec, si) => (
        <table key={sec.title} className="w-full border-collapse">
          <thead>
            <tr><th colSpan={4} className="border border-slate-400 bg-slate-100 p-1 text-left">{si + 1}. {sec.title}</th></tr>
          </thead>
          <tbody>
            {sec.items.map((it) => (
              <tr key={it.id}>
                <td className="w-1/2 border border-slate-300 p-1">{it.question}</td>
                <td className="border border-slate-300 p-1">{disciplineLabel(it.discipline)}</td>
                <td className="border border-slate-300 p-1 font-semibold">{label(it.response)}{it.isPunch ? ` (punch ${it.punchCategory}, ${label(it.punchStatus)})` : ""}</td>
                <td className="border border-slate-300 p-1">{it.remarks ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <h2 className="text-base font-semibold">Sign-off</h2>
      <table className="w-full border-collapse">
        <tbody>
          {d.signoffs.map((r) => (
            <tr key={r.discipline}>
              <td className="border border-slate-300 p-1">{r.label}</td>
              <td className="border border-slate-300 p-1">{label(r.decision)}</td>
              <td className="border border-slate-300 p-1">{r.userName ?? ""}</td>
              <td className="border border-slate-300 p-1">{fmtDate(r.signedAt, true)}</td>
              <td className="border border-slate-300 p-1">{r.comment ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClosePunchDialog({ item, onOpenChange, onSubmit, busy }: { item: PssrItem | null; onOpenChange: (v: boolean) => void; onSubmit: (note: string) => void; busy: boolean }) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) setNote(""); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Close punch item</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">{item?.question}</p>
        <Field label="How was it closed?" required hint="Attach the certificate or photo with the paperclip on the item.">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Hydro test done at 1.5x design pressure, certificate HT-118" />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || note.trim().length < 3} onClick={() => onSubmit(note.trim())}>Close item</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignDialog({ row, onOpenChange, onSubmit, busy }: { row: SignoffRow | null; onOpenChange: (v: boolean) => void; onSubmit: (decision: string, comment: string | null) => void; busy: boolean }) {
  const [decision, setDecision] = useState("APPROVE");
  const [comment, setComment] = useState("");
  return (
    <Dialog open={!!row} onOpenChange={(v) => { if (!v) { setDecision("APPROVE"); setComment(""); } onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Sign off: {row?.label}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label="Decision" required>
            <Select value={decision} onValueChange={setDecision} className="w-full">
              <SelectItem value="APPROVE">Approve start-up</SelectItem>
              <SelectItem value="REJECT">Reject (no-go)</SelectItem>
            </Select>
          </Field>
          <Field label={decision === "REJECT" ? "Reason" : "Comment"} required={decision === "REJECT"}>
            <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          {decision === "REJECT" && <p className="text-xs text-rose-700">A rejection makes the whole review NO-GO until it is reopened and resubmitted.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={decision === "REJECT" ? "destructive" : "default"} disabled={busy || (decision === "REJECT" && !comment.trim())}
            onClick={() => onSubmit(decision, comment.trim() || null)}>
            {decision === "REJECT" ? "Reject" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({ open, onOpenChange, title, help, onSubmit, busy }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; help: string; onSubmit: (r: string) => void; busy: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">{help}</p>
        <Field label="Reason" required><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || reason.trim().length < 3} onClick={() => onSubmit(reason.trim())}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseReviewDialog({ open, onOpenChange, onSubmit, busy, initialDate }: { open: boolean; onOpenChange: (v: boolean) => void; onSubmit: (iso: string | null) => void; busy: boolean; initialDate: string | null }) {
  const [date, setDate] = useState(toDateInput(initialDate));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Close the review</DialogTitle></DialogHeader>
        <Field label="Actual start-up date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy} onClick={() => onSubmit(dateInputToIso(date))}><CheckCircle2 size={14} className="mr-1" /> Close review</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ open, onOpenChange, d, meta, onSubmit, busy }: { open: boolean; onOpenChange: (v: boolean) => void; d: Detail; meta: PssrMeta | null; onSubmit: (p: Record<string, unknown>) => void; busy: boolean }) {
  const [title, setTitle] = useState(d.title);
  const [area, setArea] = useState(d.area ?? "");
  const [unit, setUnit] = useState(d.unit ?? "");
  const [scope, setScope] = useState(d.scope ?? "");
  const [pha, setPha] = useState(d.phaStudyId ?? "");
  const [planned, setPlanned] = useState(toDateInput(d.plannedStartupDate));
  const [leader, setLeader] = useState<string | null>(d.leaderId);
  const [team, setTeam] = useState<string[]>(d.teamUserIds);
  const [disc, setDisc] = useState<string[]>(d.requiredDisciplines);
  const matrixEditable = EDITABLE.includes(d.status);
  const mandatory = new Set(meta?.mandatoryDisciplines ?? []);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Edit review details</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field></div>
          <Field label="Area"><Input value={area} onChange={(e) => setArea(e.target.value)} /></Field>
          <Field label="Unit / equipment"><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
          <Field label="Planned start-up"><Input type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} /></Field>
          <Field label="PHA / HAZOP study reference"><Input value={pha} onChange={(e) => setPha(e.target.value)} /></Field>
          <Field label="Leader"><UserPicker value={leader} onChange={(id) => setLeader(id)} filter={{ plantId: d.plantId }} /></Field>
          <Field label="Team"><UserPicker multiple value={team} onChange={(ids) => setTeam(ids)} filter={{ plantId: d.plantId }} /></Field>
          <div className="md:col-span-2"><Field label="Scope"><Textarea rows={3} value={scope} onChange={(e) => setScope(e.target.value)} /></Field></div>
          {matrixEditable && (
            <div className="md:col-span-2 space-y-1">
              <Label className="text-xs font-medium text-slate-700">Sign-off matrix</Label>
              <div className="flex flex-wrap gap-3">
                {(meta?.disciplines ?? []).map((x) => (
                  <Label key={x} className="flex items-center gap-1.5 text-sm font-normal">
                    <Checkbox checked={mandatory.has(x) || disc.includes(x)} disabled={mandatory.has(x)}
                      onCheckedChange={(v) => setDisc((cur) => (v === true ? Array.from(new Set([...cur, x])) : cur.filter((y) => y !== x)))} />
                    {meta?.disciplineLabels[x] ?? label(x)}
                  </Label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || title.trim().length < 3} onClick={() => onSubmit({
            title: title.trim(), area: area || null, unit: unit || null, scope: scope || null, phaStudyId: pha.trim() || null,
            plannedStartupDate: dateInputToIso(planned), leaderId: leader, teamUserIds: team,
            ...(matrixEditable ? { requiredDisciplines: disc } : {}),
          })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
