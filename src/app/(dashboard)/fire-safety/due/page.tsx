import { PageHeader } from "@/components/page-header";
import { DueList } from "@/components/fire/due-list";
import { FireNav } from "@/components/fire/shared";
import { loadFireContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function FireDuePage(props: { searchParams: Promise<{ plantId?: string }> }) {
  const sp = await props.searchParams;
  const { plants, meta } = await loadFireContext();
  return (
    <div>
      <PageHeader
        title="Inspections Due"
        breadcrumbs={[{ label: "Operational Safety" }, { label: "Fire Safety", href: "/fire-safety" }, { label: "Due / Overdue" }]}
        description="Overdue, never-inspected and defective fire equipment first, then what comes due next. Start an inspection here or scan the asset's QR label on site."
      />
      <FireNav />
      <DueList plants={plants} meta={meta} defaultPlantId={sp.plantId ?? null} />
    </div>
  );
}
