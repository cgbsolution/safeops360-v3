"use client";

/**
 * `<SegmentBar />` — the Analytics Screen Contract's third component.
 *
 * The sticky filter bar: site / facility, severity, and analysis window.
 *
 * Three decisions in here are load-bearing.
 *
 * **1. The URL is the state.** Every selection is written to the query string
 * and read back from it; the component holds no filter state of its own. A
 * filtered analytics view is therefore a link — it can be pasted into an email
 * or a board pack, and the recipient sees the same numbers. The alternative
 * (local state) produces the classic failure where two people discuss "the
 * overdue chart" while looking at two different populations.
 *
 * **2. Selection re-queries, it does not reload.** `router.replace` +
 * `router.refresh` inside a transition re-runs the server component and swaps
 * the KPIs, the InsightRail and the chart in place. `replace` rather than
 * `push` so that ten filter fiddles do not bury the previous page under ten
 * back-button steps. The bar stays interactive during the fetch and says so.
 *
 * **3. The date range moves the WINDOW, not the population.** Site and severity
 * are identity filters and narrow which records are counted. The window governs
 * the trend, the opened/closed counts and every delta — but Open, ageing and
 * target adherence stay point-in-time across the whole population, because a
 * backlog figure that quietly forgets everything raised before the window is
 * exactly the sort of reassuring, wrong number this contract exists to remove.
 * The bar states the distinction, so the reader is never guessing which one
 * they just moved.
 */

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Gauge, CalendarRange, RotateCcw, Loader2 } from "lucide-react";
import { INK, NAVY } from "@/lib/design/midnight";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";

export interface SegmentOption {
  value: string;
  label: string;
  count?: number;
}

export interface SegmentBarProps {
  sites: SegmentOption[];
  severities: SegmentOption[];
  /** Heading for the severity control — flows grade risk under different names. */
  severityLabel?: string | null;
  /** Current values, resolved by the server from the same query string. */
  site: string | null;
  severity: string | null;
  months: number;
  /** Window presets, in months. The default matches the screen's own default. */
  monthOptions?: number[];
  /** Records after filtering — shown so an empty result is explained, not blank. */
  recordCount?: number;
  className?: string;
}

const PARAM = { site: "plant", severity: "severity", months: "months" } as const;

function Control({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Label
      className="inline-flex items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-[12px] font-normal leading-normal text-inherit transition-colors focus-within:border-primary-500"
      style={{ borderColor: NAVY[200] }}
    >
      <span style={{ color: INK.faint }} aria-hidden>
        {icon}
      </span>
      <span className="font-medium" style={{ color: INK.muted }}>
        {label}
      </span>
      {children}
    </Label>
  );
}

export function SegmentBar({
  sites,
  severities,
  severityLabel,
  site,
  severity,
  months,
  monthOptions = [3, 6, 12, 24, 36],
  recordCount,
  className = "",
}: SegmentBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const p = new URLSearchParams(searchParams?.toString() ?? "");
      if (value) p.set(key, value);
      else p.delete(key);
      const qs = p.toString();
      startTransition(() => {
        // replace, not push: filter fiddling must not fill the back stack.
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        router.refresh();
      });
    },
    [pathname, router, searchParams]
  );

  const selectClass =
    "h-auto w-auto cursor-pointer gap-1 border-0 bg-transparent py-0 pl-0 pr-1 text-[12px] outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-wait";
  const isFiltered = Boolean(site || severity) || months !== 12;

  return (
    <div
      className={
        "sticky top-0 z-20 -mx-1 mb-5 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 backdrop-blur " +
        className
      }
      style={{ borderColor: NAVY[200], backgroundColor: "rgba(232,238,247,0.92)" }}
      role="search"
      aria-label="Analytics filters"
    >
      <Control icon={<Building2 size={13} />} label="Site">
        <span className="contents" style={{ color: INK.strong }}>
        <Select
          className={selectClass}
          value={site ?? ""}
          disabled={pending}
          onChange={(e) => setParam(PARAM.site, e.target.value || null)}
          aria-label="Filter by site"
        >
          <SelectItem value="">All sites{sites.length ? ` (${sites.length})` : ""}</SelectItem>
          {sites.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
              {o.count !== undefined ? ` · ${o.count}` : ""}
            </SelectItem>
          ))}
        </Select>
        </span>
      </Control>

      {severities.length > 0 && (
        <Control icon={<Gauge size={13} />} label={severityLabel ?? "Severity"}>
          <span className="contents" style={{ color: INK.strong }}>
          <Select
            className={selectClass}
            value={severity ?? ""}
            disabled={pending}
            onChange={(e) => setParam(PARAM.severity, e.target.value || null)}
            aria-label={`Filter by ${severityLabel ?? "severity"}`}
          >
            <SelectItem value="">All</SelectItem>
            {severities.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
                {o.count !== undefined ? ` · ${o.count}` : ""}
              </SelectItem>
            ))}
          </Select>
          </span>
        </Control>
      )}

      <Control icon={<CalendarRange size={13} />} label="Window">
        <span className="contents" style={{ color: INK.strong }}>
        <Select
          className={selectClass}
          value={String(months)}
          disabled={pending}
          onChange={(e) => setParam(PARAM.months, e.target.value === "12" ? null : e.target.value)}
          aria-label="Analysis window"
        >
          {monthOptions.map((m) => (
            <SelectItem key={m} value={String(m)}>
              Last {m} months
            </SelectItem>
          ))}
        </Select>
        </span>
      </Control>

      {isFiltered && (
        <Button
          variant="bare"
          type="button"
          onClick={() => {
            startTransition(() => {
              router.replace(pathname, { scroll: false });
              router.refresh();
            });
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium hover:underline"
          style={{ color: NAVY[700] }}
        >
          <RotateCcw size={12} aria-hidden />
          Reset
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2 text-[11px]" style={{ color: INK.muted }}>
        {pending && (
          <span className="inline-flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" aria-hidden />
            Recomputing…
          </span>
        )}
        {recordCount !== undefined && !pending && (
          <span className="tabular-nums">
            {recordCount} record{recordCount === 1 ? "" : "s"} in scope
          </span>
        )}
        {/* Stated, not assumed: the window and the population are different
            filters, and the reader has to know which one they just moved. */}
        <span className="hidden lg:inline" style={{ color: INK.faint }}>
          · window drives trend &amp; deltas; backlog stays point-in-time
        </span>
      </div>
    </div>
  );
}
