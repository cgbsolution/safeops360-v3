// One component renders every non-register tab of every register workspace.
//
// The Analytics Navigation Reset asked for the analytics of thirteen
// registers to move inside those registers. The temptation is thirteen tab
// components; the whole reason the per-module screens could be collapsed at
// all is that they were already ONE implementation behind thirteen three-line
// route files (see @/components/analytics/flow-analytics-page). So this is
// that same move again, one level up: the pane, its header, its tab strip and
// its permission gate live here once, and a register page contributes four
// lines and a key.
//
// A register whose analytics is genuinely domain-specific — the combined
// HIRA + EAI aggregation dashboard, the audit benchmarking panels — passes it
// in through `panes`, so "different" costs a prop rather than a fork.

import { PageHeader } from "@/components/page-header";
import { WorkspaceTabs } from "@/components/analytics/workspace-tabs";
import { FlowAnalyticsPage } from "@/components/analytics/flow-analytics-page";
import { ModuleSignalsPane } from "@/components/signals/module-signals-pane";
import { REGISTERS, type RegisterKey } from "@/lib/registers";
import { INK, NAVY } from "@/lib/design/midnight";

const TAB_TITLE: Record<string, string> = {
  analytics: "Analytics",
  signals: "Signals",
  benchmarking: "Benchmarking",
};

export async function RegisterWorkspacePane({
  register,
  tab,
  searchParams,
  panes,
  analyticsExtra,
}: {
  register: RegisterKey;
  /** Already normalised by `resolveTab` — never a value this register lacks. */
  tab: string;
  // Next 15: a promise, and it must be awaited. Reading it synchronously
  // typechecks but fails `next build`, which then ships a stale page.
  searchParams: Promise<Record<string, string | undefined>>;
  /** Register-specific panes, keyed by tab. Overrides the default for that tab. */
  panes?: Record<string, React.ReactNode>;
  /**
   * Domain analysis appended UNDER the shared contract view on the Analytics
   * tab — the equipment/findings panels on Inspections, the competency panels
   * on Training. Kept separate from `panes` because it augments the contract
   * rather than replacing it: those registers must still get prior-period
   * deltas and the data-quality pass from the same engine as everyone else.
   */
  analyticsExtra?: React.ReactNode;
}) {
  const spec = REGISTERS[register];

  const header = (
    <>
      <PageHeader
        title={spec.title}
        breadcrumbs={[
          ...(spec.section ? [{ label: spec.section }] : []),
          { label: spec.title, href: spec.base },
          { label: TAB_TITLE[tab] ?? tab },
        ]}
      />
      <WorkspaceTabs tabs={spec.tabs} active={tab} />
    </>
  );

  const override = panes?.[tab];
  if (override !== undefined) {
    return (
      <div>
        {header}
        {override}
      </div>
    );
  }

  if (tab === "signals") {
    if (!spec.signalsModule) return null;
    return (
      <div>
        {header}
        <ModuleSignalsPane module={spec.signalsModule} moduleLabel={spec.title} />
      </div>
    );
  }

  if (tab === "analytics") {
    if (!spec.flow) {
      // A register declared analytics but supplied neither a flow key nor a
      // pane. Say so rather than render an empty screen: a blank analytics
      // tab reads as "no findings", which is a claim about the plant.
      return (
        <div>
          {header}
          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: NAVY[200], color: INK.muted }}
          >
            Analytics for this register is not wired up. This is a configuration gap, not a
            statement that there is nothing to report.
          </div>
        </div>
      );
    }
    return (
      <div>
        {header}
        <FlowAnalyticsPage flow={spec.flow} searchParams={searchParams} extra={analyticsExtra} />
      </div>
    );
  }

  return null;
}

/**
 * The tab strip as it appears on the REGISTER tab itself.
 *
 * Separate from the pane renderer because a register page owns its own
 * PageHeader — with its "New record" button, its plant switcher and its own
 * description — and replacing that with a generic one to gain a tab strip
 * would be a downgrade the reader notices immediately.
 */
export function RegisterTabs({ register }: { register: RegisterKey }) {
  return <WorkspaceTabs tabs={REGISTERS[register].tabs} active="register" />;
}
