import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import { PRINCIPLE_SHORT, type Cycle, type PrincipleDetail } from "../../../lib-brsr";
import { PrincipleView } from "./principle-view";

export const dynamic = "force-dynamic";

export default async function PrinciplePage({
  params,
}: {
  params: Promise<{ cycleId: string; principle: string }>;
}) {
  const { cycleId, principle } = await params;
  await requirePermission("BRSR.READ");

  let detail: PrincipleDetail | null = null;
  let cycle: Cycle | null = null;
  let error: string | null = null;
  try {
    [detail, cycle] = await Promise.all([
      backendFetch<PrincipleDetail>(`/api/brsr/cycles/${cycleId}/principles/${principle}`),
      backendFetch<Cycle>(`/api/brsr/cycles/${cycleId}`),
    ]);
  } catch (e: any) {
    error = e?.message ?? "Failed to load this principle";
  }

  return (
    <div>
      <PageHeader
        title={`${principle} — ${PRINCIPLE_SHORT[principle] ?? "Principle"}`}
        description={detail?.response.title ?? undefined}
        breadcrumbs={[
          { label: "BRSR Reporting", href: "/brsr" },
          { label: cycle?.financialYear ?? cycleId, href: `/brsr/${cycleId}` },
          { label: principle },
        ]}
      />
      {error || !detail || !cycle ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          {error ?? "Principle not found"}
        </div>
      ) : (
        <PrincipleView cycleId={cycleId} cycle={cycle} detail={detail} />
      )}
    </div>
  );
}
