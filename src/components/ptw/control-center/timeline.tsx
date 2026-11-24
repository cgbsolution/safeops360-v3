"use client";

import { useEffect, useState } from "react";
import { fmtClock, pctInWindow, typeInfo, type ControlCenterPayload, type OpsBar } from "@/lib/ptw/ops";
import { OpsPanel } from "./panel";

const ROW_H = 46;
const BAR_H = 10;
const LABEL_W = 170;

function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function ticks(start: Date, end: Date): { at: Date; label: string }[] {
  const span = end.getTime() - start.getTime();
  const days = span > 36 * 3600_000;
  return Array.from({ length: 5 }, (_, i) => {
    const at = new Date(start.getTime() + (span * i) / 4);
    const label = days
      ? at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : i === 4 && span === 24 * 3600_000 ? "24:00" : fmtClock(at);
    return { at, label };
  });
}

function barStyle(b: Pick<OpsBar, "kind"> & { type?: string }): React.CSSProperties {
  // Overrun / closed don't use the type colour — and the legend swatches call
  // this with no type at all, so only look the colour up when it is needed.
  switch (b.kind) {
    case "overrun":
      return { background: "repeating-linear-gradient(135deg, #FF8A8A 0 4px, #6B2537 4px 8px)" };
    case "closed":
      return { background: "#475569" };
    case "scheduled":
      return { background: "transparent", border: `1.5px dashed ${typeInfo(b.type).color}` };
    default:
      return { background: typeInfo(b.type).color };
  }
}

const KIND_LABEL = { active: "active", overrun: "overrun — past validity, not closed", scheduled: "scheduled", closed: "closed" };

export function Timeline({ data, loading, error, onOpenPermit }: {
  data: ControlCenterPayload | null;
  loading?: boolean;
  error?: string | null;
  onOpenPermit: (id: string) => void;
}) {
  const now = useMinute();
  const start = data ? new Date(data.filters.windowStart) : null;
  const end = data ? new Date(data.filters.windowEnd) : null;
  const nowPct = start && end ? pctInWindow(now, start, end) : null;
  const showNow = start && end && now >= start && now <= end;
  const title = data?.filters.range === "7d" ? "Last 7 days — validity windows by area" : data?.filters.range === "shift" ? "This shift — validity windows by area" : "Today's timeline — validity windows by area";

  return (
    <OpsPanel
      title={title}
      right={
        <ul className="flex flex-wrap gap-3 text-[12px] ops-text-2" aria-label="Timeline legend">
          <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: "#F59E0B" }} aria-hidden />Active (type colour)</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm" style={barStyle({ kind: "overrun" })} aria-hidden />Overrun</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm" style={{ border: "1.5px dashed #9FB0C8" }} aria-hidden />Scheduled</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: "#475569" }} aria-hidden />Closed</li>
        </ul>
      }
      state={!data && loading ? "loading" : !data && error ? "error" : "ready"}
      error={error}
      empty={data && !data.timeline.length ? "No permit windows in this period." : undefined}
      className="min-w-0"
    >
      {data && start && end && (
        <div className="ops-scroll overflow-x-auto">
          <div className="relative" style={{ minWidth: 640 }}>
            <div className="flex text-[11px] ops-muted" style={{ paddingLeft: LABEL_W }}>
              <div className="relative h-5 flex-1">
                {ticks(start, end).map((t, i) => (
                  <span key={i} className="ops-num absolute -translate-x-1/2" style={{ left: `${i * 25}%` }}>{t.label}</span>
                ))}
              </div>
            </div>
            <div className="relative">
              {data.timeline.map((row) => {
                const lanes = Math.max(1, ...row.bars.map((b) => b.lane + 1));
                return (
                  <div key={row.areaId ?? "none"} className="flex border-t" style={{ borderColor: "var(--ops-border)", minHeight: ROW_H }}>
                    <div className="flex shrink-0 items-center pr-3 text-[13px] ops-text-2" style={{ width: LABEL_W }}>
                      <span className="truncate">{row.areaName}</span>
                      {row.hidden > 0 && <span className="ml-1 text-[11px] ops-muted">+{row.hidden}</span>}
                    </div>
                    <div className="relative flex-1" style={{ height: Math.max(ROW_H, lanes * 15 + 8) }}>
                      {row.bars.map((b) => {
                        const l = pctInWindow(b.start, start, end);
                        const r = pctInWindow(b.end, start, end);
                        const label = `${b.number} · ${typeInfo(b.type).label} · ${fmtClock(b.start)}–${fmtClock(b.validTo)} · ${KIND_LABEL[b.kind]}${b.holder ? ` · ${b.holder}` : ""}`;
                        return (
                          <button
                            key={b.permitId}
                            type="button"
                            title={label}
                            aria-label={`${label}. Open permit`}
                            onClick={() => onOpenPermit(b.permitId)}
                            className="absolute flex items-center"
                            style={{ left: `${l}%`, width: `max(${r - l}%, 6px)`, top: 4 + b.lane * 15, height: 14 }}
                          >
                            <span className="block w-full rounded-sm" style={{ height: BAR_H, ...barStyle(b) }} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {showNow && nowPct !== null && (
                <div
                  className="pointer-events-none absolute bottom-0 top-0"
                  style={{ left: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${nowPct / 100})`, width: 2, background: "var(--ops-gold)" }}
                  aria-hidden
                >
                  <span className="ops-num absolute -top-1 left-1 rounded-full px-1.5 text-[10px] font-bold" style={{ background: "var(--ops-gold)", color: "var(--ops-glyph)" }}>
                    NOW
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </OpsPanel>
  );
}
