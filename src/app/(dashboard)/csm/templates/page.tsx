import { PageHeader } from "@/components/page-header";
import { CsmNav } from "@/components/csm/shared";
import { TemplatesView } from "@/components/csm/templates";
import { loadCsmContext } from "../_load";

export const dynamic = "force-dynamic";

export default async function CsmTemplatesPage() {
  const { meta } = await loadCsmContext();
  return (
    <div>
      <PageHeader
        title="Prequalification questionnaires"
        breadcrumbs={[{ label: "CSM", href: "/csm" }, { label: "Questionnaires" }]}
        description="Sections, questions, answer types and weights of the contractor prequalification questionnaire, with pass and conditional thresholds."
      />
      <CsmNav />
      <TemplatesView meta={meta} />
    </div>
  );
}
