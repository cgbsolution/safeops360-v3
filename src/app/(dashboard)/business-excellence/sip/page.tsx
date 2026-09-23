// Structured Improvement Project portfolio (§7).
//
// The portfolio view §7 asks for: every open, at-risk and closed project, with
// benefit realised against projected. RAG is derived server-side from milestone
// slippage and the target date — it is never stored, so it cannot go stale.

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlantSwitcher } from "@/components/plant-switcher";
import { FilterTab, FilterTabsList } from "@/components/ui/filter-tabs";
import { resolvePlantContext } from "@/lib/plant-context";
import { Can } from "@/components/auth/can";
import { Target, Plus, AlertTriangle, CheckCircle2, PauseCircle } from "lucide-react";
import { fmtDate } from "../_meta";
import {
  RAG_LABEL,
  SIP_STATUS_CHIP,
  SIP_STATUS_LABEL,
  fmtMetric,
  type SipListItem
} from "../_meta-p2";
import { Chip, EmptyState, LoadError, PersonRef, RecordRef, StatBox } from "../ui";
import { RagChip } from "../ui-p2";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type ListResponse = {
  items: SipListItem[];
  total: number;
  statusCounts: Record<string, number>;
  ragCounts: Record<string, number>;
};

const STATUS_TABS = [
  { code: "", label: "All" },
  { code: "SUBMITTED", label: "Awaiting review" },
  { code: "APPROVED", label: "Approved" },
  { code: "IN_PROGRESS", label: "In progress" },
  { code: "ON_HOLD", label: "On hold" },
  { code: "BENEFIT_VALIDATION", label: "Awaiting sign-off" },
  { code: "CLOSED", label: "Closed" }
];

