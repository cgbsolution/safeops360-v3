"use client";

// Live observation dashboard (the "Live" tab on /observations). One plant-scoped
// aggregate from GET /api/observations/live, refreshed every 60 s while the tab
// is visible and immediately when it regains focus. A failed refresh keeps the
// last good figures on screen (wall-display behaviour, same as the IMS dashboard).

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImageOff, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Select, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiJson, humanize, qs, type Bucket, type LiveDashboard } from "@/lib/observation-reporting/api";

const REFRESH_MS = 60_000;
const ALL = "__all__";
// Reference categorical slots 1 + 2 (validated adjacent pair) and the
// single-hue sequential blue for magnitude bars.
const BLUE = "#2a78d6";
const ORANGE = "#eb6834";
const SEVERITY_STEPS: Record<string, string> = { LOW: "#86b6ef", MEDIUM: "#5598e7", HIGH: "#256abf", CRITICAL: "#104281" };

const trendConfig: ChartConfig = {
  reported: { label: "Reported", color: BLUE },
  closed: { label: "Closed", color: ORANGE },
};
const barConfig: ChartConfig = { count: { label: "Observations", color: BLUE } };

type PlantOption = { id: string; name: string };
type Tone = "good" | "warn" | "bad" | undefined;

function Tile({ title, value, sub, tone }: { title: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone }) {
  const color = tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  return (
    <div className="h-full rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", color)}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function BucketBars({ data, height = 220 }: { data: Bucket[]; height?: number }) {
  if (!data.length) return <p className="py-10 text-center text-xs text-slate-400">No observations in this window</p>;
  const rows = data.map((d) => ({ name: d.label, count: d.count }));
  return (
    <ChartContainer config={barConfig} className="w-full" style={{ height: Math.max(height, rows.length * 28 + 20) }}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={2}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={140} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <ChartTooltip cursor={{ fill: "rgba(148,163,184,0.12)" }} content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: "right", fontSize: 11, fill: "#52514e" }} />
      </BarChart>
    </ChartContainer>
  );
}

function RankList({ data, empty }: { data: Bucket[]; empty: string }) {
  if (!data.length) return <p className="py-6 text-center text-xs text-slate-400">{empty}</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={`${d.key}`} className="text-xs" title={`${d.label}: ${d.count}`}>
          <div className="flex justify-between gap-2">
            <span className="truncate text-slate-700">{d.label}</span>
            <span className="font-semibold tabular-nums text-slate-900">{d.count}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full" style={{ width: `${(100 * d.count) / max}%`, background: BLUE }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Thumb({ observationId, attachmentId, cache }: { observationId: string; attachmentId: string | null; cache: React.MutableRefObject<Map<string, string | null>> }) {
  const [url, setUrl] = useState<string | null | undefined>(attachmentId ? cache.current.get(attachmentId) : null);
  useEffect(() => {
    if (!attachmentId || cache.current.has(attachmentId)) {
      setUrl(attachmentId ? cache.current.get(attachmentId) ?? null : null);
      return;
    }
    let alive = true;
    apiJson<{ url: string }>(`/api/observations/${observationId}/attachments/${attachmentId}/download?inline=1`)
      .then((r) => {
        cache.current.set(attachmentId, r.url);
        if (alive) setUrl(r.url);
      })
      .catch(() => {
        cache.current.set(attachmentId, null);
        if (alive) setUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [observationId, attachmentId, cache]);
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : attachmentId && url === undefined ? (
        <Camera className="h-5 w-5 animate-pulse text-slate-300" />
      ) : (
        <ImageOff className="h-5 w-5 text-slate-300" />
      )}
    </div>
  );
}

const SEV_BADGE: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-rose-100 text-rose-800",
};

