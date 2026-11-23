"use client";

// IMS / MIS dashboard: every safety indicator from the JSL Hisar MIS list on one
// screen, from GET /api/ims/dashboard. Refreshes every 60 s while the tab is
// visible, and immediately when the tab regains focus. Keeps the last good data
// on a failed refresh rather than blanking the wall display.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fmtDate, imsFetch, label, qs, type ImsDashboard, type PlantOption } from "@/lib/ims/api";
import { ALL_PLANTS, ErrorBox, PlantSelect, plantParam } from "./shared";

const REFRESH_MS = 60_000;
const PERIODS = ["MTD", "FYTD", "L30", "L90", "L365"];

type Tone = "good" | "warn" | "bad" | undefined;

function Tile({ title, value, sub, tone, href }: { title: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; href?: string }) {
  const color = tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  const body = (
    <div className={cn("h-full rounded-xl border border-slate-200 bg-white p-4 transition", href && "hover:border-primary-400 hover:shadow-sm")}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", color)}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{children}</CardContent>
    </Card>
  );
}

const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("en-IN"));
const rate = (v: number | null) => (v === null ? "Not measured" : v.toFixed(2));

export function ImsDashboardView({ plants, defaultPlantId }: { plants: PlantOption[]; defaultPlantId: string | null }) {
  const [plant, setPlant] = useState<string>(defaultPlantId ?? ALL_PLANTS);
  const [period, setPeriod] = useState("FYTD");
  const [data, setData] = useState<ImsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const d = await imsFetch<ImsDashboard>(`/api/ims/dashboard${qs({ plantId: plantParam(plant), period })}`);
      if (id === reqId.current) {
        setData(d);
        setError(null);
      }
    } catch (e: any) {
      if (id === reqId.current) setError(e?.message ?? "Could not load the dashboard");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [plant, period]);

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
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={period} onValueChange={setPeriod} className="h-9 w-52" aria-label="Period">
          {PERIODS.map((p) => <SelectItem key={p} value={p}>{label(p)}</SelectItem>)}
        </Select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={cn("mr-1.5", loading && "animate-spin")} /> Refresh
        </Button>
        {d && (
          <span className="ml-auto text-[11px] text-slate-500">
            {fmtDate(d.window.start)} to {fmtDate(d.window.end)} · updated {new Date(d.generatedAt).toLocaleTimeString("en-IN")} · auto-refresh 60 s
          </span>
        )}
      </div>
      <ErrorBox error={error && d ? `${error}. Showing the last loaded figures.` : error} />
      {!d ? (
        !error && <div className="py-16 text-center text-sm text-slate-400">Loading indicators…</div>
      ) : (
        <>
          <Section title="Lagging indicators (IS 3786, per million man-hours)">
            <Tile title="Frequency rate" value={rate(d.lagging.frequencyRate)} sub={`${d.lagging.ltiCount} LTI · ${d.lagging.fatalityCount} fatal`} tone={d.lagging.frequencyRate ? "bad" : "good"} href="/manhours/kpi" />
            <Tile title="Severity rate" value={rate(d.lagging.severityRate)} sub={`${n(d.lagging.lostDays)} man-days lost`} tone={d.lagging.severityRate ? "warn" : "good"} href="/manhours/kpi" />
            <Tile title="FSI" value={rate(d.lagging.fsi)} sub="Frequency-severity index" />
            <Tile title="Recordables" value={n(d.lagging.recordableCount)} sub={`${d.lagging.firstAidCount} first aid`} />
            <Tile title="Incidents reported" value={n(d.lagging.incidentsTotal)} sub={Object.entries(d.lagging.incidentsByType).map(([k, v]) => `${label(k)} ${v}`).slice(0, 3).join(" · ") || "None"} href="/incidents" />
            <Tile title="Near misses" value={n(d.nearMisses.reported)} href="/near-miss" />
          </Section>

          <Section title="Manpower & exposure">
            <Tile title="Headcount" value={n(d.manpower.headcount)} sub="Latest monthly return" href="/manhours" />
            <Tile title="Man-hours" value={n(d.manpower.manHours)} sub={`${d.manpower.monthsReported} plant-month return(s)`} href="/manhours" />
            <Tile title="Employee hours" value={n(d.manpower.employeeHours)} />
            <Tile title="Contractor hours" value={n(d.manpower.contractorHours)} />
            <Tile title="Live permits" value={n(d.permits.live)} sub="Issued, active or suspended now" href="/ptw" />
            <Tile title="Permits issued" value={n(d.permits.issued)} sub="In period" href="/ptw" />
          </Section>

          <Section title="Leading indicators">
            <Tile title="Trainings" value={n(d.trainings.total)} sub={`${d.trainings.completed} completed`} href="/training" />
            <Tile title="External trainings" value={n(d.trainings.external)} sub={`${d.trainings.internal} internal`} href="/training" />
            <Tile title="Toolbox talks" value={n(d.toolboxTalks.total)} sub={`${n(d.toolboxTalks.participants)} attendees · ${d.toolboxTalks.preJobFlra} pre-job`} href="/ims/toolbox-talks" />
            <Tile title="Inspections done" value={n(d.inspections.completed)} sub={`${d.inspections.fireInspections} fire inspections`} href="/inspections" />
            <Tile title="Inspections overdue" value={n(d.inspections.overdue)} tone={d.inspections.overdue ? "bad" : "good"} href="/inspections" />
            <Tile title="Observations" value={n(d.observations.reported)} sub={`${d.observations.open} open`} href="/observations" />
          </Section>

          <Section title="Risk & assurance">
            <Tile title="HIRA reviewed" value={n(d.hira.reviewed)} sub={`${d.hira.dueNext30} due in 30 days`} tone="good" href="/hira/reviews" />
            <Tile title="HIRA reviews overdue" value={n(d.hira.overdue)} tone={d.hira.overdue ? "bad" : "good"} href="/hira/reviews" />
            <Tile title="Safety audits planned" value={n(d.audits.planned)} href="/cams/calendar" />
            <Tile title="Audits closed" value={n(d.audits.closed)} tone="good" href="/cams" />
            <Tile title="Audits overdue" value={n(d.audits.overdue)} tone={d.audits.overdue ? "bad" : "good"} href="/cams" />
            <Tile title="Show cause notices" value={n(d.showCause.issued)} sub={`${d.showCause.open} open · ${d.showCause.replyOverdue} reply overdue`} tone={d.showCause.replyOverdue ? "warn" : undefined} href="/ims/show-cause" />
          </Section>

          <Section title="Governance">
            <Tile title="Safety committee meetings" value={n(d.meetings.committeeHeld)} sub={`${d.meetings.held} meetings held of ${d.meetings.scheduled}`} href="/ims/meetings" />
            <Tile title="MOM actions open" value={n(d.mom.open)} sub={`${d.mom.closed} closed in period`} href="/ims/mom" />
            <Tile title="MOM actions overdue" value={n(d.mom.overdue)} tone={d.mom.overdue ? "bad" : "good"} href="/ims/mom?overdue=1" />
            <Tile title="Mock drills done" value={n(d.mockDrills.completed)} sub={`of ${d.mockDrills.scheduled} scheduled`} tone="good" href="/ims/mock-drills" />
            <Tile title="Mock drills overdue" value={n(d.mockDrills.overdue)} tone={d.mockDrills.overdue ? "bad" : "good"} href="/ims/mock-drills" />
            <Tile title="Drills next 30 days" value={n(d.mockDrills.upcoming30)} href="/ims/mock-drills" />
          </Section>
        </>
      )}
    </div>
  );
}
