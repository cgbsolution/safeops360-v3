// Signal Engine — Data Quality panel (spec §5.1, Stream 1).
//
// A separate screen from the Cross-Module Analytics Dashboard on purpose. These
// signals name unpopulated columns and broken references: the audience is admin
// and engineering, the remedy is a code change, and putting "your HIRA
// consequence field is 0% populated" in front of a safety officer devalues both
// the finding and the feed it appeared in. DATA_QUALITY signals are excluded
// from the executive Daily Brief for the same reason.
//
// Server component, System-Admin gated by the backend (a non-admin's token gets
// a 403 from /api/signal-rules and never sees DATA_QUALITY rows in the feed).

import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  fetchSignalRules,
  fetchSignalRuns,
  fetchSignals,
  type EngineSignal,
  type SignalRule,
  type SignalRun,
} from "@/lib/signal-engine";

export const dynamic = "force-dynamic";

const SEVERITY_CHIP: Record<string, string> = {
  CRITICAL: "bg-rose-100 text-rose-800 border-rose-200",
  HIGH: "bg-orange-100 text-orange-800 border-orange-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  LOW: "bg-sky-100 text-sky-800 border-sky-200",
  INFO: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_CHIP: Record<string, string> = {
  OPEN: "bg-primary-50 text-primary-700 border-primary-200",
  ACKNOWLEDGED: "bg-sky-100 text-sky-800 border-sky-200",
  ACTIONED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  DISMISSED: "bg-slate-100 text-slate-500 border-slate-200",
  EXPIRED: "bg-slate-100 text-slate-400 border-slate-200",
};

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/** The module a data-quality signal is about, read off its evidence. */
function moduleOf(s: EngineSignal): string {
  return s.evidence[0]?.sourceModule ?? "PLATFORM";
}

function SignalCard({ s }: { s: EngineSignal }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            "inline-block rounded border px-2 py-0.5 text-[11px] font-medium " +
            (SEVERITY_CHIP[s.severity] ?? SEVERITY_CHIP.INFO)
          }
        >
          {s.severity}
        </span>
        <span
          className={
            "inline-block rounded border px-2 py-0.5 text-[11px] " +
            (STATUS_CHIP[s.status] ?? STATUS_CHIP.OPEN)
          }
        >
          {s.status}
        </span>
        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-600">
          {s.ruleCode}
        </span>
        <span className="text-[11px] uppercase tracking-wider text-slate-400">
          {moduleOf(s)}
        </span>
        <span className="ml-auto text-[11px] text-slate-400">
          {/* Signal strength, not a learned probability — see spec §4.4. */}
          strength {s.confidence.toFixed(2)} · seen {s.occurrenceCount}×
        </span>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-slate-700">
        {s.narrativeTemplate}
      </p>

      <p className="mt-2 border-l-2 border-primary-200 pl-3 text-[13px] leading-relaxed text-slate-500">
        {s.recommendedAction}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span className="font-mono">{s.signalKey}</span>
        <span>first seen {fmtWhen(s.firstSeenAt)}</span>
        <span>recomputed {fmtWhen(s.computedAt)}</span>
        {s.evidenceCount > 0 && <span>{s.evidenceCount} evidence record(s)</span>}
      </div>
    </li>
  );
}

function EmptyState({ runs }: { runs: SignalRun[] }) {
  // "No findings" and "never ran" look identical on a panel like this, and
  // conflating them is exactly the failure this engine exists to catch — so the
  // empty state says which one it is.
  const everRan = runs.some((r) => r.completedAt);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
      {everRan ? (
        <>
          <p className="font-medium text-slate-700">No open data-quality signals.</p>
          <p className="mt-1 text-slate-500">
            The last run completed {fmtWhen(runs[0]?.completedAt)} and found nothing
            outstanding. Every field the engine scans is populated above its threshold
            and every cross-module reference resolves.
          </p>
        </>
      ) : (
        <>
          <p className="font-medium text-amber-700">The engine has not completed a run yet.</p>
          <p className="mt-1 text-slate-500">
            An empty list here means &ldquo;not measured&rdquo;, not &ldquo;nothing wrong&rdquo;.
            Confirm the Signal Engine tables have been applied
            (<code className="font-mono text-[12px]">scripts.create_signal_engine_tables</code>)
            and that the <code className="font-mono text-[12px]">signal_engine_scan</code> job is
            scheduled.
          </p>
        </>
      )}
    </div>
  );
}

