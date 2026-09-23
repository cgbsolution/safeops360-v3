import { PageHeader } from "@/components/page-header";
import { resolvePlantContext } from "@/lib/plant-context";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { SuggestionForm } from "./suggestion-form";

export const dynamic = "force-dynamic";

export default async function NewSuggestionPage(props: {
  searchParams: Promise<{ plantId?: string }>;
}) {
  await requirePermission("SUGGESTION.CREATE");

  // Next 15: searchParams is a Promise and MUST be awaited.
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);
  const plantName = plants.find((p) => p.id === plantId)?.name ?? null;

  if (!plantId) {
    // A suggestion without a site cannot be scoped, numbered or routed to a
    // screener. Say so rather than rendering a form whose save will fail.
    return (
      <div>
        <PageHeader title="Make a suggestion" />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          No site is selected, and a suggestion belongs to one. Pick a site on the
          Suggestion Scheme register first.
        </div>
      </div>
    );
  }

  // Areas come straight from Prisma rather than a backend round-trip: this is a
  // read-only picker scoped to a plant the caller already has, and the backend
  // re-validates that the area belongs to the plant on save anyway.
  const areas = await prisma.area.findMany({
    where: { plantId },
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });

  return (
    <div>
      <PageHeader
        title="Make a suggestion"
        description="Anything that would make this place work better. It does not have to be about a machine, and it does not have to be fully worked out."
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Suggestion Scheme", href: "/business-excellence/suggestions" },
          { label: "New" }
        ]}
      />
      <SuggestionForm plantId={plantId} plantName={plantName} areas={areas} />
    </div>
  );
}
