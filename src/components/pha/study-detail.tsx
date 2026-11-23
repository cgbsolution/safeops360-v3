"use client";

// One PHA study: header + workflow actions, then tabs for the overview, team,
// sessions, the node worksheets and the recommendation register.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Download, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { promptDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { UserPicker } from "@/components/ui/user-picker";
import {
  dateInputToIso, fmtDate, label, phaDownload, phaFetch, toDateInput, toLocalInput, type PhaMeta, type PhaSession,
  type PlantOption, type StudyDetail,
} from "@/lib/pha/api";
import { RecommendationsPanel } from "./recommendations";
import { EmptyRow, ErrorBox, Field, StatusBadge } from "./shared";
import { StudyForm } from "./study-form";
import { MatrixLegend, NodesPanel } from "./worksheet";

// ── team ─────────────────────────────────────────────────────────────────────
function TeamPanel({ study, meta, editable, onStudy }: { study: StudyDetail; meta: PhaMeta | null; editable: boolean; onStudy: (s: StudyDetail) => void }) {
  const [external, setExternal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(p: Promise<StudyDetail>) {
    setBusy(true);
    setError(null);
    try {
      onStudy(await p);
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const ok = await call(phaFetch<StudyDetail>(`/api/pha/studies/${study.id}/team`, {
      method: "POST",
      json: { userId: external ? null : userId, externalName: external ? name : null, organisation: org || null, discipline: discipline || null, role },
    }));
    if (ok) { setUserId(null); setName(""); setOrg(""); setDiscipline(""); setRole("MEMBER"); }
  }

  return (
    <div className="space-y-3">
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Discipline</TableHead><TableHead>Organisation</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {study.team.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.name ?? "—"}{m.isExternal && <span className="ml-1 text-[11px] text-slate-500">(external)</span>}</TableCell>
                <TableCell className="text-xs">{label(m.role)}</TableCell>
                <TableCell className="text-xs">{label(m.discipline)}</TableCell>
                <TableCell className="text-xs">{m.organisation ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {editable && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" aria-label="Remove member" disabled={busy}
                      onClick={() => call(phaFetch<StudyDetail>(`/api/pha/team/${m.id}`, { method: "DELETE" }))}><Trash2 size={14} /></Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {study.team.length === 0 && <EmptyRow text="No team members yet." />}
      </div>
      {editable && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Add team member</CardTitle></CardHeader>
          <CardContent className="grid items-end gap-3 md:grid-cols-6">
            <Field label="Member type">
              <Select value={external ? "EXT" : "USER"} onValueChange={(v) => setExternal(v === "EXT")} aria-label="Member type">
                <SelectItem value="USER">Platform user</SelectItem>
                <SelectItem value="EXT">External (vendor, consultant)</SelectItem>
              </Select>
            </Field>
            <Field label={external ? "Name" : "User"} className="md:col-span-2">
              {external ? <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
                : <UserPicker value={userId} onChange={(id) => setUserId(id)} placeholder="Pick a user" />}
            </Field>
            <Field label="Role">
              <Select value={role} onValueChange={setRole} aria-label="Role">
                {(meta?.teamRoles ?? ["MEMBER"]).map((r) => <SelectItem key={r} value={r}>{label(r)}</SelectItem>)}
              </Select>
            </Field>
            <Field label="Discipline">
              <Select value={discipline} onValueChange={setDiscipline} aria-label="Discipline">
                <SelectItem value="">—</SelectItem>
                {(meta?.disciplines ?? []).map((d) => <SelectItem key={d} value={d}>{label(d)}</SelectItem>)}
              </Select>
            </Field>
            <Field label="Organisation"><Input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Optional" /></Field>
            <div className="md:col-span-6 flex justify-end">
              <Button size="sm" onClick={add} disabled={busy || (external ? name.trim().length < 2 : !userId)}><Plus size={14} /> Add member</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── sessions ─────────────────────────────────────────────────────────────────
function SessionDialog({
  open, onOpenChange, study, session, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; study: StudyDetail; session: PhaSession | null; onSaved: (s: StudyDetail) => void }) {
  const [date, setDate] = useState(toLocalInput());
  const [duration, setDuration] = useState("180");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [externals, setExternals] = useState("");
  const [nodeIds, setNodeIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(session ? toLocalInput(new Date(session.sessionDate)) : toLocalInput());
    setDuration(session?.durationMinutes ? String(session.durationMinutes) : "180");
    setAttendees(session?.attendeeUserIds ?? study.team.filter((m) => m.userId).map((m) => m.userId as string));
    setExternals((session?.attendeeNames ?? study.team.filter((m) => m.isExternal).map((m) => m.name ?? "")).join(", "));
    setNodeIds(session?.nodeIds ?? []);
    setNotes(session?.notes ?? "");
    setError(null);
  }, [open, session, study.team]);

  async function save() {
    setBusy(true);
    setError(null);
    const json = {
      sessionDate: new Date(date).toISOString(), durationMinutes: duration ? Number(duration) : null, attendeeUserIds: attendees,
      attendeeNames: externals.split(",").map((x) => x.trim()).filter(Boolean), nodeIds, notes: notes || null,
    };
    try {
      const r = session
        ? await phaFetch<StudyDetail>(`/api/pha/sessions/${session.id}`, { method: "PUT", json })
        : await phaFetch<StudyDetail>(`/api/pha/studies/${study.id}/sessions`, { method: "POST", json });
      onSaved(r);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Could not save the session");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>{session ? `Edit session ${session.sessionNo}` : "Record session"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <ErrorBox error={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date and time" required><Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Duration (minutes)"><Input type="number" min={10} max={1440} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
          </div>
          <Field label="Attendees (platform users)">
            <UserPicker multiple value={attendees} onChange={(ids) => setAttendees(ids)} placeholder="Pick attendees" />
          </Field>
          <Field label="External attendees" hint="Comma-separated names."><Input value={externals} onChange={(e) => setExternals(e.target.value)} /></Field>
          <Field label="Nodes covered">
            <div className="space-y-1 rounded-md border border-slate-200 p-2">
              {study.nodes.map((n) => {
                const on = nodeIds.includes(n.id);
                return (
                  <Button key={n.id} type="button" variant={on ? "secondary" : "ghost"} size="sm" className="w-full justify-start text-xs"
                    onClick={() => setNodeIds((p) => (on ? p.filter((x) => x !== n.id) : [...p, n.id]))}>
                    {on ? "✓ " : ""}Node {n.nodeNo}: {n.title}
                  </Button>
                );
              })}
              {study.nodes.length === 0 && <p className="text-xs text-slate-400">No nodes yet.</p>}
            </div>
          </Field>
          <Field label="Notes"><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Decisions, parking-lot items, open questions" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !date}>Save session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionsPanel({ study, editable, onStudy }: { study: StudyDetail; editable: boolean; onStudy: (s: StudyDetail) => void }) {
  const [dialog, setDialog] = useState<{ open: boolean; session: PhaSession | null }>({ open: false, session: null });
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <ErrorBox error={error} />
      {editable && <div className="flex justify-end"><Button size="sm" onClick={() => setDialog({ open: true, session: null })}><Plus size={14} /> Record session</Button></div>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow><TableHead>#</TableHead><TableHead>Date</TableHead><TableHead>Duration</TableHead><TableHead>Attendees</TableHead><TableHead>Nodes covered</TableHead><TableHead>Notes</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {study.sessions.map((x) => (
              <TableRow key={x.id} className="align-top">
                <TableCell className="tabular-nums">{x.sessionNo}</TableCell>
                <TableCell className="text-xs">{fmtDate(x.sessionDate, true)}</TableCell>
                <TableCell className="text-xs">{x.durationMinutes ? `${x.durationMinutes} min` : "—"}</TableCell>
                <TableCell className="max-w-xs text-xs">{[...x.attendees.map((a) => a.name), ...x.attendeeNames].join(", ") || "—"}</TableCell>
                <TableCell className="text-xs">{x.nodeLabels.join(", ") || "—"}</TableCell>
                <TableCell className="max-w-xs whitespace-pre-line text-xs">{x.notes ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {editable && (
                    <>
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Edit session" onClick={() => setDialog({ open: true, session: x })}><Pencil size={14} /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" aria-label="Delete session" onClick={async () => {
                        try { onStudy(await phaFetch<StudyDetail>(`/api/pha/sessions/${x.id}`, { method: "DELETE" })); } catch (e: any) { setError(e?.message ?? "Could not delete"); }
                      }}><Trash2 size={14} /></Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {study.sessions.length === 0 && <EmptyRow text="No sessions recorded." />}
      </div>
      <SessionDialog open={dialog.open} onOpenChange={(v) => setDialog((p) => ({ ...p, open: v }))} study={study} session={dialog.session} onSaved={onStudy} />
    </div>
  );
}

// ── approve dialog ───────────────────────────────────────────────────────────
function ApproveDialog({ open, onOpenChange, years, busy, onSubmit }: { open: boolean; onOpenChange: (v: boolean) => void; years: number; busy: boolean; onSubmit: (b: { comments: string; revalidationDueDate: string | null }) => void }) {
  const [comments, setComments] = useState("");
  const [due, setDue] = useState("");
  useEffect(() => {
    if (open) {
      const d = new Date();
      d.setFullYear(d.getFullYear() + years);
      setDue(toDateInput(d.toISOString()));
      setComments("");
    }
  }, [open, years]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Approve study</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Approval accepts the worksheet and its residual risks. Open recommendations stay tracked until the study is closed.</p>
          <Field label="Revalidation due" hint={`Default ${years} years from approval.`}><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Comments"><Textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="success" disabled={busy} onClick={() => onSubmit({ comments, revalidationDueDate: dateInputToIso(due) })}>Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── study ────────────────────────────────────────────────────────────────────
export function StudyDetailView({ initial, meta, plants }: { initial: StudyDetail; meta: PhaMeta | null; plants: PlantOption[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [s, setS] = useState<StudyDetail>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingHeader, setEditingHeader] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [tab, setTab] = useState("worksheet");
  const editable = s.perms.update && (s.status === "DRAFT" || s.status === "IN_PROGRESS");
  const onStudy = useCallback((x: StudyDetail) => setS(x), []);

  async function act(path: string, json: unknown, msg: string) {
    setBusy(true);
    setError(null);
    try {
      setS(await phaFetch<StudyDetail>(`/api/pha/studies/${s.id}${path}`, { method: "POST", json }));
      toast({ title: msg, variant: "success" });
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function returnForRework() {
    const comments = await promptDialog({ title: "Return for rework", description: "What does the team need to change?", placeholder: "Review comments", confirmLabel: "Return" });
    if (comments) await act("/return", { comments }, "Study returned for rework");
  }

  async function deleteDraft() {
    const reason = await promptDialog({ title: "Delete draft study?", description: "Give a reason (at least 10 characters).", placeholder: "Reason", confirmLabel: "Delete", destructive: true });
    if (!reason) return;
    try {
      await phaFetch(`/api/pha/studies/${s.id}`, { method: "DELETE", json: { reason } });
      router.push("/process-safety/hazop");
    } catch (e: any) {
      setError(e?.message ?? "Could not delete");
    }
  }

  async function exportXlsx() {
    try {
      await phaDownload(`/api/pha/studies/${s.id}/export.xlsx`, `${s.studyNo}_worksheet.xlsx`);
    } catch (e: any) {
      setError(e?.message ?? "Export failed");
    }
  }

  const rc = s.recommendationCounts ?? {};
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={s.status} />
        <span className="text-sm text-slate-600">{s.methodLabel} · {s.plantName ?? ""}{s.unit ? ` · ${s.unit}` : ""}{s.area ? ` · ${s.area}` : ""}</span>
        {s.revalidationState && <span className="text-xs text-slate-500">Revalidation {fmtDate(s.revalidationDueDate)} <StatusBadge status={s.revalidationState} /></span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportXlsx}><Download size={14} /> Worksheet XLSX</Button>
          <Button asChild size="sm" variant="outline"><Link href={`/process-safety/hazop/${s.id}/report`}><Printer size={14} /> Report</Link></Button>
          {s.status === "DRAFT" && s.perms.update && <Button size="sm" variant="ghost" className="text-rose-600" onClick={deleteDraft}>Delete draft</Button>}
          {s.status === "DRAFT" && s.perms.update && <Button size="sm" disabled={busy} onClick={() => act("/start", undefined, "Study started")}>Start study</Button>}
          {s.status === "IN_PROGRESS" && s.perms.update && (
            <Button size="sm" disabled={busy || s.submitBlockers.length > 0} title={s.submitBlockers.join("\n")} onClick={() => act("/submit", undefined, "Submitted for review")}>Submit for review</Button>
          )}
          {s.status === "UNDER_REVIEW" && s.perms.approve && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={returnForRework}>Return for rework</Button>
              <Button size="sm" variant="success" disabled={busy} onClick={() => setApproveOpen(true)}>Approve</Button>
            </>
          )}
          {s.status === "APPROVED" && s.perms.approve && (
            <Button size="sm" disabled={busy || s.closeBlockers.length > 0} title={s.closeBlockers.join("\n")} onClick={() => act("/close", undefined, "Study closed")}>Close study</Button>
          )}
        </div>
      </div>
      <ErrorBox error={error} />
      {s.status === "IN_PROGRESS" && s.submitBlockers.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="mb-1 font-semibold">Before submitting for review:</div>
          <ul className="list-disc space-y-0.5 pl-5">{s.submitBlockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
      {s.status === "APPROVED" && s.closeBlockers.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <div className="mb-1 font-semibold">To close this study:</div>
          <ul className="list-disc space-y-0.5 pl-5">{s.closeBlockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
      {s.reviewComments && <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900"><span className="font-semibold">Review comments:</span> {s.reviewComments}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Nodes", s.nodes.length], ["Worksheet rows", s.nodes.reduce((a, n) => a + n.rowCount, 0)],
          ["Open recommendations", (rc.OPEN ?? 0) + (rc.IN_PROGRESS ?? 0)], ["Overdue", s.overdueRecommendations],
          ["Closed / rejected", (rc.CLOSED ?? 0) + (rc.REJECTED ?? 0)],
        ].map(([t, v]) => (
          <div key={t as string} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t}</div>
            <div className={`mt-1 text-xl font-bold tabular-nums ${t === "Overdue" && (v as number) > 0 ? "text-rose-600" : "text-slate-900"}`}>{v}</div>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="team">Team ({s.team.length})</TabsTrigger>
          <TabsTrigger value="sessions">Sessions ({s.sessions.length})</TabsTrigger>
          <TabsTrigger value="worksheet">Nodes &amp; worksheet</TabsTrigger>
          <TabsTrigger value="recs">Recommendations ({Object.values(rc).reduce((a, b) => a + b, 0)})</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          {editingHeader ? (
            <StudyForm plants={plants} meta={meta} study={s} onSaved={(x) => { setS(x); setEditingHeader(false); }} onCancel={() => setEditingHeader(false)} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm">Study</CardTitle>
                  {editable && <Button size="sm" variant="outline" onClick={() => setEditingHeader(true)}><Pencil size={14} /> Edit</Button>}
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[160px_1fr]">
                    <dt className="text-slate-500">Scope</dt><dd className="whitespace-pre-line">{s.scope || "—"}</dd>
                    <dt className="text-slate-500">Design intent</dt><dd className="whitespace-pre-line">{s.designIntentSummary || "—"}</dd>
                    <dt className="text-slate-500">Drawings</dt><dd>{s.drawingRefs.join(", ") || "—"}</dd>
                    <dt className="text-slate-500">Facilitator</dt><dd>{s.facilitatorName ?? "—"}</dd>
                    <dt className="text-slate-500">Scribe</dt><dd>{s.scribeName ?? "—"}</dd>
                    <dt className="text-slate-500">Approver</dt><dd>{s.approverName ?? "—"}</dd>
                    <dt className="text-slate-500">MOC reference</dt><dd>{s.mocId ?? "—"}</dd>
                    {s.approvedAt && <><dt className="text-slate-500">Approved</dt><dd>{fmtDate(s.approvedAt)} by {s.approvedByName ?? "—"}</dd></>}
                    {s.closedAt && <><dt className="text-slate-500">Closed</dt><dd>{fmtDate(s.closedAt)}</dd></>}
                  </dl>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Risk matrix</CardTitle></CardHeader>
                <CardContent><MatrixLegend matrix={s.matrix} /></CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
        <TabsContent value="team" className="mt-4"><TeamPanel study={s} meta={meta} editable={editable} onStudy={onStudy} /></TabsContent>
        <TabsContent value="sessions" className="mt-4"><SessionsPanel study={s} editable={editable} onStudy={onStudy} /></TabsContent>
        <TabsContent value="worksheet" className="mt-4"><NodesPanel study={s} meta={meta} onStudy={onStudy} /></TabsContent>
        <TabsContent value="recs" className="mt-4">
          <RecommendationsPanel key={`${s.status}-${Object.values(rc).join("-")}`} studyId={s.id} studyStatus={s.status} canUpdate={s.perms.update}
            onChanged={async () => { try { setS(await phaFetch<StudyDetail>(`/api/pha/studies/${s.id}`)); } catch { /* keep */ } }} />
        </TabsContent>
      </Tabs>

      <ApproveDialog open={approveOpen} onOpenChange={setApproveOpen} years={meta?.revalidationYears ?? 5} busy={busy}
        onSubmit={async (b) => { if (await act("/approve", b, "Study approved")) setApproveOpen(false); }} />
    </div>
  );
}
