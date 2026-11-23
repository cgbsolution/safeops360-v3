import { PageHeader } from "@/components/page-header";
import { DocDetail } from "@/components/knowledge-bank/doc-detail";
import { ErrorBox, KbNav } from "@/components/knowledge-bank/shared";
import { backendFetch } from "@/lib/backend/fetch";
import type { KbDocumentDetail } from "@/lib/knowledge-bank/api";
import { loadKbMeta } from "../_load";

export const dynamic = "force-dynamic";

export default async function KnowledgeBankDocumentPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  // Loading the detail records the read (view count, "opened before acknowledging").
  const [{ meta, error: metaError }, loaded] = await Promise.all([
    loadKbMeta(),
    backendFetch<KbDocumentDetail>(`/api/kb/documents/${encodeURIComponent(id)}`)
      .then((d) => ({ d, error: null as string | null }))
      .catch((e: any) => ({ d: null as KbDocumentDetail | null, error: (e?.message as string) ?? "Could not load the document" })),
  ]);
  const { d, error } = loaded;
  return (
    <div>
      <PageHeader
        title={d ? `${d.docNo} · ${d.title}` : "Knowledge Bank document"}
        breadcrumbs={[
          { label: "Knowledge Bank", href: "/knowledge-bank" },
          ...(d?.categoryName ? [{ label: d.categoryName, href: `/knowledge-bank?categoryId=${d.categoryId}` }] : []),
          { label: d?.docNo ?? "Document" },
        ]}
      />
      <KbNav showManage={!!meta && (meta.caps.manage || meta.caps.approve)} />
      {d && meta ? <DocDetail initial={d} meta={meta} /> : <ErrorBox error={error ?? metaError} />}
    </div>
  );
}
