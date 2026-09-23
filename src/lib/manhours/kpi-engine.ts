// ─────────────────────────────────────────────────────────────────────
//  KPI Computation Engine
//
//  Every safety KPI rendered anywhere in the platform flows through
//  this class. Formulas live in ./kpi-registry; this file is the only
//  place that translates registry entries into Prisma queries and
//  numerical results.
//
//  Design notes:
//    • Dependency-injected PrismaClient → testable from scripts +
//      reusable inside Next server components without coupling to a
//      singleton path alias.
//    • Snapshot-at-lock: KpiResult is the canonical shape stored in
//      ManhoursSubmission.kpiSnapshot at lock-time (Commit 3). Future
//      re-renders read the snapshot — they do NOT re-run the engine.
//    • Net vs gross hours: prefers ManhoursSubmission.netExposureHours.
//      Falls back to legacy `Manhours.employeeHours + contractorHours`
//      (gross) when no submission exists for the period, and flags
//      `fellBackToLegacyGrossHours: true` so callers can warn. This
//      bridge dies when C6 backfills submissions for every month.
//    • Scope is plantId-only in Commit 1. Department + contractor
//      scope land in Commit 4.
// ─────────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import * as rates from "./frequency-rates";
import type { InjuryCounts } from "./frequency-rates";
import {
  KPI_REGISTRY,
  type KpiCode,
  type KpiDefinition,
  type KpiBand,
  type KpiSource
} from "./kpi-registry";

// ─── Public I/O types ──────────────────────────────────────────────

export interface KpiScope {
  /** Single-plant scope. Omit for company-wide. */
  plantId?: string;
  /** Reserved for Commit 4. Engine throws if set. */
  departmentId?: string;
  /** Reserved for Commit 4. Engine throws if set. */
  contractorCompanyId?: string;
}

export interface KpiPeriod {
  year: number;
  /** 1-12. Required for monthly, optional anchor for rolling/YTD. */
  month?: number;
  quarter?: 1 | 2 | 3 | 4;
  /** Year-to-date: Jan 1 → end of `month` (or now). */
  isYTD?: boolean;
  /** Rolling 12 months ending at end of `month` (or now). */
  isRolling12?: boolean;
  customStart?: Date;
  /** Exclusive. */
  customEnd?: Date;
}

export interface KpiPeriodBounds {
  start: Date;
  /** Exclusive upper bound. */
  end: Date;
  label: string;
}

export interface KpiAuditTrail {
  /** Source-record IDs that contributed to the numerator. Used by
   *  drill-down UI (Commit 4) and audit exports. */
  sourceRecordIds: string[];
  /** ManhoursSubmission.ids that refined the denominator. Only LOCKED
   *  submissions carrying real hours appear here — see resolveExposure. */
  manhoursSubmissionIds: string[];
  /** Manhours monthly-return ids that supplied the canonical exposure and the
   *  injury counts. */
  manhoursReturnIds: string[];
  /** Where the denominator came from, in the reader's words. Rendered in the
   *  drill-down so "why is this number what it is" never needs a code read. */
  exposureBasis: string;
  /** True when no ManhoursSubmission existed for the period and the
   *  engine fell back to legacy Manhours gross-hour rows. */
  fellBackToLegacyGrossHours: boolean;
}

export interface KpiResult {
  kpiCode: KpiCode;
  kpiName: string;
  /** `null` when the KPI could not be computed for this scope and period —
   *  read `unavailableReason` for why.
   *
   *  Nullable on purpose, and the most load-bearing line in this file. It used to
   *  be `number`, so a rate with no exposure denominator had nowhere to go but
   *  `0` — and `0` on a lower-is-better rate bands as WORLD_CLASS. Manhours
   *  Performance showed `LTIFR 0.00 · World Class` beside its own pyramid
   *  counting 3 LTIs, for a plant with 1.76M hours of submitted exposure. The
   *  type is what stops that returning: every consumer now has to decide what to
   *  render for "not measurable", and the compiler will not let one be forgotten.
   *  Never coalesce this to 0. */
  value: number | null;
  formattedValue: string;
  /** Why `value` is null; null when `value` is present. */
  unavailableReason: string | null;
  numerator: number;
  denominator: number;
  formula: string;
  band: KpiBand | null;
  bandColor: string;
  higherIsBetter: boolean;
  benchmarks?: KpiDefinition["benchmarks"];
  period: KpiPeriodBounds;
  scope: KpiScope;
  computedAt: Date;
  audit: KpiAuditTrail;
}

/** What the canonical `Manhours` monthly returns say about a scope and period. */
interface ExposureResolution {
  /** Summed exposure hours, or `null` when the period was never measured. */
  hours: number | null;
  /** Summed injury counts from those same returns, or `null` when no return
   *  exists — an injury-based rate needs both halves from one source. */
  counts: InjuryCounts | null;
  reason: string | null;
  basis: string;
  submissionIds: string[];
  returnIds: string[];
  fellBackToLegacyGrossHours: boolean;
}

export interface KpiEngineOptions {
  /** Fiscal year start month (1-12). Default 4 (Indian fiscal — April). */
  fiscalYearStartMonth?: number;
  /** Days charged per fatality per IS 3786. */
  fatalityDaysCharged?: number;
}

// ─── Engine ────────────────────────────────────────────────────────

/** Band palette — same colours regardless of higherIsBetter direction.
 *  The `band` field already encodes whether the score is good or bad,
 *  so we just need a consistent visual mapping. */
const BAND_COLOR: Record<KpiBand, string> = {
  WORLD_CLASS: "#10b981", // emerald
  EXCELLENT: "#84cc16",   // lime
  AVERAGE: "#f59e0b",     // amber
  POOR: "#ef4444"         // rose
};

/** Maps source identifiers to the date column the engine uses for
 *  period filtering. Keeping this in one place avoids per-KPI
 *  configuration. */
