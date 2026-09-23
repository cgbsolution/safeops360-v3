// Quality Circle register — the circles themselves (§6).
//
// The circle is a row rather than a field on a project because §6 wants
// "team-level history retained across multiple projects, supporting a running
// team leaderboard". A circle that completed four projects over three years is
// the unit the leaderboard ranks.

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlantSwitcher } from "@/components/plant-switcher";
import { FilterTab, FilterTabsList } from "@/components/ui/filter-tabs";
import { resolvePlantContext } from "@/lib/plant-context";
import { Can } from "@/components/auth/can";
import { Users, Plus, Trophy, FolderKanban, UserCheck } from "lucide-react";
import { fmtDate } from "../_meta";
import {
  QCC_TEAM_STATUS_CHIP,
  QCC_TEAM_STATUS_LABEL,
  type QccTeamListItem
} from "../_meta-p2";
import { Chip, EmptyState, LoadError, PersonRef, RecordRef, StatBox } from "../ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type ListResponse = {
  items: QccTeamListItem[];
  total: number;
  statusCounts: Record<string, number>;
};

const STATUS_TABS = [
  { code: "", label: "All" },
  { code: "FORMING", label: "Forming" },
  { code: "ACTIVE", label: "Active" },
  { code: "DORMANT", label: "Dormant" },
  { code: "DISBANDED", label: "Disbanded" }
];

export default async function QccTeamsPage(props: {
  searchParams: Promise<{ plantId?: string; status?: string; department?: string; q?: string }>;
}) {
  // Next 15: searchParams is a Promise and MUST be awaited.
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);

  let data: ListResponse = { items: [], total: 0, statusCounts: {} };
  let loadError: string | null = null;
  try {
    data =
      (await backendFetch<ListResponse>("/api/be/qcc/teams", {
        query: {
          plantId: plantId ?? undefined,
          status: searchParams.status || undefined,
          department: searchParams.department || undefined,
          q: searchParams.q || undefined,
          limit: 200
        }
      })) ?? { items: [], total: 0, statusCounts: {} };
  } catch (e: any) {
    loadError = e?.message ?? "Could not load the quality circle register.";
  }

  const items = data.items;
  const counts = data.statusCounts ?? {};
  const activeCircles = counts.ACTIVE ?? 0;
  const liveProjects = items.reduce((n, t) => n + t.activeProjects, 0);
  const closedProjects = items.reduce((n, t) => n + t.closedProjects, 0);
  const people = items.reduce((n, t) => n + t.memberCount, 0);

  // The leaderboard is a plain sort of what is already on the page, not a second
  // fetch — the register is capped at 200 circles and the dashboard carries the
  // authoritative, plant-scoped version.
  const leaderboard = [...items]
    .filter((t) => t.closedProjects > 0)
    .sort((a, b) => b.closedProjects - a.closedProjects)
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Quality Circles"
        description="Standing teams that take on one problem at a time, through a defined set of gates."
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Quality Circles" }
        ]}
        action={
          <div className="flex items-center gap-2">
            <PlantSwitcher plants={plants} currentPlantId={plantId} />
            <Button asChild variant="outline">
              <Link href={`/business-excellence/qcc/projects?plantId=${plantId ?? ""}`}>
                <FolderKanban size={15} className="mr-1.5" />
                All projects
              </Link>
            </Button>
            <Can permission="QCC.CREATE">
              <Button asChild>
                <Link href={`/business-excellence/qcc/new?plantId=${plantId ?? ""}`}>
                  <Plus size={15} className="mr-1.5" />
                  Form a circle
                </Link>
              </Button>
            </Can>
          </div>
        }
      />

      {loadError ? <LoadError what="The quality circle register" message={loadError} /> : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox label="Active circles" value={activeCircles} icon={Users} tone="success" />
        <StatBox label="Live projects" value={liveProjects} icon={FolderKanban} />
        <StatBox label="Projects closed" value={closedProjects} icon={Trophy} tone="success" />
        <StatBox label="People involved" value={people} icon={UserCheck} />
      </div>

      <div className="mb-4">
        <FilterTabsList>
          {STATUS_TABS.map((t) => {
            const params = new URLSearchParams();
            if (plantId) params.set("plantId", plantId);
            if (t.code) params.set("status", t.code);
            return (
              <FilterTab
                key={t.code || "all"}
                href={`/business-excellence/qcc?${params.toString()}`}
                active={(searchParams.status ?? "") === t.code}
                label={t.label}
                count={t.code ? counts[t.code] : data.total}
              />
            );
          })}
        </FilterTabsList>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {items.length === 0 && !loadError ? (
            <EmptyState
              icon={Users}
              title="No circles formed yet"
              description="A quality circle is a standing team from one area that works through problems together. Form one, then charter its first project."
              action={
                <Can permission="QCC.CREATE">
                  <Button asChild>
                    <Link href={`/business-excellence/qcc/new?plantId=${plantId ?? ""}`}>
                      Form the first circle
                    </Link>
                  </Button>
                </Can>
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <Table className="w-full min-w-[760px] text-sm">
                <TableHeader className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                  <TableRow>
                    <TableHead className="px-4 py-3">Circle</TableHead>
                    <TableHead className="px-4 py-3">Leader</TableHead>
                    <TableHead className="px-4 py-3">Members</TableHead>
                    <TableHead className="px-4 py-3">Projects</TableHead>
                    <TableHead className="px-4 py-3">Status</TableHead>
                    <TableHead className="px-4 py-3">Formed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {items.map((t) => (
                    <TableRow key={t.id} className="hover:bg-slate-50/60">
                      <TableCell className="px-4 py-3">
                        <RecordRef
                          href={`/business-excellence/qcc/${t.id}`}
                          code={t.teamNo}
                          title={t.name}
                        />
                        <div className="mt-0.5 text-xs text-slate-500">
                          {t.department ?? t.areaName ?? t.siteName ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <PersonRef person={t.leader} fallback="No leader named" />
                      </TableCell>
                      <TableCell className="px-4 py-3 tabular-nums text-slate-600">
                        {t.memberCount}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-slate-600">
                        <span className="tabular-nums">{t.activeProjects}</span> live
                        {t.closedProjects ? (
                          <span className="text-slate-400">
                            {" "}
                            · {t.closedProjects} closed
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Chip
                          label={QCC_TEAM_STATUS_LABEL[t.status] ?? t.status}
                          className={QCC_TEAM_STATUS_CHIP[t.status]}
                        />
                      </TableCell>
                      <TableCell className="px-4 py-3 text-slate-500">{fmtDate(t.formedOn)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <aside>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="flex items-center gap-1.5 font-semibold text-slate-900">
              <Trophy size={15} className="text-amber-500" />
              Leaderboard
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              By projects taken all the way to closure — which means the benefit was
              validated too.
            </p>
            {leaderboard.length ? (
              <ol className="mt-3 space-y-2">
                {leaderboard.map((t, i) => (
                  <li key={t.id} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold tabular-nums text-slate-600">
                      {i + 1}
                    </span>
                    <Link
                      href={`/business-excellence/qcc/${t.id}`}
                      className="min-w-0 flex-1 truncate text-sm text-slate-800 hover:text-primary-700"
                    >
                      {t.name}
                    </Link>
                    <span className="tabular-nums text-sm font-semibold text-slate-700">
                      {t.closedProjects}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Nothing to rank yet — no circle has closed a project.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
