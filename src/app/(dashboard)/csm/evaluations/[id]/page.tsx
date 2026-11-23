import { PageHeader } from "@/components/page-header";
import { EvaluationDetailView } from "@/components/csm/evaluation-detail";
import { CsmNav } from "@/components/csm/shared";
import { loadCsmContext } from "../../_load";

export const dynamic = "force-dynamic";

export default async function EvaluationPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { meta } = await loadCsmContext();
  return (
    <div>
      <PageHeader
        title="Performance evaluation"
        breadcrumbs={[{ label: "CSM", href: "/csm" }, { label: "Evaluations", href: "/csm/evaluations" }, { label: "Evaluation" }]}
      />
      <CsmNav />
      <EvaluationDetailView id={id} meta={meta} />
    </div>
  );
}
