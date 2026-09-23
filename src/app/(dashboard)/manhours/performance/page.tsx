// Manhours Performance — the merged MIS Dashboard + Multi-period Trends.
//
// These were two sidebar entries over one dataset, and the split was arbitrary:
// both read the same KPI engine over the same manhours submissions, and the
// only real difference was the window they looked through — this period, or the
// long run. That is a grain, not a destination, so it is a toggle.
//
// The two old routes redirect here (see next.config.js), landing on the grain
// that matches what they used to show.

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import { INK, NAVY } from "@/lib/design/midnight";
import { ManhoursDashboardView } from "./dashboard-view";
import { ManhoursTrendsView } from "./trends-view";

export const dynamic = "force-dynamic";

type View = "dashboard" | "trends";

const VIEWS: { key: View; label: string; hint: string }[] = [
  { key: "dashboard", label: "This period", hint: "Rolling 12-month KPI dashboard" },
  { key: "trends", label: "Long run", hint: "12–60 month trends + year-over-year" },
];

export default async function ManhoursPerformancePage(props: {
  searchParams: Promise<{
    view?: string;
    persona?: string;
    plantId?: string;
    range?: string;
  }>;
}) {
  await requirePermission("MANHOURS.READ");
  const sp = await props.searchParams;
  const view: View = sp.view === "trends" ? "trends" : "dashboard";

  // Carry the other parameters across a grain change. Persona belongs to the
  // dashboard and range/plant to the trends, but dropping them on the way
  // through would silently reset a reader's view every time they toggled.
  const carry = new URLSearchParams();
  if (sp.persona) carry.set("persona", sp.persona);
  if (sp.plantId) carry.set("plantId", sp.plantId);
  if (sp.range) carry.set("range", sp.range);
  const href = (v: View) => {
    const p = new URLSearchParams(carry);
    if (v !== "dashboard") p.set("view", v);
    const q = p.toString();
    return q ? `/manhours/performance?${q}` : "/manhours/performance";
  };

  return (
    <div>
      <PageHeader
        title="Manhours Performance"
        description="LTIFR, TRIFR, severity and near-miss rate from the manhours submissions — the same KPI engine at two grains."
        breadcrumbs={[{ label: "Manhours", href: "/manhours" }, { label: "Performance" }]}
      />

      <nav
        aria-label="Reporting grain"
        className="mb-5 flex items-center gap-1 border-b"
        style={{ borderColor: NAVY[200] }}
      >
        {VIEWS.map((v) => {
          const active = v.key === view;
          return (
            <Link
              key={v.key}
              href={href(v.key)}
              aria-current={active ? "page" : undefined}
              title={v.hint}
              className="-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1"
              style={{
                borderColor: active ? NAVY[700] : "transparent",
                color: active ? NAVY[700] : INK.muted,
                fontWeight: active ? 600 : 500,
              }}
            >
              {v.label}
            </Link>
          );
        })}
      </nav>

      {view === "trends" ? (
        <ManhoursTrendsView searchParams={props.searchParams} />
      ) : (
        <ManhoursDashboardView searchParams={props.searchParams} />
      )}
    </div>
  );
}
