// Shared presentational pieces for Business Excellence Phase 2.
//
// Kept alongside ui.tsx rather than inside it so Phase 1's three registers keep
// a file nobody has to re-read, but the two sets are deliberately visually
// identical — Suggestion, QCC and SIP must look like the same module as Kaizen,
// OPL and Poka Yoke.

import Link from "next/link";
import type { ReactNode } from "react";
import { fmtDate, fmtMoney } from "./_meta";
import {
  BENEFIT_SOURCE_HREF,
  BENEFIT_SOURCE_LABEL,
  BENEFIT_STATUS_CHIP,
  BENEFIT_STATUS_LABEL,
  BENEFIT_TYPE_LABEL,
  MILESTONE_STATUS_CHIP,
  MILESTONE_STATUS_LABEL,
  RAG_CHIP,
  RAG_HINT,
  RAG_LABEL,
  STAGE_HINT,
  STAGE_LABEL,
  STAGE_STATUS_CHIP,
  STAGE_STATUS_LABEL,
  VALIDATION_WINDOW_LABEL,
  fmtMetric,
  type BenefitLine,
  type BenefitSummary,
  type QccStage,
  type SipMilestone
} from "./_meta-p2";
import { Chip, PersonRef } from "./ui";

/** Red / Amber / Green, with the reason in the tooltip. */
export function RagChip({ rag, className }: { rag: string; className?: string }) {
  return (
    <Chip
      label={RAG_LABEL[rag] ?? rag}
      title={RAG_HINT[rag]}
      className={`${RAG_CHIP[rag] ?? ""} ${className ?? ""}`}
    />
  );
}

/**
 * A reason a control is disabled, rendered next to it.
 *
 * A disabled button with no explanation is the single most reported defect on
 * this platform's permit screens. Every gate in Phase 2 returns its blockers
 * from the server precisely so this component has something to say.
 */
