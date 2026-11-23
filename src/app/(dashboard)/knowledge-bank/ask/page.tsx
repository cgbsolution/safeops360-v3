import { PageHeader } from "@/components/page-header";
import { KbAsk } from "@/components/knowledge-bank/ask";
import { ErrorBox, KbNav } from "@/components/knowledge-bank/shared";
import { backendFetch } from "@/lib/backend/fetch";
import type { KbDocumentDetail } from "@/lib/knowledge-bank/api";
import { loadKbMeta } from "../_load";

export const dynamic = "force-dynamic";

export default async function KnowledgeBankAskPage(props: { searchParams: Promise<{ doc?: string }> }) {
  const sp = await props.searchParams;
  const { meta, error } = await loadKbMeta();
  let doc: { id: string; docNo: string; title: string } | null = null;
  if (sp.doc) {
    const d = await backendFetch<KbDocumentDetail>(`/api/kb/documents/${encodeURIComponent(sp.doc)}`).catch(() => null);
    doc = d ? { id: d.id, docNo: d.docNo, title: d.title } : null;
  }
  return (
    <div>
      <PageHeader
        title="Ask the Knowledge Bank"
        breadcrumbs={[{ label: "Knowledge Bank", href: "/knowledge-bank" }, { label: "Ask" }]}
        description="Ask a safety question in plain words. The answer comes only from published documents, and every point names the document, version and passage it came from."
      />
      <KbNav showManage={!!meta && (meta.caps.manage || meta.caps.approve)} />
      {meta ? <KbAsk meta={meta} document={doc} /> : <ErrorBox error={error} />}
    </div>
  );
}
