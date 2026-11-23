import { PageHeader } from "@/components/page-header";
import { CsmNav } from "@/components/csm/shared";
import { WorkOrderDetailView } from "@/components/csm/work-order-detail";
import { loadCsmContext } from "../../_load";

export const dynamic = "force-dynamic";

export default async function WorkOrderPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { meta } = await loadCsmContext();
  return (
    <div>
      <PageHeader
        title="Work order"
        breadcrumbs={[{ label: "CSM", href: "/csm" }, { label: "Work orders", href: "/csm/work-orders" }, { label: "Work order" }]}
      />
      <CsmNav />
      <WorkOrderDetailView id={id} meta={meta} />
    </div>
  );
}
