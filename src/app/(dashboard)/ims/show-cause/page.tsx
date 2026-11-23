import { PageHeader } from "@/components/page-header";
import { ImsNav } from "@/components/ims/shared";
import { ShowCauseView } from "@/components/ims/show-cause";
import { loadImsContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function ShowCausePage(props: { searchParams: Promise<{ plantId?: string }> }) {
  const sp = await props.searchParams;
  const { plants, meta } = await loadImsContext();
  return (
    <div>
      <PageHeader
        title="Show Cause Notices"
        breadcrumbs={[{ label: "IMS / MIS", href: "/ims" }, { label: "Show Cause Notices" }]}
        description="Issue a notice for a safety violation, record the reply, and close it with a decision: warning, penalty, suspension or no action."
      />
      <ImsNav />
      <ShowCauseView plants={plants} meta={meta} defaultPlantId={sp.plantId ?? null} />
    </div>
  );
}
