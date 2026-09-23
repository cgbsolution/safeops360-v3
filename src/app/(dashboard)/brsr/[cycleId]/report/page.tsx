import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import type { Cycle } from "../../lib-brsr";
import { ReportView, type BrsrReport } from "./report-view";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const { cycleId } = await params;
  await requirePermission("BRSR.READ");

  let report: BrsrReport | null = null;
  let cycle: Cycle | null = null;
  let error: string | null = null;
  try {
    [report, cycle] = await Promise.all([
      backendFetch<BrsrReport>(`/api/brsr/cycles/${cycleId}/report`),
      backendFetch<Cycle>(`/api/brsr/cycles/${cycleId}`),
    ]);
  } catch (e: any) {
    error = e?.message ?? "Failed to assemble the report";
  }

  return (
    <div>
      <PageHeader
        title="BRSR Report"
        description="The assembled disclosure — Section A, Section B and all nine Principles. Prepared for filing through the entity's own SEBI process; SafeOps360 does not submit."
        breadcrumbs={[
          { label: "BRSR Reporting", href: "/brsr" },
          { label: cycle?.financialYear ?? cycleId, href: `/brsr/${cycleId}` },
          { label: "Report" },
        ]}
      />
      {error || !report || !cycle ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          {error ?? "Report unavailable"}
        </div>
      ) : (
        <ReportView cycleId={cycleId} report={report} />
      )}
    </div>
  );
}
