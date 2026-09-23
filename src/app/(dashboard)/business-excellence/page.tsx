// Business Excellence — the module landing page and §8's consolidated dashboard.
//
// Phase 1 shipped this as a plain register index and said so: "deliberately NOT
// a dashboard … a landing page full of charts drawn from four records would be a
// demo, not a screen." That reasoning still holds for CHARTS, and there are none
// here. What Phase 2 adds is the one thing §8 actually asks for — submissions,
// conversion, cycle time and cumulative validated benefit across all six
// workflows — served by a single endpoint that scopes each register by that
// register's own READ permission.

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { PlantSwitcher } from "@/components/plant-switcher";
import { resolvePlantContext } from "@/lib/plant-context";
import {
  Lightbulb,
  BookOpen,
  ShieldCheck,
  ArrowRight,
  AlertTriangle,
  MessageSquarePlus,
  Users,
  Target,
  Trophy
} from "lucide-react";
import { LoadError } from "./ui";
import { BenefitSummaryBar, RagChip } from "./ui-p2";
import { WORKFLOW_HREF, WORKFLOW_LABEL, type BeDashboard } from "./_meta-p2";

export const dynamic = "force-dynamic";

type Counts = Record<string, number>;

async function safeCount(path: string, plantId: string | null) {
  try {
    const data = await backendFetch<{
      total: number;
      statusCounts?: Counts;
      overdueCount?: number;
    }>(path, { query: { plantId: plantId ?? undefined, limit: 1 } });
    return {
      total: data?.total ?? 0,
      counts: data?.statusCounts ?? {},
      overdue: data?.overdueCount ?? 0,
      error: null as string | null
    };
  } catch (e: any) {
    return { total: 0, counts: {} as Counts, overdue: 0, error: e?.message ?? "Unavailable" };
  }
}

const ICONS: Record<string, any> = {
  KAIZEN: Lightbulb,
  SUGGESTION: MessageSquarePlus,
  OPL: BookOpen,
  POKA_YOKE: ShieldCheck,
  QCC: Users,
  SIP: Target
};

