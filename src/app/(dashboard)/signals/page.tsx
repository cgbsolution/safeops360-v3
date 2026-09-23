// Cross-Module Analytics Dashboard — the Signal Engine's own screen.
//
// Every other analytics screen in SafeOps360 belongs to a module and answers
// "how is THIS flow doing". This one belongs to no module: it lists findings
// that only exist because two or more modules were read together, which is the
// engine's entire reason to exist.
//
// Deliberately NOT tolerant of a backend failure. A list screen that loses its
// insight bar still shows its records, so degrading there is right. Here the
// signals ARE the page, and rendering an empty list on an error would state
// "nothing is wrong across your estate" — the single most misleading thing this
// screen could say, on a page whose whole job is to notice silence.

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SignalCard, SignalEmpty, SignalError } from "@/components/signals/signal-card";
import { SignalFilterBar } from "@/components/signals/signal-filter-bar";
import { RegisterFindingsBand } from "@/components/analytics/register-findings-band";
import { INK, NAVY, STATUS } from "@/lib/design/midnight";
import {
  fetchSignals,
  fetchSignalSummary,
  type EngineSignal,
  type SignalSeverity,
  type SignalStatus,
  type SignalSummary,
} from "@/lib/signal-engine";

export const dynamic = "force-dynamic";

const SEVERITIES: SignalSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const CLASSES = [
  { value: "CORRELATION", label: "Cross-module" },
  { value: "STATISTICAL", label: "Statistical" },
  { value: "DATA_QUALITY", label: "Data quality" },
];
// Modules the rule set actually reads. Kept explicit rather than derived from
// the signals on screen: a module with no live signal must still be selectable,
// or the reader cannot tell "nothing found" from "not covered".
const MODULES = [
  "INCIDENT", "OBSERVATION", "NEAR_MISS", "CAPA", "PTW",
  "HIRA", "CAMS_AUDIT", "MOC", "TRAINING", "LOTO", "PLATFORM",
];

function Tile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number | string;
  tone?: { ink: string; tint: string; line: string };
  hint?: string;
}) {
  return (
    <div
      className="rounded-xl border bg-white p-4"
      style={{ borderColor: tone?.line ?? NAVY[200] }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: INK.muted }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: tone?.ink ?? INK.strong }}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] leading-snug" style={{ color: INK.faint }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export default async function Page(props: {
  searchParams: Promise<{
    severity?: string; module?: string; class?: string; status?: string;
  }>;
}) {
  const sp = await props.searchParams;
  const severity = sp.severity?.toUpperCase() || null;
  const module = sp.module?.toUpperCase() || null;
  const ruleClass = sp.class?.toUpperCase() || null;
  const status = sp.status?.toUpperCase() || null;

  let signals: EngineSignal[] = [];
  let total = 0;
  let summary: SignalSummary | null = null;
  let error: string | null = null;

  try {
    const [list, sum] = await Promise.all([
      fetchSignals({
        severity: severity ? [severity as SignalSeverity] : undefined,
        module: module ?? undefined,
        ruleClass: ruleClass ? [ruleClass as never] : undefined,
        // Default view is the LIVE backlog. Dismissed and expired signals are
        // reachable through the filter but must not pad the default count —
        // an executive reading "157 signals" needs that to mean 157 live ones.
        status: (status ? [status] : ["OPEN", "ACKNOWLEDGED"]) as SignalStatus[],
        limit: 200,
      }),
      fetchSignalSummary(),
    ]);
    signals = list.signals;
    total = list.total;
    summary = sum;
  } catch (e: any) {
    error = e?.message ?? "Failed to load signals";
  }

  const header = (
    <PageHeader
      title="Cross-Module Signals"
      breadcrumbs={[{ label: "Insight" }, { label: "Cross-Module Signals" }]}
      description="Findings that only appear when Observation, Near Miss, Incident, PTW, HIRA, Audit, MOC, CAPA, Training and LOTO are read as one dataset. Deterministic — no model, no network."
      action={
        <Link
          href="/admin/data-quality"
          className="rounded-lg border bg-white px-3 py-1.5 text-xs font-medium hover:border-primary-500"
          style={{ borderColor: NAVY[200], color: NAVY[700] }}
        >
          Engine &amp; rules
        </Link>
      }
    />
  );

  if (error) {
    return (
      <div>
        {header}
        <SignalError message={error} />
      </div>
    );
  }

  const bySev = summary?.bySeverity ?? {};
  const critical = bySev.CRITICAL ?? 0;
  const high = bySev.HIGH ?? 0;

  return (
    <div>
      {header}

      <RegisterFindingsBand />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Critical"
          value={critical}
          tone={critical > 0 ? STATUS.high : undefined}
          hint="act before the next shift"
        />
        <Tile
          label="High"
          value={high}
          tone={high > 0 ? STATUS.medium : undefined}
          hint="act this week"
        />
        <Tile
          label="Live signals"
          value={summary ? Object.values(bySev).reduce((a, b) => a + b, 0) : 0}
          hint="open and acknowledged"
        />
        <Tile
          label="Cross-module"
          value={summary?.byRuleClass?.CORRELATION ?? 0}
          hint={`${summary?.byRuleClass?.STATISTICAL ?? 0} statistical · ${
            summary?.byRuleClass?.DATA_QUALITY ?? 0
          } data quality`}
        />
      </div>

      <SignalFilterBar
        severity={severity}
        module={module}
        ruleClass={ruleClass}
        status={status}
        severityOptions={SEVERITIES.map((s) => ({
          value: s, label: s.charAt(0) + s.slice(1).toLowerCase(), count: bySev[s],
        }))}
        moduleOptions={MODULES.map((m) => ({
          value: m,
          label: m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          count: summary?.byModule?.[m],
        }))}
        classOptions={CLASSES.map((c) => ({
          ...c, count: summary?.byRuleClass?.[c.value],
        }))}
        total={total}
      />

      {signals.length === 0 ? (
        <SignalEmpty
          message={
            severity || module || ruleClass || status
              ? "No signals match these filters. Clear them to see the full live set."
              : "No live signals. The engine ran and found nothing above threshold — check the run log to confirm it ran at all."
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {signals.map((s) => (
            <SignalCard key={s.id} signal={s} />
          ))}
        </div>
      )}

      {total > signals.length && (
        <p className="mt-3 text-[11px]" style={{ color: INK.faint }}>
          Showing {signals.length} of {total}. Narrow the filters to see the rest — the list is
          capped rather than paged so a count on this screen is never a partial truth.
        </p>
      )}
    </div>
  );
}
