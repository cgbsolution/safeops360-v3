// Frequency rates — one definition, mirroring app/services/frequency_rates.py.
//
// Two implementations of one metric is the bug this file closes, so having a
// second file at all needs justifying: the Python module serves the EHS Scorecard
// rollup, the BRSR mapping and the ERM KRI feed; this one serves the Manhours KPI
// engine and the configurable-dashboard widgets, which run in the Next.js process
// over Prisma and cannot call into FastAPI per tile. They are kept in lockstep by
// `scripts/test-frequency-rates.ts`, which asserts the same golden vectors the
// pytest suite asserts. Change one, change both, or that test fails.
//
// The three rules, unchanged from the Python docstring:
//
//   1. A missing denominator is `null`, never `0`. "0 injuries over 0 hours" is
//      not a zero-injury period, it is an unmeasured one, and `0.00` on a
//      lower-is-better rate bands as WORLD CLASS — the single most misleading
//      value the tile can display. This is exactly what Manhours Performance did:
//      `denominator > 0 ? … : 0`, then `determineBand(0)`.
//
//   2. The base belongs to the rate, not to the caller. LTIFR / TRIFR / IFR /
//      severity rate are per 1,000,000 hours (IS 3786:1983, ILO). TRIR and DART
//      are per 200,000 hours (OSHA 29 CFR 1904).
//
//   3. Never average rates. Combining months or sites means summing numerators
//      and summing exposure, then dividing once.
//
// Canonical source: the `Manhours` monthly return — `employeeHours +
// contractorHours` for exposure, and its own `ltiCount` / `mtcCount` / `rwcCount`
// / `facCount` / `fatalityCount` / `lostDays` for the numerators. A LOCKED
// `ManhoursSubmission` supersedes the return for its own month (that is the
// migration direction), but only when it actually carries hours — see
// `resolveExposure` in kpi-engine.ts for why that guard exists.

/** Per million person-hours: IS 3786:1983 (India) and the ILO convention. */
export const BASE_PER_MILLION = 1_000_000;
/** Per 200,000 person-hours: OSHA 29 CFR 1904 — 100 FTEs at 40h × 50 weeks. */
export const BASE_OSHA = 200_000;

/** The base each named rate is published on. Read-only; see rule 2. */
export const RATE_BASES = {
  ltifr: BASE_PER_MILLION,
  trifr: BASE_PER_MILLION,
  ifr: BASE_PER_MILLION,
  severityRate: BASE_PER_MILLION,
  trir: BASE_OSHA,
  dartRate: BASE_OSHA
} as const;

/** Days charged for a fatality when computing severity rate (IS 3786:1983). */
export const FATALITY_DAYS_CHARGED = 6_000;

const PRECISION = 4;

function round(v: number): number {
  const f = 10 ** PRECISION;
  return Math.round(v * f) / f;
}

/** The injury counts a period reports, as the canonical `Manhours` return
 *  records them. Every field is a count of cases except `lostDays`. */
export interface InjuryCounts {
  lti: number;
  mtc: number;
  rwc: number;
  firstAid: number;
  fatalities: number;
  lostDays: number;
}

export const NO_INJURIES: InjuryCounts = {
  lti: 0,
  mtc: 0,
  rwc: 0,
  firstAid: 0,
  fatalities: 0,
  lostDays: 0
};

/** `numerator × base ÷ exposureHours`, or `null` when there is no exposure.
 *
 *  Prefer the named rates below — they carry the correct base. This is exported
 *  for the rates the platform does not name (near-miss and observation reporting
 *  rates, which share the denominator but not the numerator). */
export function rate(
  numerator: number | null | undefined,
  exposureHours: number | null | undefined,
  base: number
): number | null {
  if (exposureHours == null || exposureHours <= 0) return null;
  return round(((numerator ?? 0) * base) / exposureHours);
}

/** A percentage, or `null` when nothing was counted. "0 of 0" is not "0%".
 *
 *  A tile reading 0% where nothing was scheduled is indistinguishable from total
 *  failure, and it is the reading that will always be acted on wrongly. */
export function pct(
  numerator: number | null | undefined,
  denominator: number | null | undefined
): number | null {
  if (denominator == null || denominator <= 0) return null;
  return Math.round(((numerator ?? 0) / denominator) * 1000) / 10;
}

const recordable = (c: InjuryCounts) => c.lti + c.mtc + c.rwc + c.fatalities;

/** Lost Time Injury Frequency Rate — per million hours (IS 3786:1983).
 *  Fatalities ARE lost-time injuries and are counted. */
export function ltifr(counts: InjuryCounts, exposureHours: number | null): number | null {
  return rate(counts.lti + counts.fatalities, exposureHours, RATE_BASES.ltifr);
}

/** Total Recordable Injury Frequency Rate — per million hours. First-aid cases
 *  excluded per OSHA recordability; `ifr` is the inclusive variant. */
export function trifr(counts: InjuryCounts, exposureHours: number | null): number | null {
  return rate(recordable(counts), exposureHours, RATE_BASES.trifr);
}

/** Total Recordable Incident Rate — the same numerator as `trifr`, on the OSHA
 *  200,000-hour base. Two names for one count on two bases. */
export function trir(counts: InjuryCounts, exposureHours: number | null): number | null {
  return rate(recordable(counts), exposureHours, RATE_BASES.trir);
}

/** Injury Frequency Rate — all personal injuries, first-aid inclusive, per
 *  million hours. What Indian industry reports as "IFR". */
export function ifr(counts: InjuryCounts, exposureHours: number | null): number | null {
  return rate(recordable(counts) + counts.firstAid, exposureHours, RATE_BASES.ifr);
}

/** Days Away, Restricted or Transferred rate — per 200,000 hours (OSHA). An MTC
 *  involves neither days away nor restriction, so it is not a DART case. */
export function dartRate(counts: InjuryCounts, exposureHours: number | null): number | null {
  return rate(counts.lti + counts.rwc + counts.fatalities, exposureHours, RATE_BASES.dartRate);
}

/** Severity Rate — days lost per million hours, each fatality charged at
 *  `FATALITY_DAYS_CHARGED` days (IS 3786:1983). */
export function severityRate(counts: InjuryCounts, exposureHours: number | null): number | null {
  const charged = counts.lostDays + counts.fatalities * FATALITY_DAYS_CHARGED;
  return rate(charged, exposureHours, RATE_BASES.severityRate);
}

/** Frequency-Severity Index — √((LTIFR × Severity Rate) ÷ 1000), IS 3786.
 *  `null` in, `null` out: a derived index over an unmeasured input is not zero. */
export function fsi(ltifrValue: number | null, severityRateValue: number | null): number | null {
  if (ltifrValue == null || severityRateValue == null) return null;
  const product = ltifrValue * severityRateValue;
  if (product <= 0) return 0;
  return round(Math.sqrt(product / 1000));
}

/** Sum injury counts across periods or sites. Rule 3: this is what gets combined,
 *  never the rates themselves. */
export function sumCounts(parts: InjuryCounts[]): InjuryCounts {
  return parts.reduce<InjuryCounts>(
    (a, c) => ({
      lti: a.lti + c.lti,
      mtc: a.mtc + c.mtc,
      rwc: a.rwc + c.rwc,
      firstAid: a.firstAid + c.firstAid,
      fatalities: a.fatalities + c.fatalities,
      lostDays: a.lostDays + c.lostDays
    }),
    { ...NO_INJURIES }
  );
}
