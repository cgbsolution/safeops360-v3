import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { KpiResult } from "@/lib/manhours/kpi-engine";
import { KPI_REGISTRY } from "@/lib/manhours/kpi-registry";

/**
 * Speedometer-style gauge. Shows the KPI value as a needle on a
 * banded arc (world-class → poor). Pure SVG — no chart lib — so
 * it renders identically server-side and as a thumbnail in audit
 * exports.
 *
 * Falls back to a plain tile when the KPI has no benchmarks
 * defined (DAYS_SINCE_LAST_LTI, COST_OF_INCIDENTS, FSI).
 */
export function KpiGauge({
  kpi,
  href
}: {
  kpi: KpiResult;
  href?: string;
}) {
  const benchmarks = kpi.benchmarks;
  // Nothing to point a needle at. Drawing one at the arc's left-hand end would
  // put an unmeasured KPI on the world-class edge of the dial -- the gauge's
  // version of the 0.00 "World Class" tile this whole change exists to remove.
  if (kpi.value == null) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{kpi.kpiName}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-400">
            {kpi.formattedValue}
          </div>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">{kpi.unavailableReason}</p>
        </CardContent>
      </Card>
    );
  }
  if (!benchmarks) {
    // No benchmark scale → render the value as a static panel.
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{kpi.kpiName}</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{kpi.formattedValue}</div>
          <div className="text-[10px] text-slate-500 mt-1">No benchmark scale</div>
        </CardContent>
      </Card>
    );
  }

  // Arc geometry: 180° from -90° (left) to 90° (right), value mapped
  // onto [0, π]. higherIsBetter inverts so good is always on the right.
  // Cap the value at "poor + 50%" so an extreme outlier doesn't peg
  // the needle off-arc.
  const lo = kpi.higherIsBetter ? 0 : benchmarks.worldClass;
  // The top of a higher-is-better dial has to sit ABOVE the world-class threshold,
  // or the WORLD_CLASS arc has zero width and a plant that reached 98% of 98 has
  // nowhere on the dial to be. Percentages cap at 100; everything else gets 20%
  // of headroom. Lower-is-better keeps its "poor + 50%" cap so one outlier cannot
  // peg the needle off-arc.
  const isPct = KPI_REGISTRY[kpi.kpiCode].isPercentage ?? false;
  const hi = kpi.higherIsBetter
    ? isPct
      ? Math.max(100, benchmarks.worldClass)
      : benchmarks.worldClass * 1.2
    : benchmarks.poor * 1.5;
  const clamped = Math.max(lo, Math.min(hi, kpi.value));  // non-null: guarded above
  const t = (clamped - lo) / Math.max(hi - lo, 0.0001);
  const angle = kpi.higherIsBetter ? t * 180 - 90 : 90 - t * 180;

  // Band thresholds → angle positions for the coloured arc segments.
  const segments = bandSegments(benchmarks, kpi.higherIsBetter, lo, hi);

  const Inner = (
    <CardContent className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{kpi.kpiName}</div>
      <div className="mt-2 flex items-center justify-center">
        <svg viewBox="-110 -110 220 130" className="w-full max-w-[180px] h-auto">
          {segments.map((seg, i) => (
            <path
              key={i}
              d={arcPath(100, seg.startAngle, seg.endAngle)}
              stroke={seg.color}
              strokeWidth={18}
              fill="none"
              strokeLinecap="butt"
            />
          ))}
          {/* needle */}
          <g transform={`rotate(${angle})`}>
            <line x1={0} y1={0} x2={0} y2={-92} stroke="#0f172a" strokeWidth={3} strokeLinecap="round" />
            <circle cx={0} cy={0} r={6} fill="#0f172a" />
          </g>
          {/* min / max ticks */}
          <text x={-100} y={20} textAnchor="middle" className="text-[9px] fill-slate-500">
            {kpi.higherIsBetter ? lo.toFixed(0) : benchmarks.worldClass}
          </text>
          <text x={100} y={20} textAnchor="middle" className="text-[9px] fill-slate-500">
            {kpi.higherIsBetter ? benchmarks.worldClass : hi.toFixed(0)}
          </text>
        </svg>
      </div>
      <div className="mt-2 text-center">
        <div className="text-2xl font-bold tabular-nums" style={{ color: kpi.bandColor }}>
          {kpi.formattedValue}
        </div>
        {kpi.band && (
          <div
            className="text-[10px] uppercase tracking-wider font-semibold mt-0.5"
            style={{ color: kpi.bandColor }}
          >
            {kpi.band.replace(/_/g, " ")}
          </div>
        )}
      </div>
    </CardContent>
  );

  if (!href) return <Card>{Inner}</Card>;
  return (
    <Link href={href} className="block">
      <Card className={cn("transition hover:shadow-md hover:border-primary-300")}>{Inner}</Card>
    </Link>
  );
}

// ── SVG helpers ───────────────────────────────────────────────

/** Polar → cartesian for our half-circle gauge. Angle in degrees;
 *  0° points UP. Result is the (x, y) on the arc at radius r. */
function polar(r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}

function arcPath(r: number, startAngle: number, endAngle: number): string {
  const start = polar(r, startAngle + 90);
  const end = polar(r, endAngle + 90);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

interface BandSeg {
  startAngle: number;
  endAngle: number;
  color: string;
}

function bandSegments(
  b: { worldClass: number; excellent: number; average: number; poor: number },
  higherIsBetter: boolean,
  lo: number,
  hi: number
): BandSeg[] {
  // Same colours as the engine's BAND_COLOR map.
  const COL = { worldClass: "#10b981", excellent: "#84cc16", average: "#f59e0b", poor: "#ef4444" };
  const toAngle = (v: number) => {
    const clamped = Math.max(lo, Math.min(hi, v));
    const t = (clamped - lo) / Math.max(hi - lo, 0.0001);
    return higherIsBetter ? t * 180 - 90 : 90 - t * 180;
  };

  // We need 4 contiguous segments. Easiest: walk from lo→hi and tag
  // each portion with its band colour. Direction-inversion (higher
  // is better vs worse) flips which thresholds map to which colours.
  if (higherIsBetter) {
    // Boundaries are the same three the engine bands on (determineBand): each
    // threshold is the value AT WHICH the label is earned, so `average` is the
    // floor of AVERAGE and everything below it is POOR.
    //
    // These arcs used to start AVERAGE at `poor` and EXCELLENT at `average`, one
    // notch down the whole way. Inspection Compliance at 70.0% against
    // 98/95/85/70 therefore sat on the amber arc while the badge beside it read
    // POOR — the same value described two ways in the same widget.
    return [
      { startAngle: toAngle(lo), endAngle: toAngle(b.average), color: COL.poor },
      { startAngle: toAngle(b.average), endAngle: toAngle(b.excellent), color: COL.average },
      { startAngle: toAngle(b.excellent), endAngle: toAngle(b.worldClass), color: COL.excellent },
      { startAngle: toAngle(b.worldClass), endAngle: toAngle(hi), color: COL.worldClass }
    ];
  }
  // Lower is better — value 0 = best, value hi = worst.
  return [
    { startAngle: toAngle(lo), endAngle: toAngle(b.worldClass), color: COL.worldClass },
    { startAngle: toAngle(b.worldClass), endAngle: toAngle(b.excellent), color: COL.excellent },
    { startAngle: toAngle(b.excellent), endAngle: toAngle(b.average), color: COL.average },
    { startAngle: toAngle(b.average), endAngle: toAngle(hi), color: COL.poor }
  ];
}
