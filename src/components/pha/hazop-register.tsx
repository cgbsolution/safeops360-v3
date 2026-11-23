"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, label, phaFetch, qs, type PhaMeta, type PlantOption, type Study } from "@/lib/pha/api";
import { ALL_PLANTS, EmptyRow, ErrorBox, PlantSelect, StatusBadge, plantParam } from "./shared";

const ANY = "__any__";

export function HazopRegister({
  plants, meta, defaultPlantId, defaultStatus, canCreate,
}: { plants: PlantOption[]; meta: PhaMeta | null; defaultPlantId: string | null; defaultStatus: string | null; canCreate: boolean }) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  const [status, setStatus] = useState(defaultStatus ?? ANY);
  const [method, setMethod] = useState(ANY);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Study[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await phaFetch<{ items: Study[] }>(`/api/pha/studies${qs({
        plantId: plantParam(plant), status: status === ANY ? undefined : status, method: method === ANY ? undefined : method, q: q.trim() || undefined,
      })}`);
      setItems(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load studies");
    }
  }, [plant, status, method, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={status} onValueChange={setStatus} className="h-9 w-44" aria-label="Status">
          <SelectItem value={ANY}>Any status</SelectItem>
          <SelectItem value="ACTIVE">Active (not approved)</SelectItem>
          {(meta?.studyStatuses ?? []).map((s) => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}
        </Select>
        <Select value={method} onValueChange={setMethod} className="h-9 w-36" aria-label="Method">
          <SelectItem value={ANY}>Any method</SelectItem>
          {(meta?.methods ?? []).map((m) => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search study no., title, unit" className="h-9 w-64" />
        {canCreate && (
          <Button asChild size="sm" className="ml-auto">
            <Link href="/process-safety/hazop/new"><Plus size={14} /> New study</Link>
          </Button>
        )}
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Study</TableHead><TableHead>Method</TableHead><TableHead>Plant / unit</TableHead>
              <TableHead>Facilitator</TableHead><TableHead className="text-right">Nodes</TableHead>
              <TableHead className="text-right">Recs open / total</TableHead><TableHead>Status</TableHead><TableHead>Revalidation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(items ?? []).map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Button asChild variant="link" size="sm" className="h-auto p-0">
                    <Link href={`/process-safety/hazop/${s.id}`}>{s.studyNo}</Link>
                  </Button>
                  <div className="text-xs text-slate-600">{s.title}</div>
                </TableCell>
                <TableCell className="text-xs">{s.methodLabel}</TableCell>
                <TableCell className="text-xs">{s.plantName ?? "—"}{s.unit ? ` · ${s.unit}` : ""}{s.area ? ` · ${s.area}` : ""}</TableCell>
                <TableCell className="text-xs">{s.facilitatorName ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{s.nodeCount ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">{s.openRecs ?? 0} / {s.recCount ?? 0}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell className="text-xs">
                  {s.revalidationDueDate ? (
                    <span className="inline-flex items-center gap-1">{fmtDate(s.revalidationDueDate)}{s.revalidationState && s.revalidationState !== "CURRENT" && <StatusBadge status={s.revalidationState} />}</span>
                  ) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {items && items.length === 0 && <EmptyRow text="No studies match these filters." />}
        {!items && !error && <EmptyRow text="Loading…" />}
      </div>
    </div>
  );
}
