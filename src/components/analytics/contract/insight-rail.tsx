"use client";

/**
 * `<InsightRail />` — the Analytics Screen Contract's first component.
 *
 * The top band of every analytics screen: 1–3 ranked deterministic findings,
 * ordered by severity, with the rest folded behind "+N more". It replaces the
 * bespoke insight card each screen grew for itself, so that the narrative above
 * the charts is rendered by one component with one severity vocabulary — a
 * "HIGH" on Incident Analytics has to look and mean the same as a "HIGH" on
 * CAPA Analytics, and it cannot if ten screens each style their own chip.
 *
 * Findings here are DETERMINISTIC — computed from the same records as the
 * charts below by the same engine — which is why they can sit above the numbers
 * without ever contradicting them.
 *
 * Ranking is by severity then by source order, and it is stable: the engine's
 * order within a severity is preserved, so a finding does not jump position
 * between two refreshes that found the same things.
 *
 * `relatedSignalsSlot` is the seat for Signal Engine output, filled in Build 2.
 * It is deliberately a slot and not a prop shaped like a signal: the rail knows
 * only that something may belong at the foot of a finding, never what. See the
 * prop's own note for why it takes elements keyed by finding id rather than the
 * render function Build 1 reserved.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Info } from "lucide-react";
import { INK, NAVY, severityStep, STATUS } from "@/lib/design/midnight";
import { Button } from "@/components/ui/button";

export type InsightSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface InsightFinding {
  severity: InsightSeverity;
  headline: string;
  detail: string;
  /** Record refs this finding is about — rendered as evidence, never as ids. */
  relatedIds: string[];
  /** Stable key. Falls back to the headline when the source has no id. */
  id?: string;
  /**
   * The site this finding was computed for, when the source engine is scoped
   * per site. Carried so a consumer of `relatedSignalsSlot` can join other
   * per-site data to the right card instead of guessing from the headline.
   */
  siteId?: string | null;
  /** Where to go to act on it. */
  href?: string | null;
  /**
   * What to DO about it. The single most important field on this type and the
   * one the first version omitted: a rail of headlines tells a manager what is
   * true, which they mostly knew. The action is what makes it a decision aid.
   * Every source on this platform already produces one — the Tier-1 engine as
   * `suggestedAction`, the Signal Engine as `recommendedAction` — and neither
   * was being rendered.
   */
  action?: string | null;
  /** Which engine produced it, so a reader can weigh it. */
  source?: string | null;
  /** Count of records behind it — evidence weight, shown next to the source. */
  evidenceCount?: number;
}

export interface InsightRailProps {
  findings: InsightFinding[];
  /** How many to show before folding the rest away. */
  visibleCount?: number;
  /**
   * The Signal Engine's "Related signals" content, keyed by finding id.
   *
   * ELEMENTS, not a render function. Build 1 reserved this slot as
   * `(finding) => ReactNode`, which typechecks and is the obvious React shape —
   * and is illegal here. `InsightRail` is a client component and every screen
   * that renders it is a server component, so a function prop crosses the RSC
   * boundary and React throws "Functions cannot be passed directly to Client
   * Components". It stayed invisible for a whole build because the slot was
   * always `undefined`; it surfaced the moment Build 2 filled it.
   *
   * Rendered elements DO cross that boundary, so the caller resolves each
   * finding's node on the server and passes a map. The rail still knows nothing
   * about what a signal is — only that something may belong under a finding.
   */
  relatedSignalsSlot?: Record<string, React.ReactNode>;
  /** Heading above the rail. Set when the rail leads the screen. */
  title?: string;
  /** Shown in place of the rail when the engine returned nothing. */
  emptyLabel?: string;
  /**
   * Qualifier shown above the cards when the findings were computed over a
   * DIFFERENT population than the charts below — e.g. a filter the narrative
   * engine cannot honour. Never optional cosmetics: an unqualified sentence
   * sitting above numbers it does not describe is how an analytics screen
   * misleads a reader who is doing everything right.
   */
  scopeNote?: string | null;
  className?: string;
}

