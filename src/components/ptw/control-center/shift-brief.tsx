"use client";

import { Sparkles } from "lucide-react";
import { briefParts, fmtClock, type ControlCenterPayload } from "@/lib/ptw/ops";

/** Hidden when there is no brief. The risk phrase (wrapped in [[…]] by the
 *  generator) is highlighted red when the board has a critical exception,
 *  amber otherwise — and always carries an icon-free text label via <mark>. */
export function ShiftBrief({ data, onViewActions }: { data: ControlCenterPayload | null; onViewActions: () => void }) {
  const brief = data?.brief;
  if (!data || !brief?.text) return null;
  const critical = data.exceptions.some((e) => e.severity === "critical");
  return (
    <section
      aria-label="Shift brief"
      className="ops-panel flex flex-wrap items-start gap-4"
      style={{ borderColor: "var(--ops-warn-border)" }}
    >
      <div className="flex items-center gap-2">
        <Sparkles size={18} aria-hidden style={{ color: "var(--ops-gold)" }} />
        <span className="ops-label" style={{ color: "var(--ops-gold)" }}>Shift brief</span>
      </div>
      <p className="min-w-[240px] flex-1 text-[15px] leading-relaxed ops-text-2">
        {briefParts(brief.text).map((part, i) =>
          part.risk ? (
            <mark
              key={i}
              className="rounded px-1 font-semibold"
              style={{
                background: critical ? "var(--ops-crit-bg)" : "var(--ops-warn-bg)",
                color: critical ? "var(--ops-crit-text)" : "var(--ops-warn-text)",
              }}
            >
              {part.text}
            </mark>
          ) : (
            <span key={i}>{part.text}</span>
          )
        )}
        <span className="ml-2 text-[11px] ops-muted">· {fmtClock(brief.generatedAt)}</span>
      </p>
      <button type="button" onClick={onViewActions} className="ops-btn" style={{ color: "var(--ops-gold-text)" }}>
        View actions →
      </button>
    </section>
  );
}
