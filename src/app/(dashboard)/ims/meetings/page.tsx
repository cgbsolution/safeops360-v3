import { PageHeader } from "@/components/page-header";
import { MeetingsView } from "@/components/ims/meetings";
import { ImsNav } from "@/components/ims/shared";
import { loadImsContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function MeetingsPage(props: { searchParams: Promise<{ plantId?: string }> }) {
  const sp = await props.searchParams;
  const { plants, meta } = await loadImsContext();
  return (
    <div>
      <PageHeader
        title="Safety Meetings"
        breadcrumbs={[{ label: "IMS / MIS", href: "/ims" }, { label: "Safety Meetings" }]}
        description="Safety committee, apex, departmental and contractor safety meetings: schedule, attendance, minutes and the action points they raise."
      />
      <ImsNav />
      <MeetingsView plants={plants} meta={meta} defaultPlantId={sp.plantId ?? null} />
    </div>
  );
}
