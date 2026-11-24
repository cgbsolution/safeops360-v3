"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Monitor, RefreshCw } from "lucide-react";
import { Select, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fmtAgo, type ControlCenterPayload, type RangeKey } from "@/lib/ptw/ops";

export type Filters = { plant: string | null; area: string | null; shift: string | null; range: RangeKey };

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "shift", label: "This shift" },
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
];

const TABS = [
  { key: "control-center", label: "Control Center", href: "/ptw" },
  { key: "register", label: "Permits", href: "/ptw?tab=register" },
  { key: "analytics", label: "Analytics", href: "/ptw?tab=analytics" },
  { key: "signals", label: "Signals", href: "/ptw?tab=signals" },
  { key: "impairments", label: "Impairments", href: "/ptw?tab=impairments" },
];

function useNow(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Live clock + "updated Ns ago" + reconnect state. Re-renders once a second (text only, no animation). */
export function LiveClock({ updatedAt, failures, large }: { updatedAt: Date | null; failures: number; large?: boolean }) {
  const now = useNow(1000);
  const reconnecting = failures > 0;
  return (
    <div className="flex items-center gap-3" aria-live="off">
      <div className="text-right">
        <div className={cn("ops-num font-semibold", large ? "text-[44px] leading-none" : "text-[22px] leading-none")}>
          {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}
        </div>
        <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] ops-muted">
          {reconnecting ? (
            <span className="ops-chip ops-tint-warn" style={{ color: "var(--ops-warn-text)" }} role="status">
              <RefreshCw size={11} aria-hidden /> Reconnecting…
            </span>
          ) : (
            <>
              <span className="ops-live-dot inline-block h-2 w-2 rounded-full" style={{ background: "var(--ops-ok)" }} aria-hidden />
              <span>LIVE · updated {updatedAt ? fmtAgo(updatedAt, now) : "—"}</span>
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
}: {
  data: ControlCenterPayload | null;
  filters: Filters;
  plants: { id: string; name: string }[];
  onChange: (next: Partial<Filters>) => void;
  updatedAt: Date | null;
  failures: number;
  wallHref: string;
}) {
  const shifts = data?.shifts ?? [];
  const areaName = filters.area ? data?.areas.find((a) => a.id === filters.area)?.name : null;
  const activeShift = filters.range === "shift" ? filters.shift ?? data?.filters.shift ?? null : null;
  return (
    <header className="space-y-4">
      <nav aria-label="Permit to Work" className="flex flex-wrap gap-1 border-b pb-2" style={{ borderColor: "var(--ops-border)" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === "control-center" ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[44px] items-center rounded-lg px-3 text-[13px] font-semibold",
              t.key === "control-center" ? "ops-tint-warn" : "hover:bg-[color:var(--ops-surface-3)]"
            )}
            style={{
              color: t.key === "control-center" ? "var(--ops-gold-text)" : "var(--ops-text-2)",
              border: t.key === "control-center" ? "1px solid var(--ops-gold)" : "1px solid transparent",
            }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className="ops-num flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold"
            style={{ background: "var(--ops-gold)", color: "var(--ops-glyph)" }}
            aria-hidden
          >
            S360
          </div>
          <div className="min-w-0">
            <h1 className="ops-num truncate text-[20px] font-bold leading-tight">Permit to Work · Control Center</h1>
            <p className="truncate text-[13px] ops-muted">
              {data?.plant.name ?? "Loading plant…"}
              {areaName ? ` — ${areaName}` : data?.plant.location ? ` — ${data.plant.location}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Shift" className="ops-inset flex gap-1 p-1">
            {shifts.map((s) => {
              const on = activeShift === s.code;
              return (
                <button
                  key={s.code}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(on ? { shift: null, range: "today" } : { shift: s.code, range: "shift" })}
                  className="min-h-[36px] rounded-full px-3 text-[12px] font-semibold"
                  style={on ? { background: "var(--ops-gold)", color: "var(--ops-glyph)" } : { color: "var(--ops-text-2)" }}
                >
                  Shift {s.code}
                  {on && ` · ${String(s.startHour).padStart(2, "0")}:00–${String(s.endHour).padStart(2, "0")}:00`}
                </button>
              );
            })}
          </div>
          {plants.length > 1 && (
            <Select
              aria-label="Plant"
              className="ops-select w-52"
              value={filters.plant ?? data?.plant.id ?? ""}
              onValueChange={(v) => onChange({ plant: v || null, area: null })}
            >
              {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </Select>
          )}
          <Select
            aria-label="Range"
            className="ops-select w-36"
            value={filters.range}
            onValueChange={(v) => onChange({ range: v as RangeKey, shift: v === "shift" ? filters.shift : null })}
          >
            {RANGES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
          </Select>
          <Select
            aria-label="Area"
            className="ops-select w-48"
            value={filters.area ?? ""}
            onValueChange={(v) => onChange({ area: v || null })}
          >
            <SelectItem value="">All areas</SelectItem>
            {(data?.areas ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </Select>
        </div>

        <LiveClock updatedAt={updatedAt} failures={failures} />
        <a href={wallHref} target="_blank" rel="noreferrer" className="ops-btn ops-btn-gold">
          <Monitor size={16} aria-hidden /> Wall mode
        </a>
      </div>
    </header>
  );
}
