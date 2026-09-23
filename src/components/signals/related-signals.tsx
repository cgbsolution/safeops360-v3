// The Analytics Screen Contract's "related signals" slot, filled.
//
// Build 1 left `InsightRail.relatedSignalsSlot` as a render function over one
// finding, precisely so that whatever filled it later would not force a change
// to the rail's contract. This is that filling, and the rail still knows
// nothing about what a signal is.
//
// **Signals are joined to a finding by SITE, not by topic.** The rail renders
// one card per site (the insight engine is fanned out per accessible plant),
// and each signal carries the site it was computed for. Matching on that is a
// link the engine actually asserted. The tempting alternative — keyword-matching
// a signal's narrative against a finding's headline — would manufacture a
// relationship out of shared vocabulary, and a fabricated correlation on a
// screen whose whole promise is deterministic correlation is worse than none.
//
// A signal with no site (estate-wide, e.g. a platform data-quality finding) is
// attached to no finding here rather than to all of them: repeating one signal
// under every card reads as several findings.

import Link from "next/link";
import { Radar } from "lucide-react";
import { INK, NAVY } from "@/lib/design/midnight";
import type { InsightFinding } from "@/components/analytics/contract";
import { severityStyle } from "@/components/signals/signal-card";
import type { EngineSignal } from "@/lib/signal-engine";

export function RelatedSignals({
  signals,
  finding,
}: {
  signals: EngineSignal[];
  finding: InsightFinding;
}) {
  const site = finding.siteId ?? null;
  // No site on the finding means the reader's role is unscoped and the rail is
  // showing portfolio-level cards; in that case every signal is in scope.
  const matched = site ? signals.filter((s) => s.siteId === site) : signals;
  if (matched.length === 0) return null;

  const shown = matched.slice(0, 3);

  return (
    <div>
      <p
        className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: INK.faint }}
      >
        <Radar size={10} aria-hidden />
        Related signals
      </p>
      <ul className="mt-1 space-y-1">
        {shown.map((s) => {
          const st = severityStyle(s.severity);
          return (
            <li key={s.id} className="flex items-start gap-1.5">
              <span
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: st.ink }}
                aria-hidden
              />
              <span className="text-[10.5px] leading-snug" style={{ color: INK.muted }}>
                {/* Severity as a word, not colour alone — the dot is decoration. */}
                <span className="font-semibold" style={{ color: st.ink }}>
                  {s.severity}
                </span>{" "}
                {s.narrativeLLM || s.narrativeTemplate}
              </span>
            </li>
          );
        })}
      </ul>
      <Link
        href={site ? `/signals?module=INCIDENT` : "/signals"}
        className="mt-1 inline-block text-[10px] font-medium hover:underline"
        style={{ color: NAVY[700] }}
      >
        {matched.length > shown.length
          ? `+${matched.length - shown.length} more · open cross-module signals`
          : "Open cross-module signals"}
      </Link>
    </div>
  );
}
