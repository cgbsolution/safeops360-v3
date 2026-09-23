// The three audit figures the Analytics Screen Contract does not compute.
//
// Completion, Overdue and Avg Closure now come from the shared flow engine as
// ContextKPI tiles with real prior-period comparators. These three are specific
// to the audit programme and live in tables the flow engine does not read —
// findings and their CAPA linkage — so they stay, but they wear ContextKPI too.
//
// Where a comparator genuinely does not exist, the card says so. That is the
// contract's point: a number with no basis for comparison must look different
// from a number that has not moved.

import { ContextKPI } from "@/components/analytics/contract";
import { INK } from "@/lib/design/midnight";
import type { Analytics } from "../lib-cams";

export function CamsDomainKpis({ a }: { a: Analytics }) {
  return (
    <>
      <h2
        className="mb-3 mt-1 text-sm font-semibold uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        Findings &amp; conformance — the certification-readiness view
      </h2>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <ContextKPI
          label="Open findings"
          value={a.openFindingCount}
          deltaValue={undefined}
          hint="non-conformances still to be closed out"
        />
        <ContextKPI
          label="Repeat-finding rate"
          value={`${a.repeatFindingRatePct}%`}
          deltaValue={undefined}
          /* A repeat finding is the strongest single signal an external auditor
             looks for: it says the last corrective action did not hold. */
          hint="findings that recur — the last corrective action did not hold"
        />
        <ContextKPI
          label="CAPA overdue"
          value={`${a.capaOverduePct}%`}
          deltaValue={undefined}
          hint="of CAPAs raised from audit findings"
        />
      </div>
    </>
  );
}
