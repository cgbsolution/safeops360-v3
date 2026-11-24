"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/client-errors";
import { RaiseImpairmentDialog } from "./raise-impairment-dialog";

type Row = {
  id: string;
  code: string;
  systemType: string;
  systemName: string;
  areaId: string | null;
  areaName: string | null;
  reason: string;
  status: "requested" | "approved" | "active" | "restored" | "cancelled";
  inForce: boolean;
  restoreStatus: "on_track" | "due_soon" | "overdue" | null;
  startedAt: string;
  plannedRestoreAt: string | null;
  restoredAt: string | null;
  precautions: string[];
  effect: string;
  effectSeverity: string;
  createdBy: string | null;
  createdById: string;
  approvedBy: string | null;
  restoredBy: string | null;
  cancelledReason: string | null;
  escalationCount: number;
};
type ListOut = { items: Row[]; ready: boolean; permissions: { create: boolean; approve: boolean } };

const STATUS_STYLE: Record<Row["status"], string> = {
  requested: "bg-slate-100 text-slate-800 border-slate-200",
  approved: "bg-blue-50 text-blue-800 border-blue-200",
  active: "bg-rose-50 text-rose-800 border-rose-200",
  restored: "bg-emerald-50 text-emerald-800 border-emerald-200",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};
const RESTORE_STYLE = { on_track: "text-emerald-700", due_soon: "text-amber-700", overdue: "text-rose-700 font-semibold" };
const RESTORE_LABEL = { on_track: "On track", due_soon: "Due soon", overdue: "Overdue" };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function localInput(s: string | null) {
  const d = s ? new Date(s) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function ImpairmentsRegister({ plantId }: { plantId: string | null }) {
  const [filter, setFilter] = useState("open");
  const [data, setData] = useState<ListOut | null>(null);
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [raise, setRaise] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [cancel, setCancel] = useState<Row | null>(null);
  const { data: session } = useSession();
  const me = (session?.user as { id?: string } | undefined)?.id;

  const load = useCallback(async () => {
    if (!plantId) return;
    try {
      const q = new URLSearchParams({ plant: plantId });
      if (filter !== "all") q.set("status", filter);
      const [r1, r2] = await Promise.all([
        fetch(`/api/ptw/impairments?${q}`, { cache: "no-store" }),
        fetch(`/api/ptw/layout?plant=${plantId}`, { cache: "no-store" }),
      ]);
      if (!r1.ok) throw new Error(await readApiError(r1, "Could not load impairments"));
      setData(await r1.json());
      if (r2.ok) setAreas(((await r2.json()).zones ?? []).map((z: any) => ({ id: z.id, name: z.name })));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [plantId, filter]);

  useEffect(() => { load(); }, [load]);

  async function act(row: Row, action: string, body?: unknown) {
    setBusy(`${row.id}:${action}`);
    setError(null);
    try {
      const res = await fetch(`/api/ptw/impairments/${row.id}${action === "edit" ? "" : `/${action}`}`, {
        method: action === "edit" ? "PATCH" : "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(await readApiError(res, `Could not ${action} ${row.code}`));
      await load();
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const perms = data?.permissions ?? { create: false, approve: false };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2"><ShieldAlert size={18} className="text-rose-600" aria-hidden /> Safety-system impairments</CardTitle>
        <div className="flex items-center gap-2">
          <Select aria-label="Show" className="w-40" value={filter} onValueChange={setFilter}>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="restored">Restored</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </Select>
          {perms.create && data?.ready && (
            <Button onClick={() => setRaise(true)} disabled={!areas.length}><Plus size={16} /> Raise impairment</Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && <p role="alert" className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        {data && !data.ready && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Impairments are not installed yet. An administrator runs <code>npx tsx prisma/apply-ptw-control-center-ddl.ts</code> once.
          </p>
        )}
        {data?.ready && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>System</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead>Restore by</TableHead>
                  <TableHead>Effect on permits</TableHead>
                  <TableHead>Raised / approved</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-6 text-center text-slate-500">No impairments in this view.</TableCell></TableRow>
                )}
                {data.items.map((r) => (
                  <TableRow key={r.id} id={`imp-${r.id}`} className="align-top target:bg-amber-50">
                    <TableCell>
                      <div className="font-medium">{r.systemName}</div>
                      <div className="font-mono text-xs text-slate-500">{r.code}</div>
                      <div className="mt-1 max-w-[260px] text-xs text-slate-600">{r.reason}</div>
                    </TableCell>
                    <TableCell>{r.areaName ?? "—"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                      {r.inForce && <div className="mt-1 text-xs text-rose-700">in force</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmt(r.startedAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmt(r.plannedRestoreAt)}
                      {r.restoreStatus && <div className={`text-xs ${RESTORE_STYLE[r.restoreStatus]}`}>{RESTORE_LABEL[r.restoreStatus]}</div>}
                      {r.restoredAt && <div className="text-xs text-emerald-700">restored {fmt(r.restoredAt)}</div>}
                    </TableCell>
                    <TableCell className={r.effectSeverity === "critical" ? "text-rose-700" : r.effectSeverity === "warning" ? "text-amber-800" : "text-slate-600"}>
                      {r.effect}
                      {r.precautions.length > 0 && <div className="mt-1 text-xs text-slate-500">Precautions: {r.precautions.join("; ")}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      <div>Raised: {r.createdBy ?? "—"}</div>
                      <div>Approved: {r.approvedBy ?? "pending"}</div>
                      {r.escalationCount > 0 && <div className="text-rose-700">escalated ×{r.escalationCount}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {r.status === "requested" && perms.approve && r.createdById !== me && (
                          <Button size="sm" onClick={() => act(r, "approve")} disabled={!!busy}>Approve</Button>
                        )}
                        {r.status === "approved" && !r.inForce && perms.approve && (
                          <Button size="sm" variant="outline" onClick={() => act(r, "activate")} disabled={!!busy}>Activate now</Button>
                        )}
                        {(r.status === "approved" || r.status === "active") && (perms.create || perms.approve) && (
                          <Button size="sm" variant="success" onClick={() => act(r, "restore")} disabled={!!busy}>Restore</Button>
                        )}
                        {(r.status === "requested" || r.status === "approved" || r.status === "active") && (perms.create || perms.approve) && (
                          <Button size="sm" variant="outline" onClick={() => setEdit(r)} disabled={!!busy}>Edit</Button>
                        )}
                        {(r.status === "requested" || (r.status === "approved" && !r.inForce)) && (perms.create || perms.approve) && (
                          <Button size="sm" variant="ghost" onClick={() => setCancel(r)} disabled={!!busy}>Cancel</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {plantId && (
        <RaiseImpairmentDialog open={raise} onOpenChange={setRaise} plantId={plantId} areas={areas} onCreated={load} />
      )}
      <EditDialog row={edit} onClose={() => setEdit(null)} onSave={async (b) => (edit ? act(edit, "edit", b) : false)} />
      <CancelDialog row={cancel} onClose={() => setCancel(null)} onSave={async (reason) => (cancel ? act(cancel, "cancel", { reason }) : false)} />
    </Card>
  );
}

function EditDialog({ row, onClose, onSave }: { row: Row | null; onClose: () => void; onSave: (b: unknown) => Promise<boolean> }) {
  const [restore, setRestore] = useState("");
  const [precautions, setPrecautions] = useState("");
  useEffect(() => {
    if (!row) return;
    setRestore(localInput(row.plannedRestoreAt));
    setPrecautions(row.precautions.join("\n"));
  }, [row]);
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {row?.code}</DialogTitle>
          <DialogDescription>Extending an approved impairment is an approval act and resets its escalation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="edit-restore">Restore by</Label>
            <Input id="edit-restore" type="datetime-local" value={restore} onChange={(e) => setRestore(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-prec">Precautions (one per line)</Label>
            <Textarea id="edit-prec" rows={4} value={precautions} onChange={(e) => setPrecautions(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={async () => {
            const ok = await onSave({ plannedRestoreAt: new Date(restore).toISOString(), precautions: precautions.split("\n").map((x) => x.trim()).filter(Boolean) });
            if (ok) onClose();
          }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ row, onClose, onSave }: { row: Row | null; onClose: () => void; onSave: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (row) setReason(""); }, [row]);
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {row?.code}</DialogTitle>
          <DialogDescription>Only an impairment that has not taken effect can be cancelled. Restore it otherwise.</DialogDescription>
        </DialogHeader>
        <Label htmlFor="cancel-reason">Reason</Label>
        <Textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="destructive" disabled={reason.trim().length < 3} onClick={async () => { if (await onSave(reason.trim())) onClose(); }}>Cancel impairment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
