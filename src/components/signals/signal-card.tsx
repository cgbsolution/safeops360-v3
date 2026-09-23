// One Signal, rendered. Shared by the Cross-Module dashboard and the
// per-module related-signals slot so a finding reads identically wherever it
// appears — a HIGH on the dashboard and the same HIGH inside Incident
// Analytics must not look like two different things.

import Link from "next/link";
import { AlertTriangle, ArrowRight, Layers } from "lucide-react";
import { INK, NAVY, STATUS } from "@/lib/design/midnight";
import type { EngineSignal, SignalSeverity } from "@/lib/signal-engine";

/**
 * Severity → the Midnight Executive reserved status scale.
 *
 * Five engine severities map onto three visual steps deliberately. The scale
 * exists to make "act now" separable from "read later" at a glance, and five
 * tints do that worse than three; the exact severity is always written out in
 * the badge, so nothing is lost. CRITICAL is separated from HIGH by weight, not
 * by inventing a fourth colour.
 */
export function severityStyle(sev: SignalSeverity) {
  switch (sev) {
    case "CRITICAL":
      return { ...STATUS.high, weight: "font-bold" as const };
    case "HIGH":
      return { ...STATUS.high, weight: "font-semibold" as const };
    case "MEDIUM":
      return { ...STATUS.medium, weight: "font-semibold" as const };
    default:
      return { ...STATUS.low, weight: "font-medium" as const };
  }
}

const CLASS_LABEL: Record<string, string> = {
  CORRELATION: "Cross-module",
  STATISTICAL: "Statistical",
  DATA_QUALITY: "Data quality",
};

export function SeverityBadge({ severity }: { severity: SignalSeverity }) {
  const s = severityStyle(severity);
  return (
    <span
      className={
        "inline-flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide " +
        s.weight
      }
      style={{ backgroundColor: s.tint, borderColor: s.line, color: s.ink }}
    >
      {/* The word carries the meaning; colour only reinforces it. */}
      {severity}
    </span>
  );
}

export function SignalCard({
  signal,
  compact = false,
}: {
  signal: EngineSignal;
  compact?: boolean;
}) {
  const s = severityStyle(signal.severity);
  // The deterministic narrative is the default view. The optional LLM rewrite
  // is preferred only when it exists, and it never replaces what is stored.
  const text = signal.narrativeLLM || signal.narrativeTemplate;

  if (compact) {
    return (
      <div className="flex items-start gap-2">
        <SeverityBadge severity={signal.severity} />
        <div className="min-w-0">
          <p className="text-[11.5px] leading-snug" style={{ color: INK.base }}>
            {text}
          </p>
          <p className="mt-0.5 text-[10px]" style={{ color: INK.faint }}>
            {signal.ruleCode}
            {signal.evidenceCount > 0 && ` · ${signal.evidenceCount} linked records`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <article
      className="rounded-xl border bg-white p-4"
      style={{ borderColor: NAVY[200] }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={signal.severity} />
        <span
          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium"
          style={{ borderColor: NAVY[200], color: INK.muted }}
        >
          <Layers size={10} aria-hidden />
          {CLASS_LABEL[signal.ruleClass ?? ""] ?? "Signal"}
        </span>
        <span className="text-[10.5px] font-mono" style={{ color: INK.faint }}>
          {signal.ruleCode}
        </span>
        {signal.status !== "OPEN" && (
          <span
            className="rounded border px-1.5 py-0.5 text-[10px]"
            style={{ borderColor: NAVY[200], color: INK.muted }}
          >
            {signal.status}
          </span>
        )}
        {signal.occurrenceCount > 1 && (
          <span className="text-[10.5px]" style={{ color: INK.faint }}>
            seen {signal.occurrenceCount}×
          </span>
        )}
      </div>

      <p className="mt-2 text-[13.5px] leading-snug" style={{ color: INK.strong }}>
        {text}
      </p>

      <p className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug" style={{ color: INK.muted }}>
        <ArrowRight size={12} className="mt-0.5 shrink-0" style={{ color: s.ink }} aria-hidden />
        {signal.recommendedAction}
      </p>

      <div
        className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-[10.5px]"
        style={{ borderColor: NAVY[100], color: INK.faint }}
      >
        <span>{signal.siteName ?? "Estate-wide"}</span>
        <span>·</span>
        <span>{signal.evidenceCount} linked records</span>
        <span>·</span>
        <span>confidence {Math.round(signal.confidence * 100)}%</span>
        <span>·</span>
        <span>computed {signal.computedAt.slice(0, 10)}</span>
      </div>

      {signal.evidence.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {signal.evidence.slice(0, 8).map((e) => (
            <li
              key={e.id}
              className="rounded border px-1.5 py-0.5 text-[10px]"
              style={{ borderColor: NAVY[200], color: INK.muted }}
              // House rule: a record ref, never a cuid. The snapshot is frozen
              // at compute time, so this stays readable even if the source row
              // is later edited or soft-deleted.
              title={`${e.sourceModule} · ${e.sourceRecordRef ?? "unreferenced"}`}
            >
              {e.sourceRecordRef ?? e.sourceModule}
            </li>
          ))}
          {signal.evidence.length > 8 && (
            <li className="px-1 py-0.5 text-[10px]" style={{ color: INK.faint }}>
              +{signal.evidence.length - 8} more
            </li>
          )}
        </ul>
      )}
    </article>
  );
}

export function SignalEmpty({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl border bg-white px-4 py-3 text-[12px]"
      style={{ borderColor: NAVY[200], color: INK.muted }}
    >
      <AlertTriangle size={14} className="mt-px shrink-0" style={{ color: INK.faint }} aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function SignalError({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl border p-4 text-sm"
      style={{ borderColor: STATUS.high.line, backgroundColor: STATUS.high.tint, color: STATUS.high.ink }}
    >
      <p className="font-semibold">The Signal Engine could not be read.</p>
      <p className="mt-1 text-[12px]">{message}</p>
      <p className="mt-2 text-[12px]">
        This page is deliberately showing an error rather than an empty list — on a screen whose
        job is to notice silence, &ldquo;no signals&rdquo; and &ldquo;could not load&rdquo; must
        never look the same.{" "}
        <Link href="/admin/data-quality" className="underline" style={{ color: STATUS.high.ink }}>
          Check the engine run log
        </Link>
        .
      </p>
    </div>
  );
}
