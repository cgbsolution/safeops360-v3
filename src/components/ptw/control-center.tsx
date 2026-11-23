"use client";

// PTW realtime control center (JSL Hisar): live permits grouped by area, an
// exception rail and a KPI strip, from GET /api/ptw/control-center. Polls every
// 30 s (usePolling: refetch on focus, keep last good data, back off on error).
// "Wall display" turns the pane into a full-screen board for a control-room TV.
// Every number is computed on the server from the permit tables; nothing here
// is sample data.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Clock, Flame, Maximize2, Minimize2, RefreshCw, ShieldAlert, Users, Wind,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePolling } from "@/hooks/use-polling";
import { cn } from "@/lib/utils";
import {
  ALL_PLANTS, FLAG_LABEL, SEVERITY_STYLE, STATUS_STYLE, fmtMinutes, fmtTime, plantQuery,
  type CcArea, type CcException, type CcPermit, type ControlCenter,
} from "@/lib/ptw/control-center";

type PlantOption = { id: string; name: string };

const REFRESH_MS = 30_000;

export function PtwControlCenter({ plants, defaultPlantId }: { plants: PlantOption[]; defaultPlantId: string | null }) {
  const [plant, setPlant] = useState<string>(defaultPlantId ?? ALL_PLANTS);
  const [wall, setWall] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const url = `/api/ptw/control-center${plantQuery(plant === ALL_PLANTS ? null : plant)}`;
  const { data, error, loading, updatedAt, failures, refresh } = usePolling<ControlCenter>(url, { intervalMs: REFRESH_MS });

  // Leaving browser full screen (Esc) also leaves wall mode.
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setWall(false); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  useEffect(() => {
    if (!wall) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setWall(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wall]);

  async function toggleWall() {
    const next = !wall;
    setWall(next);
    try {
      if (next && rootRef.current?.requestFullscreen && !document.fullscreenElement) await rootRef.current.requestFullscreen();
      if (!next && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* full screen refused (iframe / kiosk policy): the fixed overlay still works */ }
  }

  const d = data;
  return (
    <div ref={rootRef} className={cn(wall && "fixed inset-0 z-[60] overflow-auto bg-slate-100 p-4 sm:p-6")}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {wall && (
          <div className="mr-2 text-lg font-semibold text-slate-900">
            Permit to Work: live board{d?.plantName ? ` · ${d.plantName}` : ""}
          </div>
        )}
        <Select value={plant} onValueChange={setPlant} className="h-9 w-60" aria-label="Plant">
          <SelectItem value={ALL_PLANTS}>All plants in my scope</SelectItem>
          {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </Select>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={cn(loading && "animate-spin")} /> Refresh
        </Button>
        <Button variant={wall ? "default" : "outline"} size="sm" onClick={toggleWall}>
          {wall ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {wall ? "Exit wall display" : "Wall display"}
        </Button>
        <span className="ml-auto text-[11px] text-slate-500" aria-live="polite">
          {updatedAt ? `Updated ${updatedAt.toLocaleTimeString("en-IN")}` : "Loading"}
          {" · "}refreshes every {REFRESH_MS / 1000} s
          {failures > 1 ? ` · retrying less often after ${failures} failed refreshes` : ""}
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {d ? `${error}. Showing the figures from ${updatedAt?.toLocaleTimeString("en-IN") ?? "the last refresh"}.` : error}
        </div>
      )}
      {d?.truncated && (
        <div className="mb-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-600">
          More live permits exist than the board can show; the ones ending soonest are listed. Pick a single plant.
        </div>
      )}

      {!d ? (
        !error && <BoardSkeleton />
      ) : (
        <>
          <KpiStrip d={d} wall={wall} />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div>
              {d.areas.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">
                  No permits are approved, issued, active, suspended or expired-and-open
                  {d.plantName ? ` at ${d.plantName}` : " in your plants"} right now.
                </div>
              ) : (
                <div className={cn("grid gap-3", wall ? "md:grid-cols-2 2xl:grid-cols-3" : "md:grid-cols-2")}>
                  {d.areas.map((a) => <AreaCard key={a.areaId ?? "none"} area={a} showPlant={plant === ALL_PLANTS} />)}
                </div>
              )}
            </div>
            <ExceptionRail items={d.exceptions} wall={wall} />
          </div>
        </>
      )}
    </div>
  );
}

function KpiStrip({ d, wall }: { d: ControlCenter; wall: boolean }) {
  const k = d.kpis;
  const tiles: { label: string; value: number; sub?: string; tone?: "bad" | "warn" | "good"; icon?: React.ReactNode }[] = [
    { label: "Live permits", value: k.livePermits, sub: `${k.active} active · ${k.issued} issued`, icon: <ShieldAlert size={14} /> },
    { label: "Workers on site", value: k.workersOnSite, sub: "Crew on active permits", icon: <Users size={14} /> },
    { label: "Expiring in 60 min", value: k.expiringSoon, tone: k.expiringSoon ? "warn" : "good", icon: <Clock size={14} /> },
    { label: "Expired, not closed", value: k.expiredNotClosed, tone: k.expiredNotClosed ? "bad" : "good", icon: <AlertTriangle size={14} /> },
    { label: "Gas re-test overdue", value: k.gasOverdue, tone: k.gasOverdue ? "bad" : "good", icon: <Wind size={14} /> },
    { label: "SIMOPS conflicts", value: k.simopsConflicts, tone: k.simopsConflicts ? "warn" : "good", icon: <Flame size={14} /> },
    { label: "Suspended", value: k.suspended, tone: k.suspended ? "warn" : undefined },
    { label: "Awaiting issue", value: k.awaitingIssue, sub: "Approved, not issued" },
    { label: "Closed in 24 h", value: k.closedLast24h },
  ];
  return (
    <div className={cn("mb-4 grid gap-2", "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-9")}>
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {t.icon}{t.label}
          </div>
          <div className={cn(
            "mt-0.5 font-bold tabular-nums", wall ? "text-3xl" : "text-2xl",
            t.tone === "bad" ? "text-rose-700" : t.tone === "warn" ? "text-amber-700" : "text-slate-900",
          )}>
            {t.value.toLocaleString("en-IN")}
          </div>
          {t.sub && <div className="text-[11px] text-slate-500">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function AreaCard({ area, showPlant }: { area: CcArea; showPlant: boolean }) {
  const sev = area.worstSeverity ? SEVERITY_STYLE[area.worstSeverity] : null;
  return (
    <Card className={cn("border-2", sev ? sev.ring : "border-slate-200")}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{area.areaName}</CardTitle>
            {showPlant && area.plantName && <div className="text-[11px] text-slate-500">{area.plantName}</div>}
          </div>
          {sev && <Badge className={cn("border text-[10px]", sev.chip)}>{sev.label}</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
          {Object.entries(area.counts).map(([s, n]) => (
            <span key={s} className={cn("rounded border px-1.5 py-0.5", STATUS_STYLE[s] ?? "border-slate-200")}>
              {n} {s.toLowerCase()}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5">
            <Users size={11} /> {area.workers} on site
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        {area.permits.map((p) => <PermitRow key={p.id} p={p} />)}
      </CardContent>
    </Card>
  );
}

function PermitRow({ p }: { p: CcPermit }) {
  const sev = p.worstSeverity ? SEVERITY_STYLE[p.worstSeverity] : null;
  const ended = p.minutesRemaining <= 0;
  return (
    <div className={cn("rounded-lg border bg-white px-2.5 py-2 text-xs", sev ? sev.ring : "border-slate-200")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={`/ptw/${p.id}`} className="font-semibold text-primary-700 hover:underline">{p.number}</Link>
        <span className="text-slate-600">{p.typeLabel}</span>
        <Badge className={cn("border text-[10px]", STATUS_STYLE[p.status] ?? "border-slate-200 bg-slate-50 text-slate-700")}>
          {p.status.toLowerCase()}
        </Badge>
        <span className={cn("ml-auto tabular-nums", ended ? "font-semibold text-rose-700" : p.minutesRemaining <= 60 ? "font-semibold text-amber-700" : "text-slate-500")}>
          {ended ? `ended ${fmtMinutes(p.minutesRemaining)} ago` : `${fmtMinutes(p.minutesRemaining)} left`}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
        {p.location && <span>{p.location}</span>}
        <span>Receiver: {p.receiverName ?? "-"}</span>
        <span>Issuer: {p.issuerName ?? "-"}</span>
        {p.status === "ACTIVE" && <span>Crew {p.crewCount}</span>}
        {p.gas.required && p.gas.state !== "N/A" && (
          <span className={cn(p.gas.state === "OVERDUE" || p.gas.state === "MISSING" ? "font-semibold text-rose-700" : p.gas.state === "DUE" ? "text-amber-700" : "")}>
            Gas {p.gas.state === "OK" ? `next by ${fmtTime(p.gas.dueBy)}` : p.gas.state.toLowerCase()}
          </span>
        )}
        <span>Valid to {fmtTime(p.validTo)}</span>
      </div>
      {(p.flags.length > 0 || p.simopsWith.length > 0 || p.suspendedReason) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {p.flags.map((f) => (
            <span key={f} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
              {FLAG_LABEL[f] ?? f}{f === "SIMOPS_CONFLICT" && p.simopsWith.length ? ` with ${p.simopsWith.join(", ")}` : ""}
            </span>
          ))}
          {p.suspendedReason && <span className="text-[10px] text-amber-800">Reason: {p.suspendedReason}</span>}
        </div>
      )}
    </div>
  );
}

function ExceptionRail({ items, wall }: { items: CcException[]; wall: boolean }) {
  return (
    <Card className="h-fit xl:sticky xl:top-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span>Exceptions</span>
          <span className="text-xs font-normal text-slate-500">{items.length} open</span>
        </CardTitle>
      </CardHeader>
      <CardContent className={cn("space-y-2 overflow-auto pt-0", wall ? "max-h-[calc(100vh-14rem)]" : "max-h-[70vh]")}>
        {items.length === 0 && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-4 text-center text-xs text-emerald-800">
            No exceptions on the live permits.
          </div>
        )}
        {items.map((e, i) => {
          const s = SEVERITY_STYLE[e.severity];
          return (
            <div key={`${e.code}-${e.permitId}-${i}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} aria-hidden />
                <Badge className={cn("border text-[10px]", s.chip)}>{s.label}</Badge>
                <span className="text-[11px] font-medium text-slate-600">{FLAG_LABEL[e.code] ?? e.code}</span>
              </div>
              <div className="mt-1 text-xs font-medium text-slate-900">{e.title}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                <Link href={`/ptw/${e.permitId}`} className="font-medium text-primary-700 hover:underline">{e.permitNumber}</Link>
                {e.relatedPermitIds.map((rid, j) => (
                  <Link key={rid} href={`/ptw/${rid}`} className="font-medium text-primary-700 hover:underline">
                    {e.relatedPermitNumbers[j] ?? rid}
                  </Link>
                ))}
                <span>{e.areaName}</span>
              </div>
              {e.detail && <div className="mt-0.5 text-[11px] text-slate-600">{e.detail}</div>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function BoardSkeleton() {
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
      </div>
    </div>
  );
}