const SOURCE_DATE_FIELD: Record<KpiSource, string> = {
  incident: "occurredAt",
  nearMiss: "date",
  observation: "date",
  permit: "createdAt",
  trainingRecord: "date",
  inspection: "scheduledDate",
  manhoursSubmission: "reportingPeriodStart"
};

/** Some sources don't always populate the preferred date column. Engine
 *  uses these fallbacks before giving up. */
const SOURCE_DATE_FALLBACK: Partial<Record<KpiSource, string>> = {
  incident: "date" // legacy rows pre-refactor only have `date`
};

/** Column used for ORDER BY in DAYS_SINCE queries. Must be always-
 *  populated (no nulls) for correct ordering. For Incident we use
 *  `date` (required column) rather than `occurredAt` (nullable). */
const SOURCE_ORDER_FIELD: Record<KpiSource, string> = {
  incident: "date",
  nearMiss: "date",
  observation: "date",
  permit: "createdAt",
  trainingRecord: "date",
  inspection: "scheduledDate",
  manhoursSubmission: "reportingPeriodStart"
};

/** Sources whose schema has a direct `departmentId` column. The engine
 *  uses this to gate department-scope queries — sources marked false
 *  cause applyScope to throw. */
const SOURCE_SUPPORTS_DEPARTMENT: Record<KpiSource, boolean> = {
  incident: true,
  nearMiss: true,
  observation: false,
  permit: true,
  trainingRecord: false,
  inspection: false,
  manhoursSubmission: false
};

/** The rates whose numerator AND denominator both come from the canonical
 *  `Manhours` monthly return. Each entry is the one shared function from
 *  ./frequency-rates — the base travels with the rate, so no call site can pick
 *  the wrong one (LTIFR per million, TRIR per 200,000, and so on). */
const CANONICAL_RATE_FNS: Partial<
  Record<KpiCode, (counts: InjuryCounts, hours: number) => number | null>
> = {
  LTIFR: rates.ltifr,
  TRIFR: rates.trifr,
  TRIR: rates.trir,
  IFR: rates.ifr,
  DART_RATE: rates.dartRate,
  SEVERITY_RATE: rates.severityRate
};

/** The case count each canonical rate divides, for the drill-down's "numerator"
 *  row. Kept beside the rate functions so the two cannot describe different
 *  things. */
const CANONICAL_RATE_NUMERATORS: Record<string, (c: InjuryCounts) => number> = {
  LTIFR: (c) => c.lti + c.fatalities,
  TRIFR: (c) => c.lti + c.mtc + c.rwc + c.fatalities,
  TRIR: (c) => c.lti + c.mtc + c.rwc + c.fatalities,
  IFR: (c) => c.lti + c.mtc + c.rwc + c.firstAid + c.fatalities,
  DART_RATE: (c) => c.lti + c.rwc + c.fatalities,
  SEVERITY_RATE: (c) => c.lostDays + c.fatalities * rates.FATALITY_DAYS_CHARGED
};

/** Period-over-period change, or `null` when there is nothing to compare.
 *
 *  Three screens had their own inline copy of this expression, and all three read
 *  `((cur.value - prior.value) / Math.abs(prior.value)) * 100` with both operands
 *  typed non-null. A delta between a real value and an unmeasured one is an
 *  invented comparison, and the arrow it draws is the part of a KPI tile a reader
 *  trusts most. Null in, null out. */
