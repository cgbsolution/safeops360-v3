import { PageHeader } from "@/components/page-header";
import { ImsDashboardView } from "@/components/ims/ims-dashboard";
import { ImsNav } from "@/components/ims/shared";
import { loadImsContext } from "./_load";

export const dynamic = "force-dynamic";

export default async function ImsDashboardPage(props: { searchParams: Promise<{ plantId?: string }> }) {
  const sp = await props.searchParams;
  const { plants } = await loadImsContext();
  return (
    <div>
      <PageHeader
        title="IMS / MIS Dashboard"
        breadcrumbs={[{ label: "IMS / MIS" }, { label: "Dashboard" }]}
        description="Every plant safety indicator in one place: frequency and severity rates, manpower, trainings, toolbox talks, inspections, audits, HIRA reviews, show cause notices, committee meetings, MOM actions and mock drills."
      />
      <ImsNav />
      <ImsDashboardView plants={plants} defaultPlantId={sp.plantId ?? null} />
    </div>
  );
}
