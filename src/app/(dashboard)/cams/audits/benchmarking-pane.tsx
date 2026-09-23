// The Benchmarking tab of the Audits workspace.
//
// This is the half of the old "Audit Analytics & Benchmarking" screen that the
// Analytics Screen Contract does not model: site-vs-site conformance scores,
// finding-severity Pareto, clause conformance and the CAMS-specific KPIs. The
// other half — completion, overdue, closure time, trend, ageing, data quality —
// is the shared flow engine and now lives on the Analytics tab next door, so
// the two are no longer two ways of counting the same audits.
//
// Tolerant of a backend failure, unlike the Signals pane: benchmarking is
// derived reporting over audits the reader can already see listed on the
// Register tab, so an outage here degrades to a stated failure rather than a
// misleading blank.

import { backendFetch } from "@/lib/backend/fetch";
import { STATUS } from "@/lib/design/midnight";
import type { Analytics } from "../lib-cams";
import { AnalyticsView } from "./benchmarking-view";
import { CamsDomainKpis } from "./benchmarking-kpis";

export async function AuditBenchmarkingPane() {
  let data: Analytics | null = null;
  let error: string | null = null;
  try {
    data = await backendFetch<Analytics>("/api/cams/analytics");
  } catch (e: any) {
    error = e?.message ?? "Failed to load audit benchmarking";
  }

  if (error || !data) {
    return (
      <div
        className="rounded-xl border p-4 text-sm"
        style={{
          borderColor: STATUS.medium.line,
          backgroundColor: STATUS.medium.tint,
          color: STATUS.medium.ink,
        }}
      >
        Benchmarking and clause conformance could not be loaded: {error ?? "no data"}. The audit
        lifecycle figures on the Analytics tab are unaffected.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <CamsDomainKpis a={data} />
      <AnalyticsView a={data} />
    </div>
  );
}
