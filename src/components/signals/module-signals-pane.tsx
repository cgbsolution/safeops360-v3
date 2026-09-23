// The Signals tab of a register workspace.
//
// This is the module's slice of Cross-Module Signals, not a second engine: it
// calls the same `GET /api/signals` with `?module=`, which the router resolves
// to "signals whose RULE READS this module". That distinction matters and is
// stated on screen — a signal listed under PTW may have been raised because
// PTW and Near Miss disagreed, and its subject may well be the near miss. A
// reader who takes this list as "problems with my permits" would act on the
// wrong record.
//
// Not tolerant of a backend failure. Everywhere else in the product a signal
// strip is an ornament on a screen that stands without it, so swallowing the
// error is right. Here the signals ARE the pane, and an empty list would
// state "nothing is wrong in this module" — the one thing a screen whose job
// is noticing silence must never say by accident.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SignalCard, SignalEmpty, SignalError } from "@/components/signals/signal-card";
import { INK, NAVY } from "@/lib/design/midnight";
import { fetchSignals, type EngineSignal, type SignalStatus } from "@/lib/signal-engine";

const LIVE: SignalStatus[] = ["OPEN", "ACKNOWLEDGED"];

export async function ModuleSignalsPane({
  module,
  moduleLabel,
}: {
  /** Signal Engine module token, e.g. "NEAR_MISS". */
  module: string;
  /** Human name of the register, for the explanatory line. */
  moduleLabel: string;
}) {
  let signals: EngineSignal[] = [];
  let total = 0;
  let error: string | null = null;

  try {
    const res = await fetchSignals({ module, status: LIVE, limit: 100 });
    signals = res.signals ?? [];
    total = res.total ?? signals.length;
  } catch (e: any) {
    error = e?.message ?? "Failed to load signals";
  }

  const allHref = `/signals?module=${encodeURIComponent(module)}`;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-3xl text-sm" style={{ color: INK.muted }}>
          Live cross-module signals raised by rules that read {moduleLabel}. A signal is a
          correlation between registers, so the record it names is not always a {moduleLabel}{" "}
          record — open the signal to see what it actually joined.
        </p>
        <Link
          href={allHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium hover:border-primary-500"
          style={{ borderColor: NAVY[200], color: NAVY[700] }}
        >
          All cross-module signals
          <ArrowRight size={13} aria-hidden />
        </Link>
      </div>

      {error ? (
        <SignalError message={error} />
      ) : signals.length === 0 ? (
        <SignalEmpty
          message={`No live signals reference ${moduleLabel}. The engine ran and found nothing above threshold — check the run log on Data Quality to confirm it ran at all.`}
        />
      ) : (
        <>
          <p className="mb-2 text-xs" style={{ color: INK.faint }}>
            {signals.length === total
              ? `${total} live ${total === 1 ? "signal" : "signals"}`
              : `Showing ${signals.length} of ${total} live signals`}
          </p>
          <div className="space-y-3">
            {signals.map((s) => (
              <SignalCard key={s.id} signal={s} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
