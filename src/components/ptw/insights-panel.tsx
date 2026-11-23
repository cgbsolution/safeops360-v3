"use client";

// PTW insights (JSL Hisar): appended under the shared analytics contract on
// /ptw?tab=analytics. Reads GET /api/ptw/insights for permits RAISED between two
// dates: mix by type / area / contractor / status / hour / shift, lifecycle cycle
// times from the permit's own timestamps, extensions, suspensions, gas-test
// compliance, on-time closure, and the busiest issuers and receivers.
//
// Chart rules (src/lib/design/midnight.ts): identity breakdowns use one hue
// (NEUTRAL_BAR) with the value printed beside each bar; the only two-series
// chart (raised vs closed) uses the fixed SERIES slots with a legend; one axis.

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, XAxis, YAxis } from "recharts";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePolling } from "@/hooks/use-polling";
import { CHROME, NEUTRAL_BAR, SERIES } from "@/lib/design/midnight";
import { cn } from "@/lib/utils";
import { ALL_PLANTS, fmtHours, type KeyCount, type PtwInsights } from "@/lib/ptw/control-center";

type PlantOption = { id: string; name: string };

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function PtwInsightsPanel({ plants, defaultPlantId }: { plants: PlantOption[]; defaultPlantId: string | null }) {
  const today = useMemo(() => new Date(), []);
  const [plant, setPlant] = useState<string>(defaultPlantId ?? ALL_PLANTS);
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 89 * 86_400_000)));
  const [to, setTo] = useState(isoDay(today));
  const validRange = !!from && !!to && from <= to;
  const qs = new URLSearchParams({ from, to });
  if (plant !== ALL_PLANTS) qs.set("plantId", plant);
  // Analytics changes slowly; refresh every 5 min rather than the board's 30 s.
  const { data: d, error, loading, refresh } = usePolling<PtwInsights>(
    validRange ? `/api/ptw/insights?${qs.toString()}` : null, { intervalMs: 300_000 }
  );

  return (
    <section className="mt-8">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-900">Permit operations insights</h2>
        <p className="text-xs text-slate-500">
          Permits raised in the selected window. Cycle times use each permit&apos;s own lifecycle timestamps.
        </p>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Plant</Label>
          <Select value={plant} onValueChange={setPlant} className="h-9 w-60" aria-label="Plant">
            <SelectItem value={ALL_PLANTS}>All plants in my scope</SelectItem>
            {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ptw-ins-from" className="text-xs">From</Label>
          <Input id="ptw-ins-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ptw-ins-to" className="text-xs">To</Label>
          <Input id="ptw-ins-to" type="date" value={to} min={from} max={isoDay(today)} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading || !validRange}>
          <RefreshCw size={14} className={cn(loading && "animate-spin")} /> Refresh
        </Button>
      </div>
      {!validRange && <Note>Pick a From date on or before the To date.</Note>}
      {error && <Note>{d ? `${error}. Showing the last loaded figures.` : error}</Note>}
      {d?.truncated && <Note>The window holds more permits than one report reads; narrow the dates or pick a plant.</Note>}
      {!d ? (validRange && !error && <InsightsSkeleton />) : d.totals.raised === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No permits were raised{d.plantName ? ` at ${d.plantName}` : ""} between {d.window.from} and {d.window.to}.
        </div>
      ) : (
        <InsightsBody d={d} />
      )}
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{children}</div>;
}

const pct = (v: number | null) => (v === null ? "Not measured" : `${v}%`);

