import { PageHeader } from "@/components/page-header";
import { MockDrillsView } from "@/components/ims/mock-drills";
import { ImsNav } from "@/components/ims/shared";
import { loadImsContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function MockDrillsPage(props: { searchParams: Promise<{ plantId?: string }> }) {
  const sp = await props.searchParams;
  const { plants, meta } = await loadImsContext();
  return (
    <div>
      <PageHeader
        title="Mock Drills"
        breadcrumbs={[{ label: "IMS / MIS", href: "/ims" }, { label: "Mock Drills" }]}
        description="Mock drill schedule and closure: fire evacuation, gas leak, molten metal, chemical spill and more. Closing a drill records evacuation time and head-count."
      />
      <ImsNav />
      <MockDrillsView plants={plants} meta={meta} defaultPlantId={sp.plantId ?? null} />
    </div>
  );
}
