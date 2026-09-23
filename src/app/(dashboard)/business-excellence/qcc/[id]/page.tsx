// One quality circle — its roster and its full project history (§6).

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/server";
import { can } from "@/lib/auth/permissions";
import { redirectMissingRecord } from "@/lib/nav/missing-record";
import { Plus, Users } from "lucide-react";
import { fmtDate } from "../../_meta";
import {
  QCC_MEMBER_ROLE_LABEL,
  QCC_PROJECT_STATUS_CHIP,
  QCC_PROJECT_STATUS_LABEL,
  QCC_TEAM_STATUS_CHIP,
  QCC_TEAM_STATUS_LABEL,
  type QccProjectListItem,
  type QccTeamDetail
} from "../../_meta-p2";
import { Chip, EmptyState, PersonRef, RecordRef, StatBox } from "../../ui";
import { RagChip } from "../../ui-p2";
import { TeamRoster } from "./roster";

export const dynamic = "force-dynamic";

type ProjectsResponse = {
  items: QccProjectListItem[];
  total: number;
  statusCounts: Record<string, number>;
};

export default async function QccTeamDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const user = await requirePermission("QCC.READ");

  let t: QccTeamDetail;
  try {
    t = await backendFetch<QccTeamDetail>(`/api/be/qcc/teams/${id}`);
  } catch {
    // A dead deep link becomes a redirect with a toast, never a blank page.
    redirectMissingRecord("/business-excellence/qcc", "Quality circle");
  }

  let projects: ProjectsResponse = { items: [], total: 0, statusCounts: {} };
  try {
    projects =
      (await backendFetch<ProjectsResponse>(`/api/be/qcc/teams/${id}/projects`)) ??
      projects;
  } catch {
    // A circle with an unreadable project list is still worth rendering — the
    // roster and its identity are the point of this page.
  }

  const canUpdate = (await can((user as any).id, "QCC.UPDATE", {})).allowed;
  const canCreate = (await can((user as any).id, "QCC.CREATE", {})).allowed;

  const active = t.members.filter((m) => !m.leftAt);
  const past = t.members.filter((m) => m.leftAt);

  return (
    <div>
      <PageHeader
        title={t.name}
        description={`${t.teamNo ?? "Not numbered"}${t.department ? ` · ${t.department}` : ""}`}
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Quality Circles", href: "/business-excellence/qcc" },
          { label: t.teamNo ?? t.name }
        ]}
        action={
          <div className="flex items-center gap-2">
            <Chip
              label={QCC_TEAM_STATUS_LABEL[t.status] ?? t.status}
              className={QCC_TEAM_STATUS_CHIP[t.status]}
            />
            {canCreate && t.status !== "DISBANDED" ? (
              <Button asChild>
                <Link
                  href={`/business-excellence/qcc/projects/new?teamId=${t.id}&plantId=${t.plantId}`}
                >
                  <Plus size={15} className="mr-1.5" />
                  New project
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      {t.motto ? (
        <p className="mb-5 rounded-xl border border-slate-200 bg-white p-4 text-sm italic text-slate-600">
          “{t.motto}”
        </p>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox label="Members" value={active.length} icon={Users} />
        <StatBox label="Live projects" value={t.activeProjects} />
        <StatBox label="Closed projects" value={t.closedProjects} tone="success" />
        <StatBox label="Formed" value={fmtDate(t.formedOn)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Projects</h2>
            {projects.items.length === 0 ? (
              <EmptyState
                title="No projects yet"
                description="A circle earns its place on the leaderboard by taking problems all the way to a validated benefit."
                action={
                  canCreate && t.status !== "DISBANDED" ? (
                    <Button asChild>
                      <Link
                        href={`/business-excellence/qcc/projects/new?teamId=${t.id}&plantId=${t.plantId}`}
                      >
                        Charter the first project
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {projects.items.map((p) => (
                  <li key={p.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <RecordRef
                        href={`/business-excellence/qcc/projects/${p.id}`}
                        code={p.projectNo}
                        title={p.title}
                      />
                      <div className="flex items-center gap-2">
                        <Chip
                          label={QCC_PROJECT_STATUS_LABEL[p.status] ?? p.status}
                          className={QCC_PROJECT_STATUS_CHIP[p.status]}
                        />
                        {!["CLOSED", "ABANDONED", "REJECTED"].includes(p.status) ? (
                          <RagChip rag={p.rag} />
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {p.methodology} · {p.signedOffStages}/{p.totalStages} gates
                      {p.currentStage ? ` · now at ${p.currentStage.toLowerCase()}` : null}
                      {p.targetDate ? ` · target ${fmtDate(p.targetDate)}` : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <TeamRoster
            teamId={t.id}
            members={t.members}
            canUpdate={canUpdate && t.status !== "DISBANDED"}
          />

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Circle</h2>
            <dl className="space-y-2.5 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Leader</dt>
                <dd className="mt-0.5">
                  <PersonRef person={t.leader} fallback="No leader named" />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">
                  Facilitator
                </dt>
                <dd className="mt-0.5">
                  <PersonRef person={t.facilitator} fallback="None named" />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Site</dt>
                <dd className="mt-0.5 text-slate-700">
                  {t.siteName ?? "—"}
                  {t.areaName ? <span className="text-slate-400"> · {t.areaName}</span> : null}
                </dd>
              </div>
              {t.disbandedOn ? (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-slate-400">
                    Disbanded
                  </dt>
                  <dd className="mt-0.5 text-slate-700">{fmtDate(t.disbandedOn)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {past.length ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-900">Past members</h2>
              {/* Kept visible on purpose: somebody who left is still barred from
                  validating a benefit on a project they worked on, and the roster
                  is where that rule becomes explicable. */}
              <p className="mt-1 text-xs text-slate-500">
                Still barred from signing off this circle&rsquo;s benefits.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {past.map((m) => (
                  <li key={m.id} className="flex items-center justify-between">
                    <PersonRef person={m.user} />
                    <span className="text-xs text-slate-400">
                      left {fmtDate(m.leftAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
