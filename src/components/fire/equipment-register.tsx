"use client";

// Fire equipment register: filter by plant / type / status, search, register
// new assets. Each row opens the asset's detail page.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions } from "@/components/auth/can";
import { ALL_PLANTS, EmptyRow, ErrorBox, PlantSelect, plantParam } from "@/components/ims/shared";
import {
  canManageEquipment, fireFetch, fireLabel, fmtDate, qs, type FireEquipment, type FireMeta, type PlantOption,
} from "@/lib/fire/api";
import { EquipmentFormDialog } from "./equipment-form";
import { FireStatusBadge } from "./shared";

const ANY = "__any__";

export function EquipmentRegister({
  plants, meta, initial,
}: {
  plants: PlantOption[];
  meta: FireMeta | null;
  initial: { plantId?: string; type?: string; status?: string; q?: string };
}) {
  const router = useRouter();
  const perms = usePermissions();
  const [plant, setPlant] = useState(initial.plantId ?? ALL_PLANTS);
  const [type, setType] = useState(initial.type ?? ANY);
  const [status, setStatus] = useState(initial.status ?? ANY);
  const [q, setQ] = useState(initial.q ?? "");
  const [rows, setRows] = useState<FireEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fireFetch<{ items: FireEquipment[] }>(`/api/fire/equipment${qs({
        plantId: plantParam(plant), type: type === ANY ? undefined : type,
        status: status === ANY ? undefined : status, q: q.trim() || undefined,
      })}`);
      setRows(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load equipment");
    } finally {
      setLoading(false);
    }
  }, [plant, type, status, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={type} onValueChange={setType} className="h-9 w-48" aria-label="Type">
          <SelectItem value={ANY}>All types</SelectItem>
          {(meta?.equipmentTypes ?? []).map((t) => <SelectItem key={t} value={t}>{fireLabel(t)}</SelectItem>)}
        </Select>
        <Select value={status} onValueChange={setStatus} className="h-9 w-44" aria-label="Status">
          <SelectItem value={ANY}>All statuses</SelectItem>
          {(meta?.equipmentStatuses ?? []).filter((s) => s !== "DECOMMISSIONED").map((s) => (
            <SelectItem key={s} value={s}>{fireLabel(s)}</SelectItem>
          ))}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, location, serial…" className="h-9 w-60" />
        <span className="text-xs text-slate-500">{loading ? "Loading…" : `${rows.length} item(s)`}</span>
        {canManageEquipment(perms) && (
          <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}><Plus size={14} /> Register equipment</Button>
        )}
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[980px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Code</TableHead><TableHead>Type</TableHead><TableHead>Location</TableHead><TableHead>Plant</TableHead>
              <TableHead>Capacity</TableHead><TableHead>Last inspected</TableHead><TableHead>Next due</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell><Link href={`/fire-safety/equipment/${e.id}`} className="font-medium text-primary-700 hover:underline">{e.equipmentCode}</Link></TableCell>
                <TableCell className="text-xs">{fireLabel(e.type)}</TableCell>
                <TableCell className="text-xs">{e.location}{e.buildingId && <div className="text-[11px] text-slate-500">{e.buildingId}</div>}</TableCell>
                <TableCell className="text-xs">{e.plantName ?? "—"}</TableCell>
                <TableCell className="text-xs text-slate-500">{e.capacitySpec ?? "—"}</TableCell>
                <TableCell className="text-xs">{fmtDate(e.lastInspectionDate)}</TableCell>
                <TableCell className="text-xs tabular-nums">{fmtDate(e.nextInspectionDueDate)}</TableCell>
                <TableCell><FireStatusBadge status={e.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!loading && rows.length === 0 && !error && <EmptyRow text="No equipment matches this filter." />}
      </div>
      <EquipmentFormDialog
        open={adding} onOpenChange={setAdding} equipment={null} plants={plants} meta={meta}
        defaultPlantId={plantParam(plant) ?? plants[0]?.id ?? null}
        onSaved={(e) => router.push(`/fire-safety/equipment/${e.id}`)}
      />
    </div>
  );
}
