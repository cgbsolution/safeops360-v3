// Per-flow analytics — frontend contract + server fetch.
//
// Mirrors app/services/analytics/engine.py. Not tolerant: unlike the insight
// bar (which degrades to nothing above a list that still renders), the charts
// ARE this page. Silently rendering an empty analytics screen would state
// "nothing happened in this flow", which is a false claim about the business.

import { backendFetch } from "@/lib/backend/fetch";

export interface TrendPoint {
  period: string;            // "2026-08"
  opened: number;
  /** null where the flow records no closure date — draw no line, not a zero. */
  closed: number | null;
  backlog: number | null;
}

export interface BreakdownItem {
  key: string;
  label: string;
  total: number;
  open: number;
  /** Present only where the register actually accepts this filter. */
  href: string | null;
}

export interface Breakdown {
  key: string;
  label: string;
  items: BreakdownItem[];
}

export interface SegmentOptionDTO {
  value: string;
  label: string;
  count: number;
}

/**
 * A metric that is structurally UNCOUNTABLE rather than zero. Computed by the
 * engine off the same rows as the KPI it undermines — never authored per
 * screen, so it cannot drift from what was actually counted.
 */
export interface DataQualityFlagDTO {
  /** The metric this undermines, matching the KPI label it sits beside. */
  metric: string;
  /** The database column that is empty. */
  field: string;
  /** That column in the reader's language — "statutory deadline". */
  fieldLabel: string;
  incompleteCount: number;
  totalCount: number;
  /** What `totalCount` counts — "open records", "closed records", "records". */
  scope: string;
  sharePct: number;
  /** True when NOTHING can be counted, not merely some of it. */
  blocking: boolean;
  reason: string;
}

export interface FlowAnalytics {
  flow: string;
  label: string;
  href: string;
  plant: string | null;
  plantName: string | null;
  months: number;
  /** ISO bounds of the analysis window and of the equal-length prior window. */
  windowStart: string;
  windowEnd: string;
  priorWindowStart: string;
  /** Severity values actually applied, after normalisation. */
  severities: string[];
  /**
   * Choices for the SegmentBar, computed BEFORE the site/severity narrowing so
   * choosing one site never empties the dropdown you chose it from.
   */
  filterOptions: {
    sites: SegmentOptionDTO[];
    severities: SegmentOptionDTO[];
    /** The flow's own word for severity — "Risk level" on Near Miss. */
    severityLabel: string | null;
    severityDimension: string | null;
  };
  generatedAt: string;
  recordCount: number;
  truncated: boolean;
  statusDrillParam: string | null;
  hasClosureData: boolean;
  hasTargetDates: boolean;
  /**
   * What this flow's Open tile actually counts. Flows disagree about what
   * "open" means — an ACTIVE environmental aspect is in force, not
   * outstanding — and a bare "Open: 0" against 16 records reads as the
   * opposite of the truth unless the tile says what it counted.
   */
  openMeaning: string;
  summary: {
    total: number;
    open: number;
    closed: number;
    /**
     * The Open tile's comparator: the same backlog one window earlier,
     * reconstructed from dates because status carries no history. `null` where
     * the population holds no usable date — the UI must then say "no prior
     * period data" rather than print a confident 0.
     */
    openPrior: number | null;
    openDelta: number | null;
    openedInWindow: number;
    closedInWindow: number;
    openedPriorWindow: number;
    closedPriorWindow: number;
    openedDeltaPct: number | null;
    avgDaysToClose: number | null;
    avgDaysToClosePrior: number | null;
    avgDaysToCloseDelta: number | null;
    closureRatePct: number | null;
    closureRatePriorPct: number | null;
  };
  trend: TrendPoint[];
  breakdowns: Breakdown[];
  ageing: { bucket: string; count: number }[];
  sla: {
    overdue: number;
    dueIn7: number;
    openWithoutTarget: number;
    closedOnTime: number;
    closedLate: number;
    onTimeClosurePct: number | null;
  };
  /** Metrics that cannot be computed from the data as it stands. */
  dataQuality: DataQualityFlagDTO[];
  contributors: { id: string; name: string; open: number; total: number; overdue: number }[];
  notes: string | null;
  /**
   * Which of the caller's filters the narrative layer actually honours. The
   * insight engine is shared with the register screens and narrows on plant
   * only — the UI must say so rather than let an unfiltered sentence sit above
   * a filtered chart.
   */
  insightsScope: {
    plant: boolean;
    severity: boolean;
    window: boolean;
    /** Set when the rail was suppressed rather than shown unscoped. */
    suppressedReason: string | null;
    /**
     * False when this flow has NO Tier-1 rule set at all — a coverage gap, not
     * an all-clear. The screen must render that differently from a rule set
     * that ran and found nothing.
     */
    engineAvailable: boolean;
  };
  insights: {
    id: string;
    kind: string;
    severity: string;
    headline: string;
    evidence: string;
    suggestedAction?: string | null;
    confidence: string;
    recordRefs: string[];
    /** Plant the card was computed for; null for an unscoped/portfolio card. */
    siteId: string | null;
  }[];
}

export interface FlowAnalyticsFilters {
  /** Site / facility id. An identity filter: it narrows the population. */
  plant?: string;
  /** Values of the flow's severity dimension. Identity filter. */
  severity?: string[];
  /** Analysis window, in months. Moves the window, NOT the population. */
  months?: number;
  /** Explicit window bounds (ISO dates); override `months` when given. */
  from?: string;
  to?: string;
}

export async function fetchFlowAnalytics(
  flow: string,
  opts: FlowAnalyticsFilters = {}
): Promise<FlowAnalytics> {
  return backendFetch<FlowAnalytics>(`/api/analytics/${flow}`, {
    // `severity` is an array and buildQuery emits it as repeated keys, which is
    // what FastAPI's `list[str] = Query(...)` expects.
    query: {
      plant: opts.plant,
      months: opts.months,
      severity: opts.severity,
      from: opts.from,
      to: opts.to,
    },
  });
}
