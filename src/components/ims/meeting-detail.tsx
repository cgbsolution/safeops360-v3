"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { UserPicker } from "@/components/ui/user-picker";
import { fmtDate, imsFetch, label, localToIso, toLocalInput, type Meeting } from "@/lib/ims/api";
import { ActionStatusDialog } from "./mom-tracker";
import { EmptyRow, ErrorBox, Field, StatusBadge } from "./shared";

export function MeetingDetail({ initial }: { initial: Meeting }) {
  const { toast } = useToast();
  const [m, setM] = useState<Meeting>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [minutes, setMinutes] = useState(initial.minutes ?? "");
  const [heldOpen, setHeldOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [moving, setMoving] = useState<NonNullable<Meeting["actions"]>[number] | null>(null);

  async function call(path: string, method: string, json: unknown, msg: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await imsFetch<Meeting>(`/api/ims/meetings/${m.id}${path}`, { method, json });
      setM(r);
      setMinutes(r.minutes ?? "");
      toast({ title: msg, variant: "success" });
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const actions = m.actions ?? [];
  const canRecordActions = m.status === "HELD" || m.status === "MINUTES_PUBLISHED";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={m.status} />
        <span className="text-sm text-slate-600">{label(m.meetingType)} · {m.plantName ?? ""} · scheduled {fmtDate(m.scheduledAt, true)}{m.venue ? ` · ${m.venue}` : ""}</span>
        <div className="ml-auto flex gap-2">
          {m.status === "SCHEDULED" && (
            <>
              <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}>Cancel meeting</Button>
              <Button size="sm" onClick={() => setHeldOpen(true)}>Mark as held</Button>
            </>
          )}
          {m.status === "HELD" && (
            <Button size="sm" variant="success" disabled={busy} onClick={async () => {
              // Publish what is on screen, not the last saved draft.
              if (minutes !== (m.minutes ?? "") && !(await call("/minutes", "PUT", { minutes }, "Minutes saved"))) return;
              await call("/publish", "POST", undefined, "Minutes published");
            }}>Publish minutes</Button>
          )}
        </div>
      </div>
      <ErrorBox error={error} />
      {m.cancelReason && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Cancelled: {m.cancelReason}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Participants</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div><span className="text-slate-500">Chair:</span> {m.chairpersonName ?? "—"}</div>
            <div><span className="text-slate-500">Secretary:</span> {m.secretaryName ?? "—"}</div>
            {m.heldAt && <div><span className="text-slate-500">Held:</span> {fmtDate(m.heldAt, true)}</div>}
            {(m.workerRepCount !== null || m.managementRepCount !== null) && (
              <div><span className="text-slate-500">Representation:</span> {m.workerRepCount ?? 0} worker · {m.managementRepCount ?? 0} management</div>
            )}
            {m.attendees.length > 0 && (
              <div className="pt-1 text-xs text-slate-600">{m.attendees.map((a) => a.name).join(", ")}</div>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Agenda</CardTitle></CardHeader>
          <CardContent className="whitespace-pre-line text-sm text-slate-700">{m.agenda || "No agenda recorded."}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Minutes of meeting</CardTitle></CardHeader>
        <CardContent>
          {m.status === "HELD" ? (
            <div className="space-y-2">
              <Textarea rows={8} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Points discussed and decisions taken. Add each follow-up as an action point below." />
              <Button size="sm" variant="outline" disabled={busy || minutes === (m.minutes ?? "")} onClick={() => call("/minutes", "PUT", { minutes }, "Minutes saved")}>Save minutes</Button>
            </div>
          ) : (
            <div className="whitespace-pre-line text-sm text-slate-700">
              {m.minutes || (m.status === "SCHEDULED" ? "Minutes are recorded after the meeting is held." : "No minutes recorded.")}
              {m.minutesPublishedAt && <div className="mt-2 text-[11px] text-slate-500">Published {fmtDate(m.minutesPublishedAt, true)}</div>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Action points (MOM tracker)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <Table className="text-sm">
              <TableHeader className="bg-slate-50">
                <TableRow><TableHead>#</TableHead><TableHead>Action</TableHead><TableHead>Owner</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {actions.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="tabular-nums">{a.itemNo}</TableCell>
                    <TableCell>{a.description}{a.closureNote && <div className="text-[11px] text-slate-500">Closure: {a.closureNote}</div>}</TableCell>
                    <TableCell className="text-xs">{a.ownerName ?? "—"}</TableCell>
                    <TableCell className="text-xs">{fmtDate(a.dueDate)}</TableCell>
                    <TableCell><StatusBadge status={a.status} overdue={a.overdue} /></TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setMoving(a)}>Update</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {actions.length === 0 && <EmptyRow text={canRecordActions ? "No action points yet." : "Action points are added once the meeting is held."} />}
          </div>
          {canRecordActions && <AddAction meetingId={m.id} plantId={m.plantId} onAdded={setM} />}
        </CardContent>
      </Card>

      <HeldDialog open={heldOpen} onOpenChange={setHeldOpen} plantId={m.plantId} busy={busy}
        onSubmit={async (body) => { if (await call("/held", "POST", body, "Meeting marked as held")) setHeldOpen(false); }} />
      <CancelDialog open={cancelOpen} onOpenChange={setCancelOpen} busy={busy}
        onSubmit={async (reason) => { if (await call("/cancel", "POST", { reason }, "Meeting cancelled")) setCancelOpen(false); }} />
      <ActionStatusDialog action={moving} onClose={() => setMoving(null)}
        onSaved={async () => { setMoving(null); setM(await imsFetch<Meeting>(`/api/ims/meetings/${m.id}`)); }} />
    </div>
  );
}

function AddAction({ meetingId, plantId, onAdded }: { meetingId: string; plantId: string; onAdded: (m: Meeting) => void }) {
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [due, setDue] = useState(() => toLocalInput(new Date(Date.now() + 14 * 864e5)).slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const r = await imsFetch<Meeting>(`/api/ims/meetings/${meetingId}/actions`, {
        method: "POST",
        json: { description, ownerUserId: owner, dueDate: localToIso(`${due}T18:00`) },
      });
      setDescription("");
      setOwner(null);
      onAdded(r);
    } catch (e: any) {
      setError(e?.message ?? "Could not add the action");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_220px_160px_auto] md:items-end">
        <Field label="New action point"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Provide hand rails at CRM-2 walkway" /></Field>
        <Field label="Owner"><UserPicker value={owner} onChange={(id) => setOwner(id)} filter={{ plantId }} /></Field>
        <Field label="Due date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Button onClick={add} disabled={busy || description.trim().length < 3 || !owner || !due}>{busy ? "Adding…" : "Add"}</Button>
      </div>
      <ErrorBox error={error} />
    </div>
  );
}

function HeldDialog({
  open, onOpenChange, plantId, busy, onSubmit,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; plantId: string; busy: boolean;
  onSubmit: (body: { heldAt: string; attendeeUserIds: string[]; workerRepCount: number | null; managementRepCount: number | null }) => void;
}) {
  const [heldAt, setHeldAt] = useState(toLocalInput());
  const [attendees, setAttendees] = useState<string[]>([]);
  const [workers, setWorkers] = useState("");
  const [mgmt, setMgmt] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Mark meeting as held</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label="Held at" required><Input type="datetime-local" value={heldAt} onChange={(e) => setHeldAt(e.target.value)} /></Field>
          <Field label="Attendees"><UserPicker multiple value={attendees} onChange={(ids) => setAttendees(ids)} filter={{ plantId }} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Worker representatives" hint="Factories Act s.41G: equal worker and management representation"><Input type="number" min={0} value={workers} onChange={(e) => setWorkers(e.target.value)} /></Field>
            <Field label="Management representatives"><Input type="number" min={0} value={mgmt} onChange={(e) => setMgmt(e.target.value)} /></Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy} onClick={() => onSubmit({
            heldAt: localToIso(heldAt), attendeeUserIds: attendees,
            workerRepCount: workers ? Number(workers) : null, managementRepCount: mgmt ? Number(mgmt) : null,
          })}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ open, onOpenChange, busy, onSubmit }: { open: boolean; onOpenChange: (v: boolean) => void; busy: boolean; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Cancel meeting</DialogTitle></DialogHeader>
        <Field label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
          <Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => onSubmit(reason)}>Cancel meeting</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
