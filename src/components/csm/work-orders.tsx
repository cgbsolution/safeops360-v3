"use client";

// Contract / work orders for plant contractors. A work order is raised as a
// draft with its safety requirements checklist and goes ACTIVE only through
// the activation gate (qualified contractor, not blacklisted / suspended,
// checklist complete, engineer-in-charge, supervisor ratio).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { UserPicker } from "@/components/ui/user-picker";
import { csmFetch, dateToIso, fmtDate, label, qs, type Contractor, type CsmMeta, type PlantOption, type WorkOrder, type WorkOrderDetail } from "@/lib/csm/api";
import { ALL_PLANTS, EmptyRow, ErrorBox, Field, LinkButton, Pill, PlantSelect, plantParam } from "./shared";

const FILTERS = ["LIVE", "DRAFT", "ACTIVE", "SUSPENDED", "COMPLETED", "CANCELLED", "ALL"];

export function WorkOrdersView({ plants, meta, defaultPlantId, initialStatus, openNew, contractorId }: {
  plants: PlantOption[]; meta: CsmMeta | null; defaultPlantId: string | null; initialStatus?: string | null; openNew?: boolean; contractorId?: string | null;
}) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  const [status, setStatus] = useState(initialStatus && FILTERS.includes(initialStatus) ? initialStatus : "ALL");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(!!openNew);

  const load = useCallback(async () => {
    try {
      const r = await csmFetch<{ items: WorkOrder[] }>(`/api/csm/work-orders${qs({
        plantId: plantParam(plant), status: status === "ALL" ? undefined : status, q: q.trim(), contractorCompanyId: contractorId,
      })}`);
      setRows(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load work orders");
    }
  }, [plant, status, q, contractorId]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={status} onValueChange={setStatus} className="h-9 w-44" aria-label="Status">
          {FILTERS.map((f) => <SelectItem key={f} value={f}>{f === "LIVE" ? "Active + suspended" : f === "ALL" ? "All" : label(f)}</SelectItem>)}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, number or contractor" className="h-9 w-64" />
        <span className="text-xs text-slate-500">{rows.length} work order(s)</span>
        <Button size="sm" className="ml-auto" onClick={() => setNewOpen(true)}><Plus size={14} /> Raise work order</Button>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[1050px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Work order</TableHead><TableHead>Contractor</TableHead><TableHead>Type</TableHead><TableHead>Period</TableHead>
              <TableHead className="text-right">Manpower</TableHead><TableHead>High-risk</TableHead><TableHead>Engineer-in-charge</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((w) => (
              <TableRow key={w.id}>
                <TableCell>
                  <LinkButton href={`/csm/work-orders/${w.id}`}>{w.workOrderNo}</LinkButton>
                  <div className="line-clamp-1 max-w-xs text-[11px] text-slate-600">{w.title}</div>
                  <div className="text-[11px] text-slate-500">{w.plantName ?? ""}{w.areaName ? ` · ${w.areaName}` : ""}</div>
                </TableCell>
                <TableCell><LinkButton href={`/csm/contractors/${w.contractorCompanyId}`}>{w.contractorName ?? "—"}</LinkButton></TableCell>
                <TableCell className="text-xs">{label(w.workType)}</TableCell>
                <TableCell className="text-xs">{fmtDate(w.startDate)} – {fmtDate(w.endDate)}</TableCell>
                <TableCell className="text-right tabular-nums">{w.estimatedManpower}</TableCell>
                <TableCell className="max-w-[200px] text-[11px] text-slate-600">{w.highRiskActivities.map(label).join(", ") || "—"}</TableCell>
                <TableCell className="text-xs">{w.engineerInChargeName ?? "—"}</TableCell>
                <TableCell><Pill value={w.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !error && <EmptyRow text="No work orders match this filter." />}
      </div>
      <NewWorkOrderDialog open={newOpen} onOpenChange={setNewOpen} plants={plants} meta={meta}
                          defaultPlantId={plantParam(plant) ?? defaultPlantId} defaultContractorId={contractorId ?? null} />
    </div>
  );
}

function NewWorkOrderDialog({ open, onOpenChange, plants, meta, defaultPlantId, defaultContractorId }: {
  open: boolean; onOpenChange: (v: boolean) => void; plants: PlantOption[]; meta: CsmMeta | null; defaultPlantId: string | null; defaultContractorId: string | null;
}) {
  const router = useRouter();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState({ contractorCompanyId: "", plantId: "", areaId: "", title: "", scope: "", workType: "MAINTENANCE",
                               contractRef: "", start: "", end: "", manpower: "", supervisors: "", notes: "" });
  const [eic, setEic] = useState<string | null>(null);
  const [risks, setRisks] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setF((x) => ({ ...x, contractorCompanyId: defaultContractorId ?? "", plantId: defaultPlantId ?? plants[0]?.id ?? "", areaId: "",
                   title: "", scope: "", contractRef: "", start: "", end: "", manpower: "", supervisors: "", notes: "" }));
    setEic(null); setRisks([]); setChecklist({}); setError(null);
    csmFetch<{ items: Contractor[] }>("/api/csm/contractors").then((r) => setContractors(r.items.filter((c) => c.status !== "BLACKLISTED"))).catch(() => setContractors([]));
  }, [open, defaultPlantId, defaultContractorId, plants]);

  useEffect(() => {
    if (!f.plantId) { setAreas([]); return; }
    csmFetch<{ id: string; name: string }[]>(`/api/plants/${f.plantId}/areas`).then(setAreas).catch(() => setAreas([]));
  }, [f.plantId]);

  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const chosen = contractors.find((c) => c.id === f.contractorCompanyId);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await csmFetch<WorkOrderDetail>("/api/csm/work-orders", {
        method: "POST",
        json: {
          contractorCompanyId: f.contractorCompanyId, plantId: f.plantId, areaId: f.areaId || null, title: f.title, scope: f.scope,
          workType: f.workType, contractRef: f.contractRef || null, startDate: dateToIso(f.start), endDate: dateToIso(f.end),
          engineerInChargeId: eic, estimatedManpower: Number(f.manpower || 0), supervisorCount: f.supervisors === "" ? null : Number(f.supervisors),
          highRiskActivities: risks, safetyChecklist: checklist, safetyNotes: f.notes || null,
        },
      });
      onOpenChange(false);
      router.push(`/csm/work-orders/${r.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Could not raise the work order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Raise work order</DialogTitle>
          <DialogDescription>Saved as a draft. It can be activated once the contractor is qualified and every safety requirement is confirmed.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[68vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          <Field label="Contractor" required hint={chosen ? `Prequalification: ${label(chosen.qualification)}` : undefined}>
            <Select value={f.contractorCompanyId} onValueChange={set("contractorCompanyId")} className="w-full" placeholder="Pick a contractor">
              {contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {label(c.qualification)}</SelectItem>)}
            </Select>
          </Field>
          <Field label="Plant" required><PlantSelect plants={plants} value={f.plantId} onChange={(v) => setF({ ...f, plantId: v, areaId: "" })} allowAll={false} className="w-full" /></Field>
          <Field label="Area">
            <Select value={f.areaId} onValueChange={set("areaId")} className="w-full">
              <SelectItem value="">Whole plant / not specified</SelectItem>
              {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </Select>
          </Field>
          <Field label="Work type" required>
            <Select value={f.workType} onValueChange={set("workType")} className="w-full">
              {(meta?.workTypes ?? ["MAINTENANCE"]).map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
            </Select>
          </Field>
          <div className="sm:col-span-2"><Field label="Title" required><Input value={f.title} onChange={(e) => set("title")(e.target.value)} placeholder="e.g. CRM-2 annual shutdown, roof sheeting" /></Field></div>
          <div className="sm:col-span-2"><Field label="Scope of work" required hint="At least 10 characters."><Textarea rows={3} value={f.scope} onChange={(e) => set("scope")(e.target.value)} /></Field></div>
          <Field label="Start date" required><Input type="date" value={f.start} onChange={(e) => set("start")(e.target.value)} /></Field>
          <Field label="End date" required><Input type="date" value={f.end} onChange={(e) => set("end")(e.target.value)} /></Field>
          <Field label="Engineer-in-charge"><UserPicker value={eic} onChange={(id) => setEic(id)} filter={{ plantId: f.plantId || undefined }} placeholder="Search engineer" /></Field>
          <Field label="Contract / PO reference"><Input value={f.contractRef} onChange={(e) => set("contractRef")(e.target.value)} /></Field>
          <Field label="Estimated manpower"><Input type="number" min={0} value={f.manpower} onChange={(e) => set("manpower")(e.target.value)} /></Field>
          <Field label="Supervisors" hint={`At least 1 per ${meta?.supervisorRatioMax ?? 15} workers.`}><Input type="number" min={0} value={f.supervisors} onChange={(e) => set("supervisors")(e.target.value)} /></Field>
          <div className="sm:col-span-2">
            <Field label="High-risk activities">
              <div className="flex flex-wrap gap-1.5">
                {(meta?.highRiskActivities ?? []).map((h) => (
                  <Button key={h} type="button" size="sm" variant={risks.includes(h) ? "default" : "outline"}
                          onClick={() => setRisks(risks.includes(h) ? risks.filter((x) => x !== h) : [...risks, h])}>{label(h)}</Button>
                ))}
              </div>
            </Field>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <div className="text-xs font-medium text-slate-700">Safety requirements checklist</div>
            {(meta?.safetyChecklist ?? []).map((c) => (
              <div key={c.key} className="flex items-center gap-2">
                <Checkbox id={`new-${c.key}`} checked={!!checklist[c.key]} onCheckedChange={(v) => setChecklist({ ...checklist, [c.key]: v === true })} />
                <Label htmlFor={`new-${c.key}`} className="text-sm font-normal">{c.label}</Label>
              </div>
            ))}
          </div>
          <div className="sm:col-span-2"><Field label="Safety notes"><Textarea rows={2} value={f.notes} onChange={(e) => set("notes")(e.target.value)} /></Field></div>
          <div className="sm:col-span-2"><ErrorBox error={error} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !f.contractorCompanyId || !f.plantId || f.title.trim().length < 3 || f.scope.trim().length < 10 || !f.start || !f.end}>
            {busy ? "Saving…" : "Save draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
