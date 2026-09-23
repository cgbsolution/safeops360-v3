"use client";

// Leading vs lagging over time, as TWO stacked charts sharing an x-axis.
//
// Not one chart with two y-axes. Observations run in the tens and incidents in
// the single digits, so a shared scale flattens the lag series into the
// baseline and a dual axis lets the author scale one against the other to say
// whatever they like. Small multiples with an aligned x-axis is the honest
// version: each band keeps its own scale, and the reader compares SHAPE across
// the pair, which is the actual question — is leading activity moving before
// the lagging numbers do?
//
// Midnight Executive throughout, from the validated series slots.

import {
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
import { CHROME, INK, NAVY, SERIES } from "@/lib/design/midnight";
import type { ScorecardCell } from "@/lib/scorecard";

const TOOLTIP = {
  borderRadius: 10,
  border: `1px solid ${NAVY[200]}`,
  fontSize: 12,
  boxShadow: "0 4px 14px rgba(11,31,77,0.10)",
};

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-[12px] font-semibold" style={{ color: INK.strong }}>
        {title}
      </h4>
      <p className="mb-1 text-[11px]" style={{ color: INK.faint }}>
        {subtitle}
      </p>
      <div className="h-[190px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children as any}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ScorecardTrend({ series }: { series: ScorecardCell[] }) {
  const rows = series.map((s) => ({
    period: String(s.period ?? ""),
    observations: Number(s.observationsLogged ?? 0),
    nearMiss: Number(s.nearMissReported ?? 0),
    incidents: Number(s.incidentsTotal ?? 0),
    lti: Number(s.ltiCount ?? 0),
  }));

  return (
    <div className="grid gap-5">
      <Panel
        title="Leading — what the sites are doing"
        subtitle="Observations logged and near misses reported per period. Rising is generally better: it means people are looking and speaking up."
      >
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={CHROME.grid} vertical={false} />
          <XAxis
            dataKey="period"
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
          <Tooltip cursor={{ fill: "rgba(11,31,77,0.04)" }} contentStyle={TOOLTIP} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          {/* Two mark forms, not two hues alone — bars for the higher-volume
              series, a line for the lower, so the pair separates by shape. */}
          <Bar dataKey="observations" name="Observations" fill={SERIES.opened} radius={[4, 4, 0, 0]} barSize={12} maxBarSize={16} />
          <Line type="monotone" dataKey="nearMiss" name="Near misses" stroke={SERIES.backlog} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </ComposedChart>
      </Panel>

      <Panel
        title="Lagging — what happened anyway"
        subtitle="Incidents and lost-time injuries per period, on their own scale. Compare the SHAPE against the panel above, not the heights."
      >
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={CHROME.grid} vertical={false} />
          <XAxis
            dataKey="period"
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
          <Tooltip cursor={{ fill: "rgba(11,31,77,0.04)" }} contentStyle={TOOLTIP} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <Bar dataKey="incidents" name="Incidents" fill={SERIES.closed} radius={[4, 4, 0, 0]} barSize={12} maxBarSize={16} />
          <Line type="monotone" dataKey="lti" name="Lost-time injuries" stroke={NAVY[900]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </ComposedChart>
      </Panel>
    </div>
  );
}
