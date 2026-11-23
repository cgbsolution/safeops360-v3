import { PageHeader } from "@/components/page-header";
import { Checklists } from "@/components/fire/checklists";
import { FireNav } from "@/components/fire/shared";
import { loadFireContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function FireChecklistsPage() {
  const { meta } = await loadFireContext();
  return (
    <div>
      <PageHeader
        title="Inspection Checklists"
        breadcrumbs={[{ label: "Operational Safety" }, { label: "Fire Safety", href: "/fire-safety" }, { label: "Checklists" }]}
        description="One checklist per equipment type (IS 2190 extinguishers, IS 13039 hydrants, IS 2189 detection and more). Critical items raise a CAPA when they fail. Editing publishes a new version."
      />
      <FireNav />
      <Checklists meta={meta} />
    </div>
  );
}
