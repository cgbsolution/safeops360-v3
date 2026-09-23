/**
 * `<DataQualityFlag />` — the Analytics Screen Contract's fourth component.
 *
 * A first-class insight type, deliberately NOT one of the InsightRail's
 * findings, for a metric that is **structurally uncountable** rather than
 * genuinely zero or genuinely good.
 *
 * This exists because of a specific, real defect. Incident Analytics rendered
 * its Overdue tile as a clean **0** — and every reader took that to mean
 * nothing was late. In fact `statutoryDeadline` is null on all 128 incidents on
 * prod, so lateness cannot be computed for a single one of them. A zero and an
 * unmeasurable are opposite facts, and the most dangerous thing an analytics
 * screen can do is render the second as the first: the reader is not merely
 * uninformed, they have been actively reassured.
 *
 * The rule this component enforces: a metric that cannot be computed never
 * wears the good/neutral KPI treatment. It wears this one, in gold, and it says
 * the count and the field name out loud.
 *
 * Gold rather than the usual amber is a Midnight Executive decision — see
 * DATA_QUALITY in src/lib/design/midnight.ts. It also keeps the flag visually
 * distinct from the crimson the InsightRail uses for a HIGH severity finding,
 * which matters: "the plant has a problem" and "this number is not
 * trustworthy" must not look like the same alert.
 */

import { AlertTriangle } from "lucide-react";
import { DATA_QUALITY } from "@/lib/design/midnight";

export interface DataQualityFlagProps {
  /** The metric this undermines, exactly as the KPI is labelled. */
  metric: string;
  /** How many records cannot be counted. */
  incompleteCount: number;
  /** Out of how many — the denominator the metric claims to cover. */
  totalCount: number;
  /** Why, in the reader's language. Should name the missing field. */
  reason: string;
  /** Field name for the "missing [field]" clause. Optional. */
  field?: string;
  /** What `totalCount` counts — "open records", "records". */
  scope?: string;
  /**
   * True when NOTHING can be counted, not merely some. A blocking flag replaces
   * the metric's value; a partial one sits beside it.
   */
  blocking?: boolean;
  /** `inline` sits inside a KPI card; `banner` stands alone above the grid. */
  variant?: "inline" | "banner";
  className?: string;
}

export function DataQualityFlag({
  metric,
  incompleteCount,
  totalCount,
  reason,
  field,
  scope = "records",
  blocking = false,
  variant = "inline",
  className = "",
}: DataQualityFlagProps) {
  // The required sentence, built from the numbers rather than authored per
  // screen — so it can never drift from what was actually counted.
  const headline =
    `${incompleteCount} of ${totalCount} ${scope} missing ` +
    `${field ?? "a required field"} — ${metric.toLowerCase()} ` +
    (blocking ? "cannot be computed" : "may be misleading");

  return (
    <div
      className={
        (variant === "banner"
          ? "flex items-start gap-2.5 rounded-xl border p-3.5 "
          : "flex items-start gap-2 rounded-lg border px-2.5 py-2 ") + className
      }
      style={{
        backgroundColor: DATA_QUALITY.tint,
        borderColor: DATA_QUALITY.line,
        color: DATA_QUALITY.ink,
      }}
      /* Colour never carries this alone: the icon, the word "misleading" and
         the counts all say it independently. */
      role="note"
      aria-label={`Data quality: ${headline}`}
    >
      <AlertTriangle
        size={variant === "banner" ? 16 : 13}
        className="mt-px shrink-0"
        aria-hidden
      />
      <div className="min-w-0">
        <p
          className={
            variant === "banner"
              ? "text-[13px] font-semibold leading-snug"
              : "text-[11px] font-semibold leading-snug"
          }
          style={{ color: DATA_QUALITY.strongInk }}
        >
          {headline}
        </p>
        <p
          className={
            (variant === "banner" ? "mt-1 text-[12px]" : "mt-0.5 text-[10.5px]") +
            " leading-snug"
          }
        >
          {reason}
        </p>
      </div>
    </div>
  );
}
