/**
 * The Analytics Screen Contract, applied to every flow.
 *
 * ONE implementation for all eleven analytics screens. Build 1 proved the
 * contract on Incident with a screen of its own; this is that screen
 * generalised, and the bespoke version is gone. Two implementations of "what a
 * KPI is" would drift within a sprint — "overdue" would come to mean something
 * subtly different on Inspection than on CAPA, and nobody would notice until a
 * client compared two numbers in a meeting.
 *
 * Everything that varies between flows comes from the API response (`label`,
 * `href`, `filterOptions`, `dataQuality`, which breakdowns exist) or from
 * `FLOW_UI` below. Nothing varies by having a second copy of the layout.
 *
 * The four contract components:
 *   <SegmentBar />       sticky site / severity / window filters, URL-persisted
 *   <InsightRail />      ranked deterministic findings + related Signals
 *   <ContextKPI />       a number is never shown without a comparator
 *   <DataQualityFlag />  a metric that CANNOT be computed never renders as zero
 */

import Link from "next/link";
import { BreakdownBars } from "@/components/analytics/breakdown-bars";
import { TrendChart } from "@/components/analytics/trend-chart";
import {
  ContextKPI,
  DataQualityFlag,
  InsightRail,
  SegmentBar,
  type InsightFinding,
  type InsightSeverity,
} from "@/components/analytics/contract";
import {
  AGE_RAMP,
  BRAND,
  CHROME,
  INK,
  NAVY,
  NEUTRAL_BAR,
  SERIES,
  SERIES_FILL,
  severityStep,
  STATUS,
} from "@/lib/design/midnight";
import {
  fetchFlowAnalytics,
  type DataQualityFlagDTO,
  type FlowAnalytics,
} from "@/lib/flow-analytics";
import { fetchModuleSignals, type EngineSignal } from "@/lib/signal-engine";

export const DEFAULT_MONTHS = 12;
export const ALLOWED_MONTHS = [3, 6, 12, 24, 36];

/** Midnight Executive trend palette. Every value validated — see midnight.ts. */
const TREND_PALETTE = {
  series: SERIES,
  chrome: CHROME,
  backlogFill: SERIES_FILL.backlog,
};

/**
 * Midnight Executive breakdown palette. Identity dimensions take ONE navy hue —
 * each bar carries its own label and value, so colour does no work the text is
 * not already doing. Severity is the exception and takes the reserved status
 * scale: crimson / gold / navy, no orange.
 */
const BREAKDOWN_PALETTE = {
  bar: NEUTRAL_BAR,
  severity: (key: string) => severityStep(key)?.bar ?? null,
  track: BRAND.ice,
  notRecorded: NAVY[200],
};

/**
 * The only per-flow configuration in the rollout.
 *
 * `signalModule` is the Signal Engine's name for this domain, which is NOT
 * always the flow key (`risk` → `ERM`, `nearmiss` → `NEAR_MISS`,
 * `audit` → `CAMS_AUDIT`). Mapping it explicitly rather than upper-casing the
 * key keeps a silent mismatch — which would render an empty related-signals
 * slot that looks identical to "no signals exist" — impossible.
 *
 * `breadcrumb` is the register's name in the sidebar, which is occasionally
 * shorter than the analytics label.
 */
export const FLOW_UI: Record<string, { signalModule: string; breadcrumb: string }> = {
  observation: { signalModule: "OBSERVATION", breadcrumb: "Safety Observations" },
  incident: { signalModule: "INCIDENT", breadcrumb: "Incidents" },
  nearmiss: { signalModule: "NEAR_MISS", breadcrumb: "Near Miss" },
  capa: { signalModule: "CAPA", breadcrumb: "CAPA" },
  hira: { signalModule: "HIRA", breadcrumb: "HIRA" },
  eai: { signalModule: "EAI", breadcrumb: "EAI Register" },
  moc: { signalModule: "MOC", breadcrumb: "MOC" },
  risk: { signalModule: "ERM", breadcrumb: "Risk Register" },
  inspection: { signalModule: "INSPECTION", breadcrumb: "Inspections" },
  training: { signalModule: "TRAINING", breadcrumb: "Training" },
  audit: { signalModule: "CAMS_AUDIT", breadcrumb: "CAMS" },
  ptw: { signalModule: "PTW", breadcrumb: "Permit to Work" },
  // The flow is over lockout EXECUTIONS; the register tab beside it is the
  // procedure library. Named for what the numbers count, not for the tab.
  loto: { signalModule: "LOTO", breadcrumb: "Lockout Records" },
};

