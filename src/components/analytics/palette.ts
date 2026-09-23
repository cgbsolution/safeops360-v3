// Analytics colour tokens — validated, not chosen by eye.
//
// Every value below was run through the data-viz validator against this app's
// actual chart surface (#ffffff, the card background), not a generic default:
//
//   series (opened / closed / backlog)  → ALL CHECKS PASS
//       lightness band, chroma floor, CVD separation (worst adjacent ΔE 8.4
//       protan), normal-vision floor (21.6), contrast ≥ 3:1 on white.
//   ageing ramp (--ordinal)             → ALL CHECKS PASS
//       monotone light→dark, adjacent ΔL ≥ 0.06, light end 2.11:1, single hue.
//
// The first aqua candidate (#1baf7a) failed contrast on white at 2.82:1 and was
// replaced with #199e70 rather than shipped with a caveat.
//
// Worst-case CVD separation sits just above the ≥8 target and tritan is 5.5, so
// colour never carries identity alone here: the trend uses two different MARK
// FORMS (bars for opened/closed, a line for backlog) plus a legend plus direct
// labels, which is the secondary encoding that band requires.

/** Categorical series, in fixed slot order. Never cycled, never reassigned by rank. */
export const SERIES = {
  opened: "#2a78d6",  // blue   — slot 1
  closed: "#199e70",  // green  — slot 2
  backlog: "#eb6834", // orange — slot 3
} as const;

/**
 * Ordinal ramp for open-record age. One hue, light→dark, because age is an
 * ordered magnitude — not four unrelated categories.
 */
export const AGE_RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#184f95"] as const;

/**
 * Status palette — reserved. Never reused as "series 4".
 *
 * Severity/risk bands are a status scale, not an identity scale, so they get
 * these fixed steps rather than categorical hues. `warning` and `serious` sit
 * below 3:1 on a light surface by design; every bar that uses them carries a
 * visible text label and value, which is the required mitigation — colour never
 * carries the meaning alone.
 */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

/** Single hue for identity breakdowns (category / type / area / plant). */
export const NEUTRAL_BAR = "#2a78d6";

/** Recessive chrome. */
export const CHROME = {
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
} as const;

/**
 * Severity-ish value → status step. Returns null for anything unrecognised, so
 * a dimension that is not a severity scale falls back to the single-hue bar
 * rather than being mis-coloured as though it were one.
 */
export function severityColor(key: string): string | null {
  switch (key.toUpperCase()) {
    case "CRITICAL":
    case "URGENT":
    case "SIGNIFICANT":
      return STATUS.critical;
    case "HIGH":
    case "MAJOR":
      return STATUS.serious;
    case "MEDIUM":
    case "MODERATE":
      return STATUS.warning;
    case "LOW":
    case "MINOR":
      return STATUS.good;
    default:
      return null;
  }
}

/** Dimensions whose values are a severity/risk scale rather than identities. */
export const SEVERITY_DIMENSIONS = new Set([
  "severity",
  "potentialSeverity",
  "riskLevel",
  "priority",
  "residualRiskLevel",
  "initialRiskLevel",
  "residualBand",
  "inherentBand",
  "overallResidualRisk",
  "initialImpactLevel",
  "residualImpactLevel",
  "classification",
]);
