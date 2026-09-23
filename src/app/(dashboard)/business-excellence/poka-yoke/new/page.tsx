import { PageHeader } from "@/components/page-header";
import { resolvePlantContext } from "@/lib/plant-context";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { DeviceForm } from "./device-form";

export const dynamic = "force-dynamic";

export default async function NewPokaYokePage(props: {
  searchParams: Promise<{ plantId?: string }>;
}) {
  await requirePermission("POKAYOKE.CREATE");

  // Next 15: searchParams is a Promise and MUST be awaited.
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);
  const plantName = plants.find((p) => p.id === plantId)?.name ?? null;

  if (!plantId) {
    return (
      <div>
        <PageHeader title="Propose a Poka Yoke device" />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          No site is selected, and a device belongs to one. Pick a site on the register
          first.
        </div>
      </div>
    );
  }

  const areas = await prisma.area.findMany({
    where: { plantId },
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });

  return (
    <div>
      <PageHeader
        title="Propose a Poka Yoke device"
        description="Start from the defect that keeps coming back. Much of a plant's mistake-proofing is already fitted and undocumented — recording an existing device counts."
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Poka Yoke", href: "/business-excellence/poka-yoke" },
          { label: "New" }
        ]}
      />
      <DeviceForm plantId={plantId} plantName={plantName} areas={areas} />
    </div>
  );
}
