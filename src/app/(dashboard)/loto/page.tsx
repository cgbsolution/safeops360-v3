// LOTO Procedure Library — the register of reusable isolation procedures.
//
// Server component: reads through the FastAPI backend (the modern path, same as
// MOC), never Prisma directly, so plant scoping and the overdue computation come
// from the one place that owns them.

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { RegisterTabs, RegisterWorkspacePane } from "@/components/analytics/register-workspace";
import { resolveTab } from "@/lib/registers";
import { Button } from "@/components/ui/button";
import { PlantSwitcher } from "@/components/plant-switcher";
import { FilterTab, FilterTabsList } from "@/components/ui/filter-tabs";
import { resolvePlantContext } from "@/lib/plant-context";
import { Can } from "@/components/auth/can";
import { AlertTriangle, Clock, Lock, Plus, ShieldCheck } from "lucide-react";
import { type ProcedureListItem } from "./_meta";
import { LotoProceduresTable } from "./loto-table";

export const dynamic = "force-dynamic";

type ListResponse = { items: ProcedureListItem[]; total: number };

const STATUS_TABS = [
  { code: "", label: "All" },
  { code: "active", label: "Active" },
  { code: "draft", label: "Draft" },
  { code: "under_review", label: "Under review" },
  { code: "retired", label: "Retired" }
];

export default async function LotoLibraryPage(props: {
  searchParams: Promise<{ tab?: string;
    plantId?: string;
    status?: string;
    overdue?: string;
    q?: string;
  }>;
}) {
  // Next 15: searchParams is a Promise and MUST be awaited. Reading it
  // synchronously type-checks under tsc but fails `next build`, which ships a
  // silently stale page — see the deploy notes.
  const searchParams = await props.searchParams;

  // Tier-2 workspace tabs. Analytics and Signals are PANES on this
  // route, not screens of their own — see @/lib/registers.
  const activeTab = resolveTab("loto", searchParams.tab);
  if (activeTab !== "register") {
    return (
      <RegisterWorkspacePane
        register="loto"
        tab={activeTab}
        searchParams={props.searchParams}
      />
    );
  }
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);

  const showOverdueOnly = searchParams.overdue === "1";

  let data: ListResponse = { items: [], total: 0 };
  let loadError: string | null = null;
  try {
    data =
      (await backendFetch<ListResponse>("/api/loto/procedures", {
        query: {
          siteId: plantId ?? undefined,
          status: searchParams.status || undefined,
          overdue: showOverdueOnly ? true : undefined,
          q: searchParams.q || undefined,
          limit: 200
        }
      })) ?? { items: [], total: 0 };
  } catch (e: any) {
    // Surface the real reason rather than rendering an empty library, which
    // reads as "no procedures exist" — the opposite of the truth and dangerous
    // in this module specifically.
    loadError = e?.message ?? "Could not load the procedure library.";
  }

  const items = data.items;
  const overdueCount = items.filter((p) => p.review.isOverdue).length;
  const dueSoonCount = items.filter((p) => p.review.isDueSoon).length;
  const activeCount = items.filter((p) => p.status === "active").length;
  const reviewCount = items.filter((p) => p.status === "under_review").length;

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { ...searchParams, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `/loto${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="LOTO — Procedure Library"
        description="Reusable energy-isolation procedures. Authored once, QR-accessible at the equipment, reviewed on a scheduled cycle."
        action={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/loto/executions">
                <Lock size={14} /> Lockout Records
              </Link>
            </Button>
            <Can permission="LOTO.CREATE">
              <Button asChild>
                <Link href="/loto/new">
                  <Plus size={16} /> New Procedure
                </Link>
              </Button>
            </Can>
          </div>
        }
      />
      <RegisterTabs register="loto" />

      {plants.length > 1 && (
        <div className="mb-4">
          <PlantSwitcher plants={plants} currentPlantId={plantId} />
        </div>
      )}

      {loadError && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <div className="font-semibold">The procedure library could not be loaded.</div>
          <div className="mt-1 text-rose-700">{loadError}</div>
        </div>
      )}

      {/* Overdue is the one number on this screen that means someone has to act,
          so it gets its own banner rather than sitting as a stat tile people
          scroll past. Spec §3: an overdue review must never lapse silently. */}
      {overdueCount > 0 && !showOverdueOnly && (
        <Link
          href={qs({ overdue: "1" })}
          className="mb-4 flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm transition hover:bg-rose-100"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" />
          <div>
            <div className="font-semibold text-rose-900">
              {overdueCount} procedure{overdueCount === 1 ? "" : "s"} past their scheduled
              review
            </div>
            <div className="mt-0.5 text-rose-700">
              A LOTO procedure that no longer matches the plant is worse than none at
              all. Review them to confirm the isolation sequence still holds.
            </div>
          </div>
        </Link>
      )}

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatBox label="Procedures" value={data.total} tone="default" icon={ShieldCheck} />
        <StatBox label="Active" value={activeCount} tone="success" icon={ShieldCheck} />
        <StatBox label="Awaiting re-approval" value={reviewCount} tone="warning" icon={Clock} />
        <StatBox label="Review overdue" value={overdueCount} tone="danger" icon={AlertTriangle} />
      </div>

      <FilterTabsList label="Status" className="mb-3">
        {STATUS_TABS.map((t) => (
          <FilterTab
            key={t.code || "all"}
            href={qs({ status: t.code || undefined })}
            active={(searchParams.status ?? "") === t.code}
            label={t.label}
          />
        ))}
      </FilterTabsList>

      <FilterTabsList label="Review" className="mb-4">
        <FilterTab
          href={qs({ overdue: undefined })}
          active={!showOverdueOnly}
          label="All"
        />
        <FilterTab
          href={qs({ overdue: "1" })}
          active={showOverdueOnly}
          label={`Overdue only${overdueCount ? ` (${overdueCount})` : ""}`}
        />
      </FilterTabsList>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <Lock size={28} className="mx-auto text-slate-400" />
          <div className="mt-3 font-semibold text-slate-700">
            {showOverdueOnly
              ? "No procedure has a lapsed review."
              : "No LOTO procedures here yet."}
          </div>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {showOverdueOnly
              ? "Every active procedure is inside its evaluation cycle."
              : "A procedure is authored once per piece of equipment, then referenced by every job that isolates it."}
          </p>
        </div>
      ) : (
        <LotoProceduresTable data={items} />
      )}

      {dueSoonCount > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {dueSoonCount} further procedure{dueSoonCount === 1 ? " is" : "s are"} due for
          review within 30 days.
        </p>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
  icon: Icon
}: {
  label: string;
  value: number;
  tone: "default" | "success" | "warning" | "danger";
  icon: any;
}) {
  const colors = {
    default: "bg-primary-50 text-primary-800",
    success: "bg-emerald-50 text-emerald-800",
    warning: "bg-amber-50 text-amber-800",
    danger: "bg-rose-50 text-rose-800"
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[tone]}`}>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-70">
        <Icon size={12} /> {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