function InsightsBody({ d }: { d: PtwInsights }) {
  const tiles: { label: string; value: string; sub: string }[] = [
    { label: "Permits raised", value: d.totals.raised.toLocaleString("en-IN"), sub: `${d.totals.open} still open · ${d.totals.closed} closed` },
    { label: "On-time closure", value: pct(d.closure.onTimePct), sub: `${d.closure.onTime} of ${d.closure.closed} within ${d.closure.graceMinutes} min of validity end` },
    { label: "Gas re-tests on time", value: pct(d.gasTests.refreshCompliancePct), sub: `${d.gasTests.refreshesOnTime} of ${d.gasTests.refreshesEvaluated} refreshes` },
    { label: "Initial gas test", value: pct(d.gasTests.initialTestPct), sub: `${d.gasTests.permitsWithInitialTest} of ${d.gasTests.permitsRequiringGasTest} permits needing one` },
    { label: "Extensions", value: d.extensions.total.toLocaleString("en-IN"), sub: `${d.extensions.permitsExtended} permits · ${d.extensions.approved} approved · ${d.extensions.pending} pending` },
    { label: "Suspensions", value: d.suspensions.total.toLocaleString("en-IN"), sub: `${d.suspensions.permitsSuspended} permits suspended` },
    { label: "Expired, not closed", value: d.closure.expiredNotClosed.toLocaleString("en-IN"), sub: "Raised in window, still open past validity" },
    { label: "Gas exceedances", value: d.gasTests.exceedances.toLocaleString("en-IN"), sub: `${d.gasTests.readings} readings logged` },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t.label}</div>
            <div className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{t.value}</div>
            <div className="text-[11px] text-slate-500">{t.sub}</div>
          </div>
        ))}
      </div>

      <Panel title={`Raised vs closed per ${d.trend.granularity}`} description="Closed counts only permits from this window that were closed inside it.">
        <TrendBars points={d.trend.points} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Lifecycle cycle times" description="Median and 90th percentile across permits that reached both stamps.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Median</TableHead>
                <TableHead className="text-right">90th pct</TableHead>
                <TableHead className="text-right">Permits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.cycleTimes.map((c) => (
                <TableRow key={c.key}>
                  <TableCell className="text-xs">{c.label}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtHours(c.medianHours)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtHours(c.p90Hours)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{c.n}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
        <Panel title="Planned start by hour of day" description="Plant local time.">
          <HourBars rows={d.byHour} />
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
            {d.byShift.map((s) => (
              <span key={s.key} className="rounded border border-slate-200 px-1.5 py-0.5">{s.key}: <b className="tabular-nums">{s.count}</b></span>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="By permit type"><RankBars rows={d.byType} /></Panel>
        <Panel title="By status"><RankBars rows={d.byStatus} /></Panel>
        <Panel title="By area" description="Top 10."><RankBars rows={d.byArea.slice(0, 10)} /></Panel>
        <Panel title="By contractor" description="Top 10. Free-text contractor names not linked to the register are marked.">
          <RankBars rows={d.byContractor.slice(0, 10)} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Top issuers"><PeopleList rows={d.topIssuers} /></Panel>
        <Panel title="Top receivers"><PeopleList rows={d.topReceivers} /></Panel>
        <Panel title="Suspension reasons"><PeopleList rows={d.suspensions.topReasons} empty="No suspensions in this window." /></Panel>
      </div>

      <details className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">How these figures are worked out</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {Object.entries(d.definitions).map(([k, v]) => <li key={k}>{v}</li>)}
        </ul>
      </details>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const AXIS_TICK = { fontSize: 11, fill: CHROME.muted };

function RankBars({ rows }: { rows: KeyCount[] }) {
  const config: ChartConfig = { count: { label: "Permits", color: NEUTRAL_BAR } };
  if (rows.length === 0) return <div className="py-6 text-center text-xs text-slate-500">No permits.</div>;
  const data = rows.map((r) => ({ name: r.label ?? r.key, count: r.count }));
  return (
    <ChartContainer config={config} className="w-full" style={{ height: Math.max(80, data.length * 28 + 16) }}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={150} tick={AXIS_TICK} tickLine={false} axisLine={false} interval={0} />
        <ChartTooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} barSize={14}>
          <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: CHROME.muted }} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function HourBars({ rows }: { rows: { hour: number; count: number }[] }) {
  const config: ChartConfig = { count: { label: "Permits", color: NEUTRAL_BAR } };
  const data = rows.map((r) => ({ hour: String(r.hour).padStart(2, "0"), count: r.count }));
  return (
    <ChartContainer config={config} className="h-[200px] w-full">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={CHROME.grid} vertical={false} />
        <XAxis dataKey="hour" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHROME.axis }} interval={2} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <ChartTooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={14} />
      </BarChart>
    </ChartContainer>
  );
}

function TrendBars({ points }: { points: { period: string; raised: number; closed: number }[] }) {
  const config: ChartConfig = {
    raised: { label: "Raised", color: SERIES.opened },
    closed: { label: "Closed", color: SERIES.closed },
  };
  const data = points.map((p) => ({
    ...p,
    label: new Date(`${p.period}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
  }));
  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barGap={2}>
        <CartesianGrid stroke={CHROME.grid} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHROME.axis }} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <ChartTooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} content={<ChartTooltipContent />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
        <Bar dataKey="raised" name="Raised" fill="var(--color-raised)" radius={[4, 4, 0, 0]} maxBarSize={14} />
        <Bar dataKey="closed" name="Closed" fill="var(--color-closed)" radius={[4, 4, 0, 0]} maxBarSize={14} />
      </BarChart>
    </ChartContainer>
  );
}

function PeopleList({ rows, empty = "No permits." }: { rows: KeyCount[]; empty?: string }) {
  if (rows.length === 0) return <div className="py-4 text-center text-xs text-slate-500">{empty}</div>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ol className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.key} className="text-xs">
          <div className="flex justify-between gap-2">
            <span className="truncate text-slate-700">{r.label ?? r.key}</span>
            <span className="tabular-nums text-slate-900">{r.count}</span>
          </div>
          <div className="mt-0.5 h-1.5 rounded bg-slate-100">
            <div className="h-1.5 rounded" style={{ width: `${(100 * r.count) / max}%`, background: NEUTRAL_BAR }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function InsightsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
