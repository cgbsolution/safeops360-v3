import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import type { Cycle, EnvMetric, EnvSlot, EnvTotals } from "../../lib-brsr";
import { EnvironmentView } from "./environment-view";

export const dynamic = "force-dynamic";

type Plant = { id: string; name: string };

export default async function EnvironmentPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const { cycleId } = await params;
  await requirePermission("BRSR.READ");

  let cycle: Cycle | null = null;
  let metrics: EnvMetric[] = [];
  let slots: EnvSlot[] = [];
  let totals: EnvTotals | null = null;
  let plants: Plant[] = [];
  let error: string | null = null;

  try {
    const [c, m, s, t, p] = await Promise.all([
      backendFetch<Cycle>(`/api/brsr/cycles/${cycleId}`),
      backendFetch<EnvMetric[]>(`/api/brsr/cycles/${cycleId}/env`),
      backendFetch<EnvSlot[]>(`/api/brsr/env/slots`),
      backendFetch<EnvTotals>(`/api/brsr/cycles/${cycleId}/env/totals`),
      backendFetch<Plant[] | { items: Plant[] }>(`/api/plants`),
    ]);
    cycle = c;
    metrics = m ?? [];
    slots = s ?? [];
    totals = t;
    plants = Array.isArray(p) ? p : (p?.items ?? []);
  } catch (e: any) {
    error = e?.message ?? "Failed to load environmental data";
  }

  return (
    <div>
      <PageHeader
        title="Environmental Metrics"
        description="Per-facility capture for Principle 6 — energy by carrier, water by source and destination, waste by SEBI category, and emissions computed from activity data using cited factors. This is the source of truth; the Facilities environmental tab is derived from it."
        breadcrumbs={[
          { label: "BRSR Reporting", href: "/brsr" },
          { label: cycle?.financialYear ?? cycleId, href: `/brsr/${cycleId}` },
          { label: "Environmental Metrics" },
        ]}
      />
      {error || !cycle ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          {error ?? "Cycle not found"}
        </div>
      ) : (
        <EnvironmentView
          cycle={cycle}
          metrics={metrics}
          slots={slots}
          totals={totals}
          plants={plants}
        />
      )}
    </div>
  );
}
