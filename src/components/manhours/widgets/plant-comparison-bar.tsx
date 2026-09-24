"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useLabels } from "@/components/labels/label-provider";

/**
 * Horizontal bar chart of plants ranked by a single KPI value.
 * Bars are colour-coded by performance band (computed upstream so the
 * widget stays presentational). Optional target line shows the
 * world-class threshold for quick "who's there" reading.
 */
export function PlantComparisonBar({
  title,
  subtitle,
  data,
  higherIsBetter,
  target
}: {
  title: string;
  subtitle?: string;
  data: { plantCode: string; plantName: string; value: number | null; bandColor: string }[];
  higherIsBetter: boolean;
  target?: number | null;
}) {
  const L = useLabels();
  // Plants with no measurable value are NOT plotted. A null would render as a
  // zero-length bar, and on a lower-is-better KPI a zero-length bar sits at the
  // top of the ranking — the chart would show the plants that never submitted
  // their manhours as the safest in the estate. They are named underneath
  // instead, which is the honest reading and also the actionable one.
  const measured = data.filter(
    (d): d is { plantCode: string; plantName: string; value: number; bandColor: string } =>
      d.value != null
  );
  const unmeasured = data.filter((d) => d.value == null);

  // Sort: best plant at top. higherIsBetter → desc by value;
  // otherwise asc. Stable sort so equal-band plants keep input order.
  const sorted = [...measured].sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">
            {L("manhours.no_plant_exposure_to_rank", "No plant in scope has the exposure data this KPI needs, so there is nothing to rank.")}
          </p>
        ) : (
        <ResponsiveContainer width="100%" height={Math.max(180, sorted.length * 40)}>
          <BarChart data={sorted} layout="vertical" margin={{ top: 5, right: 30, left: 30, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} stroke="#64748b" />
            <YAxis
              type="category"
              dataKey="plantCode"
              tick={{ fontSize: 11 }}
              stroke="#64748b"
              width={50}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
              formatter={(value: number, _name, item) => {
                const row = item.payload as { plantName: string };
                return [value.toFixed(2), row.plantName];
              }}
            />
            {target != null && (
              <ReferenceLine
                x={target}
                stroke="#10b981"
                strokeDasharray="4 4"
                label={{ value: `target ${target}`, position: "top", fill: "#10b981", fontSize: 10 }}
              />
            )}
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {sorted.map((d, i) => (
                <Cell key={i} fill={d.bandColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        )}
        {unmeasured.length > 0 && (
          <p className="mt-2 border-t pt-2 text-[11px] leading-snug text-slate-500">
            Not ranked — no manhours reported for this period:{" "}
            <span className="font-medium">{unmeasured.map((d) => d.plantCode).join(", ")}</span>.
            Missing exposure data, not zero exposure.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
