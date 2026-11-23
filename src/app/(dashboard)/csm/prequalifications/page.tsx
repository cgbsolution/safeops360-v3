import { PageHeader } from "@/components/page-header";
import { PrequalListView } from "@/components/csm/prequal-list";
import { CsmNav } from "@/components/csm/shared";
import { loadCsmContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function PrequalificationsPage(props: { searchParams: Promise<{ plantId?: string; status?: string }> }) {
  const sp = await props.searchParams;
  const { plants } = await loadCsmContext();
  return (
    <div>
      <PageHeader
        title="Prequalification"
        breadcrumbs={[{ label: "CSM", href: "/csm" }, { label: "Prequalification" }]}
        description="Applications from submission through HSE review and plant-head approval to qualified, conditional or rejected."
      />
      <CsmNav />
      <PrequalListView plants={plants} defaultPlantId={sp.plantId ?? null} initialStatus={sp.status ?? null} />
    </div>
  );
}
