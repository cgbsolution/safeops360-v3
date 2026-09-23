import { PageHeader } from "@/components/page-header";
import { resolvePlantContext } from "@/lib/plant-context";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { SipForm } from "./sip-form";

export const dynamic = "force-dynamic";

export default async function NewSipPage(props: {
  searchParams: Promise<{ plantId?: string }>;
}) {
  await requirePermission("SIP.CREATE");

  // Next 15: searchParams is a Promise and MUST be awaited.
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);
  const plantName = plants.find((p) => p.id === plantId)?.name ?? null;

  if (!plantId) {
    return (
      <div>
        <PageHeader title="Register an improvement project" />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          No site is selected, and a project belongs to one. Pick a site on the
          portfolio first.
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
        title="Register an improvement project"
        description="Bigger than a Kaizen: a sponsor, a charter, a tracked metric and a formal sign-off before it opens."
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Improvement Projects", href: "/business-excellence/sip" },
          { label: "New" }
        ]}
      />
      <SipForm plantId={plantId} plantName={plantName} areas={areas} />
    </div>
  );
}
