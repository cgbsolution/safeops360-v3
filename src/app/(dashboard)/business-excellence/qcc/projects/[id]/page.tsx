// One circle project — the gate board, the charter, and the benefit (§6).

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import { can } from "@/lib/auth/permissions";
import { redirectMissingRecord } from "@/lib/nav/missing-record";
import { GitBranch } from "lucide-react";
import { KAIZEN_CATEGORY_LABEL, fmtDate } from "../../../_meta";
import {
  METHODOLOGY_LABEL,
  QCC_PROJECT_STATUS_CHIP,
  QCC_PROJECT_STATUS_LABEL,
  fmtMetric,
  type QccProjectDetail
} from "../../../_meta-p2";
import { Chip, PersonRef } from "../../../ui";
import { BenefitCard, MetricBar, RagChip, StageBoard } from "../../../ui-p2";
import { BenefitPanel } from "../../../benefit-panel";
import { ProjectActions, StageSignOff } from "./actions";

export const dynamic = "force-dynamic";

export default async function QccProjectDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const user = await requirePermission("QCC.READ");

  let p: QccProjectDetail;
  try {
    p = await backendFetch<QccProjectDetail>(`/api/be/qcc/projects/${id}`);
  } catch {
    // A dead deep link becomes a redirect with a toast, never a blank page.
    redirectMissingRecord("/business-excellence/qcc/projects", "Project");
  }

  const uid = (user as any).id;
  const canUpdate = (await can(uid, "QCC.UPDATE", {})).allowed;
  const canSignOff = (await can(uid, "QCC.SIGNOFF", {})).allowed;
  const canEvaluate = (await can(uid, "QCC.EVALUATE", {})).allowed;
  const canRecordBenefit = (await can(uid, "BENEFIT.RECORD", {})).allowed;
  const canValidateBenefit = (await can(uid, "BENEFIT.VALIDATE", {})).allowed;

  const live = !["CLOSED", "ABANDONED", "REJECTED"].includes(p.status);

  return (
    <div>
      <PageHeader
        title={p.title}
        description={`${p.projectNo ?? "Not yet numbered"} · ${p.teamName ?? "No circle"} · ${
          METHODOLOGY_LABEL[p.methodology] ?? p.methodology
        }`}
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Quality Circles", href: "/business-excellence/qcc" },
          { label: "Projects", href: "/business-excellence/qcc/projects" },
          { label: p.projectNo ?? "Draft" }
        ]}
        action={
          <div className="flex items-center gap-2">
            {live ? <RagChip rag={p.rag} /> : null}
            <Chip
              label={QCC_PROJECT_STATUS_LABEL[p.status] ?? p.status}
              className={QCC_PROJECT_STATUS_CHIP[p.status]}
            />
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">The problem</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-700">
              {p.problemStatement}
            </p>
            {p.selectionRationale ? (
              <>
                <h3 className="mt-4 text-xs uppercase tracking-wider text-slate-400">
                  Why this problem
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {p.selectionRationale}
                </p>
              </>
            ) : null}
            {p.scope ? (
              <>
                <h3 className="mt-4 text-xs uppercase tracking-wider text-slate-400">
                  Scope
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{p.scope}</p>
              </>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">
                {METHODOLOGY_LABEL[p.methodology] ?? p.methodology} gates
              </h2>
              <span className="text-xs tabular-nums text-slate-500">
                {p.signedOffStages}/{p.totalStages} signed off
              </span>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              Each gate needs a sign-off before the next opens. They are shown in full so
              the circle can see what is still to come.
            </p>
            <StageBoard
              stages={p.stages}
              rcaStage={p.rcaStage}
              rcaId={p.rcaId}
              action={(s) => (
                <StageSignOff
                  projectId={p.id}
                  stage={s}
                  canSignOff={canSignOff}
                  canUpdate={canUpdate}
                />
              )}
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-1 font-semibold text-slate-900">Benefit</h2>
            {/* §6: the benefit is only realised once somebody outside the circle
                has confirmed it held. The panel makes that two separate acts. */}
            <p className="mb-4 text-xs text-slate-500">
              A benefit counts toward the total only after its validation window has
              passed and somebody outside the circle has signed it off.
            </p>
            <BenefitPanel
              sourceType="QCC"
              sourceId={p.id}
              benefits={p.benefits}
              canRecord={canRecordBenefit}
              canValidate={canValidateBenefit}
              defaultCurrency="INR"
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">What happens next</h2>
            <ProjectActions
              id={p.id}
              status={p.status}
              availableActions={p.availableActions}
              transitionBlockers={p.transitionBlockers}
              rcaId={p.rcaId}
              rcaStage={p.rcaStage}
              canUpdate={canUpdate}
              canEvaluate={canEvaluate}
            />
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">The number</h2>
            <MetricBar
              baseline={p.baselineValue}
              target={p.targetValue}
              actual={p.actualValue}
              unit={p.metricUnit}
              percent={
                p.baselineValue !== null &&
                p.targetValue !== null &&
                p.actualValue !== null &&
                p.targetValue !== p.baselineValue
                  ? Math.round(
                      ((p.actualValue - p.baselineValue) /
                        (p.targetValue - p.baselineValue)) *
                        1000
                    ) / 10
                  : null
              }
              onTrack={null}
            />
            {p.baselineMetric ? (
              <p className="mt-2 text-xs text-slate-500">{p.baselineMetric}</p>
            ) : null}
          </section>

          {p.rcaId ? (
            <section className="rounded-xl border border-primary-200 bg-primary-50 p-5">
              <h2 className="flex items-center gap-1.5 font-semibold text-primary-900">
                <GitBranch size={15} />
                Root cause analysis
              </h2>
              {/* §6: "no separate RCA tool or duplicate record". The link goes to
                  the platform register; there is no analysis stored under QCC. */}
              <p className="mt-1 text-xs text-primary-800/70">
                Held in the platform&rsquo;s shared RCA register, not in this project.
              </p>
              <Link
                href={`/erm/rca/${p.rcaId}`}
                className="mt-2 block text-sm text-primary-700 hover:underline"
              >
                Open the analysis →
              </Link>
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Details</h2>
            <dl className="space-y-2.5 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Circle</dt>
                <dd className="mt-0.5">
                  {p.teamName ? (
                    <Link
                      href={`/business-excellence/qcc/${p.teamId}`}
                      className="text-primary-700 hover:underline"
                    >
                      {p.teamName}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">
                  Category
                </dt>
                <dd className="mt-0.5 text-slate-700">
                  {KAIZEN_CATEGORY_LABEL[p.category] ?? p.category}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Site</dt>
                <dd className="mt-0.5 text-slate-700">
                  {p.siteName ?? "—"}
                  {p.areaName ? <span className="text-slate-400"> · {p.areaName}</span> : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">
                  Chartered
                </dt>
                <dd className="mt-0.5 text-slate-700">{fmtDate(p.charteredAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Target</dt>
                <dd className="mt-0.5 text-slate-700">{fmtDate(p.targetDate)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">
                  Started by
                </dt>
                <dd className="mt-0.5">
                  <PersonRef person={p.createdBy} />
                </dd>
              </div>
            </dl>
          </section>

          {p.evaluationScore !== null ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-900">Evaluation</h2>
              <div className="mt-2 text-2xl font-bold tabular-nums text-slate-800">
                {p.evaluationScore}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Scored by <PersonRef person={p.evaluatedBy} /> on {fmtDate(p.evaluatedAt)}
              </p>
              {p.presentationRef ? (
                <p className="mt-1 text-xs text-slate-500">
                  Presentation: {p.presentationRef}
                </p>
              ) : null}
            </section>
          ) : null}

          {p.rejectionReason ? (
            <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm">
              <div className="font-medium text-rose-900">Why it stopped</div>
              <p className="mt-1 text-rose-800">{p.rejectionReason}</p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
