"use client";

// Printable QR labels for fire equipment. Pick assets by plant / type /
// location, then print an A4 sheet: 3 × 7 labels of 63.5 × 38.1 mm (the common
// 21-up label stock), each with the QR, code, type and location. The QR encodes
// <origin>/q/fire/<code>, which opens the asset's checklist after sign-in.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { ALL_PLANTS, ErrorBox, PlantSelect, plantParam } from "@/components/ims/shared";
import { fireFetch, fireLabel, fireQrUrl, qs, type FireEquipment, type FireMeta, type PlantOption } from "@/lib/fire/api";
import { QrImage } from "./shared";

const ANY = "__any__";
const PER_PAGE = 21;

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 15mm 7mm 0 7mm; }
  body * { visibility: hidden !important; }
  #fire-label-sheet, #fire-label-sheet * { visibility: visible !important; }
  #fire-label-sheet { position: absolute; left: 0; top: 0; }
  .fire-label-page { break-after: page; }
  .fire-label-page:last-child { break-after: auto; }
}
.fire-label-grid { display: grid; grid-template-columns: repeat(3, 63.5mm); grid-auto-rows: 38.1mm; column-gap: 2.5mm; }
.fire-label { width: 63.5mm; height: 38.1mm; box-sizing: border-box; padding: 2mm; display: flex; gap: 2mm; align-items: center; overflow: hidden; }
@media screen { .fire-label { outline: 1px dashed #cbd5e1; } }
`;

export function LabelSheet({ plants, meta, preselect }: { plants: PlantOption[]; meta: FireMeta | null; preselect: string[] }) {
  const [plant, setPlant] = useState(ALL_PLANTS);
  const [type, setType] = useState(ANY);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<FireEquipment[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set(preselect));
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  // Equipment picked earlier stays on the sheet when the filter changes.
  const [known, setKnown] = useState<Record<string, FireEquipment>>({});

  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    try {
      const r = await fireFetch<{ items: FireEquipment[] }>(`/api/fire/equipment${qs({
        plantId: plantParam(plant), type: type === ANY ? undefined : type, q: q.trim() || undefined,
      })}`);
      setRows(r.items);
      setKnown((p) => ({ ...p, ...Object.fromEntries(r.items.map((e) => [e.id, e])) }));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load equipment");
    }
  }, [plant, type, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const selected = useMemo(
    () => [...picked].map((id) => known[id]).filter(Boolean).sort((a, b) => a.equipmentCode.localeCompare(b.equipmentCode)),
    [picked, known],
  );
  const pages = useMemo(() => {
    const out: FireEquipment[][] = [];
    for (let i = 0; i < selected.length; i += PER_PAGE) out.push(selected.slice(i, i + PER_PAGE));
    return out;
  }, [selected]);

  const allShown = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });

  return (
    <div>
      <style>{PRINT_CSS}</style>
      <div className="print:hidden">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <PlantSelect plants={plants} value={plant} onChange={setPlant} />
          <Select value={type} onValueChange={setType} className="h-9 w-48" aria-label="Type">
            <SelectItem value={ANY}>All types</SelectItem>
            {(meta?.equipmentTypes ?? []).map((t) => <SelectItem key={t} value={t}>{fireLabel(t)}</SelectItem>)}
          </Select>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Location or code" className="h-9 w-56" />
          <span className="text-xs text-slate-500">{selected.length} label(s) selected · {pages.length} A4 sheet(s)</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())} disabled={!picked.size}>Clear</Button>
            <Button size="sm" onClick={() => window.print()} disabled={!selected.length}><Printer size={14} /> Print labels</Button>
          </div>
        </div>
        <ErrorBox error={error} />
        <div className="mb-4 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
            <Checkbox
              id="pick-all" checked={allShown}
              onCheckedChange={(v) => setPicked((p) => { const n = new Set(p); rows.forEach((r) => (v === true ? n.add(r.id) : n.delete(r.id))); return n; })}
            />
            <Label htmlFor="pick-all" className="text-xs font-medium">Select all {rows.length} shown</Label>
          </div>
          {rows.map((e) => (
            <div key={e.id} className="flex items-center gap-2 border-b border-slate-50 px-3 py-1.5 text-sm last:border-0">
              <Checkbox id={`pick-${e.id}`} checked={picked.has(e.id)} onCheckedChange={(v) => toggle(e.id, v === true)} />
              <Label htmlFor={`pick-${e.id}`} className="flex flex-1 cursor-pointer gap-3 font-normal">
                <span className="w-32 font-mono font-medium">{e.equipmentCode}</span>
                <span className="w-40 text-slate-600">{fireLabel(e.type)}</span>
                <span className="truncate text-slate-500">{e.location}</span>
              </Label>
            </div>
          ))}
          {rows.length === 0 && <div className="px-3 py-6 text-center text-sm text-slate-400">No equipment matches this filter.</div>}
        </div>
        {selected.length > 0 && <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</div>}
      </div>

      <div id="fire-label-sheet">
        {origin && pages.map((page, pi) => (
          <div key={pi} className="fire-label-page mb-6 print:mb-0">
            <div className="fire-label-grid bg-white">
              {page.map((e) => (
                <div key={e.id} className="fire-label text-slate-900">
                  <QrImage value={fireQrUrl(origin, e.equipmentCode)} size={100} className="h-[30mm] w-[30mm] shrink-0" />
                  <div className="min-w-0 leading-tight">
                    <div className="text-[9pt] font-bold uppercase tracking-wide text-rose-700">Fire safety</div>
                    <div className="font-mono text-[11pt] font-bold">{e.equipmentCode}</div>
                    <div className="text-[8pt] font-semibold">{fireLabel(e.type)}{e.capacitySpec ? ` · ${e.capacitySpec}` : ""}</div>
                    <div className="line-clamp-2 text-[7.5pt]">{e.location}</div>
                    <div className="mt-0.5 text-[6.5pt] text-slate-600">Scan to inspect</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
