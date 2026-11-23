import { PageHeader } from "@/components/page-header";
import { ProcessSafetyHub } from "@/components/pha/process-safety-hub";
import { PhaNav } from "@/components/pha/shared";
import { requirePermission } from "@/lib/auth/server";
import { resolvePlantContext } from "@/lib/plant-context";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Process Safety | SafeOps360",
};

export default async function ProcessSafetyPage(props: { searchParams: Promise<{ plantId?: string }> }) {
  await requirePermission("PHA.READ");
  const sp = await props.searchParams;
  const { plants } = await resolvePlantContext(null);
  return (
    <div>
      <PageHeader
        title="Process Safety"
        breadcrumbs={[{ label: "Process Safety" }]}
        description="Process hazard analysis, pre-startup safety reviews, the chemical register and process safety information for the plant."
      />
      <PhaNav />
      <ProcessSafetyHub plants={plants} defaultPlantId={sp.plantId ?? null} />
    </div>
  );
}
