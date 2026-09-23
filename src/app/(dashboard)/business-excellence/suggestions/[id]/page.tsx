import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/server";
import { can } from "@/lib/auth/permissions";
import { redirectMissingRecord } from "@/lib/nav/missing-record";
import { EyeOff, MessageSquarePlus } from "lucide-react";
import { KAIZEN_CATEGORY_LABEL, fmtDate, fmtMoney } from "../../_meta";
import {
  INCENTIVE_STATUS_LABEL,
  SCREENING_OUTCOME_LABEL,
  SUGGESTION_DECISION_LABEL,
  SUGGESTION_STATUS_CHIP,
  SUGGESTION_STATUS_LABEL,
  type SuggestionDetail
} from "../../_meta-p2";
import { Chip, PersonRef } from "../../ui";
import { SuggestionActions } from "./actions";

export const dynamic = "force-dynamic";

export default async function SuggestionDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const user = await requirePermission("SUGGESTION.READ");

  let s: SuggestionDetail;
  try {
    s = await backendFetch<SuggestionDetail>(`/api/be/suggestions/${id}`);
  } catch {
    // A dead deep link becomes a redirect with a toast, never a blank page.
    redirectMissingRecord("/business-excellence/suggestions", "Suggestion");
  }

  // Resolved here rather than with <Can/> because these are props on a client
  // component, not a wrapper around markup.
  const canScreen = (await can((user as any).id, "SUGGESTION.SCREEN", {})).allowed;
  const canDecide = (await can((user as any).id, "SUGGESTION.DECIDE", {})).allowed;

  return (
    <div>
      <PageHeader
        title={s.title}
        description={s.suggestionNo ?? "Not yet numbered"}
        breadcrumbs={[
          { label: "Business Excellence", href: "/business-excellence" },
          { label: "Suggestion Scheme", href: "/business-excellence/suggestions" },
          { label: s.suggestionNo ?? "Draft" }
        ]}
        action={
          <Chip
            label={SUGGESTION_STATUS_LABEL[s.status] ?? s.status}
            className={SUGGESTION_STATUS_CHIP[s.status]}
          />
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">The suggestion</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{s.description}</p>
            {s.expectedBenefit ? (
              <>
                <h3 className="mt-4 text-xs uppercase tracking-wider text-slate-400">
                  Expected benefit
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {s.expectedBenefit}
                </p>
              </>
            ) : null}
          </section>

          {/* §3's two stages, shown as two records rather than one "outcome" —
              a suggestion found NOT_RELEVANT was never rejected on its merits,
              and collapsing the two overstates what the committee turned down. */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Triage</h2>
            {s.screeningOutcome ? (
              <dl className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-slate-500">Outcome</dt>
                  <dd className="text-slate-800">
                    {SCREENING_OUTCOME_LABEL[s.screeningOutcome] ?? s.screeningOutcome}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-slate-500">By</dt>
                  <dd>
                    <PersonRef person={s.screenedBy} /> · {fmtDate(s.screenedAt)}
                  </dd>
                </div>
                {s.screeningNote ? (
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 text-slate-500">Note</dt>
                    <dd className="text-slate-700">{s.screeningNote}</dd>
                  </div>
                ) : null}
                {s.duplicateOfSuggestionId ? (
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 text-slate-500">Duplicate of</dt>
                    <dd>
                      <a
                        className="font-mono text-xs text-primary-700 hover:underline"
                        href={`/business-excellence/suggestions/${s.duplicateOfSuggestionId}`}
                      >
                        View the original
                      </a>
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-slate-500">Not yet triaged.</p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Committee decision</h2>
            {s.decision ? (
              <dl className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-slate-500">Decision</dt>
                  <dd className="text-slate-800">
                    {SUGGESTION_DECISION_LABEL[s.decision] ?? s.decision}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-slate-500">By</dt>
                  <dd>
                    <PersonRef person={s.decidedBy} /> · {fmtDate(s.decidedAt)}
                  </dd>
                </div>
                {s.deferredUntil ? (
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 text-slate-500">Revisit on</dt>
                    <dd className="text-slate-800">
                      {fmtDate(s.deferredUntil)}
                      {s.deferralDue ? (
                        <Chip
                          label="Due now"
                          className="ml-2 border-amber-200 bg-amber-100 text-amber-800"
                        />
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-slate-500">Reason</dt>
                  <dd className="whitespace-pre-wrap text-slate-700">
                    {s.decisionRationale}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500">
                No decision recorded yet.
                {!s.screeningOutcome
                  ? " It has to be triaged before the committee can decide."
                  : null}
              </p>
            )}
          </section>

          {s.implementationNote ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 font-semibold text-slate-900">Implementation</h2>
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {s.implementationNote}
              </p>
              {s.implementedAt ? (
                <p className="mt-2 text-xs text-slate-500">
                  Implemented {fmtDate(s.implementedAt)}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">What happens next</h2>
            <SuggestionActions
              id={s.id}
              status={s.status}
              availableActions={s.availableActions}
              screeningOutcome={s.screeningOutcome}
              incentiveStatus={s.incentiveStatus}
              canScreen={canScreen}
              canDecide={canDecide}
            />
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Details</h2>
            <dl className="space-y-2.5 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">From</dt>
                <dd className="mt-0.5">
                  {s.isAnonymous && !s.submittedBy ? (
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <EyeOff size={12} /> Anonymous
                    </span>
                  ) : (
                    <PersonRef person={s.submittedBy} fallback="—" />
                  )}
                  {/* Tell the reader that the name is withheld rather than
                      absent — an unexplained blank reads as missing data. */}
                  {s.isAnonymous ? (
                    <p className="mt-1 text-xs text-slate-400">
                      Submitted anonymously. The identity is recorded for the audit
                      trail and is not shown here.
                    </p>
                  ) : null}
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
                  {s.areaName ? (
                    <span className="text-slate-400"> · {s.areaName}</span>
                  ) : null}
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
                  Target date
                </dt>
                <dd className="mt-0.5 text-slate-700">
                  {fmtDate(s.targetDate)}
                  {s.isOverdue ? (
                    <Chip
                      label="Overdue"
                      className="ml-2 border-rose-200 bg-rose-100 text-rose-800"
                    />
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Raised</dt>
                <dd className="mt-0.5 text-slate-700">{fmtDate(s.createdAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Incentive</h2>
            <div className="text-sm text-slate-700">
              {INCENTIVE_STATUS_LABEL[s.incentiveStatus] ?? s.incentiveStatus}
            </div>
            {s.incentivePoints !== null || s.incentiveAmount !== null ? (
              <dl className="mt-2 space-y-1 text-sm">
                {s.incentivePoints !== null ? (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Points</dt>
                    <dd className="tabular-nums text-slate-800">{s.incentivePoints}</dd>
                  </div>
                ) : null}
                {s.incentiveAmount !== null ? (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Amount</dt>
                    <dd className="tabular-nums text-slate-800">
                      {fmtMoney(s.incentiveAmount, s.currency)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {s.incentiveNote ? (
              <p className="mt-2 text-xs text-slate-500">{s.incentiveNote}</p>
            ) : null}
            <p className="mt-3 text-xs text-slate-400">
              Recorded here only. SafeOps does not pay incentives.
            </p>
          </section>

          {s.convertedToKaizenId ? (
            <section className="rounded-xl border border-primary-200 bg-primary-50 p-5 text-sm">
              <div className="font-medium text-primary-900">Became a Kaizen</div>
              <a
                className="mt-1 block text-primary-700 hover:underline"
                href={`/business-excellence/kaizen/${s.convertedToKaizenId}`}
              >
                Open the improvement record →
              </a>
              <p className="mt-2 text-xs text-primary-800/70">
                Linked so the same idea is not counted twice on the Business
                Excellence dashboard.
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
