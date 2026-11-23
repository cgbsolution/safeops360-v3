import { PageHeader } from "@/components/page-header";
import { KbHome } from "@/components/knowledge-bank/kb-home";
import { ErrorBox, KbNav } from "@/components/knowledge-bank/shared";
import { loadKbMeta } from "./_load";

export const dynamic = "force-dynamic";

type SP = {
  q?: string; categoryId?: string; docType?: string; standardRef?: string; department?: string; plant?: string;
  includeObsolete?: string; sort?: string;
};

export default async function KnowledgeBankPage(props: { searchParams: Promise<SP> }) {
  const sp = await props.searchParams;
  const { meta, error } = await loadKbMeta();
  return (
    <div>
      <PageHeader
        title="Knowledge Bank"
        breadcrumbs={[{ label: "Knowledge Bank" }]}
        description="Safety standards, policies, SOPs, checklists, legal requirements and emergency procedures in one place, readable by everyone in the company."
      />
      <KbNav showManage={!!meta && (meta.caps.manage || meta.caps.approve)} />
      {meta ? (
        <KbHome
          meta={meta}
          initial={{
            q: sp.q ?? "", categoryId: sp.categoryId ?? "", docType: sp.docType ?? "", standardRef: sp.standardRef ?? "",
            department: sp.department ?? "", plant: sp.plant ?? "", includeObsolete: sp.includeObsolete === "true",
            sort: sp.sort ?? "relevance",
          }}
        />
      ) : (
        <ErrorBox error={error} />
      )}
    </div>
  );
}