export default async function SipPortfolioPage(props: {
  searchParams: Promise<{
    plantId?: string;
    status?: string;
    department?: string;
    ownerId?: string;
    rag?: string;
    q?: string;
  }>;
}) {
  // Next 15: searchParams is a Promise and MUST be awaited.
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);

  let data: ListResponse = { items: [], total: 0, statusCounts: {}, ragCounts: {} };
  let loadError: string | null = null;
  try {
    data =
      (await backendFetch<ListResponse>("/api/be/sip", {
        query: {
          plantId: plantId ?? undefined,
          status: searchParams.status || undefined,
          department: searchParams.department || undefined,
          ownerId: searchParams.ownerId || undefined,
          rag: searchParams.rag || undefined,
          q: searchParams.q || undefined,
          limit: 200
        }
      })) ?? data;
  } catch (e: any) {
    loadError = e?.message ?? "Could not load the improvement project portfolio.";
  }

  const items = data.items;
  const counts = data.statusCounts ?? {};
  const rag = data.ragCounts ?? {};
  const live = items.filter(
    (s) => !["CLOSED", "REJECTED", "CANCELLED"].includes(s.status)
  );

  return (
    <div>
      <PageHeader
        title="Improvement Projects"
        description="Sponsor-backed, cross-functional projects with a charter, a tracked metric and a validated benefit."
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Improvement Projects" }
        ]}
        action={
          <div className="flex items-center gap-2">
            <PlantSwitcher plants={plants} currentPlantId={plantId} />
            <Can permission="SIP.CREATE">
              <Button asChild>
                <Link href={`/business-excellence/sip/new?plantId=${plantId ?? ""}`}>
                  <Plus size={15} className="mr-1.5" />
                  New project
                </Link>
              </Button>
            </Can>
          </div>
        }
      />

      {loadError ? <LoadError what="The project portfolio" message={loadError} /> : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox label="Live projects" value={live.length} icon={Target} />
        <StatBox
          label="Off track"
          value={rag.RED ?? 0}
          icon={AlertTriangle}
          tone={(rag.RED ?? 0) > 0 ? "danger" : "default"}
          hint={`${rag.AMBER ?? 0} at risk`}
        />
        <StatBox
          label="On hold"
          value={counts.ON_HOLD ?? 0}
          icon={PauseCircle}
          tone={(counts.ON_HOLD ?? 0) > 0 ? "warning" : "default"}
        />
        <StatBox
          label="Closed"
          value={counts.CLOSED ?? 0}
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterTabsList>
          {STATUS_TABS.map((t) => {
            const params = new URLSearchParams();
            if (plantId) params.set("plantId", plantId);
            if (t.code) params.set("status", t.code);
            return (
              <FilterTab
                key={t.code || "all"}
                href={`/business-excellence/sip?${params.toString()}`}
                active={(searchParams.status ?? "") === t.code}
                label={t.label}
                count={t.code ? counts[t.code] : data.total}
              />
            );
          })}
        </FilterTabsList>

        <div className="flex gap-1.5">
          {["RED", "AMBER", "GREEN"].map((r) => {
            const params = new URLSearchParams();
            if (plantId) params.set("plantId", plantId);
            if (searchParams.rag !== r) params.set("rag", r);
            return (
              <Link
                key={r}
                href={`/business-excellence/sip?${params.toString()}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  searchParams.rag === r
                    ? "border-primary-300 bg-primary-50 text-primary-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {RAG_LABEL[r]} ({rag[r] ?? 0})
              </Link>
            );
          })}
        </div>
      </div>

      {items.length === 0 && !loadError ? (
        <EmptyState
          icon={Target}
          title="No improvement projects yet"
          description="A SIP is bigger than a Kaizen: it has a sponsor, a budget, a tracked metric and a formal sign-off before it opens."
          action={
            <Can permission="SIP.CREATE">
              <Button asChild>
                <Link href={`/business-excellence/sip/new?plantId=${plantId ?? ""}`}>
                  Register the first project
                </Link>
              </Button>
            </Can>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <Table className="w-full min-w-[1000px] text-sm">
            <TableHeader className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <TableRow>
                <TableHead className="px-4 py-3">Project</TableHead>
                <TableHead className="px-4 py-3">Owner</TableHead>
                <TableHead className="px-4 py-3">Sponsor</TableHead>
                <TableHead className="px-4 py-3">Metric</TableHead>
                <TableHead className="px-4 py-3">Milestones</TableHead>
                <TableHead className="px-4 py-3">Status</TableHead>
                <TableHead className="px-4 py-3">Health</TableHead>
                <TableHead className="px-4 py-3">Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {items.map((s) => (
                <TableRow key={s.id} className="hover:bg-slate-50/60">
                  <TableCell className="px-4 py-3">
                    <RecordRef
                      href={`/business-excellence/sip/${s.id}`}
                      code={s.sipNo}
                      title={s.title}
                    />
                    {s.department ? (
                      <div className="mt-0.5 text-xs text-slate-500">{s.department}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <PersonRef person={s.owner} />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <PersonRef person={s.sponsor} fallback="No sponsor" />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {s.metricName ? (
                      <>
                        <div className="text-slate-700">{s.metricName}</div>
                        <div className="text-xs text-slate-500">
                          {fmtMetric(s.baselineValue, s.metricUnit) ?? "—"} →{" "}
                          {fmtMetric(s.targetValue, s.metricUnit) ?? "—"}
                          {s.metricPercent !== null ? (
                            <span className="ml-1 text-slate-400">
                              ({s.metricPercent}%)
                            </span>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-400">Not set</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-slate-600">
                    <span className="tabular-nums">
                      {s.milestoneCompleted}/{s.milestoneTotal}
                    </span>
                    {s.milestoneLate ? (
                      <span className="ml-1 text-rose-600">· {s.milestoneLate} late</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Chip
                      label={SIP_STATUS_LABEL[s.status] ?? s.status}
                      className={SIP_STATUS_CHIP[s.status]}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {["CLOSED", "REJECTED", "CANCELLED"].includes(s.status) ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <RagChip rag={s.rag} />
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-slate-500">{fmtDate(s.targetDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
