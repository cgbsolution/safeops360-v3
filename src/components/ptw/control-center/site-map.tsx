"use client";

// Live site map. Zones are real <button>s clipped to their polygon (so the hit
// area is exactly the zone and Tab reaches every one); an SVG layer draws the
// outlines, the selected-zone gold outline and the SIMOPS ring. Pins are 44 px
// buttons around a 26 px coloured circle. Status is never colour-only: overdue
// and flagged rings are named in the legend and in each pin's accessible name.

import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { PERMIT_TYPES, typeInfo, type ControlCenterPayload, type OpsZone } from "@/lib/ptw/ops";
import { OpsPanel } from "./panel";

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

export function MapLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] ops-text-2" aria-label="Map legend">
      {LEGEND_TYPES.map((t) => (
        <li key={t} className="flex items-center gap-1.5">
          <span
            className="ops-num inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
            style={{ background: PERMIT_TYPES[t].color, color: "var(--ops-glyph)" }}
            aria-hidden
          >
            {PERMIT_TYPES[t].glyph}
          </span>
          {PERMIT_TYPES[t].label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-4 w-4 rounded-full" style={{ boxShadow: "0 0 0 2px var(--ops-bg), 0 0 0 4px var(--ops-crit)", background: "var(--ops-surface-3)" }} aria-hidden />
        Overdue
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-4 w-4 rounded-full" style={{ boxShadow: "0 0 0 2px var(--ops-bg), 0 0 0 4px var(--ops-warn)", background: "var(--ops-surface-3)" }} aria-hidden />
        Flagged
      </li>
      <li className="flex items-center gap-1.5">
        <ShieldAlert size={14} aria-hidden style={{ color: "var(--ops-crit)" }} /> Impairment
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
  const zones = data?.map.zones.filter((z) => z.polygon.length >= 3) ?? [];
  const boxes = useMemo(() => new Map(zones.map((z) => [z.id, bbox(z.polygon)])), [zones]);

  const summary = data
    ? `Site map of ${data.plant.name ?? "the plant"}: ${zones.length} zones, ${data.map.pins.length} permits on site` +
      (data.map.conflicts.length ? `, ${data.map.conflicts.length} SIMOPS conflict${data.map.conflicts.length === 1 ? "" : "s"}` : "") +
      (data.kpis.activeImpairments ? `, ${data.kpis.activeImpairments} impaired safety system${data.kpis.activeImpairments === 1 ? "" : "s"}` : "")
    : "Site map loading";

  // One ring per pair of areas, even if several permit pairs conflict there.
  const rings = useMemo(() => {
    const seen = new Map<string, { areaIds: string[]; label: string }>();
    for (const c of data?.map.conflicts ?? []) {
      const key = [...c.areaIds].sort().join("|");
      if (!seen.has(key)) seen.set(key, c);
    }
    return [...seen.values()];
  }, [data]);

  return (
    <OpsPanel
      title="Live site map — where work is happening"
      right={<MapLegend />}
      state={!data && loading ? "loading" : !data && error ? "error" : "ready"}
      error={error}
      empty={data && !zones.length ? "This plant has no zones yet. Add areas, then draw them under Impairments → Zone setup." : undefined}
      className="min-w-0"
    >
      <div
        className="relative w-full overflow-hidden rounded-[10px]"
        style={{ aspectRatio: "2 / 1", minHeight: 300, background: "var(--ops-surface-2)", border: "1px solid var(--ops-border)" }}
      >
        {data?.map.layoutImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
          <img src={data.map.layoutImageUrl} alt="" className="absolute inset-0 h-full w-full object-fill opacity-40" />
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
                stroke={on || foc ? "var(--ops-gold)" : "var(--ops-zone-border)"}
                strokeWidth={on || foc ? 2 : 1}
                vectorEffect="non-scaling-stroke"
                strokeDasharray={foc && !on ? "4 3" : undefined}
              />
            );
          })}
          {rings.map((r) => {
            const bs = r.areaIds.map((a) => boxes.get(a)).filter(Boolean) as Box[];
            if (!bs.length) return null;
            const x0 = Math.min(...bs.map((b) => b.x0));
            const x1 = Math.max(...bs.map((b) => b.x1));
            const y0 = Math.min(...bs.map((b) => b.y0));
            const y1 = Math.max(...bs.map((b) => b.y1));
            return (
              <ellipse
                key={r.areaIds.join("|")}
                className="ops-simops-ring"
                cx={(x0 + x1) / 2}
                cy={(y0 + y1) / 2}
                rx={(x1 - x0) / 2 + 2}
                ry={(y1 - y0) / 2 + 3}
                fill="none"
                stroke="var(--ops-warn)"
                strokeWidth={2}
                strokeDasharray="6 5"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
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

          {rings.map((r) => {
            const bs = r.areaIds.map((a) => boxes.get(a)).filter(Boolean) as Box[];
            if (!bs.length) return null;
            const cx = (Math.min(...bs.map((b) => b.x0)) + Math.max(...bs.map((b) => b.x1))) / 2;
            const cy = (Math.min(...bs.map((b) => b.y0)) + Math.max(...bs.map((b) => b.y1))) / 2;
            return (
              <span
                key={`chip-${r.areaIds.join("|")}`}
                className="ops-chip pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-semibold"
                style={{ left: `${cx}%`, top: `${cy}%`, background: "var(--ops-warn-bg)", borderColor: "var(--ops-warn)", color: "var(--ops-warn-text)" }}
              >
                {r.label}
              </span>
            );
          })}

          {(data?.map.pins ?? []).map((p) => {
            const info = typeInfo(p.type);
            const ring = p.overdue
              ? "0 0 0 3px var(--ops-surface-2), 0 0 0 6px var(--ops-crit)"
              : p.flagged
                ? "0 0 0 3px var(--ops-surface-2), 0 0 0 6px var(--ops-warn)"
                : "0 0 0 2px var(--ops-surface-2)";
            const state = [p.overdue && "overdue", p.flagged && "flagged", p.status === "SUSPENDED" && "suspended"].filter(Boolean).join(", ");
            return (
              <button
                key={p.permitId}
                type="button"
                onClick={() => onOpenPermit(p.permitId)}
                aria-label={`${p.number}, ${info.label}${state ? `, ${state}` : ""}. Open permit`}
                title={`${p.number} · ${info.label}${state ? ` · ${state}` : ""}`}
                className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                style={{ left: `${p.x}%`, top: `${p.y}%`, zIndex: 3 }}
              >
                <span
                  className="ops-num flex h-[26px] w-[26px] items-center justify-center rounded-full text-[12px] font-bold"
                  style={{ background: info.color, color: "var(--ops-glyph)", boxShadow: ring, opacity: p.status === "SUSPENDED" ? 0.6 : 1 }}
                  aria-hidden
                >
                  {info.glyph}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[12px] ops-muted">
        Click a zone for site guidance · click a pin to open the permit
        {data?.map.autoLayout && " · zones are laid out automatically until a layout is drawn"}
      </p>
    </OpsPanel>
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
    <button
      type="button"
      onClick={() => onSelect(zone.id)}
      onFocus={onFocus}
      onBlur={onBlur}
      aria-pressed={selected}
      aria-label={`${zone.name}: ${zone.permitCount} permit${zone.permitCount === 1 ? "" : "s"} on site${imp ? `, impaired ${zone.impairmentCodes.join(", ")}` : ""}. Show site guidance`}
      className="absolute flex flex-col justify-between p-2 text-left focus-visible:outline-none"
      style={{
        left: `${box.x0}%`,
        top: `${box.y0}%`,
        width: `${box.x1 - box.x0}%`,
        height: `${box.y1 - box.y0}%`,
        clipPath: clipPath(zone.polygon, box),
        background: selected ? "var(--ops-zone-selected)" : "var(--ops-zone)",
        opacity: zone.dimmed ? 0.45 : 1,
      }}
    >
      <span className="text-[12px] font-semibold leading-tight" style={{ color: selected ? "var(--ops-gold-text)" : "var(--ops-text-2)" }}>
        {zone.name}
        {zone.activeCount > 0 && <span className="ml-1 ops-muted">· {zone.activeCount} active</span>}
      </span>
      {imp && (
        <span
          className="ops-chip ops-mono w-fit text-[11px] font-semibold"
          style={{ background: "var(--ops-crit-bg)", borderColor: "var(--ops-crit-border)", color: "var(--ops-crit-text)" }}
        >
          <ShieldAlert size={12} aria-hidden /> {zone.impairmentCodes.join(" · ")}
        </span>
      )}
    </button>
  );
}
