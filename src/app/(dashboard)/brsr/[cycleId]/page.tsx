import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import type { CycleDashboard } from "../lib-brsr";
import { CycleDashboardView } from "./dashboard-view";

export const dynamic = "force-dynamic";

export default async function BrsrCyclePage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  // Next 15: searchParams/params are async. Awaiting them is what the sync
  // access lint would let through but `next build` rejects.
  const { cycleId } = await params;
  await requirePermission("BRSR.READ");

  let data: CycleDashboard | null = null;
  let error: string | null = null;
  try {
    data = await backendFetch<CycleDashboard>(`/api/brsr/cycles/${cycleId}/dashboard`);
  } catch (e: any) {
    error = e?.message ?? "Failed to load the BRSR cycle";
  }

  return (
    <div>
      <PageHeader
        title={data ? `BRSR ${data.cycle.financialYear}` : "BRSR Cycle"}
        description="Completion across all nine Principles, and the environmental data feeding Principle 6. Every auto-populated figure links back to the records it was derived from."
        breadcrumbs={[
          { label: "BRSR Reporting", href: "/brsr" },
          { label: data?.cycle.financialYear ?? cycleId },
        ]}
      />
      {error || !data ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          {error ?? "Cycle not found"}
        </div>
      ) : (
        <CycleDashboardView data={data} />
      )}
    </div>
  );
}
