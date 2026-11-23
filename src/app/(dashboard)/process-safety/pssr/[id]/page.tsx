import { PageHeader } from "@/components/page-header";
import { PssrDetailView } from "@/components/pssr-psi/pssr-detail";
import { PssrNav, Tag } from "@/components/pssr-psi/shared";
import { backendFetch } from "@/lib/backend/fetch";
import type { PssrDetail, PssrMeta } from "@/lib/pssr-psi/api";

export const dynamic = "force-dynamic";

export default async function PssrDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  let error: string | null = null;
  const [review, meta] = await Promise.all([
    backendFetch<PssrDetail>(`/api/pssr/reviews/${encodeURIComponent(id)}`).catch((e: any) => {
      error = e?.message ?? "Could not load the review";
      return null;
    }),
    backendFetch<PssrMeta>("/api/pssr/meta").catch(() => null),
  ]);
  return (
    <div>
      <PageHeader
        title={review ? `${review.pssrNo} · ${review.title}` : "Pre-startup safety review"}
        breadcrumbs={[
          { label: "Process Safety", href: "/process-safety" },
          { label: "PSSR", href: "/process-safety/pssr" },
          { label: review?.pssrNo ?? "Review" },
        ]}
        action={review ? <Tag code={review.status} /> : undefined}
      />
      <PssrNav />
      {review ? (
        <PssrDetailView initial={review} meta={meta} />
      ) : (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{error}</div>
      )}
    </div>
  );
}
