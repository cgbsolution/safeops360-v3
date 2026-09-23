/**
 * The shared page shell for every analytics route.
 *
 * Each route file is now three lines: name the flow, hand over the query
 * string. Parsing and clamping live here so eleven screens cannot disagree
 * about what `?months=` means, and so a hand-edited URL degrades to the default
 * on every screen rather than 422-ing the API on some of them.
 */
import {
  ALLOWED_MONTHS,
  DEFAULT_MONTHS,
  FlowAnalyticsView,
} from "@/components/analytics/flow-analytics-view";

export type AnalyticsSearchParams = {
  plant?: string;
  severity?: string;
  months?: string;
};

export async function FlowAnalyticsPage({
  flow,
  searchParams,
  extra,
}: {
  flow: string;
  // Next 15: a promise, and it must be awaited. Reading it synchronously
  // typechecks but fails `next build`, which then ships a stale page.
  searchParams: Promise<AnalyticsSearchParams>;
  extra?: React.ReactNode;
}) {
  const sp = await searchParams;
  const parsed = Number(sp.months);
  const months = ALLOWED_MONTHS.includes(parsed) ? parsed : DEFAULT_MONTHS;

  return (
    <FlowAnalyticsView
      flow={flow}
      site={sp.plant?.trim() || null}
      severity={sp.severity?.trim() || null}
      months={months}
      extra={extra}
    />
  );
}