function findFlag(flags: DataQualityFlagDTO[], metric: string): DataQualityFlagDTO | undefined {
  return flags.find((f) => f.metric.toLowerCase() === metric.toLowerCase());
}

function flagNode(f: DataQualityFlagDTO) {
  return (
    <DataQualityFlag
      metric={f.metric}
      incompleteCount={f.incompleteCount}
      totalCount={f.totalCount}
      field={f.fieldLabel}
      scope={f.scope}
      blocking={f.blocking}
      reason={f.reason}
    />
  );
}

/**
 * The insight engine grades findings on its own four-step scale
 * (critical/high/watch/info); the rail speaks three. Mapping here keeps one
 * severity vocabulary on screen without the shared component having to know
 * any single engine's dialect.
 */
function toRailSeverity(v: string): InsightSeverity {
  switch (v.toLowerCase()) {
    case "critical":
    case "high":
      return "HIGH";
    case "watch":
    case "medium":
      return "MEDIUM";
    default:
      return "LOW";
  }
}

function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={"rounded-xl border bg-white p-4 " + className}
      style={{ borderColor: NAVY[200] }}
    >
      <h3 className="text-sm font-semibold" style={{ color: INK.strong }}>
        {title}
      </h3>
      {subtitle && (
        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: INK.faint }}>
          {subtitle}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function signed(n: number, unit = ""): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}${unit}`;
}

export async function FlowAnalyticsView({
  flow,
  site,
  severity,
  months = DEFAULT_MONTHS,
  extra,
}: {
  flow: string;
  site: string | null;
  severity: string | null;
  months?: number;
  /**
   * Domain panels this flow has that the contract does not model — Pareto,
   * clause conformance, site benchmarking. Rendered BELOW the contract layer.
   * The rollout replaces duplicated KPI and insight markup; it does not delete
   * genuine analysis that has no equivalent here.
   */
  extra?: React.ReactNode;
}) {
  const ui = FLOW_UI[flow] ?? { signalModule: flow.toUpperCase(), breadcrumb: flow };

  let d: FlowAnalytics | null = null;
  let error: string | null = null;
  // The Signal Engine lookup runs alongside the analytics fetch, not after it:
  // it is independent data and serialising them would add its latency to a page
  // that is complete without it. `fetchModuleSignals` never throws — an engine
  // outage yields an empty list and the rail simply shows no related signals.
  let relatedSignals: EngineSignal[] = [];
  try {
    const [analytics, signals] = await Promise.all([
      fetchFlowAnalytics(flow, {
        plant: site ?? undefined,
        severity: severity ? [severity] : undefined,
        months,
      }),
      fetchModuleSignals(ui.signalModule, { limit: 8 }),
    ]);
    d = analytics;
    relatedSignals = signals;
  } catch (e: any) {
    error = e?.message ?? "Failed to load analytics";
  }

  if (error || !d) {
    // Not tolerant, by design. Unlike the insight bar above a register — which
    // can degrade to nothing over a list that still renders — the charts ARE
    // this page. Rendering an empty analytics screen would state "nothing
    // happened in this flow", which is a claim about the business.
    return (
      <div
        className="rounded-xl border p-6 text-sm"
        style={{
          borderColor: STATUS.high.line,
          backgroundColor: STATUS.high.tint,
          color: STATUS.high.ink,
        }}
      >
        {error}
      </div>
    );
  }

  const s = d.summary;
  const flags = d.dataQuality ?? [];
  const overdueFlag = findFlag(flags, "Overdue");
  const avgCloseFlag = findFlag(flags, "Avg days to close");
  const tileFlagMetrics = new Set(["overdue", "avg days to close"]);
  const standaloneFlags = flags.filter((f) => !tileFlagMetrics.has(f.metric.toLowerCase()));

  const ageMax = Math.max(1, ...d.ageing.map((a) => a.count));
  const windowLabel = `vs prior ${d.months} months`;

  // How many periods actually carry records. A chart drawn over two non-zero
  // months is a pair of bars, not a trend, and drawing it invites a reader to
  // see direction that is not there. Four is the minimum at which a line can
  // sustain a claim.
  const livePoints = d.trend.filter((t) => (t.opened ?? 0) > 0).length;
  const trendIsReadable = livePoints >= 4;
  // Same test for a breakdown: one bar is a label, not a distribution.
  const usefulBreakdowns = d.breakdowns.filter((b) => b.items.length > 1);

  // ── The decision list ───────────────────────────────────────────────────
  //
  // Tier-1 findings and Signal Engine findings, merged into ONE ranked list and
  // rendered at the TOP of the screen with the action each implies.
  //
  // Previously the Tier-1 findings led and the signals were a footnote inside
  // them, under a grid of counts. That was the wrong way round: the counts tell
  // a manager what is true, which they mostly knew, and the findings tell them
  // what to do about it. A cross-module signal — "34 open Major NC audit
  // findings at NW have no CAPA raised" — is the single most actionable thing on
  // this screen, and it was three lines of small text below the fold.
  const findings: InsightFinding[] = [
    ...d.insights.map((i) => ({
      id: i.id,
      severity: toRailSeverity(i.severity),
      headline: i.headline,
      detail: i.evidence,
      action: i.suggestedAction ?? null,
      source: "Module rule",
      evidenceCount: (i.recordRefs ?? []).length,
      relatedIds: i.recordRefs ?? [],
      siteId: i.siteId ?? null,
    })),
    ...relatedSignals.map((sig) => ({
      id: `sig:${sig.id}`,
      severity: toRailSeverity(sig.severity),
      headline: sig.narrativeLLM || sig.narrativeTemplate,
      detail:
        `${sig.siteName ?? "Estate-wide"} · seen ${sig.occurrenceCount}× · ` +
        `confidence ${Math.round(sig.confidence * 100)}%`,
      action: sig.recommendedAction,
      source: "Cross-module signal",
      evidenceCount: sig.evidenceCount,
      relatedIds: (sig.evidence ?? []).map((e) => e.sourceRecordRef ?? e.sourceModule).slice(0, 6),
      siteId: sig.siteId ?? null,
      href: "/signals",
    })),
  ];

  const unhonoured: string[] = [];
  if (severity && !d.insightsScope?.severity) unhonoured.push("severity");
  if (d.months !== DEFAULT_MONTHS && !d.insightsScope?.window) unhonoured.push("analysis window");
  const scopeNote =
    findings.length > 0 && unhonoured.length > 0
      ? `These findings cover ${
          d.plantName ? `all ${d.plantName} records` : "all records in your scope"
        } — the ${unhonoured.join(" and ")} filter${
          unhonoured.length > 1 ? "s" : ""
        } below ${unhonoured.length > 1 ? "do" : "does"} not apply to them.`
      : null;

  const insightsSuppressed = d.insightsScope?.suppressedReason ?? null;
  // A flow with NO Tier-1 rule set is a coverage gap, not an all-clear, and the
  // rail must not render the same emptiness for both. The rollout deliberately
  // does not invent rules to fill these — it names them.
  const noEngine = d.insightsScope?.engineAvailable === false;

  // No per-finding signal sub-slot any more: signals ARE findings in the list
  // above, so nesting them underneath would print each one twice.

  return (
    <div>
      {/* No PageHeader here. This view is always a TAB of a register
          workspace now, and the workspace owns the title, the breadcrumb and
          the tab strip — a second title one line below the first read as two
          screens stacked, and the "Open register" button it carried is the
          Register tab three pixels to the left. What survives is the
          provenance line, which is load-bearing: it states how many records
          the figures below are computed from and over what window. */}
      <p className="mb-4 text-sm" style={{ color: INK.muted }}>
        {d.recordCount} records
        {d.plantName ? ` · ${d.plantName}` : ""} · window {d.windowStart.slice(0, 10)} →{" "}
        {d.windowEnd.slice(0, 10)} · computed from the records themselves, deterministically.
      </p>

      {/* 0. Filters. Sticky, and the URL is the state. */}
      <SegmentBar
        sites={d.filterOptions.sites}
        severities={d.filterOptions.severities}
        severityLabel={d.filterOptions.severityLabel}
        site={d.plant}
        severity={severity}
        months={d.months}
        recordCount={d.recordCount}
      />

      {d.truncated && (
        <div
          className="mb-4 rounded-lg border p-3 text-xs"
          style={{
            borderColor: STATUS.medium.line,
            backgroundColor: STATUS.medium.tint,
            color: STATUS.medium.ink,
          }}
        >
          This flow exceeds the analysis cap, so these figures cover the most recent records
          only — they are not a complete count.
        </div>
      )}

      {/* 1. THE DECISIONS. This band leads the screen: what changed, why it
             matters, and what to do about it. Everything below is the evidence
             behind it. */}
      {/* The band ALWAYS renders, even with nothing in it.
             Inspections has no module rules and no cross-module signal reads
             it, so it used to skip the band entirely and open on "Evidence" —
             every other screen led with a decision and that one silently
             started with numbers. A reader scanning screens reads the missing
             heading as "nothing was looked for here", which is exactly what it
             means, so the band says it rather than disappearing. */}
      <InsightRail
        title="What needs a decision"
        findings={findings}
        visibleCount={3}
        emptyLabel={
          noEngine
            ? `No module rules exist for ${d.label} yet, and no cross-module signal rule reads it either — so this band has no source. That is a coverage gap, not an all-clear.`
            : insightsSuppressed ??
              "Nothing above threshold this period. The module rules and the cross-module signal engine both ran and found no finding worth an action."
        }
        scopeNote={scopeNote}
      />

      {noEngine && findings.length > 0 && (
        <p className="-mt-3 mb-5 text-[11px]" style={{ color: INK.faint }}>
          {d.label} has no module-specific rule set yet, so every finding above comes from the
          cross-module signal engine. That is a coverage gap, not an all-clear.
        </p>
      )}

      {/* 2. The evidence. Numbers support the decisions above; they are not the
             point of the screen. */}
      <h2
        className="mb-2 text-sm font-semibold uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        Evidence
      </h2>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ContextKPI
          label="Open"
          value={s.open}
          deltaValue={s.openDelta !== null ? signed(s.openDelta) : undefined}
          deltaDirection={
            s.openDelta === null || s.openDelta === 0 ? "flat" : s.openDelta > 0 ? "up" : "down"
          }
          /* A growing backlog is unambiguously bad; a shrinking one is good. */
          deltaIsGood={s.openDelta === null ? undefined : s.openDelta <= 0}
          comparatorLabel={
            s.openPrior !== null ? `${windowLabel} (was ${s.openPrior})` : undefined
          }
          hint={`${d.openMeaning} · ${s.total} total on record`}
          href={d.href}
        />

        <ContextKPI
          label={`Opened · last ${d.months}m`}
          value={s.openedInWindow}
          deltaValue={s.openedDeltaPct !== null ? signed(s.openedDeltaPct, "%") : undefined}
          deltaDirection={
            s.openedDeltaPct === null || s.openedDeltaPct === 0
              ? "flat"
              : s.openedDeltaPct > 0
                ? "up"
                : "down"
          }
          /* Deliberately no verdict. More records raised is not automatically
             worse — on a reporting-led programme it is the signal you were
             trying to produce. The arrow states direction; the reader supplies
             the judgement. */
          deltaIsGood={undefined}
          comparatorLabel={`${windowLabel} (was ${s.openedPriorWindow})`}
          hint={
            s.closureRatePct !== null
              ? `${s.closedInWindow} closed in the same window · ${s.closureRatePct}% closure rate`
              : d.hasClosureData
                ? `${s.closedInWindow} closed in the same window`
                : "this flow records completion as a state, not a date"
          }
        />

        <ContextKPI
          label="Avg days to close"
          value={s.avgDaysToClose ?? "—"}
          suppressValue={s.avgDaysToClose === null}
          deltaValue={
            s.avgDaysToCloseDelta !== null ? signed(s.avgDaysToCloseDelta, "d") : undefined
          }
          deltaDirection={
            s.avgDaysToCloseDelta === null || s.avgDaysToCloseDelta === 0
              ? "flat"
              : s.avgDaysToCloseDelta > 0
                ? "up"
                : "down"
          }
          /* Longer is worse, unambiguously. */
          deltaIsGood={
            s.avgDaysToCloseDelta === null ? undefined : s.avgDaysToCloseDelta <= 0
          }
          comparatorLabel={
            s.avgDaysToClosePrior !== null
              ? `${windowLabel} (was ${s.avgDaysToClosePrior}d)`
              : undefined
          }
          hint={
            !d.hasClosureData
              ? "this flow records completion as a state, not a date"
              : s.closureRatePriorPct !== null
                ? `closure rate was ${s.closureRatePriorPct}% in the prior window`
                : null
          }
          flag={avgCloseFlag ? flagNode(avgCloseFlag) : undefined}
        />

        {/* The flagship fix, now on every screen. Where the underlying field is
            unpopulated the value is suppressed: "0 overdue" computed from no
            target dates is not a measurement, and printing it tells the reader
            the opposite of the truth. */}
        <ContextKPI
          label="Overdue"
          value={d.hasTargetDates ? d.sla.overdue : "—"}
          suppressValue={!d.hasTargetDates || Boolean(overdueFlag?.blocking)}
          deltaValue={undefined}
          comparatorLabel={undefined}
          hint={
            overdueFlag?.blocking
              ? null
              : d.hasTargetDates
                ? `${d.sla.dueIn7} due within 7 days`
                : "this flow has no target-date field"
          }
          flag={overdueFlag ? flagNode(overdueFlag) : undefined}
        />
      </div>

      {standaloneFlags.length > 0 && (
        <div className="mb-5 grid gap-3 md:grid-cols-2">
          {standaloneFlags.map((f) => (
            <DataQualityFlag
              key={f.metric + f.field}
              variant="banner"
              metric={f.metric}
              incompleteCount={f.incompleteCount}
              totalCount={f.totalCount}
              field={f.fieldLabel}
              scope={f.scope}
              blocking={f.blocking}
              reason={f.reason}
            />
          ))}
        </div>
      )}

      {/* 3. Direction of travel — only where there is a direction to see. */}
      {trendIsReadable ? (
        <Panel
          title="Trend"
          subtitle={
            d.hasClosureData
              ? "Opened and closed per month, with the running open backlog. One axis — all three series are counts of records."
              : "Opened per month. This flow records no closure date, so no closed or backlog series is drawn: a zero line would read as 'nothing is ever resolved', which is not what the data says."
          }
          className="mb-5"
        >
          <TrendChart data={d.trend} hasClosureData={d.hasClosureData} palette={TREND_PALETTE} />
        </Panel>
      ) : (
        <div
          className="mb-5 rounded-xl border px-4 py-3 text-[12px]"
          style={{ borderColor: NAVY[200], color: INK.muted, backgroundColor: NAVY[50] }}
        >
          <strong style={{ color: INK.strong }}>No trend shown.</strong> Only {livePoints} of the{" "}
          {d.trend.length} periods in this window carry any {d.label.toLowerCase()}. A chart over
          that is a pair of bars, not a direction, and drawing it would invite a reading the data
          cannot support.
        </div>
      )}

      {/* 4. Where it is concentrated. */}
      {usefulBreakdowns.length > 0 && (
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          {usefulBreakdowns.map((b) => (
            <Panel
              key={b.key}
              title={b.label}
              subtitle={
                b.items.some((i) => i.href)
                  ? "Click a row to open the filtered register."
                  : undefined
              }
            >
              <BreakdownBars breakdown={b} palette={BREAKDOWN_PALETTE} />
            </Panel>
          ))}
        </div>
      )}

      {/* 5. Age and lateness. */}
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <Panel
          title="Open record age"
          subtitle="How long the open backlog has been waiting. Point-in-time — not restricted by the analysis window."
        >
          <ul className="space-y-2">
            {d.ageing.map((a, idx) => (
              <li key={a.bucket}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px]" style={{ color: INK.base }}>
                    {a.bucket}
                  </span>
                  <span className="text-[11px] tabular-nums" style={{ color: INK.muted }}>
                    {a.count}
                  </span>
                </div>
                <div
                  className="mt-1 h-2 w-full overflow-hidden rounded-full"
                  style={{ backgroundColor: BRAND.ice }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max((a.count / ageMax) * 100, a.count ? 1.5 : 0)}%`,
                      backgroundColor: AGE_RAMP[Math.min(idx, AGE_RAMP.length - 1)],
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Target adherence"
          subtitle={
            overdueFlag?.blocking
              ? "Not measurable on this data — see the flag below."
              : d.hasTargetDates
                ? "Against each record's own target date."
                : "This flow has no target-date field, so adherence cannot be measured."
          }
        >
          {overdueFlag?.blocking ? (
            <DataQualityFlag
              variant="banner"
              metric={overdueFlag.metric}
              incompleteCount={overdueFlag.incompleteCount}
              totalCount={overdueFlag.totalCount}
              field={overdueFlag.fieldLabel}
              scope={overdueFlag.scope}
              blocking
              reason={
                overdueFlag.reason +
                " Nothing on this panel can distinguish an on-time record from a late one until the field is populated."
              }
            />
          ) : d.hasTargetDates ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[11px] uppercase tracking-wider" style={{ color: INK.muted }}>
                  Overdue now
                </dt>
                <dd
                  className="mt-0.5 text-xl font-semibold"
                  style={{ color: d.sla.overdue ? STATUS.high.ink : INK.strong }}
                >
                  {d.sla.overdue}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider" style={{ color: INK.muted }}>
                  Due in 7 days
                </dt>
                <dd className="mt-0.5 text-xl font-semibold" style={{ color: INK.strong }}>
                  {d.sla.dueIn7}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider" style={{ color: INK.muted }}>
                  Closed on time
                </dt>
                <dd className="mt-0.5 text-xl font-semibold" style={{ color: INK.strong }}>
                  {d.sla.onTimeClosurePct === null ? "—" : `${d.sla.onTimeClosurePct}%`}
                </dd>
                <dd className="text-[11px]" style={{ color: INK.faint }}>
                  {d.sla.closedOnTime} on time · {d.sla.closedLate} late
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider" style={{ color: INK.muted }}>
                  Open, no target
                </dt>
                <dd className="mt-0.5 text-xl font-semibold" style={{ color: INK.strong }}>
                  {d.sla.openWithoutTarget}
                </dd>
                <dd className="text-[11px]" style={{ color: INK.faint }}>
                  cannot be measured as late or on time
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs" style={{ color: INK.faint }}>
              Not applicable to this flow.
            </p>
          )}
        </Panel>
      </div>

      {/* 6. Who is carrying it. */}
      {d.contributors.length > 0 && (
        <Panel
          title="Open records by owner"
          subtitle="Concentration here is usually a resourcing problem, not an individual one."
          className="mb-5"
        >
          <ul className="divide-y" style={{ borderColor: NAVY[100] }}>
            {d.contributors.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between py-2">
                <span className="text-[13px]" style={{ color: INK.base }}>
                  {c.name}
                </span>
                <span className="text-[11px] tabular-nums" style={{ color: INK.muted }}>
                  {c.open} open
                  {c.overdue > 0 && (
                    <span style={{ color: STATUS.high.ink }}> · {c.overdue} overdue</span>
                  )}
                  <span style={{ color: INK.faint }}> · {c.total} all time</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* 7. Anything this flow has that the contract does not model. */}
      {extra}

      {d.notes && (
        <p className="text-[11px] leading-snug" style={{ color: INK.faint }}>
          Note: {d.notes}
        </p>
      )}
    </div>
  );
}
