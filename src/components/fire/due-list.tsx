"use client";

// Assets to inspect next: overdue, never inspected, defective, then coming due.
// "Start inspection" opens the same phone checklist a QR scan opens.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions } from "@/components/auth/can";
import { ALL_PLANTS, EmptyRow, ErrorBox, PlantSelect, plantParam } from "@/components/ims/shared";
import { canInspect, fireFetch, fireLabel, fmtDate, qs, type FireEquipment, type FireMeta, type PlantOption } from "@/lib/fire/api";
import { FireStatusBadge } from "./shared";

const ANY = "__any__";
const WINDOWS = [
  { v: "auto", label: "Due soon (per asset interval)" },
  { v: "7", label: "Due within 7 days" },
  { v: "15", label: "Due within 15 days" },
  { v: "30", label: "Due within 30 days" },
];

export function DueList({ plants, meta, defaultPlantId }: { plants: PlantOption[]; meta: FireMeta | null; defaultPlantId: string | null }) {
  const perms = usePermissions();
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  const [type, setType] = useState(ANY);
  const [win, setWin] = useState("auto");
  const [rows, setRows] = useState<FireEquipment[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fireFetch<{ items: FireEquipment[]; counts: Record<string, number> }>(`/api/fire/inspections/due${qs({
        plantId: plantParam(plant), equipmentType: type === ANY ? undefined : type, days: win === "auto" ? undefined : win,
      })}`);
      setRows(r.items);
      setCounts(r.counts);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load the due list");
    } finally {
      setLoading(false);
    }
  }, [plant, type, win]);

  useEffect(() => { void load(); }, [load]);
  const inspector = canInspect(perms);

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-3 sm:max-w-xl">
        <Tile label="Overdue" value={counts.OVERDUE ?? 0} tone="text-rose-600" />
        <Tile label="Never inspected" value={counts.NEVER ?? 0} tone="text-amber-600" />
        <Tile label="Due soon" value={counts.DUE_SOON ?? 0} tone="text-amber-600" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={type} onValueChange={setType} className="h-9 w-48" aria-label="Type">
          <SelectItem value={ANY}>All types</SelectItem>
          {(meta?.equipmentTypes ?? []).map((t) => <SelectItem key={t} value={t}>{fireLabel(t)}</SelectItem>)}
        </Select>
        <Select value={win} onValueChange={setWin} className="h-9 w-60" aria-label="Window">
          {WINDOWS.map((w) => <SelectItem key={w.v} value={w.v}>{w.label}</SelectItem>)}
        </Select>
        <span className="text-xs text-slate-500">{loading ? "Loading…" : `${rows.length} asset(s)`}</span>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[900px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Code</TableHead><TableHead>Type</TableHead><TableHead>Location</TableHead><TableHead>Plant</TableHead>
              <TableHead>Last inspected</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell><Link href={`/fire-safety/equipment/${e.id}`} className="font-medium text-primary-700 hover:underline">{e.equipmentCode}</Link></TableCell>
                <TableCell className="text-xs">{fireLabel(e.type)}</TableCell>
                <TableCell className="text-xs">{e.location}</TableCell>
                <TableCell className="text-xs">{e.plantName ?? "—"}</TableCell>
                <TableCell className="text-xs">{fmtDate(e.lastInspectionDate)}</TableCell>
                <TableCell className="text-xs tabular-nums">
                  {fmtDate(e.nextInspectionDueDate)}
                  <div><FireStatusBadge status={e.dueBucket} className="mt-0.5" /></div>
                </TableCell>
                <TableCell><FireStatusBadge status={e.status} /></TableCell>
                <TableCell className="text-right">
                  {inspector && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/q/fire/${encodeURIComponent(e.equipmentCode)}?src=app`}><ClipboardCheck size={14} /> Start inspection</Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!loading && rows.length === 0 && !error && <EmptyRow text="Nothing due. Every asset in this filter is inspected and in date." />}
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={"text-2xl font-bold tabular-nums " + tone}>{value}</div>
    </div>
  );
}
