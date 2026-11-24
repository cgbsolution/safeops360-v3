"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fmtClock, fmtDelta, typeInfo, type ControlCenterPayload } from "@/lib/ptw/ops";

type Tone = "neutral" | "crit" | "warn";
type Tile = { key: string; label: string; value: number; context: string; tone: Tone };

/** Counts up over 600 ms on the FIRST load only; later refreshes jump. */
function CountUp({ value, animate }: { value: number; animate: boolean }) {
  const [shown, setShown] = useState(animate ? 0 : value);
  useEffect(() => {
    if (!animate || typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, animate]);
  return <>{shown}</>;
}

export function buildTiles(d: ControlCenterPayload): Tile[] {
  const k = d.kpis;
  const c = k.context;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return [
    { key: "active", label: "Active now", value: k.activeNow, tone: "neutral",
      context: k.deltas.activeNow === null ? "— vs same time yesterday" : `${fmtDelta(k.deltas.activeNow)} vs same time yesterday` },
    { key: "pending", label: "Pending approval", value: k.pendingApproval, tone: k.pendingPastSla > 0 ? "warn" : "neutral",
      context: k.pendingPastSla ? `${k.pendingPastSla} past SLA` : "all within SLA" },
    { key: "starting", label: "Starting ≤ 2h", value: k.starting2h, tone: "neutral",
      context: c.nextStart
        ? `${c.startingHotWork ? `${c.startingHotWork} hot work · ` : ""}next ${typeInfo(c.nextStart.type).label.toLowerCase()} ${fmtClock(c.nextStart.at)}`
        : "nothing scheduled" },
    { key: "expiring", label: "Expiring ≤ 2h", value: k.expiring2h, tone: "neutral", context: k.expiring2h ? "extend or close" : "none due" },
    { key: "expired", label: "Expired · not closed", value: k.expiredOpen, tone: k.expiredOpen > 0 ? "crit" : "neutral",
      context: k.expiredOpen ? `${k.expiredOpenToday} today · ${k.expiredOpen - k.expiredOpenToday} older` : "none open" },
    { key: "workers", label: "Workers under permit", value: k.workersUnderPermit, tone: "neutral",
      context: `${plural(k.contractorsOnSite, "contractor")} on site` },
    { key: "simops", label: "SIMOPS conflicts", value: k.simopsConflicts, tone: k.simopsConflicts > 0 ? "warn" : "neutral",
      context: c.simopsLabel ?? "no overlapping work" },
    { key: "impairments", label: "Active impairments", value: k.activeImpairments, tone: k.activeImpairments > 0 ? "crit" : "neutral",
      context: k.activeImpairments ? `${k.impairmentsOverdue} past restore · ${k.impairmentsBlocking} blocking` : "all systems in service" },
    { key: "suspended", label: "Suspended", value: k.suspended, tone: k.suspended > 0 ? "warn" : "neutral",
      context: c.topSuspendedReason ?? (k.suspended ? "see permit" : "none") },
  ];
}

const TONE = {
  neutral: { box: "border-slate-200 bg-white", value: "text-slate-900", label: "text-slate-500" },
  crit: { box: "border-rose-200 bg-rose-50", value: "text-rose-600", label: "text-rose-700" },
  warn: { box: "border-amber-200 bg-amber-50", value: "text-amber-600", label: "text-amber-700" },
};

const GRID = "grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]";

export function KpiBand({ data, loading }: { data: ControlCenterPayload | null; loading: boolean }) {
  const first = useRef(true);
  const animate = first.current && !!data;
  useEffect(() => {
    if (data) first.current = false;
  }, [data]);

  if (!data) {
    return (
      <div className={GRID}>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            {loading && (
              <>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-12" />
              </>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div role="list" aria-label="Key figures" className={GRID}>
      {buildTiles(data).map((t) => (
        <div key={t.key} role="listitem" className={cn("rounded-xl border p-4", TONE[t.tone].box)}>
          <div className={cn("text-[11px] font-semibold uppercase tracking-wider", TONE[t.tone].label)}>{t.label}</div>
          <div className={cn("mt-1 text-3xl font-bold tabular-nums", TONE[t.tone].value)}>
            <CountUp value={t.value} animate={animate} />
          </div>
          <div className="mt-1 truncate text-[11px] text-slate-500" title={t.context}>{t.context}</div>
        </div>
      ))}
    </div>
  );
}
