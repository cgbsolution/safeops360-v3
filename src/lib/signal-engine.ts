// Signal Engine ("SafeOps Signal") — frontend contract + tolerant server fetch.
//
// Mirrors app/schemas/signal_engine.py. Named `EngineSignal` rather than
// `Signal` because `@/lib/insights` already exports a `Signal` — that one is a
// row-level chip on a list screen, this one is a cross-module finding with
// evidence and a lifecycle. Keeping the names distinct stops one silently
// standing in for the other in an import.

import { backendFetch } from "@/lib/backend/fetch";

export type SignalSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type SignalStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "ACTIONED"
  | "DISMISSED"
  | "EXPIRED";
export type SignalCategory =
  | "LEADING_INDICATOR"
  | "LAGGING_PATTERN"
  | "COMPLIANCE_GAP"
  | "OPERATIONAL_RISK"
  | "DATA_QUALITY";

export interface SignalEvidence {
  id: string;
  sourceModule: string;
  sourceRecordId: string;
  sourceRecordRef?: string | null;
  weight: number;
  snapshotJson?: Record<string, unknown> | null;
}

/** The KIND of computation behind a signal, as distinct from its category. */
export type SignalRuleClass = "CORRELATION" | "STATISTICAL" | "DATA_QUALITY";

export interface EngineSignal {
  id: string;
  ruleCode: string;
  ruleName?: string | null;
  ruleClass?: SignalRuleClass | null;
  signalKey: string;
  severity: SignalSeverity;
  status: SignalStatus;
  category: SignalCategory;
  confidence: number;
  siteId?: string | null;
  siteName?: string | null;
  areaId?: string | null;
  /** Always present — the deterministic narrative, and the default view. */
  narrativeTemplate: string;
  /** Optional LLM rewrite (Stream 5). Never authoritative, never the default. */
  narrativeLLM?: string | null;
  recommendedAction: string;
  windowStart: string;
  windowEnd: string;
  computedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  expiresAt?: string | null;
  thresholdSnapshot?: Record<string, unknown> | null;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  dismissedReason?: string | null;
  linkedCapaId?: string | null;
  linkedTrainingId?: string | null;
  evidenceCount: number;
  evidence: SignalEvidence[];
}

export interface SignalListResponse {
  signals: EngineSignal[];
  total: number;
  limit: number;
  offset: number;
}

export interface SignalRule {
  id: string;
  code: string;
  name: string;
  description: string;
  category: SignalCategory;
  ruleClass: SignalRuleClass;
  defaultSeverity: SignalSeverity;
  sourceModules?: string[] | null;
  windowDays: number;
  defaultThresholds?: Record<string, unknown> | null;
  enabled: boolean;
  effectiveEnabled: boolean;
  effectiveThresholds?: Record<string, unknown> | null;
  severityOverride?: SignalSeverity | null;
  openSignals: number;
  implemented: boolean;
}

export interface SignalRun {
  id: string;
  runType: string;
  triggerEvent?: string | null;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  rulesRun: number;
  signalsEmitted: number;
  signalsUpdated: number;
  signalsExpired: number;
  errorCount: number;
  errorDetail?: Record<string, unknown> | null;
  ruleDetail?: Record<string, unknown> | null;
}

export interface SignalSummary {
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  byModule: Record<string, number>;
  byRuleClass: Record<string, number>;
  openTotal: number;
}

export interface SignalQuery {
  category?: SignalCategory[];
  status?: SignalStatus[];
  severity?: SignalSeverity[];
  ruleClass?: SignalRuleClass[];
  /** Signals whose rule READS this module — the related-signals lookup. */
  module?: string;
  site?: string;
  rule?: string;
  limit?: number;
  offset?: number;
}

/**
 * Server-side fetch for the admin panel.
 *
 * Deliberately NOT tolerant, unlike `fetchInsights`. A list screen that loses
 * its insight bar still shows its records, so swallowing the error there is
 * right. Here the signals ARE the page: degrading to an empty list would
 * render "no data-quality issues" — the single most misleading thing this
 * screen could say, on a panel whose entire job is to notice silence.
 */
export async function fetchSignals(params: SignalQuery): Promise<SignalListResponse> {
  return backendFetch<SignalListResponse>("/api/signals", {
    query: {
      category: params.category,
      status: params.status,
      severity: params.severity,
      ruleClass: params.ruleClass,
      module: params.module,
      site: params.site,
      rule: params.rule,
      limit: params.limit,
      offset: params.offset,
    },
  });
}

export async function fetchSignalSummary(): Promise<SignalSummary> {
  return backendFetch<SignalSummary>("/api/signals/summary");
}

/**
 * Signals related to one module, for the Analytics Screen Contract's
 * `InsightRail` related-signals slot.
 *
 * TOLERANT, unlike `fetchSignals`. This one hangs off the side of a screen that
 * is complete without it, so a Signal Engine outage must degrade to "no related
 * signals" rather than take down an analytics page that has its own data. The
 * opposite call is right on the dashboard, where the signals ARE the page.
 */
export async function fetchModuleSignals(
  module: string,
  opts: { limit?: number; severity?: SignalSeverity[] } = {}
): Promise<EngineSignal[]> {
  try {
    const res = await backendFetch<SignalListResponse>("/api/signals", {
      query: {
        module,
        status: ["OPEN", "ACKNOWLEDGED"],
        severity: opts.severity,
        limit: opts.limit ?? 5,
      },
    });
    return res.signals ?? [];
  } catch {
    return [];
  }
}

export async function fetchSignalRules(): Promise<SignalRule[]> {
  return backendFetch<SignalRule[]>("/api/signal-rules");
}

export async function fetchSignalRuns(limit = 15): Promise<SignalRun[]> {
  return backendFetch<SignalRun[]>("/api/signal-runs", { query: { limit } });
}
