import { PageHeader } from "@/components/page-header";
import { CsmNav } from "@/components/csm/shared";
import { WorkOrdersView } from "@/components/csm/work-orders";
import { loadCsmContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function WorkOrdersPage(props: { searchParams: Promise<{ plantId?: string; status?: string; new?: string; contractorId?: string }> }) {
  const sp = await props.searchParams;
  const { plants, meta } = await loadCsmContext();
  return (
    <div>
      <PageHeader
        title="Contractor work orders"
        breadcrumbs={[{ label: "CSM", href: "/csm" }, { label: "Work orders" }]}
        description="Contracts and work orders with their safety requirements. A work order goes active only for a qualified contractor that is not suspended or blacklisted."
      />
      <CsmNav />
      <WorkOrdersView plants={plants} meta={meta} defaultPlantId={sp.plantId ?? null} initialStatus={sp.status ?? null}
                      openNew={sp.new === "1"} contractorId={sp.contractorId ?? null} />
    </div>
  );
}
