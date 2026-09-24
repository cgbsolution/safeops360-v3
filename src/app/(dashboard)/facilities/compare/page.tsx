import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import { CompareView } from "./compare-view";
import type { FactoryProfileListResponse } from "../lib";
import { getServerLabels } from "@/lib/labels/server";
import { TERM } from "@/lib/labels/core";

export const dynamic = "force-dynamic";

export default async function FacilitiesComparePage() {
  await requirePermission("FACILITY.COMPARE");
  const L = await getServerLabels();
  let data: FactoryProfileListResponse | null = null;
  let error: string | null = null;
  try {
    data = await backendFetch<FactoryProfileListResponse>("/api/factory/profiles");
  } catch (e: any) {
    error = e?.message ?? "Failed to load facilities";
  }

  return (
    <div>
      <PageHeader
        title={`${L(TERM.factory, "Factory")} Comparison & Benchmarking`}
        breadcrumbs={[{ label: "Facilities", href: "/facilities" }, { label: "Comparison" }]}
        description={L("facilities.compare_description", "Select two or more factories to compare compliance, CAPA load, findings, workforce and certifications side by side.")}
      />
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{error}</div>
      ) : (
        <CompareView factories={data!.items} />
      )}
    </div>
  );
}
