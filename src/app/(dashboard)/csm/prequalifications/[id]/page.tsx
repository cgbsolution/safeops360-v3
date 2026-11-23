import { PageHeader } from "@/components/page-header";
import { PrequalReview } from "@/components/csm/prequal-review";
import { CsmNav } from "@/components/csm/shared";
import { loadCsmContext } from "../../_load";

export const dynamic = "force-dynamic";

export default async function PrequalificationPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { meta } = await loadCsmContext();
  return (
    <div>
      <PageHeader
        title="Prequalification review"
        breadcrumbs={[{ label: "CSM", href: "/csm" }, { label: "Prequalification", href: "/csm/prequalifications" }, { label: "Application" }]}
      />
      <CsmNav />
      <PrequalReview id={id} meta={meta} />
    </div>
  );
}
