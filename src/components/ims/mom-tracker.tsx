"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { fmtDate, imsFetch, label, qs, type ActionItem, type PlantOption } from "@/lib/ims/api";
import { ALL_PLANTS, EmptyRow, ErrorBox, Field, PlantSelect, plantParam, StatusBadge } from "./shared";

const VIEWS = [
  { v: "OPEN", l: "Open" },
  { v: "OVERDUE", l: "Overdue" },
  { v: "MINE", l: "Assigned to me (open)" },
  { v: "CLOSED", l: "Closed" },
  { v: "ALL", l: "All" },
];

// Moves the backend allows (app/services/ims.py _ACTION_MOVES).
const NEXT: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "CLOSED", "DROPPED"],
  IN_PROGRESS: ["OPEN", "CLOSED", "DROPPED"],
  CLOSED: ["OPEN"],
  DROPPED: ["OPEN"],
};

export function MomTrackerView({ plants, defaultPlantId, initialView }: { plants: PlantOption[]; defaultPlantId: string | null; initialView?: string }) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  const [view, setView] = useState(initialView ?? "OPEN");
  const [rows, setRows] = useState<ActionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<ActionItem | null>(null);

  const load = useCallback(async () => {
    const params = {
      plantId: plantParam(plant),
      status: view === "OPEN" || view === "MINE" ? "OPEN" : view === "CLOSED" ? "CLOSED" : undefined,
      overdueOnly: view === "OVERDUE",
      mine: view === "MINE",
    };
    try {
      const r = await imsFetch<{ items: ActionItem[] }>(`/api/ims/actions${qs(params)}`);
      setRows(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load action points");
    }
  }, [plant, view]);

  useEffect(() => { load(); }, [load]);

  const overdue = rows.filter((r) => r.overdue).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={view} onValueChange={setView} className="h-9 w-56" aria-label="View">
          {VIEWS.map((v) => <SelectItem key={v.v} value={v.v}>{v.l}</SelectItem>)}
        </Select>
        <span className="text-xs text-slate-500">{rows.length} action point(s){overdue ? ` · ${overdue} overdue` : ""}</span>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[960px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Meeting</TableHead><TableHead>#</TableHead><TableHead>Action</TableHead><TableHead>Owner</TableHead>
              <TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="text-xs">
                  <Link href={`/ims/meetings/${a.meetingId}`} className="font-medium text-primary-700 hover:underline">{a.meetingNo}</Link>
                  <div className="text-[11px] text-slate-500">{label(a.meetingType)}</div>
                </TableCell>
                <TableCell className="tabular-nums">{a.itemNo}</TableCell>
                <TableCell className="max-w-md">{a.description}{a.closureNote && <div className="text-[11px] text-slate-500">Closure: {a.closureNote}</div>}</TableCell>
                <TableCell className="text-xs">{a.ownerName ?? "—"}</TableCell>
                <TableCell className="text-xs">{fmtDate(a.dueDate)}</TableCell>
                <TableCell><StatusBadge status={a.status} overdue={a.overdue} /></TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setMoving(a)}>Update</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !error && <EmptyRow text="No action points in this view." />}
      </div>
      <ActionStatusDialog action={moving} onClose={() => setMoving(null)} onSaved={() => { setMoving(null); load(); }} />
    </div>
  );
}

export function ActionStatusDialog({ action, onClose, onSaved }: { action: ActionItem | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTarget(action ? NEXT[action.status]?.[0] ?? "" : "");
    setNote("");
    setError(null);
  }, [action?.id, action?.status]);

  if (!action) return null;
  const needsNote = target === "CLOSED" || target === "DROPPED";

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await imsFetch<ActionItem>(`/api/ims/actions/${action!.id}/status`, { method: "POST", json: { status: target, closureNote: note || null } });
      toast({ title: `Action ${label(target).toLowerCase()}`, variant: "success" });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Could not update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update action point #{action.itemNo}</DialogTitle>
          <DialogDescription>{action.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Move to">
            <Select value={target} onValueChange={setTarget} className="w-full">
              {(NEXT[action.status] ?? []).map((s) => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}
            </Select>
          </Field>
          <Field label={needsNote ? "Closure note" : "Note"} required={needsNote} hint={needsNote ? "What was done, or why the point is dropped." : undefined}>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !target || (needsNote && note.trim().length < 3)} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