export default async function BusinessExcellencePage(props: {
  searchParams: Promise<{ plantId?: string }>;
}) {
  // Next 15: searchParams is a Promise and MUST be awaited. Reading it
  // synchronously type-checks under tsc but fails `next build`, which ships a
  // silently stale page.
  const searchParams = await props.searchParams;
  const { plantId, plants } = await resolvePlantContext(searchParams.plantId);

  const [poka, dashboard] = await Promise.all([
    // Poka Yoke's overdue count still needs its own call — the dashboard
    // endpoint reports lifecycle counts, not verification cadence.
    safeCount("/api/be/poka-yoke", plantId),
    (async () => {
      try {
        return await backendFetch<BeDashboard>("/api/be/dashboards/summary", {
          query: { plantId: plantId ?? undefined }
        });
      } catch (e: any) {
        return { error: e?.message ?? "Unavailable" } as any;
      }
    })()
  ]);

  const dashError: string | null = (dashboard as any)?.error ?? null;
  const workflows: BeDashboard["workflows"] = dashError ? [] : (dashboard.workflows ?? []);
  const benefit = dashError ? {} : (dashboard.benefit ?? {});
  const leaderboard: BeDashboard["qccLeaderboard"] = dashError
    ? []
    : (dashboard.qccLeaderboard ?? []);
  const portfolio: BeDashboard["sipPortfolio"] = dashError
    ? {}
    : (dashboard.sipPortfolio ?? {});

  const blurbs: Record<string, string> = {
    KAIZEN:
      "Shop-floor improvement ideas with a cost, a saving and an owner. Includes a fast lane a supervisor can approve alone.",
    SUGGESTION:
      "Open to everyone and not limited to the shop floor. Anonymous if the submitter chooses. Every one gets a reason.",
    OPL: "A single visual page, published to a named audience, with an acknowledgement obligation against each person.",
    POKA_YOKE:
      "Mistake-proofing devices and the periodic checks that prove they still work. A failed check raises a CAPA.",
    QCC: "Standing teams working one problem through a set of gates, each needing a sign-off before the next opens.",
    SIP: "Sponsor-backed, cross-functional projects with a charter, a tracked metric and an independently validated benefit."
  };

  return (
    <div>
      <PageHeader
        title="Business Excellence"
        description="Six improvement workflows on one engine — from a suggestion anyone can make to a sponsor-backed project, each with a governed approval and a benefit somebody independent signed off."
      />

      {plants.length > 1 && (
        <div className="mb-4">
          <PlantSwitcher plants={plants} currentPlantId={plantId} />
        </div>
      )}

      {dashError && <LoadError what="The Business Excellence dashboard" message={dashError} />}
      {poka.error && !dashError && <LoadError what="The Poka Yoke register" message={poka.error} />}

      {poka.overdue > 0 && (
        <Link
          href="/business-excellence/poka-yoke?overdue=1"
          className="mb-5 flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm transition hover:bg-rose-100"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" />
          <div>
            <div className="font-semibold text-rose-900">
              {poka.overdue} mistake-proofing device
              {poka.overdue === 1 ? " has" : "s have"} missed a scheduled check
            </div>
            <div className="mt-0.5 text-rose-700">
              An unverified device is not a device that works — it is one nobody has
              looked at. Until it is checked, the line is running on an assumption.
            </div>
          </div>
        </Link>
      )}

      {/* §8's cumulative benefit. Financial and non-financial are shown apart,
          and only VALIDATED lines count toward the realised figure — a total
          that included unvalidated claims would be the projected total wearing
          a different label. */}
      {!dashError ? (
        <section className="mb-6">
          <h2 className="mb-2 text-xs uppercase tracking-wider text-slate-400">
            Benefit across all six workflows
          </h2>
          <BenefitSummaryBar summary={benefit} />
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workflows.map((w) => {
          const Icon = ICONS[w.workflowType] ?? Lightbulb;
          const href = WORKFLOW_HREF[w.workflowType] ?? "/business-excellence";
          const overdueHere = w.workflowType === "POKA_YOKE" ? poka.overdue : 0;
          return (
            <Link
              key={w.workflowType}
              href={plantId ? `${href}?plantId=${plantId}` : href}
              className="group rounded-xl border border-slate-200 bg-white p-5 transition hover:border-primary-300 hover:shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div
                  className={`inline-flex rounded-lg border p-2 ${
                    overdueHere
                      ? "border-rose-100 bg-rose-50 text-rose-600"
                      : "border-primary-100 bg-primary-50 text-primary-600"
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums text-slate-900">
                    {w.total}
                  </div>
                  <div className="text-[11px] text-slate-400">records</div>
                </div>
              </div>

              <div className="mt-3 font-semibold text-slate-900">
                {WORKFLOW_LABEL[w.workflowType] ?? w.workflowType}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                {blurbs[w.workflowType] ?? ""}
              </p>

              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-400">
                    Open
                  </dt>
                  <dd className="text-sm font-semibold tabular-nums text-slate-700">
                    {w.open}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-400">
                    Conversion
                  </dt>
                  {/* Null, not 0%, when nothing has been decided — a 0% badge on
                      a scheme that launched last week reads as a failure that
                      has not happened. */}
                  <dd className="text-sm font-semibold tabular-nums text-slate-700">
                    {w.conversionRate === null ? "—" : `${w.conversionRate}%`}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-400">
                    Cycle
                  </dt>
                  <dd className="text-sm font-semibold tabular-nums text-slate-700">
                    {w.avgCycleTimeDays === null ? "—" : `${w.avgCycleTimeDays}d`}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex items-center justify-end text-xs">
                <span className="inline-flex items-center gap-1 font-medium text-primary-700 group-hover:gap-1.5">
                  Open <ArrowRight size={12} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {!dashError && (leaderboard.length > 0 || Object.keys(portfolio).length > 0) ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {leaderboard.length ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="flex items-center gap-1.5 font-semibold text-slate-900">
                <Trophy size={15} className="text-amber-500" />
                Circle leaderboard
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Projects taken all the way to closure — which means the benefit was
                validated too.
              </p>
              <ol className="mt-3 space-y-2">
                {leaderboard.map((t, i) => (
                  <li key={t.teamId} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold tabular-nums text-slate-600">
                      {i + 1}
                    </span>
                    <Link
                      href={`/business-excellence/qcc/${t.teamId}`}
                      className="min-w-0 flex-1 truncate text-sm text-slate-800 hover:text-primary-700"
                    >
                      {t.teamName}
                    </Link>
                    <span className="tabular-nums text-sm font-semibold text-slate-700">
                      {t.closedProjects}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {Object.keys(portfolio).length ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="flex items-center gap-1.5 font-semibold text-slate-900">
                <Target size={15} className="text-slate-400" />
                Project portfolio
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Health is derived from milestone slippage and the target date at read
                time — it is never stored, so it cannot go stale.
              </p>
              <ul className="mt-3 space-y-2">
                {(["RED", "AMBER", "GREEN"] as const).map((r) =>
                  portfolio[r] ? (
                    <li key={r} className="flex items-center justify-between">
                      <Link
                        href={`/business-excellence/sip?rag=${r}${plantId ? `&plantId=${plantId}` : ""}`}
                      >
                        <RagChip rag={r} />
                      </Link>
                      <span className="tabular-nums text-sm font-semibold text-slate-700">
                        {portfolio[r]}
                      </span>
                    </li>
                  ) : null
                )}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <span className="font-medium text-slate-800">Root cause analysis</span> for a
        shop-floor problem — a Kaizen, a circle project or an improvement project —
        opens on the platform&apos;s existing RCA engine rather than a separate
        register, so a manufacturing cause appears on the cause-to-risk map alongside
        every other source. There is no second RCA anywhere in this module.
      </div>
    </div>
  );
}