export default async function DataQualityPage() {
  let signals: EngineSignal[] = [];
  let rules: SignalRule[] = [];
  let runs: SignalRun[] = [];
  let error: string | null = null;

  try {
    const [feed, ruleList, runList] = await Promise.all([
      fetchSignals({ category: ["DATA_QUALITY"], status: ["OPEN", "ACKNOWLEDGED"], limit: 100 }),
      fetchSignalRules(),
      fetchSignalRuns(15),
    ]);
    signals = feed.signals;
    rules = ruleList;
    runs = runList;
  } catch (e: any) {
    error = e?.message ?? "Failed to load the data-quality register";
  }

  const byModule = signals.reduce<Record<string, number>>((acc, s) => {
    const m = moduleOf(s);
    acc[m] = (acc[m] ?? 0) + 1;
    return acc;
  }, {});
  const lastRun = runs[0];

  return (
    <div>
      <PageHeader
        title="Data Quality"
        breadcrumbs={[{ label: "Admin" }, { label: "Data Quality" }]}
        description="Signal Engine — fields that are never populated and cross-module references that no longer resolve. Deterministic, computed nightly from the records themselves. System-Admin only."
      />

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          {error}. This panel requires a System-Admin role, and the Signal Engine tables
          must have been applied.
        </div>
      ) : (
        <div className="space-y-8">
          {/* Run health — the NFR §9 check ("nightly runs complete with errorCount 0")
              made visible rather than left to a log grep. */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Engine runs</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <Table className="w-full min-w-[760px] text-sm">
                <TableHeader className="bg-slate-50/95">
                  <TableRow className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <TableHead className="px-3 py-2.5 text-[11px] text-slate-500">Started</TableHead>
                    <TableHead className="px-3 py-2.5 text-[11px] text-slate-500">Type</TableHead>
                    <TableHead className="px-3 py-2.5 text-[11px] text-slate-500">Duration</TableHead>
                    <TableHead className="px-3 py-2.5 text-[11px] text-slate-500">Rules</TableHead>
                    <TableHead className="px-3 py-2.5 text-[11px] text-slate-500">New</TableHead>
                    <TableHead className="px-3 py-2.5 text-[11px] text-slate-500">Updated</TableHead>
                    <TableHead className="px-3 py-2.5 text-[11px] text-slate-500">Expired</TableHead>
                    <TableHead className="px-3 py-2.5 text-[11px] text-slate-500">Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="px-3 py-4 text-xs text-slate-400">
                        No runs recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {runs.map((r) => (
                    <TableRow key={r.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <TableCell className="px-3 py-2.5 text-xs text-slate-600">{fmtWhen(r.startedAt)}</TableCell>
                      <TableCell className="px-3 py-2.5 text-xs text-slate-500">{r.runType}</TableCell>
                      <TableCell className="px-3 py-2.5 text-xs tabular-nums text-slate-500">
                        {r.completedAt ? fmtDuration(r.durationMs) : "running…"}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-xs tabular-nums text-slate-600">{r.rulesRun}</TableCell>
                      <TableCell className="px-3 py-2.5 text-xs tabular-nums text-slate-600">{r.signalsEmitted}</TableCell>
                      <TableCell className="px-3 py-2.5 text-xs tabular-nums text-slate-500">{r.signalsUpdated}</TableCell>
                      <TableCell className="px-3 py-2.5 text-xs tabular-nums text-slate-500">{r.signalsExpired}</TableCell>
                      <TableCell className="px-3 py-2.5">
                        <span
                          className={
                            "inline-block rounded border px-2 py-0.5 text-[11px] " +
                            (r.errorCount > 0
                              ? "bg-rose-100 text-rose-800 border-rose-200"
                              : "bg-emerald-100 text-emerald-800 border-emerald-200")
                          }
                        >
                          {r.errorCount}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {lastRun?.errorDetail && (
              <pre className="mt-2 overflow-x-auto rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-800">
                {JSON.stringify(lastRun.errorDetail, null, 2)}
              </pre>
            )}
          </section>

          {/* Rule library — enable/disable and threshold tuning live on the
              backend (PATCH /api/signal-rules/{code}/override); this pass shows
              the effective configuration so a tuning decision is made against
              what is actually running, not against the defaults in the spec. */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Rule library</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <Table className="w-full min-w-[760px] text-sm">
                <TableHeader className="bg-slate-50/95">
                  <TableRow className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <TableHead className="px-3 py-2.5 text-[11px] text-slate-500">Rule</TableHead>
                    <TableHead className="px-3 py-2.5 text-[11px] text-slate-500">Category</TableHead>
                    <TableHead className="px-3 py-2.5 text-[11px] text-slate-500">State</TableHead>
                    <TableHead className="px-3 py-2.5 text-[11px] text-slate-500">Open</TableHead>
                    <TableHead className="px-3 py-2.5 text-[11px] text-slate-500">Effective thresholds</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.code} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                      <TableCell className="px-3 py-2.5 align-top">
                        <span className="font-mono text-[11px] text-slate-500">{r.code}</span>
                        <span className="block font-medium text-slate-700">{r.name}</span>
                        <span className="block max-w-md text-[11px] text-slate-400">{r.description}</span>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 align-top text-[11px] text-slate-500">{r.category}</TableCell>
                      <TableCell className="px-3 py-2.5 align-top">
                        <span
                          className={
                            "inline-block rounded border px-2 py-0.5 text-[11px] " +
                            (r.effectiveEnabled
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                              : "bg-slate-100 text-slate-500 border-slate-200")
                          }
                        >
                          {r.effectiveEnabled ? "enabled" : "disabled"}
                        </span>
                        {!r.implemented && (
                          <span className="mt-1 block text-[10px] text-amber-600">
                            catalogued, no implementation
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 align-top text-xs tabular-nums text-slate-600">{r.openSignals}</TableCell>
                      <TableCell className="px-3 py-2.5 align-top">
                        <code className="text-[11px] text-slate-500">
                          {JSON.stringify(r.effectiveThresholds ?? {})}
                        </code>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* The register itself. */}
          <section>
            <div className="mb-3 flex flex-wrap items-baseline gap-3">
              <h2 className="text-sm font-semibold text-slate-700">
                Open findings{signals.length > 0 && ` (${signals.length})`}
              </h2>
              {Object.entries(byModule)
                .sort((a, b) => b[1] - a[1])
                .map(([m, n]) => (
                  <span key={m} className="text-[11px] text-slate-400">
                    {m} <span className="tabular-nums text-slate-600">{n}</span>
                  </span>
                ))}
            </div>
            {signals.length === 0 ? (
              <EmptyState runs={runs} />
            ) : (
              <ul className="space-y-3">
                {signals.map((s) => (
                  <SignalCard key={s.id} s={s} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
