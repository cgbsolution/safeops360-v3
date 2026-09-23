import { PageHeader } from "@/components/page-header";
import { backendFetch } from "@/lib/backend/fetch";
import { resolvePlantContext } from "@/lib/plant-context";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { ProjectForm } from "./project-form";
import type { QccTeamListItem } from "../../../_meta-p2";

export const dynamic = "force-dynamic";

export default async function NewQccProjectPage(props: {
  searchParams: Promise<{ plantId?: string; teamId?: string }>;
}) {
  await requirePermission("QCC.CREATE");

  // Next 15: searchParams is a Promise and MUST be awaited.
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);
  const plantName = plants.find((p) => p.id === plantId)?.name ?? null;

  if (!plantId) {
    return (
      <div>
        <PageHeader title="Charter a circle project" />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          No site is selected, and a project belongs to one. Pick a site on the project
          register first.
        </div>
      </div>
    );
  }

  // The circle list comes from the backend rather than Prisma: the picker must
  // only offer circles this caller can actually read, and that scoping lives in
  // access_scope, not here.
  let teams: QccTeamListItem[] = [];
  try {
    const res = await backendFetch<{ items: QccTeamListItem[] }>("/api/be/qcc/teams", {
      query: { plantId, limit: 200 }
    });
    teams = (res?.items ?? []).filter((t) => t.status !== "DISBANDED");
  } catch {
    // Fall through to the empty-state below rather than 500ing the page.
  }

  if (!teams.length) {
    return (
      <div>
        <PageHeader
          title="Charter a circle project"
          breadcrumbs={[
            { label: "Business Excellence", href: "/business-excellence" },
            { label: "Quality Circles", href: "/business-excellence/qcc" },
            { label: "New project" }
          ]}
        />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          There is no active circle at {plantName ?? "this site"} to take a project on.
          Form a circle first — a project belongs to a team, and the team is what keeps
          its history across projects.
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
        title="Charter a circle project"
        description="One problem, a baseline, a target, and a set of gates to work through."
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Quality Circles", href: "/business-excellence/qcc" },
          { label: "New project" }
        ]}
      />
      <ProjectForm
        plantId={plantId}
        plantName={plantName}
        areas={areas}
        teams={teams.map((t) => ({ id: t.id, name: t.name, teamNo: t.teamNo }))}
        initialTeamId={searchParams.teamId}
      />
    </div>
  );
}
