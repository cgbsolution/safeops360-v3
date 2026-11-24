"use client";

// Live site map. Zones are shadcn Buttons clipped to their polygon (so the hit
// area is exactly the zone and Tab reaches every one); an SVG layer draws the
// outlines, the selected-zone outline and the SIMOPS ring. Pins are 44 px
// Buttons around a 26 px coloured circle. Status is never colour-only: overdue
// and flagged rings are named in the legend and in each pin's accessible name.

import Image from "next/image";
import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PERMIT_TYPES, typeInfo, type ControlCenterPayload, type OpsZone } from "@/lib/ptw/ops";
import { CcPanel } from "./panel";

type Box = { x0: number; y0: number; x1: number; y1: number };

function bbox(poly: { x: number; y: number }[]): Box {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function clipPath(poly: { x: number; y: number }[], b: Box): string {
  const w = Math.max(b.x1 - b.x0, 0.01);
  const h = Math.max(b.y1 - b.y0, 0.01);
  return `polygon(${poly.map((p) => `${(((p.x - b.x0) / w) * 100).toFixed(2)}% ${(((p.y - b.y0) / h) * 100).toFixed(2)}%`).join(", ")})`;
}

const LEGEND_TYPES = ["HOT_WORK", "CONFINED_SPACE", "ELECTRICAL_LOTO", "WORK_AT_HEIGHT", "LIFTING", "EXCAVATION"];
const RING = { overdue: "0 0 0 3px #fff, 0 0 0 6px #e11d48", flagged: "0 0 0 3px #fff, 0 0 0 6px #f59e0b", plain: "0 0 0 2px #fff" };

export function MapLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-600" aria-label="Map legend">
      {LEGEND_TYPES.map((t) => (
        <li key={t} className="flex items-center gap-1.5">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-slate-900"
                style={{ background: PERMIT_TYPES[t].color }} aria-hidden>
            {PERMIT_TYPES[t].glyph}
          </span>
          {PERMIT_TYPES[t].label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-3.5 rounded-full bg-slate-200" style={{ boxShadow: RING.overdue }} aria-hidden /> Overdue
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-3.5 rounded-full bg-slate-200" style={{ boxShadow: RING.flagged }} aria-hidden /> Flagged
      </li>
      <li className="flex items-center gap-1.5">
        <ShieldAlert size={13} aria-hidden className="text-rose-600" /> Impairment
      </li>
    </ul>
  );
}

export function SiteMap({
  data,
  selected,
  onSelect,
  onOpenPermit,
  loading,
  error,
}: {
  data: ControlCenterPayload | null;
  selected: string | null;
  onSelect: (zoneId: string) => void;
  onOpenPermit: (permitId: string) => void;
  loading?: boolean;
  error?: string | null;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  const zones = useMemo(() => data?.map.zones.filter((z) => z.polygon.length >= 3) ?? [], [data]);
  const boxes = useMemo(() => new Map(zones.map((z) => [z.id, bbox(z.polygon)])), [zones]);

  const summary = data
    ? `Site map of ${data.plant.name ?? "the plant"}: ${zones.length} zones, ${data.map.pins.length} permits on site` +
      (data.map.conflicts.length ? `, ${data.map.conflicts.length} SIMOPS conflict${data.map.conflicts.length === 1 ? "" : "s"}` : "") +
      (data.kpis.activeImpairments ? `, ${data.kpis.activeImpairments} impaired safety system${data.kpis.activeImpairments === 1 ? "" : "s"}` : "")
    : "Site map loading";

  // One ring per pair of areas, even if several permit pairs conflict there.
  const rings = useMemo(() => {
    const seen = new Map<string, { areaIds: string[]; label: string; box: Box }>();
    for (const c of data?.map.conflicts ?? []) {
      const key = [...c.areaIds].sort().join("|");
      const bs = c.areaIds.map((a) => boxes.get(a)).filter(Boolean) as Box[];
      if (seen.has(key) || !bs.length) continue;
      seen.set(key, {
        areaIds: c.areaIds,
        label: c.label,
        box: {
          x0: Math.min(...bs.map((b) => b.x0)), x1: Math.max(...bs.map((b) => b.x1)),
          y0: Math.min(...bs.map((b) => b.y0)), y1: Math.max(...bs.map((b) => b.y1)),
        },
      });
    }
    return [...seen.values()];
  }, [data, boxes]);

  return (
    <CcPanel
      title="Live site map — where work is happening"
      right={<MapLegend />}
      state={!data && loading ? "loading" : !data && error ? "error" : "ready"}
      error={error}
      empty={data && !zones.length ? "This plant has no zones yet. Add areas, then draw them under Impairments → Zone setup." : undefined}
    >
      <div className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50" style={{ aspectRatio: "2 / 1", minHeight: 300 }}>
        {data?.map.layoutImageUrl && (
          <Image src={data.map.layoutImageUrl} alt="" fill unoptimized className="object-fill opacity-50" />
        )}

        {/* Decorative layer: outlines, selection, SIMOPS rings. The summary lives here. */}
        <svg role="img" aria-label={summary} className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {zones.map((z) => {
            const on = z.id === selected;
            const foc = z.id === focused;
            return (
              <polygon
                key={z.id}
                points={z.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={on || foc ? "hsl(var(--primary))" : "#cbd5e1"}
                strokeWidth={on || foc ? 2 : 1}
                vectorEffect="non-scaling-stroke"
                strokeDasharray={foc && !on ? "4 3" : undefined}
              />
            );
          })}
          {rings.map((r) => (
            <ellipse
              key={r.areaIds.join("|")}
              className="motion-safe:animate-pulse"
              cx={(r.box.x0 + r.box.x1) / 2}
              cy={(r.box.y0 + r.box.y1) / 2}
              rx={(r.box.x1 - r.box.x0) / 2 + 2}
              ry={(r.box.y1 - r.box.y0) / 2 + 3}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        <div role="group" aria-label="Zones and permits" className="absolute inset-0">
          {zones.map((z) => (
            <ZoneButton
              key={z.id}
              zone={z}
              box={boxes.get(z.id)!}
              selected={z.id === selected}
              onSelect={onSelect}
              onFocus={() => setFocused(z.id)}
              onBlur={() => setFocused((f) => (f === z.id ? null : f))}
            />
          ))}

          {rings.map((r) => (
            <Badge
              key={`chip-${r.areaIds.join("|")}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 border-amber-300 bg-amber-50 font-semibold text-amber-800"
              style={{ left: `${(r.box.x0 + r.box.x1) / 2}%`, top: `${(r.box.y0 + r.box.y1) / 2}%` }}
            >
              {r.label}
            </Badge>
          ))}

          {(data?.map.pins ?? []).map((p) => {
            const info = typeInfo(p.type);
            const state = [p.overdue && "overdue", p.flagged && "flagged", p.status === "SUSPENDED" && "suspended"].filter(Boolean).join(", ");
            return (
              <Button
                key={p.permitId}
                type="button"
                variant="bare"
                size="bare"
                onClick={() => onOpenPermit(p.permitId)}
                aria-label={`${p.number}, ${info.label}${state ? `, ${state}` : ""}. Open permit`}
                title={`${p.number} · ${info.label}${state ? ` · ${state}` : ""}`}
                className="absolute z-[3] flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              >
                <span
                  className={cn("flex h-[26px] w-[26px] items-center justify-center rounded-full text-[12px] font-bold text-slate-900", p.status === "SUSPENDED" && "opacity-60")}
                  style={{ background: info.color, boxShadow: p.overdue ? RING.overdue : p.flagged ? RING.flagged : RING.plain }}
                  aria-hidden
                >
                  {info.glyph}
                </span>
              </Button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Click a zone for site guidance · click a pin to open the permit
        {data?.map.autoLayout && " · zones are laid out automatically until a layout is drawn"}
      </p>
    </CcPanel>
  );
}

function ZoneButton({
  zone,
  box,
  selected,
  onSelect,
  onFocus,
  onBlur,
}: {
  zone: OpsZone;
  box: Box;
  selected: boolean;
  onSelect: (id: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const imp = zone.impairmentCodes.length > 0;
  return (
    <Button
      type="button"
      variant="bare"
      size="bare"
      onClick={() => onSelect(zone.id)}
      onFocus={onFocus}
      onBlur={onBlur}
      aria-pressed={selected}
      aria-label={`${zone.name}: ${zone.permitCount} permit${zone.permitCount === 1 ? "" : "s"} on site${imp ? `, impaired ${zone.impairmentCodes.join(", ")}` : ""}. Show site guidance`}
      className={cn(
        "absolute flex flex-col items-start justify-between whitespace-normal p-2 text-left focus-visible:ring-0 focus-visible:ring-offset-0",
        selected ? "bg-primary-50" : "bg-white hover:bg-slate-100",
        zone.dimmed && "opacity-50"
      )}
      style={{
        left: `${box.x0}%`,
        top: `${box.y0}%`,
        width: `${box.x1 - box.x0}%`,
        height: `${box.y1 - box.y0}%`,
        clipPath: clipPath(zone.polygon, box),
      }}
    >
      <span className={cn("text-xs font-semibold leading-tight", selected ? "text-primary-800" : "text-slate-700")}>
        {zone.name}
        {zone.activeCount > 0 && <span className="ml-1 font-normal text-slate-500">· {zone.activeCount} active</span>}
      </span>
      {imp && (
        <Badge className="w-fit gap-1 border-rose-200 bg-rose-50 font-mono text-[11px] text-rose-700">
          <ShieldAlert size={12} aria-hidden /> {zone.impairmentCodes.join(" · ")}
        </Badge>
      )}
    </Button>
  );
}
