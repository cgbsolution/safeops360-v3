import { prisma } from "@/lib/prisma";
import { stripPlantWhere } from "@/lib/dashboard/scope";
import {
  AnalyticsStrip,
  AnalyticsStripError,
  type AnalyticsStripData,
} from "@/components/dashboard/analytics-strip";
import { last12Months, monthBounds, percentDelta } from "@/lib/dashboard/strip";
import { ltifr, trir, NO_INJURIES, type InjuryCounts } from "@/lib/manhours/frequency-rates";

// Manhours & Safety KPIs analytics strip — Prisma-direct module.
//
// manhours/page.tsx has no list-scope helper, so we scope with
// stripPlantWhere("MANHOURS.READ") (Manhours has plantId). Manhours rows are monthly per
// plant; we fetch a generous window ordered by period desc and aggregate in
// JS, keyed `${year}-${month}`.
//
// The rates come from lib/manhours/frequency-rates — the one shared definition,
// also used by the KPI engine, the configurable-dashboard widgets and (via its
// Python mirror) the EHS Scorecard. This file used to carry its own copy:
//
//   LTIFR = ltiCount * 1_000_000 / totalHours     ... : 0   when hours were 0
//   TRIR  = (lti + rwc + mtc) * 200_000 / totalHours ... : 0
//
// Two problems with that. The `: 0` turned "no manhours submitted" into a green
// 0.00 on a lower-is-better tile, and the LTIFR numerator omitted fatalities —
// understating the rate at exactly the sites where it matters most. Both are the
// shared module's business now.
//
// Lower is better for LTIFR/TRIR, so deltas pass higherIsBetter=false.

const KEY = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** Year-month key offset `back` whole months from the (year, month) anchor. */
function monthKeyBack(year: number, month: number, back: number): string {
  const d = new Date(year, month - 1 - back, 1);
  return KEY(d.getFullYear(), d.getMonth() + 1);
}

export async function ManhoursAnalyticsStrip() {
  try {
    const plantWhere = await stripPlantWhere("MANHOURS.READ");
    const { now } = monthBounds();
    const buckets = last12Months(now);

    // Last ~200 monthly rows across scope, newest first — covers 24+ months
    // even across several plants. Aggregate the raw counts/hours in JS so the
    // rolling windows use the sum-of-numerators / sum-of-hours formula (NOT an
    // average of per-row ratios), matching the page's roll-up.
    const rows = await prisma.manhours.findMany({
      where: { ...plantWhere },
      select: {
        year: true,
        month: true,
        employeeHours: true,
        contractorHours: true,
        ltiCount: true,
        rwcCount: true,
        mtcCount: true,
        fatalityCount: true,
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 200,
    });

    // Aggregate per month-key across plants.
    type Agg = { hours: number; lti: number; recordable: number; fatalities: number };
    const byMonth = new Map<string, Agg>();
    for (const r of rows) {
      const k = KEY(r.year, r.month);
      const a = byMonth.get(k) ?? { hours: 0, lti: 0, recordable: 0, fatalities: 0 };
      a.hours += r.employeeHours + r.contractorHours;
      a.lti += r.ltiCount;
      a.recordable += r.ltiCount + r.rwcCount + r.mtcCount;
      // Fatalities ARE lost-time injuries; the old local formula left them out.
      a.fatalities += r.fatalityCount;
      byMonth.set(k, a);
    }

    // Anchor on the most recent month present in the data (rows are sorted
    // desc); fall back to the current calendar month when there are no rows.
    const anchorYear = rows[0]?.year ?? now.getFullYear();
    const anchorMonth = rows[0]?.month ?? now.getMonth() + 1;

    // Rolling-12 (months 1-12 back) vs prior-12 (months 13-24 back).
    const roll = (fromBack: number, toBack: number): Agg => {
      const acc: Agg = { hours: 0, lti: 0, recordable: 0, fatalities: 0 };
      for (let b = fromBack; b < toBack; b++) {
        const a = byMonth.get(monthKeyBack(anchorYear, anchorMonth, b));
        if (!a) continue;
        acc.hours += a.hours;
        acc.lti += a.lti;
        acc.recordable += a.recordable;
        acc.fatalities += a.fatalities;
      }
      return acc;
    };
    // `recordable` is already lti + rwc + mtc, and neither rate distinguishes RWC
    // from MTC, so the non-LTI remainder goes in as MTC.
    const countsOf = (a: Agg): InjuryCounts => ({
      ...NO_INJURIES,
      lti: a.lti,
      fatalities: a.fatalities,
      mtc: Math.max(0, a.recordable - a.lti)
    });
    const ltifrOf = (a: Agg) => ltifr(countsOf(a), a.hours);
    const trirOf = (a: Agg) => trir(countsOf(a), a.hours);

    const cur12 = roll(0, 12);
    const prior12 = roll(12, 24);

    const ltifr12 = ltifrOf(cur12);
    const trir12 = trirOf(cur12);
    const ltifrPrior = ltifrOf(prior12);
    const trirPrior = trirOf(prior12);

    // Hours this (most recent) month across scope plants.
    const hoursThisMonth = byMonth.get(KEY(anchorYear, anchorMonth))?.hours ?? 0;

    // Sparkline: 12 monthly LTIFR buckets (sum lti *1e6 / sum hours per month),
    // aligned to the calendar last-12-month axis.
    // Months with no reported exposure are DROPPED, not plotted as 0. A zero point
    // draws the line down to the axis, which reads as an improvement rather than as
    // an absence.
    const sparkPoints = buckets
      .map((bkt) => {
        const k = KEY(bkt.start.getFullYear(), bkt.start.getMonth() + 1);
        const a = byMonth.get(k);
        const v = a ? ltifrOf(a) : null;
        return { label: bkt.label, value: v == null ? null : Number(v.toFixed(2)) };
      })
      .filter((pt): pt is { label: string; value: number } => pt.value != null);

    // Alert flag: LTIFR rising by >20% vs prior 12 months.
    const ltifrRising =
      ltifr12 != null && ltifrPrior != null && ltifrPrior > 0 && ltifr12 > ltifrPrior * 1.2 ? 1 : 0;

    const data: AnalyticsStripData = {
      tiles: [
        {
          // An em dash, not "0.00". A delta is only shown when both periods were
          // measured — a change computed against a missing figure is invented.
          label: "LTIFR",
          value: ltifr12 == null ? "—" : ltifr12.toFixed(2),
          emphasis: true,
          href: "/manhours",
          delta:
            ltifr12 == null || ltifrPrior == null
              ? undefined
              : percentDelta(ltifr12, ltifrPrior, false),
        },
        {
          label: "TRIR",
          value: trir12 == null ? "—" : trir12.toFixed(2),
          href: "/manhours",
          delta:
            trir12 == null || trirPrior == null
              ? undefined
              : percentDelta(trir12, trirPrior, false),
        },
        {
          label: "Hours This Month",
          value: hoursThisMonth.toLocaleString("en-IN"),
          href: "/manhours",
        },
      ],
      sparkline: {
        points: sparkPoints,
        color: "#ef4444",
        label: "LTIFR · 12 mo",
      },
      alerts: [
        { label: "LTIFR rising", count: ltifrRising, tone: "bad", href: "/manhours" },
        { label: "Submission overdue", count: 0, tone: "warn", href: "/manhours" },
      ],
    };

    return <AnalyticsStrip data={data} />;
  } catch (err) {
    console.error("[manhours-strip] failed", err);
    return <AnalyticsStripError />;
  }
}
