// Horizontal bars for a categorical breakdown.
//
// Deliberately plain HTML, not a chart library. Every bar carries its own text
// label and its own value, so identity comes from the label and magnitude from
// the bar length — colour is doing no work that text is not already doing. That
// is why an identity breakdown (category, area, plant, source) uses ONE hue
// rather than twelve: twelve cycled hues would imply twelve meanings and force a
// legend that the row labels already are.
//
// Severity-scale dimensions are the exception: their values are ordered states,
// so they take the reserved status palette. Those steps are sub-3:1 on white by
// design, which is legal only because each bar ships a visible label and value.

import Link from "next/link";
import type { Breakdown } from "@/lib/flow-analytics";
import { INK, NAVY } from "@/lib/design/midnight";
import {
  NEUTRAL_BAR,
  SEVERITY_DIMENSIONS,
  severityColor,
} from "@/components/analytics/palette";

export interface BreakdownPalette {
  /** Single hue for identity dimensions. */
  bar: string;
  /** Severity value → colour, or null when the value is not a severity. */
  severity: (key: string) => string | null;
  /** Track behind the bar. */
  track: string;
  /** Fill for the "Not recorded" row — an absence, never a category. */
  notRecorded: string;
}

export function BreakdownBars({
  breakdown,
  palette,
}: {
  breakdown: Breakdown;
  /**
   * Override the colours. Defaults to the original validated palette so the
   * seven screens still on the old layout render exactly as before; the
   * Analytics Screen Contract's reference screen passes the Midnight Executive
   * set. Without this the severity breakdown kept painting its bars from the
   * legacy status ramp — which is where the one orange (#ec835a) left on the
   * rebuilt Incident screen was coming from.
   */
  palette?: BreakdownPalette;
}) {
  const items = breakdown.items;
  const max = Math.max(1, ...items.map((i) => i.total));
  const isSeverity = SEVERITY_DIMENSIONS.has(breakdown.key);
  const barColor = palette?.bar ?? NEUTRAL_BAR;
  const severityOf = palette?.severity ?? severityColor;
  const track = palette?.track ?? "#f1f5f9";
  const absent = palette?.notRecorded ?? "#d8d8d4";

  if (items.length === 0) {
    return (
      <p className="text-xs" style={{ color: INK.faint }}>No values recorded for this dimension.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const color = (isSeverity && severityOf(item.key)) || barColor;
        const pct = Math.max((item.total / max) * 100, 1.5);
        const notRecorded = item.key === "__NOT_SET__";

        const row = (
          <div className="group">
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={"truncate text-[12px] " + (notRecorded ? "italic" : "")}
                style={{ color: notRecorded ? INK.faint : INK.base }}
                title={item.label}
              >
                {item.label}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums" style={{ color: INK.muted }}>
                {item.total}
                {item.open > 0 && (
                  <span style={{ color: INK.faint }}> · {item.open} open</span>
                )}
              </span>
            </div>
            <div
              className="mt-1 h-2 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: track }}
            >
              <div
                className="h-full rounded-full transition-[filter] group-hover:brightness-110"
                style={{
                  width: `${pct}%`,
                  // "Not recorded" is an absence, not a category — it must not
                  // look like the strongest finding on the chart just because
                  // the field is unpopulated.
                  backgroundColor: notRecorded ? absent : color,
                }}
              />
            </div>
          </div>
        );

        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className="block rounded transition-colors hover:bg-[color:var(--me-surface)]">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