export function percentDelta(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

export class KpiEngine {
  private readonly fyStartMonth: number;
  private readonly fatalityDaysCharged: number;

  constructor(
    private readonly prisma: PrismaClient,
    options: KpiEngineOptions = {}
  ) {
    this.fyStartMonth = options.fiscalYearStartMonth ?? 4;
    this.fatalityDaysCharged = options.fatalityDaysCharged ?? 6000;
  }

  // ── Public entry points ─────────────────────────────────────────

  async computeKpi(code: KpiCode, scope: KpiScope, period: KpiPeriod): Promise<KpiResult> {
    const def = KPI_REGISTRY[code];
    if (!def) throw new Error(`Unknown KPI code: ${code}`);

    const bounds = this.resolvePeriodBounds(period);
    const emptyAudit = {
      sourceRecordIds: [],
      manhoursSubmissionIds: [],
      manhoursReturnIds: [],
      exposureBasis: "not applicable — this KPI has no exposure denominator",
      fellBackToLegacyGrossHours: false
    };

    // Derived KPIs short-circuit and don't compute a denominator.
    if (def.numerator.kind === "DERIVED") {
      const d = await this.computeDerived(def, scope, period);
      return this.buildResult(def, scope, bounds, d.value, d.value ?? 0, 0, emptyAudit, d.reason);
    }

    // ── Rates ────────────────────────────────────────────────────
    // The denominator is resolved FIRST and the whole computation abandoned when
    // the period was never measured. This ordering is the fix: the old code
    // computed a numerator, found no denominator, and quietly substituted 0 for
    // the rate. There is no numerator worth having without exposure to divide it
    // by, and no honest number to print.
    if (def.denominator.kind === "EXPOSURE_HOURS") {
      const exposure = await this.resolveExposure(scope, bounds);
      const audit = {
        sourceRecordIds: [],
        manhoursSubmissionIds: exposure.submissionIds,
        manhoursReturnIds: exposure.returnIds,
        exposureBasis: exposure.basis,
        fellBackToLegacyGrossHours: exposure.fellBackToLegacyGrossHours
      };
      if (exposure.hours == null) {
        return this.buildResult(def, scope, bounds, null, 0, 0, audit, exposure.reason);
      }

      // Injury-based rates take BOTH halves from the canonical Manhours return:
      // its own reported counts over its own reported hours. Mixing an Incident-
      // register numerator with a Manhours denominator is how the same metric came
      // to differ between this page and the EHS Scorecard.
      const canonical = CANONICAL_RATE_FNS[def.code];
      if (canonical) {
        if (exposure.counts == null) {
          return this.buildResult(
            def, scope, bounds, null, 0, exposure.hours, audit,
            "no manhours return was submitted for this period, so the reported " +
              "injury counts this rate divides are unknown — this is missing data, " +
              "not a zero-injury period"
          );
        }
        const value = canonical(exposure.counts, exposure.hours);
        return this.buildResult(
          def, scope, bounds, value,
          CANONICAL_RATE_NUMERATORS[def.code](exposure.counts),
          exposure.hours,
          { ...audit, sourceRecordIds: exposure.returnIds },
          value == null ? "no exposure hours were reported for this period" : null
        );
      }

      // Reporting rates (near miss, observation): their own numerator over the
      // same canonical denominator.
      const { numerator, sourceRecordIds } = await this.computeNumerator(def, scope, bounds);
      const value = rates.rate(numerator ?? 0, exposure.hours, def.multiplier);
      return this.buildResult(
        def, scope, bounds, value, numerator ?? 0, exposure.hours,
        { ...audit, sourceRecordIds },
        value == null ? "no exposure hours were reported for this period" : null
      );
    }

    // ── Everything else: streak / percentage / cost. The numerator IS the value.
    const { numerator, sourceRecordIds } = await this.computeNumerator(def, scope, bounds);
    if (numerator == null) {
      // A percentage over an empty denominator. "0 of 0" is not "0%" — it is the
      // reading that gets acted on wrongly every time.
      return this.buildResult(
        def, scope, bounds, null, 0, 0, { ...emptyAudit, sourceRecordIds },
        "nothing was counted in this period, so this percentage has no denominator"
      );
    }
    return this.buildResult(
      def, scope, bounds, numerator * def.multiplier, numerator, 0,
      { ...emptyAudit, sourceRecordIds }, null
    );
  }

  /** Compute many KPIs for the same scope+period. Runs them in
   *  parallel — be mindful of Prisma connection_limit=1 in production;
   *  the queries will serialise inside the single connection. */
  async computeKpiBatch(
    codes: readonly KpiCode[],
    scope: KpiScope,
    period: KpiPeriod
  ): Promise<Record<string, KpiResult>> {
    const results = await Promise.all(codes.map((c) => this.computeKpi(c, scope, period)));
    const out: Record<string, KpiResult> = {};
    for (let i = 0; i < codes.length; i++) out[codes[i]] = results[i];
    return out;
  }

  /** Compute the prior-period KPI value and return it as a trend tuple
   *  the UI can render directly. Supports monthly + rolling-12 periods
   *  (the two common dashboard shapes); other period kinds throw —
   *  caller catches and skips the trend chip. */
  async computeTrend(
    code: KpiCode,
    currentValue: number | null,
    scope: KpiScope,
    period: KpiPeriod
  ): Promise<{
    direction: "UP" | "DOWN" | "FLAT";
    percentChange: number | null;
    priorValue: number | null;
    priorPeriodLabel: string;
  } | null> {
    const priorPeriod = this.shiftPeriodBackward(period);
    if (!priorPeriod) {
      throw new Error("Trend supports monthly and rolling-12 periods only.");
    }
    const prior = await this.computeKpi(code, scope, priorPeriod);
    const priorValue = prior.value;
    // No trend across an unmeasured period. A "0% change" or a computed arrow
    // between a real value and a missing one is an invented comparison, and the
    // arrow is the part a reader trusts most.
    if (currentValue == null || priorValue == null) return null;
    const def = KPI_REGISTRY[code];
    const flatThresholdPct = def.isPercentage ? 0.5 : 5; // 0.5pp / 5% relative

    let direction: "UP" | "DOWN" | "FLAT" = "FLAT";
    let pct: number | null = null;
    if (priorValue === 0 && currentValue === 0) {
      direction = "FLAT";
    } else if (priorValue === 0) {
      direction = currentValue > 0 ? "UP" : "DOWN";
      pct = null;
    } else {
      pct = ((currentValue - priorValue) / Math.abs(priorValue)) * 100;
      if (Math.abs(pct) < flatThresholdPct) direction = "FLAT";
      else direction = pct > 0 ? "UP" : "DOWN";
    }

    return { direction, percentChange: pct, priorValue, priorPeriodLabel: prior.period.label };
  }

  /** Shift a period backward by one unit. Returns null for shapes
   *  the engine doesn't trend (custom range, quarter, year, YTD). */
  private shiftPeriodBackward(period: KpiPeriod): KpiPeriod | null {
    if (period.isRolling12) {
      const anchor = period.month
        ? new Date(period.year, period.month - 1, 1)
        : new Date();
      const prevAnchor = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
      return {
        year: prevAnchor.getFullYear(),
        month: prevAnchor.getMonth() + 1,
        isRolling12: true
      };
    }
    if (period.month && !period.quarter && !period.isYTD && !period.customStart) {
      const prev = new Date(period.year, period.month - 2, 1);
      return { year: prev.getFullYear(), month: prev.getMonth() + 1 };
    }
    return null;
  }

  /** Return the cached KPI value from a LOCKED submission's snapshot.
   *  Returns null when no LOCKED snapshot exists for the
   *  (plantId, year, month) tuple. The drill-down API uses this to
   *  serve the immutable audit trail for historical periods —
   *  re-computation would silently shift numbers if source incidents
   *  were reclassified after lock. */
  async findKpiSnapshot(opts: {
    code: KpiCode;
    plantId: string;
    year: number;
    month: number;
  }): Promise<KpiResult | null> {
    const sub = await this.prisma.manhoursSubmission.findUnique({
      where: {
        plantId_reportingYear_reportingMonth: {
          plantId: opts.plantId,
          reportingYear: opts.year,
          reportingMonth: opts.month
        }
      },
      select: { status: true, kpiSnapshot: true }
    });
    if (!sub || sub.status !== "LOCKED" || !sub.kpiSnapshot) return null;
    const snap = sub.kpiSnapshot as { kpis?: Record<string, KpiResult> };
    return snap.kpis?.[opts.code] ?? null;
  }

  // ── Period resolution ──────────────────────────────────────────

  resolvePeriodBounds(period: KpiPeriod): KpiPeriodBounds {
    if (period.customStart && period.customEnd) {
      return {
        start: period.customStart,
        end: period.customEnd,
        label: `${this.fmtDate(period.customStart)} – ${this.fmtDate(period.customEnd)}`
      };
    }

    if (period.isRolling12) {
      // Anchor at end of given month (exclusive) or now.
      const anchor = period.month
        ? new Date(period.year, period.month, 1)
        : new Date();
      const start = new Date(anchor.getFullYear(), anchor.getMonth() - 12, 1);
      return {
        start,
        end: anchor,
        label: `Rolling 12 (${this.fmtMonth(start)} – ${this.fmtMonth(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))})`
      };
    }

    if (period.isYTD) {
      const start = new Date(period.year, 0, 1);
      const end = period.month ? new Date(period.year, period.month, 1) : new Date();
      return { start, end, label: `YTD ${period.year}` };
    }

    if (period.quarter) {
      // Indian fiscal Q1 = Apr-Jun, Q2 = Jul-Sep, Q3 = Oct-Dec, Q4 = Jan-Mar
      // (configurable via constructor — default fyStartMonth = 4).
      const fyStart0 = this.fyStartMonth - 1; // 0-indexed
      const qStart0 = (fyStart0 + (period.quarter - 1) * 3) % 12;
      // Q4 of FY26 starts Jan 2027 in absolute terms.
      const qYear = qStart0 < fyStart0 ? period.year + 1 : period.year;
      const start = new Date(qYear, qStart0, 1);
      const end = new Date(qYear, qStart0 + 3, 1);
      return { start, end, label: `FY${String(period.year).slice(2)} Q${period.quarter}` };
    }

    if (period.month) {
      const start = new Date(period.year, period.month - 1, 1);
      const end = new Date(period.year, period.month, 1);
      return { start, end, label: this.fmtMonth(start) };
    }

    // Full calendar year
    return {
      start: new Date(period.year, 0, 1),
      end: new Date(period.year + 1, 0, 1),
      label: String(period.year)
    };
  }

  private fmtMonth(d: Date): string {
    return d.toLocaleString("en-IN", { month: "short", year: "numeric" });
  }
  private fmtDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  // ── Numerator dispatch ─────────────────────────────────────────

  private async computeNumerator(
    def: KpiDefinition,
    scope: KpiScope,
    bounds: KpiPeriodBounds
  ): Promise<{ numerator: number | null; sourceRecordIds: string[] }> {
    const n = def.numerator;

    if (n.kind === "MODULE_COUNT") {
      const where = this.buildWhere(n.source, scope, bounds, n.where);
      const rows = await this.findIds(n.source, where);
      return { numerator: rows.length, sourceRecordIds: rows };
    }

    if (n.kind === "MODULE_SUM") {
      const where = this.buildWhere(n.source, scope, bounds, n.where);
      const rows = await (this.prisma as any)[n.source].findMany({
        where,
        select: { id: true, [n.sumField]: true }
      });
      const sum = rows.reduce(
        (s: number, r: Record<string, unknown>) => s + (Number(r[n.sumField]) || 0),
        0
      );
      return { numerator: sum, sourceRecordIds: rows.map((r: { id: string }) => r.id) };
    }

    if (n.kind === "DAYS_SINCE") {
      // No period filter — we want the latest qualifying record across
      // all time, then days since it. Scope still applies (plant filter).
      const baseWhere = { ...(n.where ?? {}) };
      const where = this.applyScope(n.source, scope, baseWhere);

      // Order by the always-populated column so nulls in the preferred
      // (more-precise) column don't push real records out of the way.
      const orderField = SOURCE_ORDER_FIELD[n.source];
      const preferredField = SOURCE_DATE_FIELD[n.source];

      const latest = await (this.prisma as any)[n.source].findFirst({
        where,
        orderBy: { [orderField]: "desc" },
        // Select both fields if they differ — engine uses the preferred
        // one when set (more precise), falls back to order field.
        select:
          orderField === preferredField
            ? { id: true, [orderField]: true }
            : { id: true, [orderField]: true, [preferredField]: true }
      });

      if (!latest) {
        // Sentinel — no qualifying record in history. UI shows ∞.
        // Returning a large number keeps the engine numerical.
        return { numerator: 9999, sourceRecordIds: [] };
      }

      const ref: Date | null = latest[preferredField] ?? latest[orderField] ?? null;
      if (!ref) return { numerator: 9999, sourceRecordIds: [] };
      const days = Math.floor((Date.now() - ref.getTime()) / 86_400_000);
      return { numerator: Math.max(0, days), sourceRecordIds: [latest.id] };
    }

    if (n.kind === "CUSTOM") {
      return this.computeCustomNumerator(n.tag, scope, bounds);
    }

    // DERIVED is handled at the top of computeKpi — should never reach here
    return { numerator: 0, sourceRecordIds: [] };
  }

  // ── CUSTOM numerator handlers ──────────────────────────────────

  private async computeCustomNumerator(
    tag: string,
    scope: KpiScope,
    bounds: KpiPeriodBounds
  ): Promise<{ numerator: number | null; sourceRecordIds: string[] }> {
    switch (tag) {
      case "SEVERITY_NUMERATOR":
        return this.computeSeverityNumerator(scope, bounds);
      case "CAPA_CLOSURE":
        return this.computeCapaClosure(scope, bounds);
      case "TRAINING_COMPLIANCE":
        return this.computeTrainingCompliance(scope, bounds);
      case "INSPECTION_COMPLIANCE":
        return this.computeInspectionCompliance(scope, bounds);
      case "PTW_FLRA_COMPLIANCE":
        return this.computePtwFlraCompliance(scope, bounds);
      case "COST_OF_INCIDENTS":
        return this.computeCostOfIncidents(scope, bounds);
      default:
        throw new Error(`Unknown CUSTOM numerator tag: ${tag}`);
    }
  }

  /** IS 3786 severity: SUM(lostDays for LTI) + 6000 × FATALITY count. */
  private async computeSeverityNumerator(scope: KpiScope, bounds: KpiPeriodBounds) {
    const where = this.buildWhere("incident", scope, bounds, {
      type: { in: ["LTI", "FATALITY"] }
    });
    const incs = await this.prisma.incident.findMany({
      where,
      select: { id: true, type: true, lostDays: true }
    });
    let days = 0;
    for (const i of incs) {
      if (i.type === "FATALITY") days += this.fatalityDaysCharged;
      else days += i.lostDays ?? 0;
    }
    return { numerator: days, sourceRecordIds: incs.map((i) => i.id) };
  }

  /** CAPA on-time closure across NearMissCapa + IncidentCapa +
   *  InspectionFindingCapa. Numerator is the percentage directly;
   *  denominator is NONE in the registry. */
  private async computeCapaClosure(scope: KpiScope, bounds: KpiPeriodBounds) {
    // CAPAs from all three modules. Filter on targetDate within bounds
    // (i.e. CAPAs that were DUE in the period — the right denominator
    // for "closure rate of CAPAs due in this window").
    const dueRange = { gte: bounds.start, lt: bounds.end };

    // Plant scope is filtered on parent record where possible.
    const nmWhere: Record<string, unknown> = { targetDate: dueRange };
    const inWhere: Record<string, unknown> = { targetDate: dueRange };
    const fnWhere: Record<string, unknown> = { dueDate: dueRange };
    if (scope.plantId) {
      nmWhere.nearMiss = { plantId: scope.plantId };
      inWhere.incident = { plantId: scope.plantId };
      fnWhere.finding = { inspection: { plantId: scope.plantId } };
    }

    const [nm, inc, fn] = await Promise.all([
      this.prisma.nearMissCapa.findMany({
        where: nmWhere,
        select: { id: true, status: true, targetDate: true, completedAt: true }
      }),
      this.prisma.incidentCapa.findMany({
        where: inWhere,
        select: { id: true, status: true, targetDate: true, completedAt: true }
      }),
      this.prisma.inspectionFindingCapa.findMany({
        where: fnWhere,
        select: { id: true, status: true, dueDate: true, completedAt: true }
      })
    ]);

    const all = [
      ...nm.map((r) => ({ id: r.id, due: r.targetDate, done: r.completedAt })),
      ...inc.map((r) => ({ id: r.id, due: r.targetDate, done: r.completedAt })),
      ...fn.map((r) => ({ id: r.id, due: r.dueDate, done: r.completedAt }))
    ];
    // No CAPA fell due in this window. A closure rate of 0% would read as total
    // failure to close anything; null reads as "nothing was due", which is what
    // happened. Same rule as the frequency rates -- see ./frequency-rates.
    if (all.length === 0) return { numerator: null, sourceRecordIds: [] };
    const onTime = all.filter((c) => c.done && c.due && c.done <= c.due).length;
    return {
      numerator: (onTime / all.length) * 100,
      sourceRecordIds: all.map((r) => r.id)
    };
  }

  /** % of unique (employee, program) pairs whose LATEST record is
   *  valid + passed. Collapses retakes to the most recent attempt
   *  before counting (mirrors the dashboard's existing logic). */
  private async computeTrainingCompliance(scope: KpiScope, _bounds: KpiPeriodBounds) {
    // Compliance is "as of now", not period-bounded — `validUntil > now`
    // already captures currency. _bounds is accepted for signature
    // uniformity but intentionally unused.
    const where = scope.plantId
      ? { employee: { plantId: scope.plantId } }
      : {};
    const rows = await this.prisma.trainingRecord.findMany({
      where,
      select: { id: true, employeeId: true, programId: true, date: true, passed: true, validUntil: true }
    });
    // Nobody is assigned any training in scope: unknown, not 0% compliant.
    if (rows.length === 0) return { numerator: null, sourceRecordIds: [] };

    type Row = (typeof rows)[number];
    const latestByPair = new Map<string, Row>();
    for (const r of rows) {
      const key = `${r.employeeId}::${r.programId}`;
      const prev = latestByPair.get(key);
      if (!prev || r.date > prev.date) latestByPair.set(key, r);
    }
    const now = new Date();
    let valid = 0;
    const contributing: string[] = [];
    for (const r of latestByPair.values()) {
      contributing.push(r.id);
      if (r.passed && r.validUntil > now) valid++;
    }
    return {
      numerator: (valid / latestByPair.size) * 100,
      sourceRecordIds: contributing
    };
  }

  /** % of inspections in the period that completed on time. */
  private async computeInspectionCompliance(scope: KpiScope, bounds: KpiPeriodBounds) {
    const where: Record<string, unknown> = { scheduledDate: { gte: bounds.start, lt: bounds.end } };
    if (scope.plantId) where.plantId = scope.plantId;
    const rows = await this.prisma.inspection.findMany({
      where,
      select: { id: true, status: true }
    });
    // Nothing was scheduled in this period. 0% would be indistinguishable from
    // "every scheduled inspection was missed" -- the opposite conclusion.
    if (rows.length === 0) return { numerator: null, sourceRecordIds: [] };
    const completed = rows.filter((r) => r.status === "COMPLETED").length;
    return {
      numerator: (completed / rows.length) * 100,
      sourceRecordIds: rows.map((r) => r.id)
    };
  }

  /** % of permits in the period that have a linked FLRA. Should be
   *  100% for any plant with discipline. Anything else is a process
   *  failure that should escalate. */
  private async computePtwFlraCompliance(scope: KpiScope, bounds: KpiPeriodBounds) {
    const permitWhere: Record<string, unknown> = {
      createdAt: { gte: bounds.start, lt: bounds.end }
    };
    if (scope.plantId) permitWhere.plantId = scope.plantId;
    const permits = await this.prisma.permit.findMany({
      where: permitWhere,
      select: { id: true }
    });
    // No permits were raised in this period, so linkage compliance is undefined
    // rather than 0% -- and 0% on this KPI is defined as a process failure.
    if (permits.length === 0) return { numerator: null, sourceRecordIds: [] };
    const permitIds = permits.map((p) => p.id);
    const flrasWithPermits = await this.prisma.fLRA.findMany({
      where: { permitId: { in: permitIds } },
      select: { permitId: true }
    });
    const linkedPermitIds = new Set(flrasWithPermits.map((f) => f.permitId).filter(Boolean) as string[]);
    return {
      numerator: (linkedPermitIds.size / permits.length) * 100,
      sourceRecordIds: permitIds
    };
  }

  /** Sum of Incident.costTotal across the period. */
  private async computeCostOfIncidents(scope: KpiScope, bounds: KpiPeriodBounds) {
    const where = this.buildWhere("incident", scope, bounds, { costTotal: { not: null } });
    const rows = await this.prisma.incident.findMany({
      where,
      select: { id: true, costTotal: true }
    });
    const sum = rows.reduce((s, r) => s + Number(r.costTotal ?? 0), 0);
    return { numerator: sum, sourceRecordIds: rows.map((r) => r.id) };
  }

  // ── Derived KPIs ───────────────────────────────────────────────

  private async computeDerived(
    def: KpiDefinition,
    scope: KpiScope,
    period: KpiPeriod
  ): Promise<{ value: number | null; reason: string | null }> {
    if (def.numerator.kind !== "DERIVED") return { value: null, reason: "not a derived KPI" };

    if (def.numerator.tag === "FSI") {
      // sqrt((LTIFR x Severity Rate) / 1000) per IS 3786.
      //
      // Unavailability propagates. This used to read ltifr.value * sev.value with
      // both sides typed non-null, so a missing denominator upstream arrived here
      // as 0, came out of the square root as 0, and banded as excellent -- a false
      // zero laundered through two more layers of arithmetic.
      const [ltifr, sev] = await Promise.all([
        this.computeKpi("LTIFR", scope, period),
        this.computeKpi("SEVERITY_RATE", scope, period)
      ]);
      const value = rates.fsi(ltifr.value, sev.value);
      return {
        value,
        reason:
          value == null
            ? "FSI is derived from LTIFR and severity rate, and " +
              (ltifr.unavailableReason ?? sev.unavailableReason ?? "one of them could not be computed")
            : null
      };
    }

    if (def.numerator.tag === "HEINRICH_RATIO") {
      // Near Miss : Recordable Incident — uses absolute counts, not
      // rates (rates would cancel out the manhours denominator and
      // give a clean ratio anyway, but counts read better in drill-
      // down so we use them).
      const bounds = this.resolvePeriodBounds(period);
      const nmWhere = this.buildWhere("nearMiss", scope, bounds, {});
      const incWhere = this.buildWhere("incident", scope, bounds, {
        type: { in: ["MTC", "RWC", "LTI", "FATALITY"] }
      });
      const [nmCount, incCount] = await Promise.all([
        this.prisma.nearMiss.count({ where: nmWhere }),
        this.prisma.incident.count({ where: incWhere })
      ]);
      // Unbounded when there are no incidents: the ratio of near misses to
      // nothing is the near-miss count itself, which is the intended reading for a
      // higher-is-better indicator. Null only when neither exists -- there is no
      // reporting culture to describe.
      if (incCount === 0 && nmCount === 0) {
        return {
          value: null,
          reason: "no near misses and no recordable incidents were logged in this period"
        };
      }
      return { value: incCount > 0 ? nmCount / incCount : nmCount, reason: null };
    }

    return { value: null, reason: "unknown derived KPI" };
  }

  // -- Denominator: canonical exposure ---------------------------

  /**
   * The canonical exposure hours AND injury counts for a scope and period.
   *
   * Manhours -- the signed-off monthly return -- is the canonical source for both
   * halves of every injury rate on this platform. The EHS Scorecard reads it,
   * BRSR reads it, the ERM KRI feed reads it, and now so does this engine.
   *
   * Three things this replaces, all of them live on production:
   *
   *   1. The old code took the ManhoursSubmission path whenever ANY submission row
   *      existed in the window (submissions.length > 0) and returned the sum of
   *      their netExposureHours even when that sum was zero. Two DRAFT submissions
   *      at one plant, both with 0 hours, were the only two rows in the entire
   *      table; they shadowed 1.76M hours of real returns at that plant and,
   *      because the plant filter only applies when a plantId is set, zeroed the
   *      denominator for the whole estate as well. The guard is now on the HOURS,
   *      not on the row count.
   *
   *   2. There was no status filter, so DRAFT submissions formed the denominator.
   *      Only LOCKED is authoritative -- which this file already knew elsewhere
   *      (loadKpiFromSnapshot refuses anything else) and disagreed with itself
   *      about here.
   *
   *   3. Missing exposure returned 0. It now returns null with a reason, and
   *      computeKpi refuses to publish a rate at all.
   *
   * A LOCKED submission SUPERSEDES its own plant-month's return hours -- that is
   * the migration direction, and net exposure hours per IS 3786 are the better
   * denominator. It never supersedes the injury counts, because submissions do not
   * carry any.
   *
   * Sub-plant scope (department / contractor) sums matching
   * ManhoursEmployeeCategory rows. Deductions are tracked at submission level
   * (plant-wide), so sub-plant denominators are GROSS hours -- the formula display
   * surfaces this. Those rows carry no injury counts, so injury RATES are not
   * available at sub-plant grain; reporting rates still are.
   */
  private async resolveExposure(
    scope: KpiScope,
    bounds: KpiPeriodBounds
  ): Promise<ExposureResolution> {
    const none = (reason: string, basis: string): ExposureResolution => ({
      hours: null,
      counts: null,
      reason,
      basis,
      submissionIds: [],
      returnIds: [],
      fellBackToLegacyGrossHours: false
    });

    // Sub-plant scope -- the categories table, gross hours, no injury counts.
    if (scope.departmentId || scope.contractorCompanyId) {
      const categoryWhere: Record<string, unknown> = {
        submission: {
          reportingPeriodStart: { gte: bounds.start, lt: bounds.end },
          ...(scope.plantId ? { plantId: scope.plantId } : {})
        },
        ...(scope.departmentId ? { departmentId: scope.departmentId } : {}),
        ...(scope.contractorCompanyId ? { contractorCompanyId: scope.contractorCompanyId } : {})
      };
      const cats = await this.prisma.manhoursEmployeeCategory.findMany({
        where: categoryWhere,
        select: { totalHours: true, submissionId: true }
      });
      const catHours = cats.reduce((sum, r) => sum + (r.totalHours || 0), 0);
      if (catHours <= 0) {
        return none(
          "no manhours were reported for this department or contractor in this period, " +
            "so there is no exposure to divide by -- this is missing data, not zero exposure",
          "no ManhoursEmployeeCategory rows with hours in this period"
        );
      }
      return {
        hours: catHours,
        counts: null,
        reason: null,
        basis:
          "gross hours from " +
          cats.length +
          " manhours category row(s) -- deductions are tracked plant-wide, so this " +
          "denominator is gross, not net",
        submissionIds: Array.from(new Set(cats.map((c) => c.submissionId))),
        returnIds: [],
        fellBackToLegacyGrossHours: false
      };
    }

    // Canonical: the Manhours monthly returns intersecting the window.
    const returnWhere: Record<string, unknown> = this.legacyMonthBoundsWhere(bounds);
    if (scope.plantId) returnWhere.plantId = scope.plantId;
    const returns = await this.prisma.manhours.findMany({
      where: returnWhere,
      select: {
        id: true,
        plantId: true,
        year: true,
        month: true,
        employeeHours: true,
        contractorHours: true,
        ltiCount: true,
        mtcCount: true,
        rwcCount: true,
        facCount: true,
        fatalityCount: true,
        lostDays: true
      }
    });

    // LOCKED submissions refine the hours for their own plant-month.
    const locked = await this.prisma.manhoursSubmission.findMany({
      where: {
        reportingPeriodStart: { gte: bounds.start, lt: bounds.end },
        status: "LOCKED",
        ...(scope.plantId ? { plantId: scope.plantId } : {})
      },
      select: {
        id: true,
        plantId: true,
        reportingYear: true,
        reportingMonth: true,
        netExposureHours: true
      }
    });
    const netByPeriod = new Map<string, { id: string; hours: number }>();
    for (const sub of locked) {
      const netHours = sub.netExposureHours || 0;
      // A locked submission carrying no hours tells us nothing, and must not be
      // allowed to override a return that does carry hours. Defect (1) above, in
      // its narrowest form.
      if (netHours > 0) {
        netByPeriod.set(
          sub.plantId + ":" + sub.reportingYear + ":" + sub.reportingMonth,
          { id: sub.id, hours: netHours }
        );
      }
    }

    if (returns.length === 0 && netByPeriod.size === 0) {
      return none(
        "no manhours were submitted for this site in this period, so LTIFR, TRIR and " +
          "the other frequency rates cannot be computed -- this is missing exposure " +
          "data, not a zero-injury period",
        "no Manhours return and no locked submission in this period"
      );
    }

    let hours = 0;
    const usedSubmissionIds: string[] = [];
    const usedReturnIds: string[] = [];
    const counted: InjuryCounts[] = [];
    const superseded = new Set<string>();

    for (const r of returns) {
      const key = r.plantId + ":" + r.year + ":" + r.month;
      const net = netByPeriod.get(key);
      if (net) {
        hours += net.hours;
        usedSubmissionIds.push(net.id);
        superseded.add(key);
      } else {
        hours += (r.employeeHours || 0) + (r.contractorHours || 0);
      }
      usedReturnIds.push(r.id);
      // Counts always come from the return -- submissions do not carry any.
      counted.push({
        lti: r.ltiCount || 0,
        mtc: r.mtcCount || 0,
        rwc: r.rwcCount || 0,
        firstAid: r.facCount || 0,
        fatalities: r.fatalityCount || 0,
        lostDays: r.lostDays || 0
      });
    }
    // A locked submission for a plant-month with no return still contributes
    // exposure -- it just cannot contribute counts.
    for (const [key, net] of netByPeriod) {
      if (!superseded.has(key)) {
        hours += net.hours;
        usedSubmissionIds.push(net.id);
      }
    }

    if (hours <= 0) {
      return none(
        "the manhours returns for this period record zero exposure hours, so the " +
          "frequency rates have no denominator",
        returns.length + " Manhours return(s) found, all recording zero hours"
      );
    }

    const netCount = usedSubmissionIds.length;
    const hoursLabel = hours.toLocaleString("en-IN");
    const basis =
      netCount > 0
        ? hoursLabel +
          " hours -- net exposure from " +
          netCount +
          " locked submission(s) where available, gross hours from " +
          usedReturnIds.length +
          " Manhours return(s) otherwise"
        : hoursLabel +
          " gross hours from " +
          usedReturnIds.length +
          " Manhours monthly return(s)";

    return {
      hours,
      counts: counted.length > 0 ? rates.sumCounts(counted) : null,
      reason: null,
      basis,
      submissionIds: usedSubmissionIds,
      returnIds: usedReturnIds,
      // No locked submission covered any month, so the denominator is gross hours
      // where IS 3786 asks for net. Surfaced in the drill-down.
      fellBackToLegacyGrossHours: netCount === 0
    };
  }

  /** Build a Prisma where clause that picks legacy Manhours rows
   *  intersecting the date bounds, expressed as a year/month OR list. */
  private legacyMonthBoundsWhere(bounds: KpiPeriodBounds): Record<string, unknown> {
    const months: { year: number; month: number }[] = [];
    const cursor = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), 1);
    while (cursor < bounds.end) {
      months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (months.length === 0) return { id: "__none__" }; // empty match
    return { OR: months };
  }

  // ── Where-clause builders ──────────────────────────────────────

  /** Compose scope + period filters on top of the registry's base
   *  where clause. */
  private buildWhere(
    source: KpiSource,
    scope: KpiScope,
    bounds: KpiPeriodBounds,
    baseWhere?: Record<string, unknown>
  ): Record<string, unknown> {
    const dateField = SOURCE_DATE_FIELD[source];
    const fallbackDate = SOURCE_DATE_FALLBACK[source];

    const periodFilter: Record<string, unknown> = fallbackDate
      ? {
          OR: [
            { [dateField]: { gte: bounds.start, lt: bounds.end } },
            // Legacy rows: dateField is null, only fallback populated
            { AND: [{ [dateField]: null }, { [fallbackDate]: { gte: bounds.start, lt: bounds.end } }] }
          ]
        }
      : { [dateField]: { gte: bounds.start, lt: bounds.end } };

    const where: Record<string, unknown> = { ...periodFilter, ...(baseWhere ?? {}) };
    return this.applyScope(source, scope, where);
  }

  /** Layer scope (plantId / departmentId / contractorCompanyId) onto
   *  a where clause. Throws when a scope dimension isn't applicable
   *  to the source — UI gates the dropdown so this surfaces only on
   *  programmer error. */
  private applyScope(
    source: KpiSource,
    scope: KpiScope,
    where: Record<string, unknown>
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...where };

    if (scope.plantId) {
      // Every source that goes through the standard buildWhere has a
      // direct plantId column.
      out.plantId = scope.plantId;
    }

    if (scope.departmentId) {
      const supports = SOURCE_SUPPORTS_DEPARTMENT[source];
      if (!supports) {
        throw new Error(
          `Department scope is not supported for source "${source}". ` +
            `Models without a departmentId column: observation, inspection, manhoursSubmission.`
        );
      }
      out.departmentId = scope.departmentId;
    }

    if (scope.contractorCompanyId) {
      // Only Incident-driven KPIs filter cleanly via the persons
      // relation. Other sources don't have contractor associations
      // we can layer onto a where clause.
      if (source !== "incident") {
        throw new Error(
          `Contractor scope is supported only for Incident-driven KPIs (LTIFR, TRIFR, TRIR, DART, Severity). ` +
            `Source "${source}" has no per-contractor breakdown.`
        );
      }
      out.persons = {
        some: { contractorCompanyId: scope.contractorCompanyId }
      };
    }

    return out;
  }

  /** Run a typed-where findMany and return only the IDs. */
  private async findIds(source: KpiSource, where: Record<string, unknown>): Promise<string[]> {
    const rows = await (this.prisma as any)[source].findMany({
      where,
      select: { id: true }
    });
    return rows.map((r: { id: string }) => r.id);
  }

  // ── Result assembly + formatting ───────────────────────────────

  private buildResult(
    def: KpiDefinition,
    scope: KpiScope,
    bounds: KpiPeriodBounds,
    value: number | null,
    numerator: number,
    denominator: number,
    audit: KpiAuditTrail,
    unavailableReason: string | null
  ): KpiResult {
    const band = this.determineBand(value, def);
    return {
      kpiCode: def.code,
      kpiName: def.name,
      value,
      unavailableReason: value == null ? (unavailableReason ?? "not computable for this period") : null,
      formattedValue: this.formatValue(value, def),
      numerator,
      denominator,
      formula: def.formula,
      band,
      bandColor: band ? BAND_COLOR[band] : "#94a3b8", // slate-400 for unbanded KPIs
      higherIsBetter: def.higherIsBetter,
      benchmarks: def.benchmarks,
      period: bounds,
      scope,
      computedAt: new Date(),
      audit
    };
  }

  private determineBand(value: number | null, def: KpiDefinition): KpiBand | null {
    // An unmeasured period has no performance band. This is the guard that makes
    // "LTIFR 0.00 -- WORLD CLASS" unreachable: with no exposure the value is null,
    // so there is nothing to compare against a benchmark.
    if (value == null) return null;
    if (!def.benchmarks) return null;
    const b = def.benchmarks;

    // Each threshold is the value AT WHICH you earn that label, so three
    // comparisons place all four bands and `poor` is the floor of the range rather
    // than a boundary between two of them. Anything below `average` is POOR.
    //
    // Deliberately unchanged, because it is the correct reading of the threshold
    // names and kpi-gauge.tsx was the half that disagreed: its higher-is-better
    // arcs painted `average..excellent` as EXCELLENT, shifting every band down a
    // notch, so Inspection Compliance at 70.0% on a 98/95/85/70 ladder sat on the
    // amber arc wearing a POOR badge. The gauge now derives its arcs from the same
    // boundaries used here. `benchmarks.poor` remains in use as the interpolation
    // floor for the composite score in ./scorecard.ts, which is a different
    // question from which label a value earns.
    if (def.higherIsBetter) {
      if (value >= b.worldClass) return "WORLD_CLASS";
      if (value >= b.excellent) return "EXCELLENT";
      if (value >= b.average) return "AVERAGE";
      return "POOR";
    } else {
      // Lower is better -- invert thresholds.
      if (value <= b.worldClass) return "WORLD_CLASS";
      if (value <= b.excellent) return "EXCELLENT";
      if (value <= b.average) return "AVERAGE";
      return "POOR";
    }
  }

  private formatValue(value: number | null, def: KpiDefinition): string {
    // The one string every unavailable KPI renders. Deliberately not "0", not
    // "N/A" and not blank: it has to read as "we could not measure this", because
    // a reader who sees a number assumes a measurement.
    if (value == null) return "Not computable";
    switch (def.displayFormat) {
      case "integer":
        return Math.round(value).toLocaleString("en-IN");
      case "percent":
        return `${value.toFixed(1)}%`;
      case "currency_indian":
        // ₹ with Indian grouping. No decimals — costs at this scale
        // are usually 6+ figures.
        return `₹${Math.round(value).toLocaleString("en-IN")}`;
      case "decimal_2_places":
      default:
        return value.toFixed(2);
    }
  }
}
