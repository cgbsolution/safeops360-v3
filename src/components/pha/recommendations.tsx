"use client";

// Recommendations: add (optionally raised as a CAPA), edit owner / due / priority,
// move status (reject needs a justification, close needs a note; a CAPA-tracked
// recommendation closes when its CAPA closes), and the study-level register.

import { useCallback, useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { UserPicker } from "@/components/ui/user-picker";
import {
  dateInputToIso, fmtDate, label, phaFetch, qs, toDateInput, type Recommendation,
} from "@/lib/pha/api";
import { EmptyRow, ErrorBox, Field, RiskChip, StatusBadge } from "./shared";

const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
const ANY = "__any__";

export function AddRecDialog({
  deviationId, deviationText, plantId, open, onOpenChange, onSaved,
}: {
  deviationId: string | null; deviationText?: string; plantId: string; open: boolean;
  onOpenChange: (v: boolean) => void; onSaved: (r: Recommendation) => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [raiseCapa, setRaiseCapa] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setText(""); setOwnerId(null); setDue(""); setPriority("MEDIUM"); setRaiseCapa(true); setError(null);
    }
  }, [open]);

  async function save() {
    if (!deviationId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await phaFetch<Recommendation>(`/api/pha/deviations/${deviationId}/recommendations`, {
        method: "POST", json: { text, ownerId, dueDate: dateInputToIso(due), priority, raiseCapa: raiseCapa && Boolean(ownerId) },
      });
      toast({ title: `${r.recLabel} raised${r.capaNumber ? ` as ${r.capaNumber}` : ""}`, description: r.warning ?? undefined, variant: r.warning ? "default" : "success" });
      onSaved(r);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Add recommendation</DialogTitle></DialogHeader>
        {deviationText && <p className="text-xs text-slate-500">Deviation: {deviationText}</p>}
        <div className="space-y-3">
          <ErrorBox error={error} />
          <Field label="Recommendation" required>
            <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="What should be done, specifically (e.g. add independent low-low fuel gas pressure trip closing SSV-101)" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Owner" className="sm:col-span-2">
              <UserPicker value={ownerId} onChange={(id) => setOwnerId(id)} filter={{ plantId }} placeholder="Responsible person" />
            </Field>
            <Field label="Priority">
              <Select value={priority} onValueChange={setPriority} aria-label="Priority">
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{label(p)}</SelectItem>)}
              </Select>
            </Field>
          </div>
          <Field label="Target date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <div className="flex items-center gap-2">
            <Checkbox id="raise-capa" checked={raiseCapa} onCheckedChange={(v) => setRaiseCapa(v === true)} disabled={!ownerId} />
            <Label htmlFor="raise-capa" className="text-sm">Track as a CAPA {ownerId ? "" : "(needs an owner)"}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || text.trim().length < 5}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditRecDialog({ rec, onClose, onSaved, textEditable }: { rec: Recommendation | null; onClose: () => void; onSaved: (r: Recommendation) => void; textEditable: boolean }) {
  const [text, setText] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rec) {
      setText(rec.text); setOwnerId(rec.ownerId); setDue(toDateInput(rec.dueDate)); setPriority(rec.priority); setError(null);
    }
  }, [rec]);

  async function save() {
    if (!rec) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ownerId, dueDate: dateInputToIso(due), priority };
      if (textEditable && text !== rec.text) body.text = text;
      onSaved(await phaFetch<Recommendation>(`/api/pha/recommendations/${rec.id}`, { method: "PATCH", json: body }));
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(rec)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Edit {rec?.recLabel}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <ErrorBox error={error} />
          <Field label="Recommendation">
            <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} disabled={!textEditable} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Owner" className="sm:col-span-2">
              <UserPicker value={ownerId} onChange={(id) => setOwnerId(id)} filter={{ plantId: rec?.plantId }} placeholder="Responsible person" />
            </Field>
            <Field label="Priority">
              <Select value={priority} onValueChange={setPriority} aria-label="Priority">
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{label(p)}</SelectItem>)}
              </Select>
            </Field>
          </div>
          <Field label="Target date" hint={rec?.capaNumber ? `Changes follow onto ${rec.capaNumber}.` : undefined}>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MOVES: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "CLOSED", "REJECTED"],
  IN_PROGRESS: ["OPEN", "CLOSED", "REJECTED"],
  CLOSED: ["OPEN"],
  REJECTED: ["OPEN"],
};

