import { PageHeader } from "@/components/page-header";
import { KbManage } from "@/components/knowledge-bank/manage";
import { ErrorBox, KbNav } from "@/components/knowledge-bank/shared";
import { loadKbMeta } from "../_load";

export const dynamic = "force-dynamic";

export default async function KnowledgeBankManagePage() {
  const { meta, error } = await loadKbMeta();
  const staff = !!meta && (meta.caps.manage || meta.caps.approve);
  return (
    <div>
      <PageHeader
        title="Manage the Knowledge Bank"
        breadcrumbs={[{ label: "Knowledge Bank", href: "/knowledge-bank" }, { label: "Manage" }]}
        description="Upload documents and new versions, review and publish them, make old ones obsolete, and keep periodic reviews on time."
      />
      <KbNav showManage={staff} />
      {meta && staff ? (
        <KbManage meta={meta} />
      ) : (
        <ErrorBox error={error ?? "Managing the knowledge bank needs the KB.MANAGE or KB.APPROVE permission. You can still read every published document."} />
      )}
    </div>
  );
}
