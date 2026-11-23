import { PageHeader } from "@/components/page-header";
import { ImsNav } from "@/components/ims/shared";
import { ToolboxTalksView } from "@/components/ims/toolbox-talks";
import { loadImsContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function ToolboxTalksPage(props: { searchParams: Promise<{ plantId?: string }> }) {
  const sp = await props.searchParams;
  const { plants } = await loadImsContext();
  return (
    <div>
      <PageHeader
        title="Toolbox Talks"
        breadcrumbs={[{ label: "IMS / MIS", href: "/ims" }, { label: "Toolbox Talks" }]}
        description="Plant toolbox talk (TBT) register: topic, crew and contract-worker attendance. The MIS count adds the pre-job TBTs recorded in Site Safety Checks."
      />
      <ImsNav />
      <ToolboxTalksView plants={plants} defaultPlantId={sp.plantId ?? null} />
    </div>
  );
}
