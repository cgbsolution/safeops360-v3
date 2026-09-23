import { backendFetch } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";
import { NearMissForm } from "../near-miss-form";
import { requirePermission } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

type PlantWithAreas = {
  id: string;
  name: string;
  areas?: { id: string; name: string }[];
};

export default async function NewNearMissPage() {
  await requirePermission("NEAR_MISS.CREATE");
  // GET /api/plants?include_areas=true replaces a Prisma findMany with
  // `include: { areas: true }`. The backend scopes the list to the plants this
  // user may act in — the Prisma query returned every plant regardless, so a
  // user could pick a plant outside their scope in the form.
  const plants =
    (await backendFetch<PlantWithAreas[]>("/api/plants?include_areas=true").catch(() => null)) ?? [];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Report Near Miss"
        description="An unplanned event that did not result in injury but could have"
        breadcrumbs={[{ label: "Near Miss", href: "/near-miss" }, { label: "New" }]}
      />
      <NearMissForm
        plants={plants.map((p) => ({
          id: p.id,
          name: p.name,
          areas: (p.areas ?? []).map((a) => ({ id: a.id, name: a.name }))
        }))}
      />
    </div>
  );
}
