/**
 * `<ContextKPI />` — the Analytics Screen Contract's second component.
 *
 * Replaces the bare-number KPI card. A number with no comparator is not a
 * finding, it is trivia: "42 open" tells a plant head nothing until they know
 * whether it was 4 or 400 a period ago. So this component makes the delta row
 * structural — every instance renders label, value AND a delta row.
 *
 * Two rules make that honest rather than decorative:
 *
 *  1. **The delta row is never silently dropped.** Where no comparator exists,
 *     the row renders "no prior period data" in muted ink. An absent delta and
 *     a zero delta are different facts and must look different.
 *  2. **Direction and goodness are separate props.** More records opened is not
 *     automatically bad — on a leading-indicator flow it usually means people
 *     started reporting. `deltaDirection` says which way the number moved;
 *     `deltaIsGood` says whether that is good, and is OPTIONAL. Omit it and the
 *     arrow stays neutral ink rather than asserting a judgement the data does
 *     not support.
 *
 * A KPI whose metric is structurally uncountable does not belong here at all —
 * pass a <DataQualityFlag /> as `flag` and, when nothing can be counted,
 * `suppressValue` so the card never shows a reassuring zero.
 */

import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { INK, NAVY, STATUS } from "@/lib/design/midnight";

export interface ContextKPIProps {
  label: string;
  value: string | number;
  /** Formatted delta, e.g. "+38", "12%", "4.4 days". */
  deltaValue?: string;
  deltaDirection?: "up" | "down" | "flat";
  /**
   * Whether the movement is good. Omit where the direction carries no
   * judgement — the arrow then stays neutral instead of inventing one.
   */
  deltaIsGood?: boolean;
  /** What it is compared against, e.g. "vs prior 12 months". */
  comparatorLabel?: string;
  /** Optional secondary comparator, e.g. a benchmark or target. */
  benchmarkLabel?: string;
  benchmarkValue?: string;
  /** Sub-line under the value — context, not a comparator. */
  hint?: string | null;
  /** Data-quality flag for this metric; renders under the delta row. */
  flag?: React.ReactNode;
  /**
   * Hide the number entirely. For a metric that cannot be computed at all,
   * where printing "0" would be a false statement.
   */
  suppressValue?: boolean;
  href?: string | null;
  className?: string;
}

function DeltaRow({
  deltaValue,
  deltaDirection,
  deltaIsGood,
  comparatorLabel,
}: Pick<ContextKPIProps, "deltaValue" | "deltaDirection" | "deltaIsGood" | "comparatorLabel">) {
  // Rule 1: no comparator is stated, never omitted.
  if (!deltaValue) {
    return (
      <p className="mt-1.5 text-[11px] leading-snug" style={{ color: INK.faint }}>
        No prior period data — nothing to compare against
      </p>
    );
  }

  const Icon =
    deltaDirection === "up" ? ArrowUpRight : deltaDirection === "down" ? ArrowDownRight : ArrowRight;
  // Rule 2: neutral unless the caller asserts a judgement.
  const ink =
    deltaIsGood === undefined
      ? INK.muted
      : deltaIsGood
        ? STATUS.low.ink
        : STATUS.high.ink;

  return (
    <p className="mt-1.5 flex items-center gap-1 text-[11px] leading-snug">
      <Icon size={12} className="shrink-0" style={{ color: ink }} aria-hidden />
      {/* The value wears the judgement colour; the comparator label stays in
          muted text ink. Colour marks the number, never the sentence. */}
      <span className="font-semibold tabular-nums" style={{ color: ink }}>
        {deltaValue}
      </span>
      {comparatorLabel && <span style={{ color: INK.faint }}>{comparatorLabel}</span>}
    </p>
  );
}

export function ContextKPI({
  label,
  value,
  deltaValue,
  deltaDirection = "flat",
  deltaIsGood,
  comparatorLabel,
  benchmarkLabel,
  benchmarkValue,
  hint,
  flag,
  suppressValue = false,
  href,
  className = "",
}: ContextKPIProps) {
  const body = (
    <div
      className={
        "flex h-full flex-col rounded-xl border bg-white p-4 transition-colors " + className
      }
      style={{ borderColor: NAVY[200] }}
    >
      <div
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: INK.muted }}
      >
        {label}
      </div>

      {suppressValue ? (
        <div className="mt-1 text-2xl font-semibold" style={{ color: INK.faint }}>
          {/* An em dash, not a zero. "Not measurable" must not be able to be
              misread as "none". */}
          —
        </div>
      ) : (
        // Proportional figures on a standalone number; tabular is for columns.
        <div className="mt-1 text-2xl font-semibold" style={{ color: INK.strong }}>
          {value}
        </div>
      )}

      <DeltaRow
        deltaValue={deltaValue}
        deltaDirection={deltaDirection}
        deltaIsGood={deltaIsGood}
        comparatorLabel={comparatorLabel}
      />

      {benchmarkValue && (
        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: INK.faint }}>
          <span className="tabular-nums font-medium" style={{ color: INK.muted }}>
            {benchmarkValue}
          </span>
          {benchmarkLabel ? ` ${benchmarkLabel}` : ""}
        </p>
      )}

      {hint && (
        <p className="mt-1 text-[11px] leading-snug" style={{ color: INK.faint }}>
          {hint}
        </p>
      )}

      {flag && <div className="mt-2">{flag}</div>}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
