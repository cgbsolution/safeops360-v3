"use client";

// Filter bar under the standard page header (same pattern as the IMS / MIS
// dashboard): plant, shift, range and area pickers, live status, refresh and
// wall mode. shadcn controls only.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Monitor, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fmtAgo, type ControlCenterPayload, type RangeKey } from "@/lib/ptw/ops";

export type Filters = { plant: string | null; area: string | null; shift: string | null; range: RangeKey };

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "shift", label: "This shift" },
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
];

function useNow(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Clock + "updated Ns ago", or a reconnecting notice after a failed refresh. */
export function LiveClock({ updatedAt, failures, large }: { updatedAt: Date | null; failures: number; large?: boolean }) {
  const now = useNow(1000);
  return (
    <div className="flex items-center gap-3 text-right">
      <div>
        <div className={cn("font-semibold tabular-nums text-slate-900", large ? "text-4xl" : "text-lg leading-none")}>
          {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}
        </div>
        <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-slate-500">
          {failures > 0 ? (
            <span role="status" className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
              <RefreshCw size={11} aria-hidden /> Reconnecting…
            </span>
          ) : (
            <>
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" aria-hidden />
              <span>Live · updated {updatedAt ? fmtAgo(updatedAt, now) : "—"}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function HeaderBar({
  data,
  filters,
  plants,
  onChange,
  updatedAt,
  failures,
  wallHref,
  onRefresh,
  loading,
}: {
  data: ControlCenterPayload | null;
  filters: Filters;
  plants: { id: string; name: string }[];
  onChange: (next: Partial<Filters>) => void;
  updatedAt: Date | null;
  failures: number;
  wallHref: string;
  onRefresh: () => void;
  loading?: boolean;
}) {
  const shifts = data?.shifts ?? [];
  const activeShift = filters.range === "shift" ? filters.shift ?? data?.filters.shift ?? null : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {plants.length > 1 && (
        <Select
          aria-label="Plant"
          className="h-9 w-56"
          value={filters.plant ?? data?.plant.id ?? ""}
          onValueChange={(v) => onChange({ plant: v || null, area: null })}
        >
          {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </Select>
      )}
      {shifts.length > 0 && (
        <div role="group" aria-label="Shift" className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
          {shifts.map((s) => {
            const on = activeShift === s.code;
            return (
              <Button
                key={s.code}
                type="button"
                size="sm"
                variant={on ? "default" : "ghost"}
                aria-pressed={on}
                title={s.label ?? `Shift ${s.code}`}
                className="h-8"
                onClick={() => onChange(on ? { shift: null, range: "today" } : { shift: s.code, range: "shift" })}
              >
                Shift {s.code}
                {on && ` · ${String(s.startHour).padStart(2, "0")}:00–${String(s.endHour).padStart(2, "0")}:00`}
              </Button>
            );
          })}
        </div>
      )}
      <Select
        aria-label="Range"
        className="h-9 w-40"
        value={filters.range}
        onValueChange={(v) => onChange({ range: v as RangeKey, shift: v === "shift" ? filters.shift : null })}
      >
        {RANGES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
      </Select>
      <Select aria-label="Area" className="h-9 w-52" value={filters.area ?? ""} onValueChange={(v) => onChange({ area: v || null })}>
        <SelectItem value="">All areas</SelectItem>
        {(data?.areas ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
      </Select>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
        <RefreshCw size={14} className={cn("mr-1.5", loading && "animate-spin")} /> Refresh
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href={wallHref} target="_blank" rel="noreferrer">
          <Monitor size={14} className="mr-1.5" /> Wall mode
        </Link>
      </Button>
      <div className="ml-auto">
        <LiveClock updatedAt={updatedAt} failures={failures} />
      </div>
    </div>
  );
}
