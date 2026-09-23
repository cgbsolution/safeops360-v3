// The Signal Engine's band in the Daily Brief command centre.
//
// The Daily Brief ranks ALERTS — things that happened, plus proactive
// sentinel cards, scored by Brief Priority Score. Signals are a different
// kind of object: they are patterns ACROSS modules that no single event
// raised, so they get their own band above the feed rather than being merged
// into it. Merging would force a cross-module correlation to be scored by a
// formula built for single events, and it would lose the one thing that makes
// a signal worth reading — that it is not about a single record.
//
// DATA_QUALITY signals are excluded here, deliberately and regardless of role.
// They name unpopulated columns and broken references; the audience is
// engineering and the remedy is a code change. Putting "your HIRA consequence
// field is 0% populated" into an executive brief devalues both the finding and
// the feed it appears in. They have their own screen at /admin/data-quality.
//
// Tolerant by design: this band hangs off the side of a page that is complete
// without it, so a Signal Engine outage renders nothing rather than taking the
// brief down.

import Link from "next/link";
import { ArrowUpRight, Radar } from "lucide-react";
import { SeverityBadge } from "@/components/signals/signal-card";
import { INK, NAVY } from "@/lib/design/midnight";
import { fetchSignals, type EngineSignal, type SignalSeverity } from "@/lib/signal-engine";

// Rank order is the engine's severity scale, most severe first. The API already
// orders by severity then recency in SQL; this constant exists so the band's
// own "top N" cut cannot silently disagree with it.
const RANK: Record<SignalSeverity, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4,
};

export async function SignalBriefBand({ limit = 4 }: { limit?: number }) {
  let signals: EngineSignal[] = [];
  try {
    const res = await fetchSignals({
      status: ["OPEN", "ACKNOWLEDGED"],
      // Executive audience: the operational categories only.
      category: ["LEADING_INDICATOR", "LAGGING_PATTERN", "COMPLIANCE_GAP", "OPERATIONAL_RISK"],
      limit: 40,
    });
    signals = [...res.signals]
      .sort(
        (a, b) =>
          RANK[a.severity] - RANK[b.severity] ||
          b.computedAt.localeCompare(a.computedAt)
      )
      .slice(0, limit);
  } catch {
    return null;
  }

  if (signals.length === 0) return null;

  const criticals = signals.filter((s) => s.severity === "CRITICAL").length;

  return (
    <section
      className="mb-5 rounded-xl border p-4"
      style={{ borderColor: NAVY[200], backgroundColor: NAVY[50] }}
      aria-label="Cross-module signals"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Radar size={15} style={{ color: NAVY[700] }} aria-hidden />
        <h2 className="text-sm font-semibold" style={{ color: INK.strong }}>
          Cross-module signals
        </h2>
        <span className="text-[11px]" style={{ color: INK.faint }}>
          patterns no single module can see
          {criticals > 0 && ` · ${criticals} critical`}
        </span>
        <Link
          href="/signals"
          className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
          style={{ color: NAVY[700] }}
        >
          All signals
          <ArrowUpRight size={12} aria-hidden />
        </Link>
      </div>

      <ul className="mt-3 space-y-2">
        {signals.map((s) => (
          <li key={s.id} className="flex items-start gap-2">
            <SeverityBadge severity={s.severity} />
            <div className="min-w-0">
              <p className="text-[12.5px] leading-snug" style={{ color: INK.base }}>
                {s.narrativeLLM || s.narrativeTemplate}
              </p>
              <p className="mt-0.5 text-[10.5px]" style={{ color: INK.faint }}>
                {s.ruleCode} · {s.siteName ?? "Estate-wide"} · {s.evidenceCount} linked records
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
