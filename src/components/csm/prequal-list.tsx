"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { csmFetch, fmtDate, label, qs, type Contractor, type PlantOption, type PrequalRow } from "@/lib/csm/api";
import { useRouter } from "next/navigation";
import { ALL_PLANTS, EmptyRow, ErrorBox, Field, LinkButton, Pill, PlantSelect, plantParam, ScoreText } from "./shared";

const FILTERS = ["OPEN", "DRAFT", "SUBMITTED", "HSE_REVIEW", "APPROVAL", "QUALIFIED", "CONDITIONAL", "REJECTED", "WITHDRAWN", "ALL"];

export function PrequalListView({ plants, defaultPlantId, initialStatus }: { plants: PlantOption[]; defaultPlantId: string | null; initialStatus?: string | null }) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  const [status, setStatus] = useState(initialStatus && FILTERS.includes(initialStatus) ? initialStatus : "OPEN");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PrequalRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await csmFetch<{ items: PrequalRow[] }>(`/api/csm/prequalifications${qs({ plantId: plantParam(plant), status: status === "ALL" ? undefined : status, q: q.trim() })}`);
      setRows(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load applications");
    }
  }, [plant, status, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={status} onValueChange={setStatus} className="h-9 w-48" aria-label="Status">
          {FILTERS.map((f) => <SelectItem key={f} value={f}>{f === "OPEN" ? "In progress" : f === "ALL" ? "All" : label(f)}</SelectItem>)}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contractor or application no." className="h-9 w-64" />
        <span className="text-xs text-slate-500">{rows.length} application(s)</span>
        <Button size="sm" className="ml-auto" onClick={() => setNewOpen(true)}><Plus size={14} /> New application</Button>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[1000px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Application</TableHead><TableHead>Contractor</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Auto</TableHead><TableHead className="text-right">Final</TableHead>
              <TableHead>Critical</TableHead><TableHead>Submitted</TableHead><TableHead>Valid until</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <LinkButton href={`/csm/prequalifications/${p.id}`}>{p.applicationNo}</LinkButton>
                  <div className="text-[11px] text-slate-500">{p.plantName ?? ""}{p.isRenewal ? " · renewal" : ""}</div>
                </TableCell>
                <TableCell><LinkButton href={`/csm/contractors/${p.contractorCompanyId}`}>{p.contractorName ?? "—"}</LinkButton></TableCell>
                <TableCell><Pill value={p.status} />{p.isCurrent && <div className="text-[11px] text-emerald-700">current</div>}</TableCell>
                <TableCell className="text-right"><ScoreText value={p.autoScore} /></TableCell>
                <TableCell className="text-right"><ScoreText value={p.finalScore} /></TableCell>
                <TableCell className="text-xs">{p.criticalFailureCount ? <span className="font-semibold text-rose-700">{p.criticalFailureCount} gap(s)</span> : "—"}</TableCell>
                <TableCell className="text-xs">{fmtDate(p.submittedAt)}{p.submittedVia && <div className="text-[11px] text-slate-500">{label(p.submittedVia)}</div>}</TableCell>
                <TableCell className="text-xs">{fmtDate(p.validUntil)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !error && <EmptyRow text="No applications match this filter." />}
      </div>
      <NewApplicationDialog open={newOpen} onOpenChange={setNewOpen} plants={plants} defaultPlantId={plantParam(plant) ?? defaultPlantId} />
    </div>
  );
}

/** Prequalification for an already registered contractor (e.g. one first set up under EPC). */
function NewApplicationDialog({ open, onOpenChange, plants, defaultPlantId }: { open: boolean; onOpenChange: (v: boolean) => void; plants: PlantOption[]; defaultPlantId: string | null }) {
  const router = useRouter();
  const [all, setAll] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [cid, setCid] = useState("");
  const [plantId, setPlantId] = useState(defaultPlantId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPlantId(defaultPlantId ?? plants[0]?.id ?? ""); setError(null); setCid("");
    // EPC register lists every contractor company (CSM only lists those already active at a plant).
    csmFetch<{ contractors: { id: string; companyName: string; companyCode: string | null }[] }>("/api/epc/contractors/")
      .then((r) => setAll(r.contractors.map((c) => ({ id: c.id, name: c.companyName, code: c.companyCode }))))
      .catch(() => csmFetch<{ items: Contractor[] }>("/api/csm/contractors").then((r) => setAll(r.items)).catch(() => setAll([])));
  }, [open, defaultPlantId, plants]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await csmFetch<{ id: string }>("/api/csm/prequalifications", { method: "POST", json: { contractorCompanyId: cid, plantId } });
      onOpenChange(false);
      router.push(`/csm/prequalifications/${r.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Could not open the application");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New prequalification</DialogTitle>
          <DialogDescription>For a contractor already in the register. New contractors are registered from the Contractors page.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Contractor" required>
            <Select value={cid} onValueChange={setCid} className="w-full" placeholder="Pick a contractor">
              {all.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</SelectItem>)}
            </Select>
          </Field>
          <Field label="Plant" required><PlantSelect plants={plants} value={plantId} onChange={setPlantId} allowAll={false} className="w-full" /></Field>
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !cid || !plantId}>{busy ? "Opening…" : "Open application"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
