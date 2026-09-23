import { PageHeader } from "@/components/page-header";
import { resolvePlantContext } from "@/lib/plant-context";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { OplForm } from "./opl-form";

export const dynamic = "force-dynamic";

export default async function NewOplPage(props: {
  searchParams: Promise<{ plantId?: string }>;
}) {
  await requirePermission("OPL.CREATE");

  // Next 15: searchParams is a Promise and MUST be awaited.
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);
  const plantName = plants.find((p) => p.id === plantId)?.name ?? null;

  if (!plantId) {
    return (
      <div>
        <PageHeader title="Write a One Point Lesson" />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          No site is selected, and a lesson belongs to one. Pick a site on the register
          first.
        </div>
      </div>
    );
  }

  const [areas, roles] = await Promise.all([
    prisma.area.findMany({
      where: { plantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    }),
    // Roles are the audience axis people actually think in ("all line leaders").
    // Read-only picker data; the backend resolves the audience against the real
    // roster at publish time.
    prisma.role.findMany({
      select: { code: true, name: true },
      orderBy: { name: "asc" }
    })
  ]);

  return (
    <div>
      <PageHeader
        title="Write a One Point Lesson"
        description="One page, one lesson, one audience. The strongest OPLs are written the same week something went wrong, while the detail is still fresh."
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "One Point Lesson", href: "/business-excellence/opl" },
          { label: "New" }
        ]}
      />
      <OplForm plantId={plantId} plantName={plantName} areas={areas} roles={roles} />
    </div>
  );
}
