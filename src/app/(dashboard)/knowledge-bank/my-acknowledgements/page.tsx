import { PageHeader } from "@/components/page-header";
import { KbMyAcks } from "@/components/knowledge-bank/my-acks";
import { KbNav } from "@/components/knowledge-bank/shared";
import { loadKbMeta } from "../_load";

export const dynamic = "force-dynamic";

export default async function KnowledgeBankMyAcksPage() {
  const { meta } = await loadKbMeta();
  return (
    <div>
      <PageHeader
        title="My acknowledgements"
        breadcrumbs={[{ label: "Knowledge Bank", href: "/knowledge-bank" }, { label: "My acknowledgements" }]}
        description="Documents you are asked to read and confirm, and the ones you have already acknowledged."
      />
      <KbNav showManage={!!meta && (meta.caps.manage || meta.caps.approve)} />
      <KbMyAcks />
    </div>
  );
}
