"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { UserPicker } from "@/components/ui/user-picker";
import { fmtDate, imsFetch, label, localToIso, qs, toLocalInput, type ImsMeta, type Meeting, type PlantOption } from "@/lib/ims/api";
import { ALL_PLANTS, EmptyRow, ErrorBox, Field, PlantSelect, plantParam, StatusBadge } from "./shared";

const ANY = "__any__";

export function MeetingsView({ plants, defaultPlantId, meta }: { plants: PlantOption[]; defaultPlantId: string | null; meta: ImsMeta | null }) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  const [type, setType] = useState(ANY);
  const [status, setStatus] = useState(ANY);
  const [rows, setRows] = useState<Meeting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await imsFetch<{ items: Meeting[] }>(
        `/api/ims/meetings${qs({ plantId: plantParam(plant), meetingType: type === ANY ? undefined : type, status: status === ANY ? undefined : status })}`
      );
      setRows(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load meetings");
    }
  }, [plant, type, status]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={type} onValueChange={setType} className="h-9 w-56" aria-label="Meeting type">
          <SelectItem value={ANY}>All meeting types</SelectItem>
          {(meta?.meetingTypes ?? []).map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
        </Select>
        <Select value={status} onValueChange={setStatus} className="h-9 w-44" aria-label="Status">
          <SelectItem value={ANY}>All statuses</SelectItem>
          {(meta?.meetingStatuses ?? []).map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
        </Select>
        <span className="text-xs text-slate-500">{rows.length} meeting(s)</span>
        <Button size="sm" className="ml-auto" onClick={() => setOpen(true)}><Plus size={14} className="mr-1" /> Schedule meeting</Button>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[900px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Meeting no.</TableHead><TableHead>Type</TableHead><TableHead>Title</TableHead><TableHead>Scheduled</TableHead>
              <TableHead>Chair</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Open actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell><Link href={`/ims/meetings/${m.id}`} className="font-medium text-primary-700 hover:underline">{m.meetingNo}</Link></TableCell>
                <TableCell className="text-xs">{label(m.meetingType)}</TableCell>
                <TableCell>{m.title}<div className="text-[11px] text-slate-500">{m.plantName ?? ""}</div></TableCell>
                <TableCell className="text-xs">{fmtDate(m.scheduledAt, true)}</TableCell>
                <TableCell className="text-xs">{m.chairpersonName ?? "—"}</TableCell>
                <TableCell><StatusBadge status={m.status} overdue={m.status === "SCHEDULED" && new Date(m.scheduledAt) < new Date()} /></TableCell>
                <TableCell className="text-right tabular-nums">{m.actionsOpen} / {m.actionsTotal}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !error && <EmptyRow text="No meetings match this filter." />}
      </div>
      <ScheduleDialog open={open} onOpenChange={setOpen} plants={plants} meta={meta} defaultPlantId={plantParam(plant) ?? defaultPlantId} />
    </div>
  );
}

function ScheduleDialog({
  open, onOpenChange, plants, meta, defaultPlantId,
}: { open: boolean; onOpenChange: (v: boolean) => void; plants: PlantOption[]; meta: ImsMeta | null; defaultPlantId: string | null }) {
  const router = useRouter();
  const [plantId, setPlantId] = useState(defaultPlantId ?? "");
  const [meetingType, setMeetingType] = useState("SAFETY_COMMITTEE");
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(toLocalInput());
  const [venue, setVenue] = useState("");
  const [chair, setChair] = useState<string | null>(null);
  const [secretary, setSecretary] = useState<string | null>(null);
  const [agenda, setAgenda] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPlantId(defaultPlantId ?? plants[0]?.id ?? "");
      setError(null);
    }
  }, [open, defaultPlantId, plants]);

  const [titleTouched, setTitleTouched] = useState(false);
  useEffect(() => {
    // Default title ("Safety committee meeting, Nov 2026") until the user types their own.
    if (titleTouched) return;
    const d = new Date(when || Date.now());
    setTitle(`${label(meetingType)} meeting, ${d.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`);
  }, [meetingType, when, titleTouched]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const m = await imsFetch<Meeting>("/api/ims/meetings", {
        method: "POST",
        json: { plantId, meetingType, title, scheduledAt: localToIso(when), venue: venue || null, chairpersonId: chair, secretaryId: secretary, agenda: agenda || null },
      });
      onOpenChange(false);
      router.push(`/ims/meetings/${m.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Could not schedule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Schedule safety meeting</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plant" required><PlantSelect plants={plants} value={plantId} onChange={setPlantId} allowAll={false} className="w-full" /></Field>
            <Field label="Meeting type" required>
              <Select value={meetingType} onValueChange={setMeetingType} className="w-full">
                {(meta?.meetingTypes ?? []).map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
              </Select>
            </Field>
          </div>
          <Field label="Title" required><Input value={title} onChange={(e) => { setTitleTouched(true); setTitle(e.target.value); }} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date & time" required><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
            <Field label="Venue"><Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Admin building conference room" /></Field>
            <Field label="Chairperson"><UserPicker value={chair} onChange={(id) => setChair(id)} filter={{ plantId }} /></Field>
            <Field label="Secretary"><UserPicker value={secretary} onChange={(id) => setSecretary(id)} filter={{ plantId }} /></Field>
          </div>
          <Field label="Agenda"><Textarea rows={4} value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder={"1. Review of last MOM actions\n2. Incidents and near misses this month\n3. ..."} /></Field>
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !plantId || title.trim().length < 3}>{busy ? "Scheduling…" : "Schedule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
