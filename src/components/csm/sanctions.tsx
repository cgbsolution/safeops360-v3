"use client";

// Suspend / blacklist / reinstate: request (CSM.MANAGE) and approve or reject
// (CSM.APPROVE, plant head or corporate HSE; never the requester).

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { promptDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { csmFetch, dateToIso, fmtDate, label, type CsmMeta, type PlantOption, type Sanction } from "@/lib/csm/api";
import { EmptyRow, ErrorBox, Field, LinkButton, Pill, PlantSelect } from "./shared";

export function SanctionTable({ rows, onChanged, showContractor = false }: { rows: Sanction[]; onChanged: () => void; showContractor?: boolean }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(s: Sanction, approve: boolean) {
    const text = await promptDialog({
      title: `${approve ? "Approve" : "Reject"} ${label(s.action).toLowerCase()} — ${s.sanctionNo}`,
      description: approve
        ? s.action === "REINSTATE"
          ? "The contractor becomes active again. From a blacklist it must requalify before it can work."
          : "The contractor's live work orders are suspended, cleared workers blocked and today's gate passes revoked."
        : "Say why the request is rejected.",
      confirmLabel: approve ? "Approve" : "Reject",
      destructive: !approve || s.action !== "REINSTATE",
      placeholder: approve ? "Approval notes (optional)" : "Reason for rejection",
    });
    if (text === null) return;
    if (!approve && text.trim().length < 3) {
      toast({ variant: "error", title: "A reason is required to reject" });
      return;
    }
    setBusy(s.id);
    try {
      await csmFetch(`/api/csm/sanctions/${s.id}/${approve ? "approve" : "reject"}`, {
        method: "POST", json: approve ? { notes: text || null } : { reason: text },
      });
      toast({ variant: "success", title: `${s.sanctionNo} ${approve ? "approved" : "rejected"}` });
      onChanged();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not record the decision", description: e?.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[860px] text-sm">
        <TableHeader className="bg-slate-50">
          <TableRow>
            <TableHead>Request</TableHead>{showContractor && <TableHead>Contractor</TableHead>}<TableHead>Action</TableHead>
            <TableHead>Reason</TableHead><TableHead>Requested</TableHead><TableHead>Status</TableHead><TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.sanctionNo}<div className="text-[11px] text-slate-500">{s.plantName ?? ""}</div></TableCell>
              {showContractor && (
                <TableCell><LinkButton href={`/csm/contractors/${s.contractorCompanyId}`}>{s.contractorName ?? "Contractor"}</LinkButton></TableCell>
              )}
              <TableCell>
                <Pill value={s.action === "BLACKLIST" ? "BLACKLISTED" : s.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE"} text={label(s.action)} />
                {s.effectiveUntil && <div className="text-[11px] text-slate-500">until {fmtDate(s.effectiveUntil)}</div>}
              </TableCell>
              <TableCell className="max-w-sm">
                <div className="text-xs font-medium">{label(s.reasonCategory)}</div>
                <div className="line-clamp-2 text-[11px] text-slate-600">{s.reason}</div>
                {s.evidence.length > 0 && <div className="text-[11px] text-slate-500">Evidence: {s.evidence.map((e) => e.label).join(", ")}</div>}
              </TableCell>
              <TableCell className="text-xs">{fmtDate(s.requestedAt)}<div className="text-[11px] text-slate-500">{s.requestedByName ?? ""}</div></TableCell>
              <TableCell>
                <Pill value={s.status} />
                {s.decidedAt && <div className="text-[11px] text-slate-500">{fmtDate(s.decidedAt)} · {s.decidedByName ?? ""}</div>}
                {s.decisionNotes && <div className="line-clamp-1 text-[11px] text-slate-500">{s.decisionNotes}</div>}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right">
                {s.status === "PENDING_APPROVAL" && (
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" disabled={busy === s.id} onClick={() => decide(s, true)}>Approve</Button>
                    <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => decide(s, false)}>Reject</Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && <EmptyRow text="No sanction requests." />}
    </div>
  );
}

export function RequestSanctionDialog({
  open, onOpenChange, contractorId, contractorName, currentStatus, plants, meta, defaultPlantId, evidenceOptions, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; contractorId: string; contractorName: string; currentStatus: string;
  plants: PlantOption[]; meta: CsmMeta | null; defaultPlantId: string | null;
  evidenceOptions: { type: string; id: string; label: string }[]; onSaved: () => void;
}) {
  const { toast } = useToast();
  const blocked = ["SUSPENDED", "BLACKLISTED"].includes((currentStatus || "ACTIVE").toUpperCase());
  const actions = (meta?.sanctionActions ?? ["SUSPEND", "BLACKLIST", "REINSTATE"]).filter((a) =>
    a === "REINSTATE" ? blocked : !(a === "SUSPEND" && blocked) && !(a === "BLACKLIST" && currentStatus === "BLACKLISTED"),
  );
  const [action, setAction] = useState(actions[0] ?? "SUSPEND");
  const [plantId, setPlantId] = useState(defaultPlantId ?? plants[0]?.id ?? "");
  const [reasonCategory, setReasonCategory] = useState("REPEATED_VIOLATIONS");
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [evidence, setEvidence] = useState<string>("");
  const [picked, setPicked] = useState<{ type: string; id: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAction(actions[0] ?? "SUSPEND");
      setPlantId(defaultPlantId ?? plants[0]?.id ?? "");
      setReasonCategory(blocked ? "CORRECTIVE_ACTIONS_COMPLETED" : "REPEATED_VIOLATIONS");
      setReason(""); setUntil(""); setPicked([]); setEvidence(""); setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await csmFetch("/api/csm/sanctions", {
        method: "POST",
        json: { contractorCompanyId: contractorId, plantId, action, reasonCategory, reason, evidence: picked,
                effectiveUntil: action === "SUSPEND" ? dateToIso(until) : null },
      });
      toast({ variant: "success", title: "Request sent for approval", description: "A plant head or corporate HSE must approve it." });
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Could not send the request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sanction — {contractorName}</DialogTitle>
          <DialogDescription>Takes effect only when a plant head or corporate HSE approves. The requester cannot approve.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Action" required>
              <Select value={action} onValueChange={setAction} className="w-full">
                {actions.map((a) => <SelectItem key={a} value={a}>{label(a)}</SelectItem>)}
              </Select>
            </Field>
            <Field label="Requesting plant" required>
              <PlantSelect plants={plants} value={plantId} onChange={setPlantId} allowAll={false} className="w-full" />
            </Field>
          </div>
          <Field label="Reason category" required>
            <Select value={reasonCategory} onValueChange={setReasonCategory} className="w-full">
              {(meta?.sanctionReasons ?? []).map((r) => <SelectItem key={r} value={r}>{label(r)}</SelectItem>)}
            </Select>
          </Field>
          <Field label="Reason" required hint="At least 10 characters. What happened, and why this sanction.">
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {action === "SUSPEND" && (
            <Field label="Suspended until (optional)"><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
          )}
          {evidenceOptions.length > 0 && (
            <Field label="Evidence" hint="Records from the Contractor 360 that support the request.">
              <div className="flex gap-2">
                <Select value={evidence} onValueChange={setEvidence} className="w-full" placeholder="Pick a record">
                  {evidenceOptions.map((o) => <SelectItem key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>{label(o.type)} · {o.label}</SelectItem>)}
                </Select>
                <Button type="button" variant="outline" disabled={!evidence} onClick={() => {
                  const o = evidenceOptions.find((x) => `${x.type}:${x.id}` === evidence);
                  if (o && !picked.some((p) => p.id === o.id)) setPicked([...picked, o]);
                  setEvidence("");
                }}>Add</Button>
              </div>
              {picked.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {picked.map((p) => (
                    <Button key={p.id} type="button" size="sm" variant="secondary" onClick={() => setPicked(picked.filter((x) => x.id !== p.id))}>
                      {p.label} ✕
                    </Button>
                  ))}
                </div>
              )}
            </Field>
          )}
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={action === "REINSTATE" ? "default" : "destructive"} onClick={save} disabled={busy || !plantId || reason.trim().length < 10}>
            {busy ? "Sending…" : "Send for approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
