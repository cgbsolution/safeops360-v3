import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import type { TrendPoint } from "../lib-brsr";
import { TrendsView } from "./trends-view";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  await requirePermission("BRSR.READ");

  let points: TrendPoint[] = [];
  let error: string | null = null;
  try {
    points = (await backendFetch<TrendPoint[]>("/api/brsr/trend")) ?? [];
  } catch (e: any) {
    error = e?.message ?? "Failed to load the trend series";
  }

  return (
    <div>
      <PageHeader
        title="Year-over-Year Trends"
        description="Energy, emissions and water intensity across reporting cycles — the ratios investors track. A year with no turnover reported shows an absolute figure and omits the intensity rather than plotting a misleading zero."
        breadcrumbs={[{ label: "BRSR Reporting", href: "/brsr" }, { label: "Trends" }]}
      />
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          {error}
        </div>
      ) : (
        <TrendsView points={points} />
      )}
    </div>
  );
}
