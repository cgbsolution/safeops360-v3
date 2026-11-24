"use client";

import Link from "next/link";
import { fmtDuration, type ControlCenterPayload } from "@/lib/ptw/ops";
import { OpsPanel } from "./panel";

/** Lifecycle pipeline — count now, average time at the step, SLA. A tile is a
 *  link that opens the Permits tab filtered to that step. */
export function Pipeline({ data, loading, error, interactive = true }: {
  data: ControlCenterPayload | null;
  loading?: boolean;
  error?: string | null;
  interactive?: boolean;
}) {
  return (
    <OpsPanel
      title="Lifecycle pipeline — where permits are stuck"
      subtitle="Count now · average time at step · SLA"
      state={!data && loading ? "loading" : !data && error ? "error" : "ready"}
      error={error}
    >
      <ol className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        {(data?.pipeline ?? []).map((s) => {
          const tint = s.breached ? "ops-tint-crit" : s.count && s.tint === "active" ? "ops-tint-ok" : s.count && s.tint === "closure" ? "ops-tint-warn" : "";
          const countColor = s.breached ? "var(--ops-crit)" : s.count && s.tint === "active" ? "var(--ops-ok)" : s.count && s.tint === "closure" ? "var(--ops-warn)" : "var(--ops-text)";
          const slaLine = s.slaMin == null
            ? "bounded by validity"
            : s.breached
              ? `BREACHED · ${s.breachedCount} past ${fmtDuration(s.slaMin)}`
              : `SLA ${fmtDuration(s.slaMin)} · within`;
          const body = (
            <>
              <div className="ops-label truncate">{s.label}</div>
              <div className="ops-num mt-1 font-bold leading-none" style={{ fontSize: "calc(30px * var(--ops-scale))", color: countColor }}>{s.count}</div>
              <div className="mt-2 text-[12px] ops-text-2">{s.count ? `avg ${fmtDuration(s.avgDwellMin)} here` : "idle"}</div>
              <div className="mt-0.5 text-[11px] font-semibold" style={{ color: s.breached ? "var(--ops-crit-text)" : "var(--ops-muted)" }}>{slaLine}</div>
            </>
          );
          return (
            <li key={s.step}>
              {interactive ? (
                <Link
                  href={`/ptw?tab=register&step=${s.step}`}
                  className={`ops-inset block min-h-[44px] p-3 hover:border-[color:var(--ops-zone-border)] ${tint}`}
                  style={{ color: "var(--ops-text)" }}
                  aria-label={`${s.label}: ${s.count} permits${s.breached ? `, SLA breached for ${s.breachedCount}` : ""}. Show in Permits`}
                >
                  {body}
                </Link>
              ) : (
                <div className={`ops-inset p-3 ${tint}`}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </OpsPanel>
  );
}
