/**
 * EHS Scorecard — the dashboard.
 *
 * Built ON the Analytics Screen Contract (Build 1), not beside it. The four
 * components are imported and consumed unmodified:
 *
 *   <SegmentBar />       site + history window, URL-persisted
 *   <ContextKPI />       every indicator, with its month-over-month delta
 *   <InsightRail />      scorecard-specific trend findings
 *   <DataQualityFlag />  every indicator the rollup could not compute
 *
 * What is NOT reused is the flow-analytics view: this module reads a stored
 * monthly rollup rather than a live register, which is a different data model
 * with a different guarantee (a March figure must still read the same in
 * September). Reskinning an analytics screen would have meant recomputing from
 * raw records on every load, and a scorecard that silently rewrites its own
 * history is worse than no scorecard.
 *
 * The InsightRail findings are computed HERE, from the same rollup series the
 * KPIs read, rather than being pulled from the Tier-1 insight engine — that
 * engine has no scorecard module and this build is not permitted to add rules
 * to it. They are deterministic and stated as such.
 */

import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  ContextKPI,
  DataQualityFlag,
  InsightRail,
  SegmentBar,
  type InsightFinding,
} from "@/components/analytics/contract";
import { GrainToggle } from "@/components/scorecard/grain-toggle";
import { ScorecardTrend } from "@/components/scorecard/scorecard-trend";
import { INK, NAVY, STATUS } from "@/lib/design/midnight";
import {
  fetchScorecard,
  formatIndicator,
  periodsForWindow,
  type Grain,
  type ScorecardCell,
  type ScorecardIndicator,
  type ScorecardPayload,
} from "@/lib/scorecard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getServerLabels } from "@/lib/labels/server";

export const DEFAULT_MONTHS = 12;
export const ALLOWED_MONTHS = [3, 6, 12, 24, 36];

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

function delta(
  cur: unknown,
  prev: unknown,
  ind: ScorecardIndicator
): { value?: string; direction: "up" | "down" | "flat"; isGood?: boolean } {
  if (cur === null || cur === undefined || prev === null || prev === undefined) {
    return { direction: "flat" };
  }
  const diff = Math.round((Number(cur) - Number(prev)) * 100) / 100;
  const suffix = ind.unit === "pct" ? "%" : "";
  const direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  return {
    value: `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${Math.abs(diff)}${suffix}`,
    direction,
    // `neutral` means the platform declines to judge — see the near-miss note.
    isGood:
      ind.goodDirection === "neutral" || diff === 0
        ? undefined
        : ind.goodDirection === "up"
          ? diff > 0
          : diff < 0,
  };
}

/**
 * Deterministic scorecard findings.
 *
 * Only three rules, each about the RELATIONSHIP between the two bands, which is
 * the one thing a scorecard can say that a single-module screen cannot. They are
 * arithmetic over the same series the KPIs render — nothing is inferred.
 */
function buildFindings(p: ScorecardPayload): InsightFinding[] {
  const out: InsightFinding[] = [];
  const cur = p.current;
  const prior = p.prior;
  if (!cur || !prior) return out;

  const num = (c: ScorecardCell | null, k: string) =>
    c && c[k] !== null && c[k] !== undefined ? Number(c[k]) : null;

  const obsNow = num(cur, "observationsLogged");
  const obsPrev = num(prior, "observationsLogged");
  const incNow = num(cur, "incidentsTotal");
  const incPrev = num(prior, "incidentsTotal");

  // 1. Leading activity falling while lagging has not yet moved — the pattern
  //    the brief names, and the whole reason a scorecard pairs the two bands.
  if (obsNow !== null && obsPrev !== null && obsPrev >= 5 && obsNow < obsPrev * 0.7) {
    const stable = incNow !== null && incPrev !== null && incNow <= incPrev;
    out.push({
      id: "leading-down",
      severity: stable ? "HIGH" : "MEDIUM",
      headline: `Observation reporting fell ${Math.round((1 - obsNow / obsPrev) * 100)}% this period`,
      detail: stable
        ? `${obsPrev} → ${obsNow} observations, while incidents did not rise (${incPrev} → ${incNow}). ` +
          `Leading activity has dropped before the lagging numbers have reacted — this is the ` +
          `window in which a decline is still cheap to reverse.`
        : `${obsPrev} → ${obsNow} observations. Reporting activity is down.`,
      relatedIds: [],
      siteId: p.site,
    });
  }

  // 2. Lagging worsening while leading is flat or falling.
  if (incNow !== null && incPrev !== null && incNow > incPrev && obsNow !== null && obsPrev !== null && obsNow <= obsPrev) {
    out.push({
      id: "lagging-up-leading-flat",
      severity: "HIGH",
      headline: `Incidents rose to ${incNow} while observation reporting did not increase`,
      detail:
        `Incidents ${incPrev} → ${incNow} against observations ${obsPrev} → ${obsNow}. ` +
        `The site is experiencing more events without a matching rise in hazard reporting.`,
      relatedIds: [],
      siteId: p.site,
    });
  }

  // 3. Rates unavailable for the current period — stated as a finding because a
  //    scorecard without frequency rates is not the document people think it is.
  const cov = p.sourceCoverage;
  if (cov?.lastPeriodWithExposure && cov.lastPeriod !== cov.lastPeriodWithExposure) {
    out.push({
      id: "no-exposure",
      severity: "MEDIUM",
      headline: `Frequency rates stop at ${cov.lastPeriodWithExposure}`,
      detail:
        `Manhours are recorded to ${cov.lastPeriodWithExposure} while activity runs to ` +
        `${cov.lastPeriod}. LTIFR, TRIR and severity rate cannot be computed for the most ` +
        `recent periods — they are unavailable, not zero.`,
      relatedIds: [],
      siteId: p.site,
    });
  }
  return out;
}

