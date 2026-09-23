// One improvement project — charter, milestones, metric and benefit (§7).

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import { can } from "@/lib/auth/permissions";
import { redirectMissingRecord } from "@/lib/nav/missing-record";
import { BookOpen, GitBranch } from "lucide-react";
import { KAIZEN_CATEGORY_LABEL, fmtDate, fmtMoney } from "../../_meta";
import {
  SIP_STATUS_CHIP,
  SIP_STATUS_LABEL,
  fmtMetricProgress,
  type SipDetail
} from "../../_meta-p2";
import { Chip, PersonRef, StatBox } from "../../ui";
import { MetricBar, MilestoneList, RagChip } from "../../ui-p2";
import { BenefitPanel } from "../../benefit-panel";
import { AddMilestone, MilestoneControls, SipActions } from "./actions";

export const dynamic = "force-dynamic";

export default async function SipDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requirePermission("SIP.READ");

  let s: SipDetail;
  try {
    s = await backendFetch<SipDetail>(`/api/be/sip/${id}`);
  } catch {
    // A dead deep link becomes a redirect with a toast, never a blank page.
    redirectMissingRecord("/business-excellence/sip", "Improvement project");
  }

  const uid = (user as any).id;
  const canUpdate = (await can(uid, "SIP.UPDATE", {})).allowed;
  const canRecordBenefit = (await can(uid, "BENEFIT.RECORD", {})).allowed;
  const canValidateBenefit = (await can(uid, "BENEFIT.VALIDATE", {})).allowed;

  const live = !["CLOSED", "REJECTED", "CANCELLED"].includes(s.status);
  // Milestones can be deleted only before approval; after that the plan is a
  // record of what was committed to, and they can be cancelled but not removed.
  const canDeleteMilestones =
    canUpdate && ["DRAFT", "SUBMITTED", "UNDER_REVIEW"].includes(s.status);

  return (
    <div>
      <PageHeader
        title={s.title}
        description={`${s.sipNo ?? "Not yet numbered"}${s.department ? ` · ${s.department}` : ""}`}
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Improvement Projects", href: "/business-excellence/sip" },
          { label: s.sipNo ?? "Draft" }
        ]}
        action={
          <div className="flex items-center gap-2">
            {live ? <RagChip rag={s.rag} /> : null}
            <Chip
              label={SIP_STATUS_LABEL[s.status] ?? s.status}
              className={SIP_STATUS_CHIP[s.status]}
            />
          </div>
        }
      />

      {s.holdReason ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span className="font-medium">On hold.</span> {s.holdReason}
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox
          label="Milestones"
          value={`${s.milestoneCompleted}/${s.milestoneTotal}`}
          hint={s.milestoneLate ? `${s.milestoneLate} late` : undefined}
          tone={s.milestoneLate ? "warning" : "default"}
        />
        <StatBox
          label="Benefit validated"
          value={fmtMoney(s.benefitSummary?.realisedFinancial ?? null, s.currency) ?? "—"}
          tone="success"
        />
        <StatBox
          label="Projected"
          value={fmtMoney(s.benefitSummary?.projectedFinancial ?? null, s.currency) ?? "—"}
        />
        <StatBox label="Target date" value={fmtDate(s.targetDate)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Charter</h2>
            <h3 className="text-xs uppercase tracking-wider text-slate-400">Scope</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{s.scope}</p>
            {s.problemStatement ? (
              <>
                <h3 className="mt-4 text-xs uppercase tracking-wider text-slate-400">
                  Problem
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {s.problemStatement}
                </p>
              </>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Milestones</h2>
              {canUpdate && live ? (
                <AddMilestone sipId={s.id} nextSequence={s.milestones.length} />
              ) : null}
            </div>
            <MilestoneList
              milestones={s.milestones}
              action={(m) => (
                <MilestoneControls
                  sipId={s.id}
                  milestone={m}
                  canUpdate={canUpdate && live}
                  canDelete={canDeleteMilestones}
                />
              )}
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-1 font-semibold text-slate-900">Benefit</h2>
            {/* §7: actual-vs-target over the life of the project, not just at
                closure — which is why readings are enabled here and not on QCC. */}
            <p className="mb-4 text-xs text-slate-500">
              Tracked over the life of the project, not only at closure. It counts
              toward the total once its validation window has passed and the designated
              authority has signed it off.
            </p>
            <BenefitPanel
              sourceType="SIP"
              sourceId={s.id}
              benefits={s.benefits}
              canRecord={canRecordBenefit}
              canValidate={canValidateBenefit}
              defaultCurrency={s.currency}
              showReadings
            />
          </section>

          {s.lessonsLearned ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 flex items-center gap-1.5 font-semibold text-slate-900">
                <BookOpen size={15} className="text-slate-400" />
                Lessons learned
              </h2>
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {s.lessonsLearned}
              </p>
              {s.lessonsLearnedOplId ? (
                <Link
                  href={`/business-excellence/opl/${s.lessonsLearnedOplId}`}
                  className="mt-3 block text-sm text-primary-700 hover:underline"
                >
                  Published as a One Point Lesson →
                </Link>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">What happens next</h2>
            <SipActions
              id={s.id}
              status={s.status}
              availableActions={s.availableActions}
              transitionBlockers={s.transitionBlockers}
              lessonsLearned={s.lessonsLearned}
              canUpdate={canUpdate}
            />
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">
              {s.metricName ?? "The metric"}
            </h2>
            <MetricBar
              baseline={s.baselineValue}
              target={s.targetValue}
              actual={s.latestActualValue}
              unit={s.metricUnit}
              percent={s.metricProgress?.percent ?? null}
              onTrack={s.metricProgress?.onTrack ?? null}
            />
            <p className="mt-2 text-xs text-slate-500">
              {fmtMetricProgress({
                percent: s.metricProgress?.percent ?? null,
                onTrack: s.metricProgress?.onTrack ?? null
              })}
              {s.latestReadingAt ? ` · last read ${fmtDate(s.latestReadingAt)}` : ""}
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Details</h2>
            <dl className="space-y-2.5 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Sponsor</dt>
                <dd className="mt-0.5">
                  <PersonRef person={s.sponsor} fallback="No sponsor named" />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Owner</dt>
                <dd className="mt-0.5">
                  <PersonRef person={s.owner} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">
                  Category
                </dt>
                <dd className="mt-0.5 text-slate-700">
                  {KAIZEN_CATEGORY_LABEL[s.category] ?? s.category}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Site</dt>
                <dd className="mt-0.5 text-slate-700">
                  {s.siteName ?? "—"}
                  {s.areaName ? <span className="text-slate-400"> · {s.areaName}</span> : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Dates</dt>
                <dd className="mt-0.5 text-slate-700">
                  {fmtDate(s.startDate)} → {fmtDate(s.targetDate)}
                </dd>
              </div>
              {s.investmentCost !== null ? (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-slate-400">
                    Investment
                  </dt>
                  <dd className="mt-0.5 text-slate-700">
                    {fmtMoney(s.investmentCost, s.currency)}
                  </dd>
                </div>
              ) : null}
              {s.priorityScore !== null ? (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-slate-400">
                    Priority
                  </dt>
                  <dd className="mt-0.5 tabular-nums text-slate-700">
                    {s.priorityScore}
                    <span className="ml-1 text-xs text-slate-400">
                      (feasibility {s.feasibilityScore ?? "—"} × impact {s.impactScore ?? "—"})
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          {s.rcaId ? (
            <section className="rounded-xl border border-primary-200 bg-primary-50 p-5">
              <h2 className="flex items-center gap-1.5 font-semibold text-primary-900">
                <GitBranch size={15} />
                Root cause analysis
              </h2>
              <Link
                href={`/erm/rca/${s.rcaId}`}
                className="mt-2 block text-sm text-primary-700 hover:underline"
              >
                Open the analysis →
              </Link>
            </section>
          ) : null}

          {s.rejectionReason ? (
            <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm">
              <div className="font-medium text-rose-900">Why it stopped</div>
              <p className="mt-1 text-rose-800">{s.rejectionReason}</p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
