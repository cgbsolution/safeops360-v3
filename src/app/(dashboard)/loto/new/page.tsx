import { PageHeader } from "@/components/page-header";
import { resolvePlantContext } from "@/lib/plant-context";
import { ProcedureBuilder } from "@/components/loto/procedure-builder";

export const dynamic = "force-dynamic";

export default async function NewLotoProcedurePage(props: {
  searchParams: Promise<{ plantId?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);
  const plantName = plants.find((p) => p.id === plantId)?.name ?? null;

  if (!plantId) {
    // A procedure without a site cannot be scoped, numbered or reviewed. Say so
    // rather than rendering a form whose save will fail.
    return (
      <div>
        <PageHeader title="New LOTO Procedure" />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          No site is selected, and a LOTO procedure belongs to one. Pick a site from
          the procedure library first.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="New LOTO Procedure"
        description="Author the isolation sequence once. It is then reusable, QR-accessible at the equipment, and reviewed on a schedule."
        breadcrumbs={[
          { label: "LOTO", href: "/loto" },
          { label: "New procedure" }
        ]}
      />
      <ProcedureBuilder plantId={plantId} plantName={plantName} />
    </div>
  );
}
