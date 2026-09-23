// Suggestion Scheme register (§3).
//
// Server component: reads through the FastAPI backend, never Prisma directly,
// so plant scoping, the overdue computation AND the anonymity rule all come
// from the one place that owns them. The submitter's name arrives already
// suppressed on an anonymous row — this screen never has the identity to leak.

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlantSwitcher } from "@/components/plant-switcher";
import { FilterTab, FilterTabsList } from "@/components/ui/filter-tabs";
import { resolvePlantContext } from "@/lib/plant-context";
import { Can } from "@/components/auth/can";
import { MessageSquarePlus, Plus, Clock, CheckCircle2, Inbox, EyeOff } from "lucide-react";
import { KAIZEN_CATEGORY_LABEL, fmtDate } from "../_meta";
import {
  SCREENING_OUTCOME_LABEL,
  SUGGESTION_STATUS_CHIP,
  SUGGESTION_STATUS_LABEL,
  type SuggestionListItem
} from "../_meta-p2";
import { Chip, EmptyState, LoadError, PersonRef, RecordRef, StatBox } from "../ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type ListResponse = {
  items: SuggestionListItem[];
  total: number;
  statusCounts: Record<string, number>;
};

const STATUS_TABS = [
  { code: "", label: "All" },
  { code: "SUBMITTED", label: "Awaiting triage" },
  { code: "SCREENING", label: "With the committee" },
  { code: "ACCEPTED", label: "Accepted" },
  { code: "IN_IMPLEMENTATION", label: "Implementing" },
  { code: "DEFERRED", label: "Deferred" },
  { code: "CLOSED", label: "Closed" }
];

export default async function SuggestionRegisterPage(props: {
  searchParams: Promise<{
    plantId?: string;
    status?: string;
    category?: string;
    outcome?: string;
    decision?: string;
    mine?: string;
    overdue?: string;
    q?: string;
  }>;
}) {
  // Next 15: searchParams is a Promise and MUST be awaited.
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);

  const showMineOnly = searchParams.mine === "1";
  const showOverdueOnly = searchParams.overdue === "1";

  let data: ListResponse = { items: [], total: 0, statusCounts: {} };
  let loadError: string | null = null;
  try {
    data =
      (await backendFetch<ListResponse>("/api/be/suggestions", {
        query: {
          plantId: plantId ?? undefined,
          status: searchParams.status || undefined,
          category: searchParams.category || undefined,
          outcome: searchParams.outcome || undefined,
          decision: searchParams.decision || undefined,
          mine: showMineOnly ? true : undefined,
          overdue: showOverdueOnly ? true : undefined,
          q: searchParams.q || undefined,
          limit: 200
        }
      })) ?? { items: [], total: 0, statusCounts: {} };
  } catch (e: any) {
    loadError = e?.message ?? "Could not load the Suggestion Scheme register.";
  }

  const items = data.items;
  const counts = data.statusCounts ?? {};
  const awaitingTriage = counts.SUBMITTED ?? 0;
  const withCommittee = counts.SCREENING ?? 0;
  const accepted = (counts.ACCEPTED ?? 0) + (counts.IN_IMPLEMENTATION ?? 0);
  const deferralsDue = items.filter((s) => s.deferralDue).length;

  return (
    <div>
      <PageHeader
        title="Suggestion Scheme"
        description="Any idea, from anyone — not just the shop floor. Every one gets a triage, a decision and a reason."
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Suggestion Scheme" }
        ]}
        action={
          <div className="flex items-center gap-2">
            <PlantSwitcher plants={plants} currentPlantId={plantId} />
            <Can permission="SUGGESTION.CREATE">
              <Button asChild>
                <Link href={`/business-excellence/suggestions/new?plantId=${plantId ?? ""}`}>
                  <Plus size={15} className="mr-1.5" />
                  Make a suggestion
                </Link>
              </Button>
            </Can>
          </div>
        }
      />

      {loadError ? <LoadError what="The Suggestion Scheme register" message={loadError} /> : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox label="Awaiting triage" value={awaitingTriage} icon={Inbox} tone={awaitingTriage > 0 ? "warning" : "default"} />
        <StatBox label="With the committee" value={withCommittee} icon={Clock} />
        <StatBox label="Accepted" value={accepted} icon={CheckCircle2} tone="success" />
        <StatBox
          label="Deferrals due"
          value={deferralsDue}
          icon={Clock}
          tone={deferralsDue > 0 ? "warning" : "default"}
          hint={deferralsDue > 0 ? "Parked ideas past their review date" : undefined}
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
                href={`/business-excellence/suggestions?${params.toString()}`}
                active={(searchParams.status ?? "") === t.code}
                label={t.label}
                count={t.code ? counts[t.code] : data.total}
              />
            );
          })}
        </FilterTabsList>
        <Link
          href={`/business-excellence/suggestions?${new URLSearchParams({
            ...(plantId ? { plantId } : {}),
            ...(showMineOnly ? {} : { mine: "1" })
          }).toString()}`}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            showMineOnly
              ? "border-primary-200 bg-primary-50 text-primary-800"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Mine
        </Link>
      </div>

      {items.length === 0 && !loadError ? (
        <EmptyState
          icon={MessageSquarePlus}
          title="No suggestions here yet"
          description="The Suggestion Scheme is open to everyone and is not limited to the shop floor — anything that would make the place work better belongs here."
          action={
            <Can permission="SUGGESTION.CREATE">
              <Button asChild>
                <Link href={`/business-excellence/suggestions/new?plantId=${plantId ?? ""}`}>
                  Make the first suggestion
                </Link>
              </Button>
            </Can>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <Table className="w-full min-w-[880px] text-sm">
            <TableHeader className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <TableRow>
                <TableHead className="px-4 py-3">Suggestion</TableHead>
                <TableHead className="px-4 py-3">Category</TableHead>
                <TableHead className="px-4 py-3">From</TableHead>
                <TableHead className="px-4 py-3">Status</TableHead>
                <TableHead className="px-4 py-3">Triage</TableHead>
                <TableHead className="px-4 py-3">Site</TableHead>
                <TableHead className="px-4 py-3">Raised</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {items.map((s) => (
                <TableRow key={s.id} className="hover:bg-slate-50/60">
                  <TableCell className="px-4 py-3">
                    <RecordRef
                      href={`/business-excellence/suggestions/${s.id}`}
                      code={s.suggestionNo}
                      title={s.title}
                    />
                    {s.deferralDue ? (
                      <Chip
                        label="Deferral due"
                        className="mt-1 border-amber-200 bg-amber-100 text-amber-800"
                      />
                    ) : null}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-slate-600">
                    {KAIZEN_CATEGORY_LABEL[s.category] ?? s.category}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {s.isAnonymous && !s.submittedBy ? (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <EyeOff size={12} /> Anonymous
                      </span>
                    ) : (
                      <PersonRef person={s.submittedBy} fallback="—" />
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Chip
                      label={SUGGESTION_STATUS_LABEL[s.status] ?? s.status}
                      className={SUGGESTION_STATUS_CHIP[s.status]}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-slate-600">
                    {s.screeningOutcome
                      ? SCREENING_OUTCOME_LABEL[s.screeningOutcome] ?? s.screeningOutcome
                      : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-slate-600">
                    {s.siteName ?? "—"}
                    {s.areaName ? (
                      <span className="text-slate-400"> · {s.areaName}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-slate-500">{fmtDate(s.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
