"use client";

// Fire inspection register: every completed QR checklist inspection, filterable
// by plant, equipment type, result, inspector and date.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserPicker } from "@/components/ui/user-picker";
import { ALL_PLANTS, EmptyRow, ErrorBox, PlantSelect, plantParam } from "@/components/ims/shared";
import { fireFetch, fireLabel, fmtDate, qs, type FireInspection, type FireMeta, type PlantOption } from "@/lib/fire/api";
import { FireStatusBadge } from "./shared";

const ANY = "__any__";

export function InspectionRegister({
  plants, meta, initial,
}: {
  plants: PlantOption[];
  meta: FireMeta | null;
  initial: { plantId?: string; equipmentType?: string; result?: string; criticalOnly?: boolean };
}) {
  const [plant, setPlant] = useState(initial.plantId ?? ALL_PLANTS);
  const [type, setType] = useState(initial.equipmentType ?? ANY);
  const [result, setResult] = useState(initial.result ?? ANY);
  const [critical, setCritical] = useState(!!initial.criticalOnly);
  const [inspector, setInspector] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<FireInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // dateTo is exclusive on the API: add a day so the picked date is included.
      const toIso = to ? new Date(new Date(to).getTime() + 864e5).toISOString() : undefined;
      const r = await fireFetch<{ items: FireInspection[] }>(`/api/fire/inspections${qs({
        plantId: plantParam(plant), equipmentType: type === ANY ? undefined : type,
        result: result === ANY ? undefined : result, criticalOnly: critical, inspectorId: inspector ?? undefined,
        dateFrom: from ? new Date(from).toISOString() : undefined, dateTo: toIso, q: q.trim() || undefined,
      })}`);
      setRows(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load inspections");
    } finally {
      setLoading(false);
    }
  }, [plant, type, result, critical, inspector, from, to, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const fails = rows.filter((r) => r.result === "FAIL").length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={type} onValueChange={setType} className="h-9 w-48" aria-label="Type">
          <SelectItem value={ANY}>All types</SelectItem>
          {(meta?.equipmentTypes ?? []).map((t) => <SelectItem key={t} value={t}>{fireLabel(t)}</SelectItem>)}
        </Select>
        <Select value={result} onValueChange={setResult} className="h-9 w-36" aria-label="Result">
          <SelectItem value={ANY}>Any result</SelectItem>
          <SelectItem value="PASS">Pass</SelectItem>
          <SelectItem value="FAIL">Fail</SelectItem>
        </Select>
        <div className="w-56"><UserPicker value={inspector} onChange={(id) => setInspector(id)} placeholder="Any inspector" /></div>
        <div className="flex items-center gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-36" aria-label="From" />
          <span className="text-xs text-slate-400">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-36" aria-label="To" />
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Inspection no., code, location" className="h-9 w-56" />
        <div className="flex h-9 items-center gap-2">
          <Checkbox id="crit-only" checked={critical} onCheckedChange={(v) => setCritical(v === true)} />
          <Label htmlFor="crit-only" className="text-sm">Critical failures only</Label>
        </div>
      </div>
      <div className="mb-2 text-xs text-slate-500">{loading ? "Loading…" : `${rows.length} inspection(s), ${fails} failed`}{rows.length >= 500 ? " (showing the latest 500)" : ""}</div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[1080px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Inspection</TableHead><TableHead>Completed</TableHead><TableHead>Equipment</TableHead><TableHead>Location</TableHead>
              <TableHead>Inspector</TableHead><TableHead>Result</TableHead><TableHead>Pass / fail / NA</TableHead><TableHead>Asset after</TableHead><TableHead>CAPA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <Link href={`/fire-safety/inspections/${i.id}`} className="font-medium text-primary-700 hover:underline">{i.inspectionNo}</Link>
                  <div className="text-[11px] text-slate-500">{i.scanned ? "QR scan" : "Manual"}{i.latitude != null ? " · GPS" : ""}</div>
                </TableCell>
                <TableCell className="text-xs">{fmtDate(i.completedAt, true)}</TableCell>
                <TableCell className="text-xs">
                  <Link href={`/fire-safety/equipment/${i.equipmentId}`} className="text-primary-700 hover:underline">{i.equipmentCode}</Link>
                  <div className="text-[11px] text-slate-500">{fireLabel(i.equipmentType)}</div>
                </TableCell>
                <TableCell className="text-xs">{i.location ?? "—"}{i.plantName && <div className="text-[11px] text-slate-500">{i.plantName}</div>}</TableCell>
                <TableCell className="text-xs">{i.inspectorName ?? "—"}</TableCell>
                <TableCell>
                  <FireStatusBadge status={i.result} />
                  {i.criticalFailCount > 0 && <div className="mt-0.5 text-[11px] font-medium text-rose-700">{i.criticalFailCount} critical</div>}
                </TableCell>
                <TableCell className="text-xs tabular-nums">{i.passCount} / {i.failCount} / {i.naCount}</TableCell>
                <TableCell><FireStatusBadge status={i.equipmentStatusAfter} /></TableCell>
                <TableCell className="text-xs">{i.capaId ? <Link href={`/capa/${i.capaId}`} className="text-primary-700 hover:underline">{i.capaNumber ?? "CAPA"}</Link> : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!loading && rows.length === 0 && !error && <EmptyRow text="No inspections match this filter." />}
      </div>
    </div>
  );
}
