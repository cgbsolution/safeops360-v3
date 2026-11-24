"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtDuration, type ControlCenterPayload, type OpsPipelineStep } from "@/lib/ptw/ops";
import { CcPanel } from "./panel";

function tone(s: OpsPipelineStep) {
  if (s.breached) return { box: "border-rose-200 bg-rose-50", count: "text-rose-600" };
  if (s.count && s.tint === "active") return { box: "border-emerald-200 bg-emerald-50", count: "text-emerald-600" };
  if (s.count && s.tint === "closure") return { box: "border-amber-200 bg-amber-50", count: "text-amber-600" };
  return { box: "border-slate-200 bg-white", count: "text-slate-900" };
}

/** Lifecycle pipeline — count now, average time at the step, SLA. A tile links
 *  to the Permits tab filtered to that step. */
export function Pipeline({ data, loading, error, interactive = true }: {
  data: ControlCenterPayload | null;
  loading?: boolean;
  error?: string | null;
  interactive?: boolean;
}) {
  return (
    <CcPanel
      title="Lifecycle pipeline — where permits are stuck"
      subtitle="Count now · average time at step · SLA"
      state={!data && loading ? "loading" : !data && error ? "error" : "ready"}
      error={error}
    >
      <ol className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
        {(data?.pipeline ?? []).map((s) => {
          const t = tone(s);
          const slaLine = s.slaMin == null
            ? "bounded by validity"
            : s.breached
              ? `BREACHED · ${s.breachedCount} past ${fmtDuration(s.slaMin)}`
              : `SLA ${fmtDuration(s.slaMin)} · within`;
          const body = (
            <>
              <span className="block truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</span>
              <span className={cn("mt-1 block text-2xl font-bold tabular-nums", t.count)}>{s.count}</span>
              <span className="mt-1 block text-xs text-slate-600">{s.count ? `avg ${fmtDuration(s.avgDwellMin)} here` : "idle"}</span>
              <span className={cn("mt-0.5 block text-[11px] font-semibold", s.breached ? "text-rose-700" : "text-slate-400")}>{slaLine}</span>
            </>
          );
          const box = cn("block h-full w-full whitespace-normal rounded-xl border p-3 text-left", t.box);
          return (
            <li key={s.step}>
              {interactive ? (
                <Button asChild variant="bare" size="bare" className={cn(box, "hover:border-primary-400 hover:shadow-sm")}>
                  <Link
                    href={`/ptw?tab=register&step=${s.step}`}
                    aria-label={`${s.label}: ${s.count} permits${s.breached ? `, SLA breached for ${s.breachedCount}` : ""}. Show in Permits`}
                  >
                    {body}
                  </Link>
                </Button>
              ) : (
                <div className={box}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </CcPanel>
  );
}
