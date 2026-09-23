import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import type { Cycle } from "./lib-brsr";
import { CycleRegister } from "./cycle-register";

export const dynamic = "force-dynamic";

export default async function BrsrPage() {
  await requirePermission("BRSR.READ");

  let cycles: Cycle[] = [];
  let error: string | null = null;
  try {
    cycles = (await backendFetch<Cycle[]>("/api/brsr/cycles")) ?? [];
  } catch (e: any) {
    error = e?.message ?? "Failed to load BRSR reporting cycles";
  }

  return (
    <div>
      <PageHeader
        title="BRSR Reporting"
        description="SEBI Business Responsibility & Sustainability Reporting — one cycle per financial year, assembled across all nine Principles. Figures the platform can derive are auto-populated with a traceable link back to every source record; the rest is direct entry."
        breadcrumbs={[{ label: "BRSR Reporting" }]}
      />
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          {error}
        </div>
      ) : (
        <CycleRegister cycles={cycles} />
      )}
    </div>
  );
}