export async function ScorecardView({
  site,
  grain,
  months,
}: {
  site: string | null;
  grain: Grain;
  months: number;
}) {
  const L = await getServerLabels();
  const periods = periodsForWindow(months, grain);

  let p: ScorecardPayload | null = null;
  let error: string | null = null;
  try {
    p = await fetchScorecard({ site: site ?? undefined, grain, periods });
  } catch (e: any) {
    error = e?.message ?? "Failed to load the scorecard";
  }

  const header = (
    <PageHeader
      title="EHS Scorecard"
      breadcrumbs={[{ label: "Performance" }, { label: "EHS Scorecard" }]}
      description={
        p && !p.empty
          ? `${p.siteName ?? L("term.all_sites", "All sites")} · ${p.periods.length} ${
              grain === "month" ? "months" : "quarters"
            } to ${p.periods[p.periods.length - 1]} · computed from frozen monthly rollups, not recomputed on load.`
          : "Periodic leading and lagging indicators across Observation, Near Miss, PTW, Training, Incident and Safety Culture."
      }
      action={
        <div className="flex gap-2">
          <a
            href={`/api/scorecard/export.pptx?${new URLSearchParams({
              ...(site ? { site } : {}), grain, periods: String(periods),
            })}`}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium hover:border-primary-500"
            style={{ borderColor: NAVY[200], color: NAVY[700] }}
          >
            <Download size={13} aria-hidden />
            PPTX
          </a>
          <a
            href={`/api/scorecard/export.pdf?${new URLSearchParams({
              ...(site ? { site } : {}), grain, periods: String(periods),
            })}`}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium hover:border-primary-500"
            style={{ borderColor: NAVY[200], color: NAVY[700] }}
          >
            <FileText size={13} aria-hidden />
            PDF
          </a>
        </div>
      }
    />
  );

  if (error || !p) {
    return (
      <div>
        {header}
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
      </div>
    );
  }

  if (p.empty) {
    return (
      <div>
        {header}
        <div
          className="rounded-xl border p-6 text-sm"
          style={{
            borderColor: STATUS.medium.line,
            backgroundColor: STATUS.medium.tint,
            color: STATUS.medium.ink,
          }}
        >
          <p className="font-semibold">No scorecard data for this selection.</p>
          <p className="mt-1 text-[12px]">
            {p.message}. The rollup runs nightly; an administrator can trigger it immediately from
            the jobs console. This screen is showing an explanation rather than a grid of zeroes,
            because a scorecard full of zeroes reads as a perfect safety record.
          </p>
        </div>
      </div>
    );
  }

  const cur = p.current ?? {};
  const prior = p.prior ?? {};
  const leading = p.indicators.filter((i) => i.band === "leading");
  const lagging = p.indicators.filter((i) => i.band === "lagging");
  const periodLabel = p.periods[p.periods.length - 1];
  const priorLabel = p.periods.length > 1 ? p.periods[p.periods.length - 2] : null;
  const comparator = priorLabel ? `vs ${priorLabel}` : undefined;
  const gapByIndicator = new Map(p.gaps.map((g) => [g.indicator.toLowerCase(), g]));

  // An indicator whose gap the rollup recorded gets a DataQualityFlag rather
  // than a number. Same rule as every analytics screen: a metric that cannot be
  // computed never wears the clean-value treatment.
  const flagFor = (ind: ScorecardIndicator) => {
    const g =
      gapByIndicator.get(ind.label.toLowerCase()) ??
      (ind.unit === "rate" ? gapByIndicator.get("frequency rates") : undefined);
    if (!g) return undefined;
    return (
      <DataQualityFlag
        metric={ind.label}
        incompleteCount={1}
        totalCount={1}
        field={g.indicator.toLowerCase()}
        scope="this period"
        blocking
        reason={g.reason}
      />
    );
  };

  const renderKpi = (ind: ScorecardIndicator) => {
    const v = cur[ind.key];
    const d = delta(v, prior[ind.key], ind);
    const flag = flagFor(ind);
    return (
      <ContextKPI
        key={ind.key}
        label={ind.label}
        value={formatIndicator(v, ind.unit)}
        suppressValue={v === null || v === undefined}
        deltaValue={d.value}
        deltaDirection={d.direction}
        deltaIsGood={d.isGood}
        comparatorLabel={
          d.value
            ? `${comparator} (was ${formatIndicator(prior[ind.key], ind.unit)})`
            : undefined
        }
        hint={ind.note || undefined}
        flag={flag}
      />
    );
  };

  return (
    <div>
      {header}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <GrainToggle grain={grain} />
      </div>

      {/* Build 1's SegmentBar, unmodified. The scorecard has no severity axis,
          so that control is passed an empty option set and hides itself. */}
      <SegmentBar
        sites={p.sites.map((s) => ({ value: s.value, label: s.label }))}
        severities={[]}
        severityLabel={null}
        site={p.site}
        severity={null}
        months={months}
        recordCount={p.sourceCoverage?.plantMonths}
      />

      <InsightRail
        findings={buildFindings(p)}
        emptyLabel="No scorecard trend findings this period — leading and lagging indicators are moving together."
      />

      <h2
        className="mb-2 mt-1 text-sm font-semibold uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        Leading indicators · {periodLabel}
      </h2>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {leading.map(renderKpi)}
      </div>

      <h2
        className="mb-2 text-sm font-semibold uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        Lagging indicators · {periodLabel}
      </h2>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {lagging.map(renderKpi)}
      </div>

      <Panel
        title="Leading vs lagging over time"
        subtitle="Two panels sharing one time axis, each on its own scale — a single chart would flatten the lagging series, and a second y-axis would let either be scaled against the other."
        className="mb-5"
      >
        <ScorecardTrend series={p.series} />
      </Panel>

      {p.bySite.length > 1 && (
        <Panel
          title={`${L("scorecard.by_site", "By site")} · ${periodLabel}`}
          subtitle={L("scorecard.by_site_subtitle", "Which sites are carrying the portfolio figure.")}
          className="mb-5"
        >
          <div className="overflow-x-auto">
            <Table className="w-full text-[12px]">
              <TableHeader>
                <TableRow style={{ color: INK.muted }}>
                  <TableHead className="py-1.5 pr-3 text-left font-semibold">{L("term.site", "Site")}</TableHead>
                  {["Observations", "Near misses", "Incidents", "LTI", "LTIFR", "PTW %"].map((h) => (
                    <TableHead key={h} className="py-1.5 pl-3 text-right font-semibold">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.bySite.map((s) => (
                  <TableRow key={String(s.siteId)} className="border-t" style={{ borderColor: NAVY[100] }}>
                    <TableCell className="py-1.5 pr-3" style={{ color: INK.base }}>
                      {s.siteName}
                    </TableCell>
                    {(
                      [
                        ["observationsLogged", "count"],
                        ["nearMissReported", "count"],
                        ["incidentsTotal", "count"],
                        ["ltiCount", "count"],
                        ["ltifr", "rate"],
                        ["ptwCompliancePct", "pct"],
                      ] as const
                    ).map(([k, u]) => (
                      <TableCell
                        key={k}
                        className="py-1.5 pl-3 text-right tabular-nums"
                        style={{ color: INK.strong }}
                      >
                        {formatIndicator(s[k], u)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      )}

      {p.gaps.length > 0 && (
        <div className="mb-5">
          <h2
            className="mb-2 text-sm font-semibold uppercase tracking-wider"
            style={{ color: INK.muted }}
          >
            Data completeness
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {p.gaps.map((g) => (
              <DataQualityFlag
                key={g.indicator + g.reason.slice(0, 24)}
                variant="banner"
                metric={g.indicator}
                incompleteCount={1}
                totalCount={1}
                field={g.indicator.toLowerCase()}
                scope="this period"
                blocking
                reason={g.reason}
              />
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] leading-snug" style={{ color: INK.faint }}>
        Frequency rates are read from the Manhours module&rsquo;s own submitted figures rather than
        recomputed here, so this scorecard and the manhours return cannot disagree. Quarterly
        figures are re-derived from summed exposure, never averaged from monthly rates.{" "}
        <Link href="/manhours" className="underline" style={{ color: NAVY[700] }}>
          Manhours &amp; LTIFR
        </Link>
      </p>
    </div>
  );
}
