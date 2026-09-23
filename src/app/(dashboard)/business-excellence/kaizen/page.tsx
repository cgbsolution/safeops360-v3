// Kaizen register — shop-floor improvement ideas.
//
// Server component: reads through the FastAPI backend (the modern path, same as
// MOC and LOTO), never Prisma directly, so plant scoping and the overdue
// computation come from the one place that owns them.

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlantSwitcher } from "@/components/plant-switcher";
import { FilterTab, FilterTabsList } from "@/components/ui/filter-tabs";
import { resolvePlantContext } from "@/lib/plant-context";
import { Can } from "@/components/auth/can";
import { Lightbulb, Plus, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import {
  FAST_TRACK_BADGE_LABEL,
  KAIZEN_CATEGORY_LABEL,
  KAIZEN_STATUS_CHIP,
  KAIZEN_STATUS_LABEL,
  fmtDate,
  fmtMoney,
  type KaizenCycleTime,
  type KaizenListItem
} from "../_meta";
import { Chip, EmptyState, LoadError, PersonRef, RecordRef, StatBox } from "../ui";
import { KaizenFilterBar } from "./filter-bar";
import { ParticipationPanel } from "./participation-panel";
import { Timer, Share2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type ListResponse = {
  items: KaizenListItem[];
  total: number;
  statusCounts: Record<string, number>;
  cycleTime: KaizenCycleTime;
};

const EMPTY_CYCLE: KaizenCycleTime = {
  medianDaysRaisedToImplemented: null,
  medianDaysRaisedToVerified: null,
  implementedSampleSize: 0,
  verifiedSampleSize: 0,
  minimumSampleSize: 5
};

const STATUS_TABS = [
  { code: "", label: "All" },
  { code: "SUBMITTED", label: "Awaiting screening" },
  { code: "APPROVED", label: "Approved" },
  { code: "IN_IMPLEMENTATION", label: "Implementing" },
  { code: "IMPLEMENTED", label: "Awaiting verification" },
  { code: "VERIFIED", label: "Verified" },
  { code: "CLOSED", label: "Closed" }
];

export default async function KaizenRegisterPage(props: {
  searchParams: Promise<{
    plantId?: string;
    status?: string;
    category?: string;
    lane?: string;
    overdue?: string;
    mine?: string;
    q?: string;
    raisedFrom?: string;
    raisedTo?: string;
    savingMin?: string;
    savingMax?: string;
    sort?: string;
    direction?: string;
    view?: string;
  }>;
}) {
  // Next 15: searchParams is a Promise and MUST be awaited.
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);

  const showOverdueOnly = searchParams.overdue === "1";
  const showMineOnly = searchParams.mine === "1";
  // Participation is a fourth VIEW of the register rather than a separate
  // route, so the plant switcher, the date range and the shareable URL all keep
  // working across it. It sits alongside Everything / Mine / Past target
  // because it answers a question about the same set of records.
  const showParticipation = searchParams.view === "participation";

  // Every filter the bar can set is forwarded verbatim. The backend owns the
  // filtering, the counts AND the cycle-time aggregate, so the tiles describe
  // the same filtered question the rows answer.
  const query = {
    plantId: plantId ?? undefined,
    status: searchParams.status || undefined,
    category: searchParams.category || undefined,
    lane: searchParams.lane || undefined,
    overdue: showOverdueOnly ? true : undefined,
    mine: showMineOnly ? true : undefined,
    q: searchParams.q || undefined,
    raisedFrom: searchParams.raisedFrom || undefined,
    raisedTo: searchParams.raisedTo || undefined,
    savingMin: searchParams.savingMin || undefined,
    savingMax: searchParams.savingMax || undefined,
    sort: searchParams.sort || undefined,
    direction: searchParams.direction || undefined
  };

  let data: ListResponse = { items: [], total: 0, statusCounts: {}, cycleTime: EMPTY_CYCLE };
  let loadError: string | null = null;
  try {
    data =
      (await backendFetch<ListResponse>("/api/be/kaizen", {
        query: { ...query, limit: 200 }
      })) ?? { items: [], total: 0, statusCounts: {}, cycleTime: EMPTY_CYCLE };
  } catch (e: any) {
    loadError = e?.message ?? "Could not load the Kaizen register.";
  }

  // The export mirrors the filters exactly — same parameters, same helper on
  // the server. `overdue` is deliberately absent: it is derived in Python after
  // the query, so it cannot be expressed as a SQL filter and an export claiming
  // to honour it would quietly include records that are not past target.
  const exportQs = new URLSearchParams({ format: "csv" });
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== true) exportQs.set(k, String(v));
  }
  const exportHref = `/api/be/kaizen/export?${exportQs}`;

  const items = data.items;
  const counts = data.statusCounts ?? {};
  const cycle = data.cycleTime ?? EMPTY_CYCLE;
  const inProgress =
    (counts.SUBMITTED ?? 0) +
    (counts.SCREENED ?? 0) +
    (counts.APPROVED ?? 0) +
    (counts.IN_IMPLEMENTATION ?? 0);
  const overdueCount = items.filter((k) => k.isOverdue).length;

  // Only VERIFIED savings are totalled. Adding estimates would produce a number
  // that looks like money the plant has banked and is not — the estimate is a
  // hope recorded by the person proposing the work.
  const verifiedSaving = items
    .filter((k) => k.verifiedAnnualSaving != null)
    .reduce((sum, k) => sum + (k.verifiedAnnualSaving ?? 0), 0);
  const verifiedCurrency = items.find((k) => k.verifiedAnnualSaving != null)?.currency ?? "INR";
  const mixedCurrency = new Set(
    items.filter((k) => k.verifiedAnnualSaving != null).map((k) => k.currency)
  ).size > 1;

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { ...searchParams, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `/business-excellence/kaizen${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Kaizen"
        description="Shop-floor improvement ideas — the problem, the countermeasure, what it cost and what it actually saved."
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Kaizen" }
        ]}
        action={
          <Can permission="KAIZEN.CREATE">
            <Button asChild>
              <Link href="/business-excellence/kaizen/new">
                <Plus size={16} /> Raise an idea
              </Link>
            </Button>
          </Can>
        }
      />

      {plants.length > 1 && (
        <div className="mb-4">
          <PlantSwitcher plants={plants} currentPlantId={plantId} />
        </div>
      )}

      {loadError && <LoadError what="The Kaizen register" message={loadError} />}

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatBox label="Ideas" value={data.total} icon={Lightbulb} />
        <StatBox label="In progress" value={inProgress} tone="warning" icon={Clock} />
        <StatBox
          label="Verified"
          value={counts.VERIFIED ?? 0}
          tone="success"
          icon={CheckCircle2}
        />
        <StatBox
          label="Verified saving / yr"
          value={
            mixedCurrency
              ? "Mixed"
              : fmtMoney(verifiedSaving, verifiedCurrency) ?? "—"
          }
          tone="success"
          icon={TrendingUp}
          hint={
            mixedCurrency
              ? "Records span more than one currency"
              : "Confirmed figures only, not estimates"
          }
        />
        {/* Median, not mean: one idea that sat for a year drags a mean into
            uselessness, and the question this tile answers is "how long does a
            typical idea take". Below the sample floor it says so rather than
            printing a number computed from three records. */}
        <StatBox
          label="Median days to implement"
          value={
            cycle.medianDaysRaisedToImplemented != null
              ? `${cycle.medianDaysRaisedToImplemented}d`
              : "Not enough data"
          }
          icon={Timer}
          hint={
            cycle.medianDaysRaisedToImplemented != null
              ? `From ${cycle.implementedSampleSize} implemented idea${
                  cycle.implementedSampleSize === 1 ? "" : "s"
                }${
                  cycle.medianDaysRaisedToVerified != null
                    ? ` · ${cycle.medianDaysRaisedToVerified}d to verified saving`
                    : ""
                }`
              : `${cycle.implementedSampleSize} of the ${cycle.minimumSampleSize} implemented ideas needed to compute a median`
          }
        />
      </div>

      <KaizenFilterBar exportHref={exportHref} />

      <FilterTabsList label="Status" className="mb-3">
        {STATUS_TABS.map((t) => (
          <FilterTab
            key={t.code || "all"}
            href={qs({ status: t.code || undefined })}
            // Exact match only. With a multi-select value like
            // "SUBMITTED,SCREENED" in the URL, no single tab is active — which
            // is correct: the tab row cannot express that combination and
            // pretending one of them is selected would be a lie about the
            // filter in force.
            active={(searchParams.status ?? "") === t.code}
            label={
              t.code && counts[t.code] ? `${t.label} (${counts[t.code]})` : t.label
            }
          />
        ))}
      </FilterTabsList>

      <FilterTabsList label="View" className="mb-4">
        <FilterTab
          href={qs({ mine: undefined, overdue: undefined, view: undefined })}
          active={!showMineOnly && !showOverdueOnly && !showParticipation}
          label="Everything"
        />
        <FilterTab
          href={qs({ mine: "1", overdue: undefined, view: undefined })}
          active={showMineOnly && !showParticipation}
          label="Mine"
        />
        <FilterTab
          href={qs({ overdue: "1", mine: undefined, view: undefined })}
          active={showOverdueOnly && !showParticipation}
          label={`Past target${overdueCount ? ` (${overdueCount})` : ""}`}
        />
        <FilterTab
          href={qs({ view: "participation", mine: undefined, overdue: undefined })}
          active={showParticipation}
          label="Participation"
        />
      </FilterTabsList>

      {showParticipation ? (
        <ParticipationPanel
          plantId={plantId}
          raisedFrom={searchParams.raisedFrom}
          raisedTo={searchParams.raisedTo}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title={
            showMineOnly
              ? "You have not raised or been given an improvement idea yet."
              : showOverdueOnly
                ? "No idea is past its implementation target."
                : "No improvement ideas recorded yet."
          }
          description={
            loadError
              ? undefined
              : "A Kaizen starts with a problem someone can see at the machine — a wasted movement, a recurring defect, a jig that takes two people."
          }
          action={
            <Can permission="KAIZEN.CREATE">
              <Button asChild>
                <Link href="/business-excellence/kaizen/new">
                  <Plus size={16} /> Raise the first one
                </Link>
              </Button>
            </Can>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <Table className="w-full min-w-[900px] text-sm">
            <TableHeader>
              <TableRow className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <TableHead className="px-4 py-3 font-medium">Idea</TableHead>
                <TableHead className="px-4 py-3 font-medium">Category</TableHead>
                <TableHead className="px-4 py-3 font-medium">Where</TableHead>
                <TableHead className="px-4 py-3 font-medium">Owner</TableHead>
                <TableHead className="px-4 py-3 font-medium">Target</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Saving / yr</TableHead>
                <TableHead className="px-4 py-3 font-medium">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((k) => (
                <TableRow key={k.id} className="border-b border-slate-100 last:border-0 align-top">
                  <TableCell className="px-4 py-3">
                    <RecordRef
                      href={`/business-excellence/kaizen/${k.id}`}
                      code={k.kaizenNo}
                      title={k.title}
                    />
                    {/* Read off `fastTrack`, which the server derives from the
                        record's own investment and implementation window —
                        never off `lane`, which is only the approval route. */}
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {k.fastTrack && (
                        <Chip
                          label={FAST_TRACK_BADGE_LABEL}
                          className="border-sky-200 bg-sky-50 text-sky-700"
                          title="Low investment and a one-day implementation window, both recorded on this record"
                        />
                      )}
                      {k.replicationCount > 0 && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700"
                          title={`Deployed at ${k.replicationCount} other plant${
                            k.replicationCount === 1 ? "" : "s"
                          }`}
                        >
                          <Share2 size={11} />
                          {k.replicationCount}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-slate-700">
                    {KAIZEN_CATEGORY_LABEL[k.category] ?? k.category}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-slate-600">
                    <div>{k.siteName ?? "—"}</div>
                    <div className="text-xs text-slate-400">
                      {[k.areaName, k.lineOrMachine].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <PersonRef person={k.owner} />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span className={k.isOverdue ? "font-medium text-rose-700" : "text-slate-600"}>
                      {fmtDate(k.targetDate)}
                    </span>
                    {k.isOverdue && (
                      <div className="text-xs text-rose-600">Past target</div>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right tabular-nums">
                    {/* Verified beats estimated. When both exist the verified
                        figure is the one shown, because it is the only one that
                        survived somebody checking it. */}
                    {k.verifiedAnnualSaving != null ? (
                      <span className="font-medium text-emerald-700">
                        {fmtMoney(k.verifiedAnnualSaving, k.currency)}
                      </span>
                    ) : k.estimatedAnnualSaving != null ? (
                      <span className="text-slate-500">
                        {fmtMoney(k.estimatedAnnualSaving, k.currency)}
                        <span className="ml-1 text-[11px] text-slate-400">est.</span>
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Chip
                      label={KAIZEN_STATUS_LABEL[k.status] ?? k.status}
                      className={KAIZEN_STATUS_CHIP[k.status]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
