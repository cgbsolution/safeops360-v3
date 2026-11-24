"use client";

import { useEffect, useRef, useState } from "react";
import { fmtClock, fmtDelta, typeInfo, type ControlCenterPayload } from "@/lib/ptw/ops";
import { OpsSkeleton } from "./panel";

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
    { key: "pending", label: "Pending approval", value: k.pendingApproval,
      tone: k.pendingPastSla > 0 ? "warn" : "neutral",
      context: k.pendingPastSla ? `${k.pendingPastSla} past SLA` : "all within SLA" },
    { key: "starting", label: "Starting ≤ 2h", value: k.starting2h, tone: "neutral",
      context: c.nextStart
        ? `${c.startingHotWork ? `${c.startingHotWork} hot work · ` : ""}next ${typeInfo(c.nextStart.type).label.toLowerCase()} ${fmtClock(c.nextStart.at)}`
        : "nothing scheduled" },
    { key: "expiring", label: "Expiring ≤ 2h", value: k.expiring2h, tone: "neutral",
      context: k.expiring2h ? "extend or close" : "none due" },
    { key: "expired", label: "Expired · not closed", value: k.expiredOpen, tone: k.expiredOpen > 0 ? "crit" : "neutral",
      context: k.expiredOpen ? `${k.expiredOpenToday} today · ${k.expiredOpen - k.expiredOpenToday} older` : "none open" },
    { key: "workers", label: "Workers under permit", value: k.workersUnderPermit, tone: "neutral",
      context: `${plural(k.contractorsOnSite, "contractor")} on site` },
    { key: "simops", label: "SIMOPS conflicts", value: k.simopsConflicts, tone: k.simopsConflicts > 0 ? "warn" : "neutral",
      context: c.simopsLabel ?? "no overlapping work" },
    { key: "impairments", label: "Active impairments", value: k.activeImpairments,
      tone: k.activeImpairments > 0 ? "crit" : "neutral",
      context: k.activeImpairments
        ? `${k.impairmentsOverdue} past restore · ${k.impairmentsBlocking} blocking`
        : "all systems in service" },
    { key: "suspended", label: "Suspended", value: k.suspended, tone: k.suspended > 0 ? "warn" : "neutral",
      context: c.topSuspendedReason ?? (k.suspended ? "see permit" : "none") },
  ];
}

export function KpiBand({ data, loading }: { data: ControlCenterPayload | null; loading: boolean }) {
  const first = useRef(true);
  const animate = first.current && !!data;
  useEffect(() => {
    if (data) first.current = false;
  }, [data]);

  if (!data) {
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="ops-panel" style={{ padding: 16 }}>
            {loading ? <OpsSkeleton rows={2} /> : null}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div role="list" aria-label="Key figures" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
      {buildTiles(data).map((t) => (
        <div
          key={t.key}
          role="listitem"
          className={`ops-panel ${t.tone === "crit" ? "ops-tint-crit" : t.tone === "warn" ? "ops-tint-warn" : ""}`}
          style={{ padding: 16 }}
        >
          <div className="ops-label" style={t.tone === "crit" ? { color: "var(--ops-crit-text)" } : t.tone === "warn" ? { color: "var(--ops-warn-text)" } : undefined}>
            {t.label}
          </div>
          <div
            className="ops-num mt-1 text-[40px] font-bold leading-none"
            style={{ fontSize: "calc(40px * var(--ops-scale))", color: t.tone === "crit" ? "var(--ops-crit)" : t.tone === "warn" ? "var(--ops-warn)" : "var(--ops-text)" }}
          >
            <CountUp value={t.value} animate={animate} />
          </div>
          <div className="mt-2 truncate text-[12px] ops-muted" title={t.context}>{t.context}</div>
        </div>
      ))}
    </div>
  );
}
