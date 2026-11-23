import { PageHeader } from "@/components/page-header";
import { MomTrackerView } from "@/components/ims/mom-tracker";
import { ImsNav } from "@/components/ims/shared";
import { loadImsContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function MomTrackerPage(props: {
  searchParams: Promise<{ plantId?: string; overdue?: string; mine?: string }>;
}) {
  const sp = await props.searchParams;
  const { plants } = await loadImsContext();
  const initialView = sp.overdue ? "OVERDUE" : sp.mine ? "MINE" : "OPEN";
  return (
    <div>
      <PageHeader
        title="MOM Tracker"
        breadcrumbs={[{ label: "IMS / MIS", href: "/ims" }, { label: "MOM Tracker" }]}
        description="Every action point from the minutes of every meeting, with owner, due date and closure. Owners can update their own points."
      />
      <ImsNav />
      <MomTrackerView plants={plants} defaultPlantId={sp.plantId ?? null} initialView={initialView} />
    </div>
  );
}