export function RecStatusDialog({ rec, onClose, onSaved }: { rec: Recommendation | null; onClose: () => void; onSaved: (r: Recommendation) => void }) {
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = rec ? MOVES[rec.status] ?? [] : [];

  useEffect(() => {
    if (rec) {
      setTarget((MOVES[rec.status] ?? [])[0] ?? ""); setNote(""); setError(null);
    }
  }, [rec]);

  async function save() {
    if (!rec) return;
    setBusy(true);
    setError(null);
    try {
      const json = { status: target, justification: target === "REJECTED" ? note : undefined, closureNote: target === "CLOSED" ? note : undefined };
      onSaved(await phaFetch<Recommendation>(`/api/pha/recommendations/${rec.id}/status`, { method: "POST", json }));
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Could not update");
    } finally {
      setBusy(false);
    }
  }

  const capaLive = Boolean(rec?.capaNumber && rec.capaState && !["CLOSED", "VERIFIED", "CLOSED_RECURRED", "CANCELLED", "REJECTED"].includes(rec.capaState));
  return (
    <Dialog open={Boolean(rec)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Update {rec?.recLabel}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{rec?.text}</p>
          <ErrorBox error={error} />
          {capaLive && target === "CLOSED" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              Tracked by {rec?.capaNumber} ({label(rec?.capaState)}). It closes here automatically when the CAPA is verified or closed.
            </div>
          )}
          <Field label="Move to">
            <Select value={target} onValueChange={setTarget} aria-label="New status">
              {options.map((o) => <SelectItem key={o} value={o}>{label(o)}</SelectItem>)}
            </Select>
          </Field>
          {(target === "CLOSED" || target === "REJECTED") && (
            <Field label={target === "REJECTED" ? "Justification" : "Closure note"} required
              hint={target === "REJECTED" ? "Why the team accepts the risk without this action (kept on the study record)." : "What was done and how it was verified."}>
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !target}>Update</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Study-level recommendation register. */
export function RecommendationsPanel({
  studyId, studyStatus, canUpdate, onChanged,
}: { studyId: string; studyStatus: string; canUpdate: boolean; onChanged?: () => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [status, setStatus] = useState(ANY);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<Recommendation | null>(null);
  const [editing, setEditing] = useState<Recommendation | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await phaFetch<{ items: Recommendation[] }>(`/api/pha/recommendations${qs({ studyId, status: status === ANY ? undefined : status })}`);
      setItems(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load recommendations");
    }
  }, [studyId, status]);

  useEffect(() => {
    load();
  }, [load]);

  async function raiseCapa(r: Recommendation) {
    try {
      const out = await phaFetch<Recommendation>(`/api/pha/recommendations/${r.id}/capa`, { method: "POST" });
      toast({ title: `${out.recLabel} tracked as ${out.capaNumber}`, variant: "success" });
      await load();
      onChanged?.();
    } catch (e: any) {
      toast({ title: "CAPA not raised", description: e?.message, variant: "error" });
    }
  }

  const frozen = studyStatus === "CLOSED";
  const after = async () => { await load(); onChanged?.(); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus} className="h-9 w-44" aria-label="Status">
          <SelectItem value={ANY}>All recommendations</SelectItem>
          <SelectItem value="OPEN">Open / in progress</SelectItem>
          <SelectItem value="CLOSED">Closed</SelectItem>
          <SelectItem value="REJECTED">Rejected</SelectItem>
        </Select>
        <span className="text-xs text-slate-500">Raise recommendations from a worksheet row.</span>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>No.</TableHead><TableHead>Row</TableHead><TableHead>Recommendation</TableHead><TableHead>Risk</TableHead>
              <TableHead>Owner</TableHead><TableHead>Due</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead>
              <TableHead>CAPA</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(items ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium tabular-nums">{r.recLabel}</TableCell>
                <TableCell className="text-xs" title={r.deviationText ?? undefined}>{r.deviationRef ?? "—"}<div className="max-w-[160px] truncate text-slate-500">{r.deviationText}</div></TableCell>
                <TableCell className="max-w-md text-xs">
                  {r.text}
                  {r.status === "REJECTED" && r.justification && <div className="mt-1 text-slate-500">Justification: {r.justification}</div>}
                  {r.status === "CLOSED" && r.closureNote && <div className="mt-1 text-slate-500">Closure: {r.closureNote}</div>}
                </TableCell>
                <TableCell><RiskChip level={r.riskLevel ?? null} color={r.riskColor} compact /></TableCell>
                <TableCell className="text-xs">{r.ownerName ?? <span className="text-amber-700">Unassigned</span>}</TableCell>
                <TableCell className="text-xs">{fmtDate(r.dueDate)}</TableCell>
                <TableCell><StatusBadge status={r.priority} /></TableCell>
                <TableCell><StatusBadge status={r.status} overdue={r.overdue} /></TableCell>
                <TableCell className="text-xs">{r.capaNumber ? <>{r.capaNumber}<div className="text-slate-500">{label(r.capaState)}</div></> : "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {!frozen && (
                    <>
                      {canUpdate && (r.status === "OPEN" || r.status === "IN_PROGRESS") && (
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                      )}
                      {canUpdate && !r.capaId && r.ownerId && (r.status === "OPEN" || r.status === "IN_PROGRESS") && (
                        <Button size="sm" variant="ghost" onClick={() => raiseCapa(r)}>Raise CAPA</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setMoving(r)}>Status</Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {items && items.length === 0 && <EmptyRow text="No recommendations." />}
      </div>
      <RecStatusDialog rec={moving} onClose={() => setMoving(null)} onSaved={after} />
      <EditRecDialog rec={editing} onClose={() => setEditing(null)} onSaved={after}
        textEditable={studyStatus === "DRAFT" || studyStatus === "IN_PROGRESS"} />
    </div>
  );
}
