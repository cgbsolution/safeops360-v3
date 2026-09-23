// EHS Scorecard — periodic leading/lag indicator reporting.
//
// The route turns the query string into filters; everything else is in
// @/components/scorecard/scorecard-view. `plant` and `months` are named to match
// the Analytics Screen Contract's SegmentBar, which writes them — reusing the
// component means reusing its parameter names rather than translating them.
import { ScorecardView, ALLOWED_MONTHS, DEFAULT_MONTHS } from "@/components/scorecard/scorecard-view";
import { requirePermission } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function Page(props: {
  searchParams: Promise<{ plant?: string; months?: string; grain?: string }>;
}) {
  await requirePermission("INCIDENT.READ");
  const sp = await props.searchParams;
  const parsed = Number(sp.months);
  const months = ALLOWED_MONTHS.includes(parsed) ? parsed : DEFAULT_MONTHS;
  const grain = sp.grain === "quarter" ? "quarter" : "month";

  return <ScorecardView site={sp.plant?.trim() || null} grain={grain} months={months} />;
}
