import { PageHeader } from "@/components/page-header";
import { resolvePlantContext } from "@/lib/plant-context";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { TeamForm } from "./team-form";

export const dynamic = "force-dynamic";

export default async function NewQccTeamPage(props: {
  searchParams: Promise<{ plantId?: string }>;
}) {
  await requirePermission("QCC.CREATE");

  // Next 15: searchParams is a Promise and MUST be awaited.
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);
  const plantName = plants.find((p) => p.id === plantId)?.name ?? null;

  if (!plantId) {
    return (
      <div>
        <PageHeader title="Form a quality circle" />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          No site is selected, and a circle belongs to one. Pick a site on the Quality
          Circles register first.
        </div>
      </div>
    );
  }

  // Read-only picker list scoped to a plant the caller already has; the backend
  // re-validates that the area belongs to the plant on save.
  const areas = await prisma.area.findMany({
    where: { plantId },
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });

  return (
    <div>
      <PageHeader
        title="Form a quality circle"
        description="A standing team from one area. It keeps its identity and its record across every project it takes on."
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Quality Circles", href: "/business-excellence/qcc" },
          { label: "New" }
        ]}
      />
      <TeamForm plantId={plantId} plantName={plantName} areas={areas} />
    </div>
  );
}
