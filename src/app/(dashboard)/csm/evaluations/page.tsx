import { PageHeader } from "@/components/page-header";
import { EvaluationsView } from "@/components/csm/evaluations";
import { CsmNav } from "@/components/csm/shared";
import { loadCsmContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function EvaluationsPage(props: {
  searchParams: Promise<{ plantId?: string; new?: string; contractorId?: string; workOrderId?: string }>;
}) {
  const sp = await props.searchParams;
  const { plants, meta } = await loadCsmContext();
  return (
    <div>
      <PageHeader
        title="Contractor performance evaluation"
        breadcrumbs={[{ label: "CSM", href: "/csm" }, { label: "Evaluations" }]}
        description="Monthly, quarterly and contract-end evaluations: KPIs filled from plant safety records, manual criteria, rating band and sign-off."
      />
      <CsmNav />
      <EvaluationsView plants={plants} meta={meta} defaultPlantId={sp.plantId ?? null}
                       prefill={{ open: sp.new === "1", contractorId: sp.contractorId ?? null, workOrderId: sp.workOrderId ?? null, plantId: sp.plantId ?? null }} />
    </div>
  );
}