export function BlockerNote({ blockers }: { blockers: string[] }) {
  if (!blockers.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs text-amber-800">
      {blockers.map((b, i) => (
        <li key={i} className="flex gap-1.5">
          <span aria-hidden className="mt-[3px] text-amber-500">
            •
          </span>
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The DMAIC / PDCA gate board.
 *
 * Renders EVERY gate including the ones months away, greyed out. A board that
 * only shows the stages already reached tells a circle nothing about what is
 * coming, which is the main thing a stage-gated method is for.
 */
export function StageBoard({
  stages,
  rcaStage,
  rcaId,
  action
}: {
  stages: QccStage[];
  rcaStage: string | null;
  rcaId: string | null;
  /** Rendered inside the gate it belongs to. */
  action?: (stage: QccStage) => ReactNode;
}) {
  if (!stages.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
        The gates appear once the project is chartered.
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {stages.map((s) => {
        const isRcaGate = rcaStage === s.stage;
        return (
          <li
            key={s.id}
            className={`rounded-xl border p-4 ${
              s.status === "IN_PROGRESS"
                ? "border-blue-200 bg-blue-50/40"
                : s.status === "SIGNED_OFF"
                  ? "border-emerald-100 bg-white"
                  : "border-slate-200 bg-slate-50/60"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold tabular-nums text-slate-600">
                    {s.sequence + 1}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {STAGE_LABEL[s.stage] ?? s.stage}
                  </span>
                  <Chip
                    label={STAGE_STATUS_LABEL[s.status] ?? s.status}
                    className={STAGE_STATUS_CHIP[s.status]}
                  />
                  {isRcaGate ? (
                    <Chip
                      label={rcaId ? "RCA linked" : "Needs an RCA"}
                      title="§6 requires the platform's shared RCA register — this project has no analysis of its own."
                      className={
                        rcaId
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                          : "bg-amber-100 text-amber-800 border-amber-200"
                      }
                    />
                  ) : null}
                </div>
                <p className="mt-1 pl-8 text-xs text-slate-500">
                  {STAGE_HINT[s.stage] ?? ""}
                </p>
              </div>
              <div className="text-right text-xs text-slate-500">
                {s.targetDate ? <div>Target {fmtDate(s.targetDate)}</div> : null}
                {s.signedOffAt ? (
                  <div className="text-emerald-700">
                    Signed off {fmtDate(s.signedOffAt)}
                  </div>
                ) : null}
              </div>
            </div>

            {s.summary ? (
              <p className="mt-3 whitespace-pre-wrap pl-8 text-sm text-slate-700">
                {s.summary}
              </p>
            ) : null}

            {s.signedOffBy ? (
              <div className="mt-2 pl-8 text-xs text-slate-500">
                Signed off by <PersonRef person={s.signedOffBy} />
                {s.signOffNote ? ` — ${s.signOffNote}` : null}
              </div>
            ) : null}

            {action ? <div className="mt-3 pl-8">{action(s)}</div> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Milestone / Gantt-style tracker for a SIP. */
export function MilestoneList({
  milestones,
  action
}: {
  milestones: SipMilestone[];
  action?: (m: SipMilestone) => ReactNode;
}) {
  if (!milestones.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
        No milestones yet. A project without them has nothing to be late against.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {milestones.map((m) => (
        <li key={m.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{m.name}</span>
                <Chip
                  label={MILESTONE_STATUS_LABEL[m.status] ?? m.status}
                  className={MILESTONE_STATUS_CHIP[m.status]}
                />
                {m.isLate ? (
                  <Chip label="Late" className="border-rose-200 bg-rose-100 text-rose-800" />
                ) : null}
              </div>
              {m.description ? (
                <p className="mt-1 text-sm text-slate-600">{m.description}</p>
              ) : null}
              <div className="mt-1 text-xs text-slate-500">
                Owner: <PersonRef person={m.owner} />
              </div>
            </div>

            <div className="shrink-0 text-right text-xs text-slate-500">
              <div>Planned {fmtDate(m.plannedDate)}</div>
              {/* The original plan is never overwritten, so a revision is shown
                  alongside it rather than replacing it — that difference IS the
                  slippage. */}
              {m.revisedDate ? (
                <div className="text-amber-700">Revised {fmtDate(m.revisedDate)}</div>
              ) : null}
              {m.actualDate ? (
                <div className="text-emerald-700">Actual {fmtDate(m.actualDate)}</div>
              ) : null}
              {m.slipDays !== null && m.slipDays > 0 ? (
                <div className="text-rose-700">
                  {m.slipDays} day{m.slipDays === 1 ? "" : "s"} behind plan
                </div>
              ) : null}
            </div>
          </div>

          {m.progressPercent !== null && m.progressPercent !== undefined ? (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${
                  m.isLate ? "bg-rose-400" : "bg-primary-500"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, m.progressPercent))}%` }}
              />
            </div>
          ) : null}

          {m.note ? <p className="mt-2 text-xs text-slate-500">{m.note}</p> : null}
          {action ? <div className="mt-3">{action(m)}</div> : null}
        </li>
      ))}
    </ul>
  );
}

/** One benefit line — projected, realised, and who validated it. */
export function BenefitCard({
  benefit,
  action
}: {
  benefit: BenefitLine;
  action?: ReactNode;
}) {
  const money = (v: number | null) =>
    benefit.valueKind === "FINANCIAL"
      ? fmtMoney(v, benefit.currency ?? "INR")
      : fmtMetric(v, benefit.unit);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">
              {BENEFIT_TYPE_LABEL[benefit.benefitType] ?? benefit.benefitType}
            </span>
            <Chip
              label={BENEFIT_STATUS_LABEL[benefit.status] ?? benefit.status}
              className={BENEFIT_STATUS_CHIP[benefit.status]}
            />
            {benefit.isValidationDue ? (
              <Chip
                label="Sign-off due"
                className="border-amber-200 bg-amber-100 text-amber-800"
              />
            ) : null}
          </div>
          {benefit.sourceRef ? (
            <Link
              href={`${BENEFIT_SOURCE_HREF[benefit.sourceType] ?? "#"}/${benefit.sourceId}`}
              className="mt-0.5 block font-mono text-[11px] text-slate-500 hover:text-primary-700"
            >
              {BENEFIT_SOURCE_LABEL[benefit.sourceType] ?? benefit.sourceType} ·{" "}
              {benefit.sourceRef}
            </Link>
          ) : null}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-slate-400">
            Projected
          </dt>
          <dd className="text-sm font-semibold tabular-nums text-slate-700">
            {money(benefit.projectedValue) ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-slate-400">
            Realised
          </dt>
          {/* Emerald only once validated. An unvalidated realised figure is a
              claim, and colouring it green is exactly the confusion the
              validation window exists to prevent. */}
          <dd
            className={`text-sm font-semibold tabular-nums ${
              benefit.status === "VALIDATED" ? "text-emerald-700" : "text-slate-500"
            }`}
          >
            {money(benefit.realizedValue) ?? "Not yet measured"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-slate-400">
            Sign-off window
          </dt>
          <dd className="text-sm text-slate-700">
            {benefit.validationWindowMonths
              ? VALIDATION_WINDOW_LABEL[benefit.validationWindowMonths] ??
                `${benefit.validationWindowMonths} months`
              : "None set"}
            {benefit.validationDueAt ? (
              <span className="ml-1 text-xs text-slate-400">
                (due {fmtDate(benefit.validationDueAt)})
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        {benefit.validatedBy ? (
          <span>
            Validated by <PersonRef person={benefit.validatedBy} /> on{" "}
            {fmtDate(benefit.validatedAt)}
            {benefit.validationNote ? ` — ${benefit.validationNote}` : null}
          </span>
        ) : benefit.validatingAuthority ? (
          <span>
            Awaiting <PersonRef person={benefit.validatingAuthority} />
          </span>
        ) : (
          <span>
            Not yet validated. A benefit counts toward the total only once someone
            independent has confirmed it held.
          </span>
        )}
      </div>

      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/**
 * The benefit rollup line.
 *
 * Financial and non-financial are shown apart, never added. Summing rupees and
 * parts-per-million produces a number that looks like a benefit and means
 * nothing.
 */
export function BenefitSummaryBar({
  summary,
  currency = "INR"
}: {
  summary: Partial<BenefitSummary>;
  currency?: string;
}) {
  const realised = summary.realisedFinancial ?? null;
  const projected = summary.projectedFinancial ?? null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
        <div className="text-[11px] uppercase tracking-wider text-emerald-700/70">
          Validated benefit
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums text-emerald-800">
          {fmtMoney(realised, currency) ?? "—"}
        </div>
        <div className="mt-0.5 text-[11px] text-emerald-700/70">
          {summary.validatedLines ?? 0} line(s) signed off
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">
          Projected
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums text-slate-700">
          {fmtMoney(projected, currency) ?? "—"}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          Claimed, not yet confirmed
        </div>
      </div>
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
        <div className="text-[11px] uppercase tracking-wider text-amber-700/70">
          Awaiting sign-off
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums text-amber-800">
          {summary.pendingValidation ?? 0}
        </div>
        <div className="mt-0.5 text-[11px] text-amber-700/70">
          {summary.overdueValidation ?? 0} past their window
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">
          Non-financial
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums text-slate-700">
          {summary.nonFinancialLines ?? 0}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          Counted separately, never summed with money
        </div>
      </div>
    </div>
  );
}

/**
 * Baseline → target → where we actually are.
 *
 * Direction-agnostic: the bar fills as the distance closes, whether "better"
 * means up or down.
 */
export function MetricBar({
  baseline,
  target,
  actual,
  unit,
  percent,
  onTrack
}: {
  baseline: number | null;
  target: number | null;
  actual: number | null;
  unit: string | null;
  percent: number | null;
  onTrack: boolean | null;
}) {
  if (baseline === null || target === null) {
    return (
      <p className="text-sm text-slate-500">
        No baseline and target recorded, so progress cannot be measured.
      </p>
    );
  }

  const clamped = percent === null ? 0 : Math.min(100, Math.max(0, percent));

  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>Baseline {fmtMetric(baseline, unit)}</span>
        <span className="font-medium text-slate-700">
          {actual === null ? "No reading yet" : `Now ${fmtMetric(actual, unit)}`}
        </span>
        <span>Target {fmtMetric(target, unit)}</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${
            onTrack === false ? "bg-rose-400" : clamped >= 100 ? "bg-emerald-500" : "bg-primary-500"
          }`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
