"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { fmtDate, imsFetch, localToIso, qs, toLocalInput, type PlantOption, type ToolboxTalk } from "@/lib/ims/api";
import { ALL_PLANTS, EmptyRow, ErrorBox, Field, PlantSelect, plantParam } from "./shared";

const LANGUAGES = ["Hindi", "English", "Haryanvi", "Punjabi", "Bengali", "Odia", "Other"];
const WINDOWS = [
  { v: "30", l: "Last 30 days" },
  { v: "90", l: "Last 90 days" },
  { v: "365", l: "Last 12 months" },
];

export function ToolboxTalksView({ plants, defaultPlantId }: { plants: PlantOption[]; defaultPlantId: string | null }) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  const [days, setDays] = useState("90");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ToolboxTalk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await imsFetch<{ items: ToolboxTalk[] }>(`/api/ims/toolbox-talks${qs({ plantId: plantParam(plant), days, q: q.trim() })}`);
      setRows(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load toolbox talks");
    }
  }, [plant, days, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const people = rows.reduce((s, r) => s + r.participants, 0);
  const contractors = rows.reduce((s, r) => s + r.contractorCount, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={days} onValueChange={setDays} className="h-9 w-40" aria-label="Window">
          {WINDOWS.map((w) => <SelectItem key={w.v} value={w.v}>{w.l}</SelectItem>)}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search topic or TBT no." className="h-9 w-60" />
        <span className="text-xs text-slate-500">{rows.length} talks · {people} attendees · {contractors} contract workers</span>
        <Button size="sm" className="ml-auto" onClick={() => setOpen(true)}><Plus size={14} className="mr-1" /> Record toolbox talk</Button>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[900px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>TBT no.</TableHead><TableHead>Date</TableHead><TableHead>Topic</TableHead><TableHead>Department</TableHead>
              <TableHead>Conducted by</TableHead><TableHead className="text-right">Employees</TableHead><TableHead className="text-right">Contract</TableHead><TableHead>Plant</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium text-primary-700">{r.talkNo}</TableCell>
                <TableCell className="text-xs">{fmtDate(r.conductedAt, true)}</TableCell>
                <TableCell>
                  <div className="font-medium text-slate-800">{r.topic}</div>
                  {r.keyPoints && <div className="line-clamp-1 text-[11px] text-slate-500">{r.keyPoints}</div>}
                </TableCell>
                <TableCell className="text-xs">{r.department ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.conductedByName ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{r.employeeCount}</TableCell>
                <TableCell className="text-right tabular-nums">{r.contractorCount}</TableCell>
                <TableCell className="text-xs">{r.plantName ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !error && <EmptyRow text="No toolbox talks recorded in this window." />}
      </div>
      <NewTbtDialog open={open} onOpenChange={setOpen} plants={plants} defaultPlantId={plantParam(plant) ?? defaultPlantId} onSaved={load} />
    </div>
  );
}

function NewTbtDialog({
  open, onOpenChange, plants, defaultPlantId, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; plants: PlantOption[]; defaultPlantId: string | null; onSaved: () => void }) {
  const { toast } = useToast();
  const [plantId, setPlantId] = useState(defaultPlantId ?? plants[0]?.id ?? "");
  const [topic, setTopic] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [department, setDepartment] = useState("");
  const [language, setLanguage] = useState("Hindi");
  const [conductedAt, setConductedAt] = useState(toLocalInput());
  const [duration, setDuration] = useState("15");
  const [employees, setEmployees] = useState("0");
  const [contractors, setContractors] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPlantId(defaultPlantId ?? plants[0]?.id ?? "");
      setConductedAt(toLocalInput());
      setError(null);
    }
  }, [open, defaultPlantId, plants]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await imsFetch<ToolboxTalk>("/api/ims/toolbox-talks", {
        method: "POST",
        json: {
          plantId, topic, keyPoints: keyPoints || null, department: department || null, language,
          conductedAt: localToIso(conductedAt), durationMinutes: duration ? Number(duration) : null,
          employeeCount: Number(employees || 0), contractorCount: Number(contractors || 0),
        },
      });
      toast({ title: `${r.talkNo} recorded`, description: `${r.participants} attendees`, variant: "success" });
      setTopic(""); setKeyPoints(""); setEmployees("0"); setContractors("0");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record toolbox talk</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label="Plant" required><PlantSelect plants={plants} value={plantId} onChange={setPlantId} allowAll={false} className="w-full" /></Field>
          <Field label="Topic" required><Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Safe handling of ladle during tapping" /></Field>
          <Field label="Key points covered"><Textarea rows={3} value={keyPoints} onChange={(e) => setKeyPoints(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Conducted at" required><Input type="datetime-local" value={conductedAt} onChange={(e) => setConductedAt(e.target.value)} /></Field>
            <Field label="Duration (min)"><Input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
            <Field label="Department / section"><Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. SMS, CRM, HRAP" /></Field>
            <Field label="Language">
              <Select value={language} onValueChange={setLanguage} className="w-full">
                {LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </Select>
            </Field>
            <Field label="Employees attended" required><Input type="number" min={0} value={employees} onChange={(e) => setEmployees(e.target.value)} /></Field>
            <Field label="Contract workers attended" required><Input type="number" min={0} value={contractors} onChange={(e) => setContractors(e.target.value)} /></Field>
          </div>
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !plantId || topic.trim().length < 3}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
