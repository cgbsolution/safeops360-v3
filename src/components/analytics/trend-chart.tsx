"use client";

// Trend: opened vs closed per month, with the running backlog.
//
// ONE axis. All three series are counts of records, so they share a scale —
// a second y-axis would let the backlog line be visually scaled against the
// bars to say whatever the author wanted.
//
// Two mark forms carry the distinction alongside colour (bars vs line), which
// is the secondary encoding the palette's CVD band requires: a protan/tritan
// reader separates "monthly volume" from "outstanding backlog" by shape even if
// the hues converge.

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHROME as LEGACY_CHROME, SERIES as LEGACY_SERIES } from "@/components/analytics/palette";
import type { TrendPoint } from "@/lib/flow-analytics";

export interface TrendPalette {
  series: { opened: string; closed: string; backlog: string };
  chrome: { grid: string; axis: string; muted: string };
  /** Optional wash under the backlog line. */
  backlogFill?: string;
}

function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1, 1);
  return d.toLocaleString("en-IN", { month: "short" }) + (m === 1 ? ` ${y}` : "");
}

export function TrendChart({
  data,
  hasClosureData,
  palette,
}: {
  data: TrendPoint[];
  hasClosureData: boolean;
  /**
   * Override the colours. Defaults to the original validated palette so the
   * seven screens that have not yet adopted the Analytics Screen Contract keep
   * rendering exactly as before; Incidents › Analytics passes the Midnight
   * Executive set. Both sets were validated against this surface (#ffffff) —
   * neither is eyeballed. Build 3 flips the default when the rollout lands.
   */
  palette?: TrendPalette;
}) {
  const SERIES = palette?.series ?? LEGACY_SERIES;
  const CHROME = palette?.chrome ?? LEGACY_CHROME;
  const backlogFill = palette?.backlogFill;
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.period) }));

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          {/* Recessive chrome: horizontal hairlines only. Vertical gridlines on a
              time axis add ink without adding a reading. */}
          <CartesianGrid stroke={CHROME.grid} strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: CHROME.muted }}
            tickLine={false}
            axisLine={{ stroke: CHROME.axis }}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            tick={{ fontSize: 11, fill: CHROME.muted }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={44}
          />
          <Tooltip
            cursor={{ fill: "rgba(11,11,11,0.04)" }}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid rgba(11,11,11,0.10)",
              fontSize: 12,
              boxShadow: "0 4px 14px rgba(11,11,11,0.08)",
            }}
            formatter={(v: any, name: string) => [v ?? "—", name]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 6, color: "#52514e" }}
          />
          {/* Backlog first, so the monthly bars paint ON TOP of it. Ordering it
              after the bars — which is how it read in source order — let the
              ice wash cover them completely: the chart showed one silent blue
              hill and no monthly volume at all. Recharts paints in child order,
              and an opaque fill later in that order wins.

              One Area rather than an Area plus a Line: the same series drawn
              twice produced two legend entries for one thing, one of them
              greyed out, which reads as a broken chart. The stroke belongs to
              the area.

              Ice is used here as a SURFACE, which is the only job it can do —
              at 1.17:1 on white it is invisible as a mark, but as a wash it
              gives the backlog a body the two bar series do not have, and the
              area-vs-bar distinction is the secondary encoding that carries the
              series apart without relying on colour. */}
          {hasClosureData && backlogFill && (
            <Area
              type="monotone"
              dataKey="backlog"
              name="Open backlog"
              stroke={SERIES.backlog}
              strokeWidth={2}
              fill={backlogFill}
              fillOpacity={1}
              activeDot={{ r: 4 }}
              dot={false}
            />
          )}
          {/* 4px rounded data-ends, anchored to the baseline; a 2px surface gap
              between adjacent bars so two fills never touch. */}
          <Bar
            dataKey="opened"
            name="Opened"
            fill={SERIES.opened}
            radius={[4, 4, 0, 0]}
            barSize={10}
            maxBarSize={14}
          />
          {hasClosureData && (
            <Bar
              dataKey="closed"
              name="Closed"
              fill={SERIES.closed}
              radius={[4, 4, 0, 0]}
              barSize={10}
              maxBarSize={14}
            />
          )}
          {hasClosureData && !backlogFill && (
            <Line
              type="monotone"
              dataKey="backlog"
              name="Open backlog"
              stroke={SERIES.backlog}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
