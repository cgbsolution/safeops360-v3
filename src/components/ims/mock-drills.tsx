"use client";

// Mock drill schedule & closure. Drills live in the Fire Safety module
// (FireDrill, /api/fire/drills). Completion goes through its existing gate:
// unaccounted persons, or a MAJOR_GAP finding without a CAPA, block closure.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { UserPicker } from "@/components/ui/user-picker";
import { fmtDate, imsFetch, label, localToIso, toLocalInput, type FireDrill, type ImsMeta, type PlantOption } from "@/lib/ims/api";
import { ALL_PLANTS, EmptyRow, ErrorBox, Field, PlantSelect, plantParam, StatusBadge } from "./shared";

const OUTCOMES = ["SATISFACTORY", "NEEDS_IMPROVEMENT", "UNSATISFACTORY"];
const ANY = "__any__";

export function MockDrillsView({ plants, defaultPlantId, meta }: { plants: PlantOption[]; defaultPlantId: string | null; meta: ImsMeta | null }) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  const [status, setStatus] = useState(ANY);
  const [all, setAll] = useState<FireDrill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [completing, setCompleting] = useState<FireDrill | null>(null);
  const [cancelling, setCancelling] = useState<FireDrill | null>(null);
  const plantName = useMemo(() => Object.fromEntries(plants.map((p) => [p.id, p.name])), [plants]);

  const load = useCallback(async () => {
    try {
      const r = await imsFetch<{ items: FireDrill[] }>("/api/fire/drills");
      setAll(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load drills");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = Date.now();
  const isOverdue = (d: FireDrill) => d.status === "PLANNED" && !!d.scheduledDate && new Date(d.scheduledDate).getTime() < now;
  const rows = all
    .filter((d) => plant === ALL_PLANTS || d.plantId === plant)
    .filter((d) => status === ANY || (status === "OVERDUE" ? isOverdue(d) : d.status === status))
    .sort((a, b) => (b.scheduledDate ?? "").localeCompare(a.scheduledDate ?? ""));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={status} onValueChange={setStatus} className="h-9 w-44" aria-label="Status">
          <SelectItem value={ANY}>All statuses</SelectItem>
          {["PLANNED", "OVERDUE", "COMPLETED", "CANCELLED"].map((s) => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}
        </Select>
        <span className="text-xs text-slate-500">{rows.length} drill(s) · {rows.filter(isOverdue).length} overdue</span>
        <Button size="sm" className="ml-auto" onClick={() => setScheduleOpen(true)}><Plus size={14} className="mr-1" /> Schedule drill</Button>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[960px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Drill</TableHead><TableHead>Type</TableHead><TableHead>Plant</TableHead><TableHead>Scheduled</TableHead>
              <TableHead>Conducted</TableHead><TableHead>Evacuation (actual / target)</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium text-primary-700">{d.drillCode}{d.isAnnualMandatory && <div className="text-[11px] text-slate-500">Annual mandatory</div>}</TableCell>
                <TableCell className="text-xs">{label(d.drillType)}</TableCell>
                <TableCell className="text-xs">{plantName[d.plantId] ?? "—"}</TableCell>
                <TableCell className="text-xs">{fmtDate(d.scheduledDate, true)}</TableCell>
                <TableCell className="text-xs">{fmtDate(d.conductedDate)}{d.outcome && <div className="text-[11px] text-slate-500">{label(d.outcome)}</div>}</TableCell>
                <TableCell className="text-xs tabular-nums">
                  {d.evacuationTimeMinutes ?? "—"} / {d.evacuationTargetMinutes ?? "—"} min
                </TableCell>
                <TableCell><StatusBadge status={d.status} overdue={isOverdue(d)} /></TableCell>
                <TableCell className="text-right">
                  {d.status === "PLANNED" && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(d)}>Cancel</Button>
                      <Button size="sm" variant="outline" onClick={() => setCompleting(d)}>Record result</Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !error && <EmptyRow text="No mock drills match this filter." />}
      </div>
      <ScheduleDrillDialog open={scheduleOpen} onOpenChange={setScheduleOpen} plants={plants} meta={meta} defaultPlantId={plantParam(plant) ?? defaultPlantId} onSaved={load} />
      <CompleteDrillDialog drill={completing} onClose={() => setCompleting(null)} onSaved={() => { setCompleting(null); load(); }} />
      <CancelDrillDialog drill={cancelling} onClose={() => setCancelling(null)} onSaved={() => { setCancelling(null); load(); }} />
    </div>
  );
}

function ScheduleDrillDialog({
  open, onOpenChange, plants, meta, defaultPlantId, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; plants: PlantOption[]; meta: ImsMeta | null; defaultPlantId: string | null; onSaved: () => void }) {
  const { toast } = useToast();
  const [plantId, setPlantId] = useState(defaultPlantId ?? "");
  const [drillType, setDrillType] = useState("FIRE_EVACUATION");
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 7 * 864e5)));
  const [facilitator, setFacilitator] = useState<string | null>(null);
  const [target, setTarget] = useState("5");
  const [mandatory, setMandatory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPlantId(defaultPlantId ?? plants[0]?.id ?? "");
      setError(null);
    }
  }, [open, defaultPlantId, plants]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await imsFetch<{ drillCode: string }>("/api/fire/drills", {
        method: "POST",
        json: {
          plantId, drillType, scheduledDate: localToIso(when), facilitatorId: facilitator,
          evacuationTargetMinutes: target ? Number(target) : null, isAnnualMandatory: mandatory,
        },
      });
      toast({ title: `${r.drillCode} scheduled`, variant: "success" });
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Could not schedule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Schedule mock drill</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plant" required><PlantSelect plants={plants} value={plantId} onChange={setPlantId} allowAll={false} className="w-full" /></Field>
            <Field label="Drill type" required>
              <Select value={drillType} onValueChange={setDrillType} className="w-full">
                {(meta?.drillTypes ?? ["FIRE_EVACUATION"]).map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
              </Select>
            </Field>
            <Field label="Scheduled for" required><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
            <Field label="Evacuation target (min)"><Input type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
          </div>
          <Field label="Facilitator"><UserPicker value={facilitator} onChange={(id) => setFacilitator(id)} filter={{ plantId }} /></Field>
          <div className="flex items-center gap-2">
            <Checkbox id="drill-mandatory" checked={mandatory} onCheckedChange={(v) => setMandatory(v === true)} />
            <Label htmlFor="drill-mandatory" className="text-sm">Annual statutory drill</Label>
          </div>
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !plantId || !when}>{busy ? "Scheduling…" : "Schedule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDrillDialog({ drill, onClose, onSaved }: { drill: FireDrill | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [conducted, setConducted] = useState(toLocalInput());
  const [outcome, setOutcome] = useState("SATISFACTORY");
  const [participants, setParticipants] = useState("");
  const [evac, setEvac] = useState("");
  const [unaccounted, setUnaccounted] = useState("0");
  const [apVerified, setApVerified] = useState(true);
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConducted(toLocalInput()); setOutcome("SATISFACTORY"); setParticipants(""); setEvac("");
    setUnaccounted("0"); setApVerified(true); setReport(""); setError(null);
  }, [drill?.id]);

  if (!drill) return null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await imsFetch(`/api/fire/drills/${drill!.id}/complete`, {
        method: "POST",
        json: {
          conductedDate: localToIso(conducted), outcome, participantCount: participants ? Number(participants) : null,
          evacuationTimeMinutes: evac ? Number(evac) : null, evacuationTargetMinutes: drill!.evacuationTargetMinutes,
          assemblyPointVerified: apVerified, unaccountedPersons: Number(unaccounted || 0), reportRichText: report || null,
        },
      });
      toast({ title: `${drill!.drillCode} closed`, variant: "success" });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Could not close the drill");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record drill result · {drill.drillCode}</DialogTitle>
          <DialogDescription>A drill with unaccounted persons cannot be closed until everyone is accounted for.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Conducted at" required><Input type="datetime-local" value={conducted} onChange={(e) => setConducted(e.target.value)} /></Field>
            <Field label="Outcome" required>
              <Select value={outcome} onValueChange={setOutcome} className="w-full">
                {OUTCOMES.map((o) => <SelectItem key={o} value={o}>{label(o)}</SelectItem>)}
              </Select>
            </Field>
            <Field label="Participants"><Input type="number" min={0} value={participants} onChange={(e) => setParticipants(e.target.value)} /></Field>
            <Field label={`Evacuation time (min)${drill.evacuationTargetMinutes ? `, target ${drill.evacuationTargetMinutes}` : ""}`}><Input type="number" min={0} step="0.5" value={evac} onChange={(e) => setEvac(e.target.value)} /></Field>
            <Field label="Unaccounted persons" required><Input type="number" min={0} value={unaccounted} onChange={(e) => setUnaccounted(e.target.value)} /></Field>
            <div className="flex items-end gap-2 pb-2">
              <Checkbox id="ap-verified" checked={apVerified} onCheckedChange={(v) => setApVerified(v === true)} />
              <Label htmlFor="ap-verified" className="text-sm">Assembly point head-count verified</Label>
            </div>
          </div>
          <Field label="Observations & learnings"><Textarea rows={4} value={report} onChange={(e) => setReport(e.target.value)} /></Field>
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Close drill"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDrillDialog({ drill, onClose, onSaved }: { drill: FireDrill | null; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setReason(""); setError(null); }, [drill?.id]);
  if (!drill) return null;
  async function save() {
    setBusy(true);
    try {
      await imsFetch(`/api/fire/drills/${drill!.id}/cancel`, { method: "POST", json: { reason } });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Could not cancel");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Cancel {drill.drillCode}</DialogTitle></DialogHeader>
        <Field label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={save}>Cancel drill</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
