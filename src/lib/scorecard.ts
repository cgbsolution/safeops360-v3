// EHS Scorecard — frontend contract + server fetch.
//
// Mirrors app/services/scorecard/payload.py. The dashboard, the PDF and the
// PPTX all render this same shape; the two exports are produced by the backend
// from the identical call, so a deck cannot disagree with the screen.

import { backendFetch } from "@/lib/backend/fetch";

export type Grain = "month" | "quarter";
export type IndicatorUnit = "count" | "pct" | "rate" | "score";
export type Band = "leading" | "lagging";

export interface ScorecardIndicator {
  key: string;
  label: string;
  unit: IndicatorUnit;
  band: Band;
  /**
   * Which way is better. `neutral` is used deliberately — a rise in near-miss
   * reporting is usually better reporting rather than more hazard, and painting
   * it red teaches sites to report less.
   */
  goodDirection: "up" | "down" | "neutral";
  note: string;
  numerator: string | null;
  denominator: string | null;
}

/** One computed cell — a period, or a site within a period. */
export interface ScorecardCell {
  period?: string;
  siteId?: string;
  siteName?: string;
  rowCount?: number;
  gaps?: { indicator: string; reason: string }[];
  [key: string]: unknown;
}

export interface SourceCoverage {
  plantMonths: number;
  plantMonthsWithExposure: number;
  exposurePct: number | null;
  firstPeriod: string | null;
  lastPeriod: string | null;
  /** Exposure usually stops earlier than activity — every rate depends on it. */
  lastPeriodWithExposure: string | null;
}

export interface ScorecardPayload {
  tenant: string;
  site: string | null;
  siteName: string | null;
  grain: Grain;
  periods: string[];
  generatedAt: string;
  indicators: ScorecardIndicator[];
  series: ScorecardCell[];
  current: ScorecardCell | null;
  prior: ScorecardCell | null;
  bySite: ScorecardCell[];
  sites: { value: string; label: string }[];
  gaps: { indicator: string; reason: string }[];
  sourceCoverage: SourceCoverage | null;
  empty: boolean;
  message: string | null;
}

export interface ScorecardQuery {
  site?: string;
  grain?: Grain;
  periods?: number;
}

/**
 * Server fetch. Deliberately NOT tolerant: the indicators ARE this page, and an
 * empty scorecard would state "no safety activity", which is a claim about the
 * business rather than a rendering detail.
 */
export async function fetchScorecard(q: ScorecardQuery = {}): Promise<ScorecardPayload> {
  return backendFetch<ScorecardPayload>("/api/scorecard", {
    query: { site: q.site, grain: q.grain, periods: q.periods },
  });
}

/** How many stored periods a window of months covers, at the selected grain. */
export function periodsForWindow(months: number, grain: Grain): number {
  return grain === "quarter" ? Math.max(1, Math.ceil(months / 3)) : months;
}

export function formatIndicator(value: unknown, unit: IndicatorUnit): string {
  // An em dash, never a zero: "not measurable" and "none" are opposite facts.
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  if (unit === "pct") return `${n}%`;
  if (unit === "rate" || unit === "score") return `${n}`;
  return n.toLocaleString("en-IN");
}