const RANK: Record<InsightSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function Card({
  f,
  related,
}: {
  f: InsightFinding;
  related?: React.ReactNode;
}) {
  const step = severityStep(f.severity) ?? STATUS.low;

  const inner = (
    <div
      className="flex h-full flex-col rounded-xl border bg-white p-3.5"
      style={{ borderColor: NAVY[200], borderLeftWidth: 3, borderLeftColor: step.ink }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex w-fit items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ backgroundColor: step.tint, borderColor: step.line, color: step.ink }}
        >
          {/* The word is the encoding. The colour only reinforces it. */}
          {f.severity}
        </span>
        {f.source && (
          <span className="text-[10px]" style={{ color: INK.faint }}>
            {f.source}
            {f.evidenceCount ? ` · ${f.evidenceCount} records` : ""}
          </span>
        )}
      </div>
      <p
        className="mt-2 text-[13px] font-semibold leading-snug"
        style={{ color: INK.strong }}
      >
        {f.headline}
      </p>
      <p className="mt-1 text-[11.5px] leading-snug" style={{ color: INK.muted }}>
        {f.detail}
      </p>
      {/* The action, not the headline, is what makes this a decision aid. */}
      {f.action && (
        <p
          className="mt-2 flex items-start gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-medium leading-snug"
          style={{ backgroundColor: step.tint, color: step.ink }}
        >
          <ArrowRight size={12} className="mt-0.5 shrink-0" aria-hidden />
          {f.action}
        </p>
      )}
      {f.relatedIds.length > 0 && (
        <p className="mt-1.5 text-[10.5px] leading-snug" style={{ color: INK.faint }}>
          {f.relatedIds.slice(0, 4).join(" · ")}
          {f.relatedIds.length > 4 && ` +${f.relatedIds.length - 4} more`}
        </p>
      )}
      {/* Build 2 lands here. Empty today, and empty renders nothing. */}
      {related && <div className="mt-2 border-t pt-2" style={{ borderColor: NAVY[100] }}>{related}</div>}
    </div>
  );

  return f.href ? (
    <Link href={f.href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function InsightRail({
  findings,
  visibleCount = 3,
  relatedSignalsSlot,
  title,
  emptyLabel = "No findings for this selection.",
  scopeNote,
  className = "",
}: InsightRailProps) {
  const [expanded, setExpanded] = useState(false);

  if (findings.length === 0) {
    // The heading stays. A screen that simply starts with numbers reads as
    // though nobody looked; a heading over "nothing above threshold" says the
    // rules ran and found nothing, which is a different and useful statement.
    return (
      <section className={"mb-5 " + className} aria-label="Findings">
        {title && (
          <h2 className="mb-2 text-sm font-semibold" style={{ color: INK.strong }}>
            {title}
          </h2>
        )}
        <div
          className="rounded-xl border bg-white px-4 py-3 text-[12px]"
          style={{ borderColor: NAVY[200], color: INK.faint }}
        >
          {emptyLabel}
        </div>
      </section>
    );
  }

  // Stable sort: severity first, engine order preserved inside a severity, so
  // the rail does not reshuffle between two refreshes that found the same set.
  const ranked = findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => RANK[a.f.severity] - RANK[b.f.severity] || a.i - b.i)
    .map(({ f }) => f);

  const shown = expanded ? ranked : ranked.slice(0, visibleCount);
  const hidden = ranked.length - shown.length;

  return (
    <section className={"mb-5 " + className} aria-label="Findings">
      {title && (
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold" style={{ color: INK.strong }}>
            {title}
          </h2>
          <span className="text-[11px]" style={{ color: INK.faint }}>
            {ranked.length} finding{ranked.length === 1 ? "" : "s"}, most severe first
          </span>
        </div>
      )}
      {scopeNote && (
        <p
          className="mb-2 flex items-start gap-1.5 text-[11px] leading-snug"
          style={{ color: STATUS.medium.ink }}
        >
          <Info size={12} className="mt-px shrink-0" aria-hidden />
          {scopeNote}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {shown.map((f, i) => (
          <Card
            key={f.id ?? `${f.severity}-${f.headline}-${i}`}
            f={f}
            related={f.id ? relatedSignalsSlot?.[f.id] : undefined}
          />
        ))}
      </div>
      {(hidden > 0 || expanded) && (
        <Button
          variant="bare"
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
          style={{ color: NAVY[700] }}
        >
          <ChevronDown
            size={13}
            className={"transition-transform " + (expanded ? "rotate-180" : "")}
            aria-hidden
          />
          {expanded ? "Show fewer" : `+${hidden} more`}
        </Button>
      )}
    </section>
  );
}
