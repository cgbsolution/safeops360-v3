import { PageHeader } from "@/components/page-header";
import { PhaNav } from "@/components/pha/shared";
import { StudyForm } from "@/components/pha/study-form";
import { requirePermission } from "@/lib/auth/server";
import { loadPhaContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function NewHazopStudyPage() {
  await requirePermission("PHA.CREATE");
  const { plants, meta } = await loadPhaContext();
  return (
    <div>
      <PageHeader
        title="New PHA study"
        breadcrumbs={[
          { label: "Process Safety", href: "/process-safety" },
          { label: "PHA / HAZOP", href: "/process-safety/hazop" },
          { label: "New study" },
        ]}
        description="Set up the study header. Team, sessions, nodes and the worksheet follow on the study page."
      />
      <PhaNav />
      <StudyForm plants={plants} meta={meta} />
    </div>
  );
}
