// Quality Circle project register (§6) — every circle's projects, across the
// plant, with the stage-gate position and the RAG rollup on each row.

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlantSwitcher } from "@/components/plant-switcher";
import { FilterTab, FilterTabsList } from "@/components/ui/filter-tabs";
import { resolvePlantContext } from "@/lib/plant-context";
import { Can } from "@/components/auth/can";
import { FolderKanban, Plus, Users, CheckCircle2, AlertTriangle } from "lucide-react";
import { fmtDate } from "../../_meta";
import {
  QCC_PROJECT_STATUS_CHIP,
  QCC_PROJECT_STATUS_LABEL,
  STAGE_LABEL,
  type QccProjectListItem
} from "../../_meta-p2";
import { Chip, EmptyState, LoadError, RecordRef, StatBox } from "../../ui";
import { RagChip } from "../../ui-p2";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type ListResponse = {
  items: QccProjectListItem[];
  total: number;
  statusCounts: Record<string, number>;
};

const STATUS_TABS = [
  { code: "", label: "All" },
  { code: "CHARTERED", label: "Chartered" },
  { code: "IN_PROGRESS", label: "In progress" },
  { code: "COMPLETED", label: "Work complete" },
  { code: "BENEFIT_VALIDATION", label: "Awaiting sign-off" },
  { code: "CLOSED", label: "Closed" }
];

export default async function QccProjectsPage(props: {
  searchParams: Promise<{
    plantId?: string;
    status?: string;
    teamId?: string;
    category?: string;
    rag?: string;
    q?: string;
  }>;
}) {
  // Next 15: searchParams is a Promise and MUST be awaited.
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);

  let data: ListResponse = { items: [], total: 0, statusCounts: {} };
  let loadError: string | null = null;
  try {
    data =
      (await backendFetch<ListResponse>("/api/be/qcc/projects", {
        query: {
          plantId: plantId ?? undefined,
          status: searchParams.status || undefined,
          teamId: searchParams.teamId || undefined,
          category: searchParams.category || undefined,
          rag: searchParams.rag || undefined,
          q: searchParams.q || undefined,
          limit: 200
        }
      })) ?? { items: [], total: 0, statusCounts: {} };
  } catch (e: any) {
    loadError = e?.message ?? "Could not load the project register.";
  }

  const items = data.items;
  const counts = data.statusCounts ?? {};
  const live = items.filter(
    (p) => !["CLOSED", "ABANDONED", "REJECTED"].includes(p.status)
  );
  const atRisk = live.filter((p) => p.rag !== "GREEN").length;
  const closed = counts.CLOSED ?? 0;

  return (
    <div>
      <PageHeader
        title="Circle projects"
        description="Stage-gated problem solving. Each gate needs a sign-off before the next one opens."
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Quality Circles", href: "/business-excellence/qcc" },
          { label: "Projects" }
        ]}
        action={
          <div className="flex items-center gap-2">
            <PlantSwitcher plants={plants} currentPlantId={plantId} />
            <Button asChild variant="outline">
              <Link href={`/business-excellence/qcc?plantId=${plantId ?? ""}`}>
                <Users size={15} className="mr-1.5" />
                Circles
              </Link>
            </Button>
            <Can permission="QCC.CREATE">
              <Button asChild>
                <Link href={`/business-excellence/qcc/projects/new?plantId=${plantId ?? ""}`}>
                  <Plus size={15} className="mr-1.5" />
                  New project
                </Link>
              </Button>
            </Can>
          </div>
        }
      />

      {loadError ? <LoadError what="The project register" message={loadError} /> : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox label="Live projects" value={live.length} icon={FolderKanban} />
        <StatBox
          label="At risk"
          value={atRisk}
          icon={AlertTriangle}
          tone={atRisk > 0 ? "warning" : "default"}
        />
        <StatBox
          label="Awaiting benefit sign-off"
          value={counts.BENEFIT_VALIDATION ?? 0}
          tone={(counts.BENEFIT_VALIDATION ?? 0) > 0 ? "warning" : "default"}
        />
        <StatBox label="Closed" value={closed} icon={CheckCircle2} tone="success" />
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
                href={`/business-excellence/qcc/projects?${params.toString()}`}
                active={(searchParams.status ?? "") === t.code}
                label={t.label}
                count={t.code ? counts[t.code] : data.total}
              />
            );
          })}
        </FilterTabsList>
      </div>

      {items.length === 0 && !loadError ? (
        <EmptyState
          icon={FolderKanban}
          title="No circle projects yet"
          description="A project belongs to a circle. Form one first, then charter its problem with a baseline and a target."
          action={
            <Button asChild variant="outline">
              <Link href={`/business-excellence/qcc?plantId=${plantId ?? ""}`}>
                Go to the circles
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <Table className="w-full min-w-[920px] text-sm">
            <TableHeader className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <TableRow>
                <TableHead className="px-4 py-3">Project</TableHead>
                <TableHead className="px-4 py-3">Circle</TableHead>
                <TableHead className="px-4 py-3">Gates</TableHead>
                <TableHead className="px-4 py-3">Status</TableHead>
                <TableHead className="px-4 py-3">Health</TableHead>
                <TableHead className="px-4 py-3">Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {items.map((p) => (
                <TableRow key={p.id} className="hover:bg-slate-50/60">
                  <TableCell className="px-4 py-3">
                    <RecordRef
                      href={`/business-excellence/qcc/projects/${p.id}`}
                      code={p.projectNo}
                      title={p.title}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {p.teamName ? (
                      <Link
                        href={`/business-excellence/qcc/${p.teamId}`}
                        className="text-slate-700 hover:text-primary-700"
                      >
                        {p.teamName}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-primary-500"
                          style={{ width: `${p.stagePercent ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500">
                        {p.signedOffStages}/{p.totalStages}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {p.methodology}
                      {p.currentStage
                        ? ` · ${STAGE_LABEL[p.currentStage] ?? p.currentStage}`
                        : ""}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Chip
                      label={QCC_PROJECT_STATUS_LABEL[p.status] ?? p.status}
                      className={QCC_PROJECT_STATUS_CHIP[p.status]}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {["CLOSED", "ABANDONED", "REJECTED"].includes(p.status) ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <RagChip rag={p.rag} />
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-slate-500">{fmtDate(p.targetDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