export function ObservationLiveDashboard({ plants, defaultPlantId }: { plants: PlantOption[]; defaultPlantId: string | null }) {
  const [plant, setPlant] = useState<string>(defaultPlantId ?? ALL);
  const [windowDays, setWindowDays] = useState("30");
  const [data, setData] = useState<LiveDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);
  const thumbs = useRef(new Map<string, string | null>());

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const tz = -new Date().getTimezoneOffset();
      const d = await apiJson<LiveDashboard>(
        `/api/observations/live${qs({ plantId: plant === ALL ? undefined : plant, windowDays, tzOffsetMinutes: tz })}`
      );
      if (id === reqId.current) {
        setData(d);
        setError(null);
      }
    } catch (e: any) {
      if (id === reqId.current) setError(e?.message ?? "Could not load the live dashboard");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [plant, windowDays]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const d = data;
  const trend = (d?.trend ?? []).map((t) => ({ ...t, label: new Date(`${t.date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) }));
  const unsafeTotal = d ? d.actVsCondition.unsafeAct + d.actVsCondition.unsafeCondition : 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={plant} onValueChange={setPlant} className="h-9 w-56" aria-label="Plant">
          <SelectItem value={ALL}>All plants in my scope</SelectItem>
          {plants.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </Select>
        <Select value={windowDays} onValueChange={setWindowDays} className="h-9 w-44" aria-label="Window">
          <SelectItem value="7">Last 7 days</SelectItem>
          <SelectItem value="30">Last 30 days</SelectItem>
          <SelectItem value="90">Last 90 days</SelectItem>
        </Select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={cn("mr-1.5", loading && "animate-spin")} /> Refresh
        </Button>
        <Button asChild size="sm">
          <Link href="/capture/snap"><Camera size={14} /> Quick photo report</Link>
        </Button>
        {d && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Updated {new Date(d.generatedAt).toLocaleTimeString("en-IN")} · auto-refresh 60 s
          </span>
        )}
      </div>
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {d ? `${error}. Showing the last loaded figures.` : error}
        </div>
      )}
      {!d ? (
        !error && <div className="py-16 text-center text-sm text-slate-400">Loading live figures…</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Tile title="Today" value={d.counts.today} sub="Reported since midnight" />
            <Tile title="This week" value={d.counts.week} sub="Since Monday" />
            <Tile title="Month to date" value={d.counts.mtd} />
            <Tile title="Open" value={d.backlog.open} sub={`${d.backlog.closed} closed (all time)`} tone={d.backlog.open ? "warn" : "good"} />
            <Tile title="SLA overdue" value={d.backlog.overdue} sub="Open past target date" tone={d.backlog.overdue ? "bad" : "good"} />
            <Tile
              title="Closure rate"
              value={d.closure.closureRate === null ? "—" : `${d.closure.closureRate}%`}
              sub={`${d.closure.closedInWindow} of ${d.closure.reportedInWindow} reported in ${d.windowDays} d`}
            />
            <Tile title="On-time closure" value={d.closure.onTimeRate === null ? "—" : `${d.closure.onTimeRate}%`} sub={`${d.closure.closedByDateInWindow} closed in ${d.windowDays} d`} />
            <Tile
              title="Unsafe act : condition"
              value={`${d.actVsCondition.unsafeAct} : ${d.actVsCondition.unsafeCondition}`}
              sub={unsafeTotal ? `${Math.round((100 * d.actVsCondition.unsafeAct) / unsafeTotal)}% behavioural` : "No at-risk reports"}
            />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Reported vs closed, last {d.windowDays} days</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={trendConfig} className="h-64 w-full">
                <LineChart data={trend} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend content={<ChartLegendContent />} />
                  <Line type="monotone" dataKey="reported" stroke="var(--color-reported)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="closed" stroke="var(--color-closed)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">By area</CardTitle></CardHeader>
              <CardContent><BucketBars data={d.byArea} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">By category</CardTitle></CardHeader>
              <CardContent><BucketBars data={d.byCategory} /></CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">By severity</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {d.bySeverity.map((s) => {
                    const max = Math.max(...d.bySeverity.map((x) => x.count), 1);
                    return (
                      <li key={`${s.key}`} className="text-xs" title={`${s.label}: ${s.count}`}>
                        <div className="flex justify-between"><span className="text-slate-700">{s.label}</span><span className="font-semibold tabular-nums">{s.count}</span></div>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full" style={{ width: `${(100 * s.count) / max}%`, background: SEVERITY_STEPS[s.key ?? ""] ?? BLUE }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">By type</CardTitle></CardHeader>
              <CardContent><RankList data={d.byType} empty="No observations" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">By department</CardTitle></CardHeader>
              <CardContent><RankList data={d.byDepartment} empty="No observations" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top reporters</CardTitle></CardHeader>
              <CardContent><RankList data={d.topReporters} empty="No reporters yet" /></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Latest reports</CardTitle></CardHeader>
            <CardContent>
              {d.latest.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">No observations yet</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {d.latest.map((o) => (
                    <li key={o.id}>
                      <Button asChild variant="bare" className="flex w-full items-start gap-3 rounded-lg px-1 py-2 text-left hover:bg-slate-50">
                        <Link href={`/observations/${o.id}`}>
                          <Thumb observationId={o.id} attachmentId={o.photoAttachmentId} cache={thumbs} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="font-semibold text-slate-900">{o.number}</span>
                              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", SEV_BADGE[o.severity] ?? SEV_BADGE.LOW)}>{humanize(o.severity)}</span>
                              <span className="text-slate-500">{humanize(o.type)} · {o.categoryLabel}</span>
                              <span className="ml-auto text-[11px] text-slate-400">{o.createdAt ? new Date(o.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 whitespace-normal text-xs text-slate-600">{o.description}</p>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {[o.areaName, o.plantName, o.observerName].filter(Boolean).join(" · ")} · {humanize(o.status)}
                            </p>
                          </div>
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
