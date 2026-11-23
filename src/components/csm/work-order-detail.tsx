"use client";

// One work order: safety checklist and activation gate, lifecycle actions, and
// plant mobilisation: the roster of existing ContractorWorker records with
// plant induction and the gate clearance (medical fitness, safety-roster hold,
// contractor status, prequalification, induction).

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, UserPlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { confirmDialog, promptDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { csmFetch, dateToIso, fmtDate, label, type Clearance, type CsmMeta, type Worker, type WorkOrderDetail } from "@/lib/csm/api";
import { EmptyRow, ErrorBox, Field, KeyVal, LinkButton, Panel, Pill } from "./shared";

export function WorkOrderDetailView({ id, meta }: { id: string; meta: CsmMeta | null }) {
  const { toast } = useToast();
  const [w, setW] = useState<WorkOrderDetail | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [clearance, setClearance] = useState<{ name: string; c: Clearance } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await csmFetch<WorkOrderDetail>(`/api/csm/work-orders/${id}`);
      setW(r);
      setChecklist(r.safetyChecklist);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load the work order");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function call(path: string, method: "POST" | "PATCH", json: unknown, ok: string): Promise<WorkOrderDetail | null> {
    setBusy(true);
    setError(null);
    try {
      const r = await csmFetch<WorkOrderDetail>(`/api/csm/work-orders/${id}${path}`, { method, json });
      setW(r);
      setChecklist(r.safetyChecklist);
      if (ok) toast({ variant: "success", title: ok });
      return r;
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function withReason(path: string, title: string, ok: string, optional = false) {
    const text = await promptDialog({ title, placeholder: optional ? "Notes (optional)" : "Reason" });
    if (text === null) return;
    if (!optional && text.trim().length < 3) {
      toast({ variant: "error", title: "A reason is required" });
      return;
    }
    await call(path, "POST", optional ? { notes: text || null } : { reason: text }, ok);
  }

  if (!w) return <ErrorBox error={error} />;
  const draft = w.status === "DRAFT";
  const checklistDirty = JSON.stringify(checklist) !== JSON.stringify(w.safetyChecklist);
  const ratio = w.supervisorCount ? (w.estimatedManpower / w.supervisorCount).toFixed(0) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{w.workOrderNo}</h2>
              <Pill value={w.status} />
              {w.contractorStatus && w.contractorStatus !== "ACTIVE" && <Pill value={w.contractorStatus} />}
            </div>
            <div className="mt-0.5 text-sm text-slate-700">{w.title}</div>
            <div className="mt-1 text-sm text-slate-600">
              <LinkButton href={`/csm/contractors/${w.contractorCompanyId}`}>{w.contractorName ?? "Contractor"}</LinkButton>
              {" · "}prequalification <Pill value={w.contractorQualification} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(draft || w.status === "SUSPENDED") && (
              <Button size="sm" disabled={busy || w.activationBlockers.length > 0 || checklistDirty} onClick={() => call("/activate", "POST", {}, draft ? "Work order activated" : "Work order resumed")}>
                {draft ? "Activate" : "Resume"}
              </Button>
            )}
            {w.status === "ACTIVE" && <Button size="sm" variant="outline" disabled={busy} onClick={() => withReason("/suspend", "Suspend this work order", "Work order suspended")}>Suspend</Button>}
            {["ACTIVE", "SUSPENDED"].includes(w.status) && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => withReason("/complete", "Complete this work order", "Work order completed", true)}>Complete</Button>
            )}
            {["DRAFT", "SUSPENDED"].includes(w.status) && (
              <Button size="sm" variant="ghost" className="text-rose-700" disabled={busy} onClick={() => withReason("/cancel", "Cancel this work order", "Work order cancelled")}>Cancel</Button>
            )}
            {w.status === "COMPLETED" && (
              <LinkButton href={`/csm/evaluations?new=1&contractorId=${w.contractorCompanyId}&workOrderId=${w.id}&plantId=${w.plantId}`} variant="default">
                Contract-end evaluation
              </LinkButton>
            )}
          </div>
        </div>
        {w.suspendedReason && w.status === "SUSPENDED" && (
          <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-2 text-sm text-orange-900">Suspended: {w.suspendedReason}</div>
        )}
        {(draft || w.status === "SUSPENDED") && w.activationBlockers.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} /> Cannot {draft ? "activate" : "resume"} yet</div>
            <ul className="mt-1 list-disc pl-5 text-xs">{w.activationBlockers.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        )}
        <div className="mt-3"><ErrorBox error={error} /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Work order" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <KeyVal k="Plant / area" v={`${w.plantName ?? "—"}${w.areaName ? ` · ${w.areaName}` : ""}`} />
            <KeyVal k="Type" v={label(w.workType)} />
            <KeyVal k="Contract / PO" v={w.contractRef} />
            <KeyVal k="Start" v={fmtDate(w.startDate)} />
            <KeyVal k="End" v={fmtDate(w.endDate)} />
            <KeyVal k="Engineer-in-charge" v={w.engineerInChargeName} />
            <KeyVal k="Manpower" v={w.estimatedManpower} />
            <KeyVal k="Supervisors" v={w.supervisorCount === null ? "—" : `${w.supervisorCount}${ratio ? ` (1:${ratio})` : ""}`} />
            <KeyVal k="High-risk activities" v={w.highRiskActivities.map(label).join(", ") || "None"} />
          </div>
          <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{w.scope}</p>
          {w.safetyNotes && <p className="mt-2 text-xs text-slate-600"><strong>Safety notes:</strong> {w.safetyNotes}</p>}
        </Panel>
        <Panel title="Safety requirements" action={draft && checklistDirty ? <Button size="sm" disabled={busy} onClick={() => call("", "PATCH", { safetyChecklist: checklist }, "Checklist saved")}>Save</Button> : null}>
          <div className="space-y-2">
            {(meta?.safetyChecklist ?? []).map((c) => (
              <div key={c.key} className="flex items-start gap-2">
                <Checkbox id={`wo-${c.key}`} className="mt-0.5" checked={!!checklist[c.key]} disabled={!draft}
                          onCheckedChange={(v) => setChecklist({ ...checklist, [c.key]: v === true })} />
                <Label htmlFor={`wo-${c.key}`} className="text-sm font-normal leading-snug">{c.label}</Label>
              </div>
            ))}
          </div>
          {!draft && <p className="mt-2 text-[11px] text-slate-500">Frozen at activation (it is the activation evidence).</p>}
        </Panel>
      </div>

      <Panel
        title={`Plant mobilisation · ${w.roster.length} worker(s), ${w.rosterCounts.CLEARED ?? 0} cleared`}
        action={["DRAFT", "ACTIVE", "SUSPENDED"].includes(w.status) ? <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}><UserPlus size={13} /> Add workers</Button> : null}
      >
        <div className="overflow-x-auto">
          <Table className="min-w-[1000px] text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead><TableHead>Medical fitness</TableHead><TableHead>Plant induction</TableHead>
                <TableHead>Safety hold</TableHead><TableHead>Status</TableHead><TableHead>Gate pass</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {w.roster.map((r) => (
                <TableRow key={r.id} className={cn(r.status === "RELEASED" && "opacity-60")}>
                  <TableCell>
                    <div className="font-medium">{r.fullName}</div>
                    <div className="text-[11px] text-slate-500">{r.workerCode} · {r.tradeAtSite ?? r.primaryTrade ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-xs">{fmtDate(r.medicalValidUntil)} {r.medicalState !== "OK" && <Pill value={r.medicalState} />}</TableCell>
                  <TableCell className="text-xs">
                    {r.inductionValidUntil ? <>until {fmtDate(r.inductionValidUntil)}<div className="text-[11px] text-slate-500">{r.inductionByName ?? ""}</div></> : <span className="text-rose-700">Not inducted</span>}
                  </TableCell>
                  <TableCell className="text-xs">{r.rosterStatus === "active" ? "—" : <Pill value="BLOCKED" text={label(r.rosterStatus)} />}</TableCell>
                  <TableCell>
                    <Pill value={r.status} />
                    {r.lastCheck && r.status === "BLOCKED" && (
                      <Button variant="link" size="sm" className="h-auto p-0 text-[11px]" onClick={() => setClearance({ name: r.fullName, c: r.lastCheck as Clearance })}>Why?</Button>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{r.gatePassNo ?? "—"}{r.gatePassValidUntil && <div className="text-[11px] text-slate-500">until {fmtDate(r.gatePassValidUntil)}</div>}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {r.status !== "RELEASED" && (
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
                          if (await confirmDialog({ title: `Record plant induction for ${r.fullName}?`, description: "Valid for 12 months from today." }))
                            call(`/roster/${r.id}/induction`, "POST", {}, "Induction recorded");
                        }}>Induction</Button>
                        <Button size="sm" disabled={busy} onClick={async () => {
                          const res = await call(`/roster/${r.id}/clear`, "POST", null, "");
                          if (res?.clearance) setClearance({ name: r.fullName, c: res.clearance });
                        }}>Gate check</Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => call(`/roster/${r.id}/release`, "POST", null, "Worker released")}>Release</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {w.roster.length === 0 && <EmptyRow text="No workers on this work order yet." />}
        </div>
      </Panel>

      <Panel title="History">
        <ol className="space-y-1.5 text-sm">
          {w.history.map((h, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <span className="w-36 shrink-0 text-xs text-slate-500">{fmtDate(h.at, true)}</span>
              <span className="font-medium">{h.from ? `${label(h.from)} → ` : ""}{label(h.to)}</span>
              <span className="text-slate-600">{h.note ?? ""}</span>
              <span className="text-xs text-slate-500">{h.byName ?? ""}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <AddWorkersDialog open={addOpen} onOpenChange={setAddOpen} w={w} onSaved={(r) => { setW(r); }} />
      <ClearanceDialog value={clearance} onClose={() => setClearance(null)} />
    </div>
  );
}

const CHECK_LABELS: Record<string, string> = {
  work_order: "Work order active", contractor_status: "Contractor not suspended / blacklisted",
  prequalification: "Contractor prequalified", company_match: "Worker of this contractor",
  medical_fitness: "Medical fitness", worker_status: "Worker status", safety_roster: "No safety hold (deroster)",
  plant_induction: "Plant induction",
};

function ClearanceDialog({ value, onClose }: { value: { name: string; c: Clearance } | null; onClose: () => void }) {
  if (!value) return null;
  const { c } = value;
  const ok = c.overall !== "not_cleared";
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gate check · {value.name}</DialogTitle>
          <DialogDescription>{ok ? `Cleared. Plant gate pass valid until ${fmtDate(c.passValidUntil)}.` : "Not cleared. Fix the items in red and check again."}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 text-sm">
          {Object.entries(c.checks ?? {}).map(([k, v]) => (
            <li key={k} className="flex items-start gap-2">
              {v.result === "pass" ? <CheckCircle2 size={15} className="mt-0.5 text-emerald-600" /> : v.result === "warn"
                ? <AlertCircle size={15} className="mt-0.5 text-amber-600" /> : <XCircle size={15} className="mt-0.5 text-rose-600" />}
              <span><span className="font-medium">{CHECK_LABELS[k] ?? label(k)}</span><span className="block text-xs text-slate-500">{v.detail}</span></span>
            </li>
          ))}
          {c.note && <li className="text-xs text-slate-600">{c.note}</li>}
        </ul>
        <DialogFooter><Button onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddWorkersDialog({ open, onOpenChange, w, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; w: WorkOrderDetail; onSaved: (r: WorkOrderDetail) => void }) {
  const { toast } = useToast();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [nw, setNw] = useState({ fullName: "", primaryTrade: "", mobileNumber: "", medical: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onRoster = new Set(w.roster.filter((r) => r.status !== "RELEASED").map((r) => r.contractorWorkerId));

  const loadWorkers = useCallback(async () => {
    try {
      const r = await csmFetch<{ items: Worker[] }>(`/api/csm/contractors/${w.contractorCompanyId}/workers`);
      setWorkers(r.items);
    } catch (e: any) {
      setError(e?.message ?? "Could not load workers");
    }
  }, [w.contractorCompanyId]);

  useEffect(() => {
    if (open) { setPicked([]); setQ(""); setError(null); setNw({ fullName: "", primaryTrade: "", mobileNumber: "", medical: "" }); loadWorkers(); }
  }, [open, loadWorkers]);

  async function registerWorker() {
    setBusy(true);
    setError(null);
    try {
      const r = await csmFetch<Worker>(`/api/csm/contractors/${w.contractorCompanyId}/workers`, {
        method: "POST",
        json: { fullName: nw.fullName, primaryTrade: nw.primaryTrade || null, mobileNumber: nw.mobileNumber || null, medicalValidUntil: dateToIso(nw.medical) },
      });
      toast({ variant: "success", title: `${r.fullName} registered (${r.workerCode})` });
      setNw({ fullName: "", primaryTrade: "", mobileNumber: "", medical: "" });
      await loadWorkers();
      setPicked((p) => [...p, r.id]);
    } catch (e: any) {
      setError(e?.message ?? "Could not register the worker");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const r = await csmFetch<WorkOrderDetail>(`/api/csm/work-orders/${w.id}/roster`, { method: "POST", json: { contractorWorkerIds: picked } });
      onSaved(r);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Could not add the workers");
    } finally {
      setBusy(false);
    }
  }

  const shown = workers.filter((x) => !q || `${x.fullName} ${x.workerCode}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add workers · {w.contractorName}</DialogTitle>
          <DialogDescription>Workers come from the contractor&apos;s worker register (the same records the EPC gate uses).</DialogDescription>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or worker code" className="h-9" />
        <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
          {shown.map((x) => {
            const already = onRoster.has(x.id);
            return (
              <div key={x.id} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-0">
                <Checkbox id={`pick-${x.id}`} disabled={already} checked={already || picked.includes(x.id)}
                          onCheckedChange={(v) => setPicked(v === true ? [...picked, x.id] : picked.filter((p) => p !== x.id))} />
                <Label htmlFor={`pick-${x.id}`} className="flex-1 font-normal">
                  {x.fullName} <span className="text-xs text-slate-500">{x.workerCode} · {x.primaryTrade ?? "—"}</span>
                </Label>
                <span className="text-[11px] text-slate-500">medical {fmtDate(x.currentMedicalValidUntil)}</span>
                {x.medicalState !== "OK" && <Pill value={x.medicalState} />}
                {already && <span className="text-[11px] text-slate-500">on roster</span>}
              </div>
            );
          })}
          {shown.length === 0 && <EmptyRow text="No workers registered for this contractor yet." />}
        </div>
        <div className="rounded-lg border border-dashed border-slate-300 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-700">Register a new worker</div>
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label="Full name" required><Input value={nw.fullName} onChange={(e) => setNw({ ...nw, fullName: e.target.value })} /></Field>
            <Field label="Trade"><Input value={nw.primaryTrade} onChange={(e) => setNw({ ...nw, primaryTrade: e.target.value })} /></Field>
            <Field label="Mobile"><Input value={nw.mobileNumber} onChange={(e) => setNw({ ...nw, mobileNumber: e.target.value })} /></Field>
            <Field label="Medical valid until"><Input type="date" value={nw.medical} onChange={(e) => setNw({ ...nw, medical: e.target.value })} /></Field>
          </div>
          <Button size="sm" variant="outline" className="mt-2" disabled={busy || nw.fullName.trim().length < 2} onClick={registerWorker}>Register worker</Button>
        </div>
        <ErrorBox error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={add} disabled={busy || picked.length === 0}>Add {picked.length || ""} to roster</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
