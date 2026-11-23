import { PageHeader } from "@/components/page-header";
import { CsmHubView } from "@/components/csm/csm-hub";
import { CsmNav } from "@/components/csm/shared";
import { loadCsmContext } from "./_load";

export const dynamic = "force-dynamic";

export default async function CsmHubPage(props: { searchParams: Promise<{ plantId?: string }> }) {
  const sp = await props.searchParams;
  const { plants } = await loadCsmContext();
  return (
    <div>
      <PageHeader
        title="Contractor Safety Management"
        breadcrumbs={[{ label: "CSM" }, { label: "Hub" }]}
        description="From qualification to evaluation: prequalification pipeline, work orders and plant mobilisation, expiring licences and approvals waiting."
      />
      <CsmNav />
      <CsmHubView plants={plants} defaultPlantId={sp.plantId ?? null} />
    </div>
  );
}
