"use client";

// Contractor performance evaluations: monthly, quarterly and contract-end.
// KPIs are auto-filled from observations, near misses, incidents, show cause
// notices, permit suspensions and toolbox talks; the evaluator scores the
// manual criteria; a second person signs off.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { csmFetch, dateToIso, fmtDate, label, qs, type Contractor, type CsmMeta, type Evaluation, type PlantOption, type WorkOrder } from "@/lib/csm/api";
import { ALL_PLANTS, EmptyRow, ErrorBox, Field, LinkButton, Pill, PlantSelect, plantParam, ScoreText } from "./shared";

const STATUSES = ["ALL", "DRAFT", "SUBMITTED", "SIGNED_OFF"];

export function EvaluationsView({ plants, meta, defaultPlantId, prefill }: {
  plants: PlantOption[]; meta: CsmMeta | null; defaultPlantId: string | null;
  prefill?: { open: boolean; contractorId?: string | null; workOrderId?: string | null; plantId?: string | null };
}) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [rows, setRows] = useState<Evaluation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(!!prefill?.open);

  const load = useCallback(async () => {
    try {
      const r = await csmFetch<{ items: Evaluation[] }>(`/api/csm/evaluations${qs({
        plantId: plantParam(plant), status: status === "ALL" ? undefined : status, evaluationType: type === "ALL" ? undefined : type,
      })}`);
      setRows(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load evaluations");
    }
  }, [plant, status, type]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={type} onValueChange={setType} className="h-9 w-44" aria-label="Type">
          <SelectItem value="ALL">All types</SelectItem>
          {(meta?.evaluationTypes ?? []).map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
        </Select>
        <Select value={status} onValueChange={setStatus} className="h-9 w-40" aria-label="Status">
          {STATUSES.map((s) => <SelectItem key={s} value={s}>{s === "ALL" ? "Any status" : label(s)}</SelectItem>)}
        </Select>
        <span className="text-xs text-slate-500">{rows.length} evaluation(s)</span>
        <Button size="sm" className="ml-auto" onClick={() => setNewOpen(true)}><Plus size={14} /> New evaluation</Button>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[980px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Evaluation</TableHead><TableHead>Contractor</TableHead><TableHead>Type</TableHead><TableHead>Period</TableHead>
              <TableHead className="text-right">KPIs</TableHead><TableHead className="text-right">Manual</TableHead><TableHead className="text-right">Final</TableHead>
              <TableHead>Rating</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell><LinkButton href={`/csm/evaluations/${e.id}`}>{e.evaluationNo}</LinkButton><div className="text-[11px] text-slate-500">{e.plantName ?? ""}</div></TableCell>
                <TableCell><LinkButton href={`/csm/contractors/${e.contractorCompanyId}`}>{e.contractorName ?? "—"}</LinkButton></TableCell>
                <TableCell className="text-xs">{label(e.evaluationType)}</TableCell>
                <TableCell className="text-xs">{fmtDate(e.periodStart)} – {fmtDate(e.periodEnd)}</TableCell>
                <TableCell className="text-right"><ScoreText value={e.autoScore} /></TableCell>
                <TableCell className="text-right"><ScoreText value={e.manualScore} /></TableCell>
                <TableCell className="text-right"><ScoreText value={e.finalScore} /></TableCell>
                <TableCell><Pill value={e.ratingBand} /></TableCell>
                <TableCell><Pill value={e.status} /><div className="text-[11px] text-slate-500">{e.evaluatorName ?? ""}</div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !error && <EmptyRow text="No evaluations match this filter." />}
      </div>
      <NewEvaluationDialog open={newOpen} onOpenChange={setNewOpen} plants={plants} meta={meta}
                           defaults={{ plantId: prefill?.plantId ?? plantParam(plant) ?? defaultPlantId, contractorId: prefill?.contractorId ?? null, workOrderId: prefill?.workOrderId ?? null }} />
    </div>
  );
}

function NewEvaluationDialog({ open, onOpenChange, plants, meta, defaults }: {
  open: boolean; onOpenChange: (v: boolean) => void; plants: PlantOption[]; meta: CsmMeta | null;
  defaults: { plantId: string | null; contractorId: string | null; workOrderId: string | null };
}) {
  const router = useRouter();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [cid, setCid] = useState("");
  const [plantId, setPlantId] = useState("");
  const [type, setType] = useState("MONTHLY");
  const [wo, setWo] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCid(defaults.contractorId ?? ""); setPlantId(defaults.plantId ?? plants[0]?.id ?? "");
    setType(defaults.workOrderId ? "CONTRACT_END" : "MONTHLY"); setWo(defaults.workOrderId ?? ""); setStart(""); setEnd(""); setError(null);
    csmFetch<{ items: Contractor[] }>("/api/csm/contractors").then((r) => setContractors(r.items)).catch(() => setContractors([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!cid) { setOrders([]); return; }
    csmFetch<{ items: WorkOrder[] }>(`/api/csm/work-orders${qs({ contractorCompanyId: cid, plantId: plantId || undefined })}`)
      .then((r) => setOrders(r.items)).catch(() => setOrders([]));
  }, [cid, plantId]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await csmFetch<Evaluation>("/api/csm/evaluations", {
        method: "POST",
        json: { contractorCompanyId: cid, plantId, evaluationType: type, workOrderId: wo || null,
                periodStart: start ? dateToIso(start) : null, periodEnd: end ? new Date(`${end}T23:59:59`).toISOString() : null },
      });
      onOpenChange(false);
      router.push(`/csm/evaluations/${r.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Could not create the evaluation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New performance evaluation</DialogTitle>
          <DialogDescription>Leave the period blank for the previous month (or the previous Apr-Jun / Jul-Sep / Oct-Dec / Jan-Mar quarter). KPIs are filled in automatically.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Contractor" required>
            <Select value={cid} onValueChange={setCid} className="w-full" placeholder="Pick a contractor">
              {contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plant" required><PlantSelect plants={plants} value={plantId} onChange={setPlantId} allowAll={false} className="w-full" /></Field>
            <Field label="Type" required>
              <Select value={type} onValueChange={setType} className="w-full">
                {(meta?.evaluationTypes ?? ["MONTHLY", "QUARTERLY", "CONTRACT_END"]).map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
              </Select>
            </Field>
          </div>
          <Field label="Work order" required={type === "CONTRACT_END"} hint={type === "CONTRACT_END" ? "The period defaults to the work order's dates." : "Optional: limits the toolbox-talk target to the work order's dates."}>
            <Select value={wo} onValueChange={setWo} className="w-full">
              <SelectItem value="">{type === "CONTRACT_END" ? "Pick a work order" : "All work at the plant"}</SelectItem>
              {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.workOrderNo} · {o.title} ({label(o.status)})</SelectItem>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Period start"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Period end"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !cid || !plantId || (type === "CONTRACT_END" && !wo) || (!!start !== !!end)}>{busy ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
