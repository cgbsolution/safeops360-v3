"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown, ChevronRight, Check, PenLine, Link2, RefreshCw, Info, Lock,
} from "lucide-react";
import {
  MX, PROVENANCE_CHIP, PROVENANCE_LABEL, completionTone, displayValue, fmtDate,
  groupIndicators, type Cycle, type IndicatorWithValue, type PrincipleDetail,
} from "../../../lib-brsr";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { IndicatorEditor } from "./indicator-editor";

export function PrincipleView({
  cycleId, cycle, detail,
}: { cycleId: string; cycle: Cycle; detail: PrincipleDetail }) {
  const router = useRouter();
  const { response: resp } = detail;
  const locked = cycle.status === "FILED";
  const [editing, setEditing] = useState<IndicatorWithValue | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [narrative, setNarrative] = useState(resp.narrative ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function toggle(code: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  async function saveNarrative() {
    setBusy("narrative");
    setErr(null);
    try {
      const res = await fetch(`/api/brsr/cycles/${cycleId}/principles/${resp.principle}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ narrative }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.detail ?? "Could not save the narrative");
      }
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Could not save");
    } finally {
      setBusy(null);
    }
  }

  async function verify(code: string) {
    setBusy(code);
    setErr(null);
    try {
      const res = await fetch(`/api/brsr/cycles/${cycleId}/values/${code}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVerified: true }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.detail ?? "Could not verify");
      }
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Could not verify");
    } finally {
      setBusy(null);
    }
  }

  async function sweepThis() {
    setBusy("sweep");
    setErr(null);
    try {
      const res = await fetch(
        `/api/brsr/cycles/${cycleId}/sweep?principle=${resp.principle}`, { method: "POST" }
      );
      if (!res.ok) throw new Error("Sweep failed");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Sweep failed");
    } finally {
      setBusy(null);
    }
  }

  const renderSection = (title: string, rows: IndicatorWithValue[], voluntary: boolean) => {
    if (rows.length === 0) return null;
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <div>
            <h3 className="text-sm font-semibold" style={{ fontFamily: MX.display, color: MX.navy }}>
              {title}
            </h3>
            <p className="text-[11px] text-slate-400">
              {voluntary
                ? "Voluntary under the SEBI format — these do not count toward completion."
                : "Required disclosures. Completion is measured against these."}
            </p>
          </div>
          <span className="text-[11px] text-slate-400">{rows.length} indicators</span>
        </div>

        {groupIndicators(rows).map(({ group, rows: groupRows }, gi) => (
          <div key={gi}>
            {group && (
              <div
                className="border-b border-slate-100 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
                style={{ background: MX.ice, color: MX.navy }}
              >
                {group}
              </div>
            )}
            {groupRows.map(({ indicator: ind, value: iv }) => {
              const isOpen = expanded.has(ind.code);
              const refs = iv?.sourceRecordRefs ?? [];
              const canDrill = refs.length > 0;
              return (
                <div key={ind.code} className="border-b border-slate-50 last:border-0">
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                          {ind.code}
                        </span>
                        {iv && (
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${PROVENANCE_CHIP[iv.provenance]}`}>
                            {PROVENANCE_LABEL[iv.provenance]}
                            {iv.sourceModule ? ` · ${iv.sourceModule}` : ""}
                          </span>
                        )}
                        {iv?.provenance === "AUTO" && !iv.isVerified && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                            needs verification
                          </span>
                        )}
                        {iv?.isVerified && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700">
                            <Check size={10} /> verified
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm leading-snug text-slate-800">{ind.label}</p>

                      <div className="mt-1.5 flex flex-wrap items-baseline gap-3">
                        <span className="text-base font-semibold tabular-nums" style={{ color: MX.navy }}>
                          {displayValue(iv, ind)}
                        </span>
                        {canDrill && (
                          <Button variant="bare"
                            onClick={() => toggle(ind.code)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium"
                            style={{ color: MX.navy }}
                          >
                            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            <Link2 size={11} />
                            {iv?.sourceRecordCount ?? refs.length} source record
                            {(iv?.sourceRecordCount ?? refs.length) === 1 ? "" : "s"}
                          </Button>
                        )}
                      </div>

                      {iv?.derivationNote && (
                        <p className="mt-1 flex items-start gap-1 text-[11px] leading-relaxed text-slate-500">
                          <Info size={11} className="mt-0.5 shrink-0" />
                          <span>{iv.derivationNote}</span>
                        </p>
                      )}

                      {iv?.provenance === "AUTO_OVERRIDDEN" && (
                        <p className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                          Platform derived{" "}
                          <strong>{iv.autoValueNumber ?? iv.autoValueText ?? "—"}</strong>; overridden{" "}
                          {fmtDate(iv.overriddenAt)} — “{iv.overrideReason}”
                        </p>
                      )}

                      {iv?.provenance === "NOT_APPLICABLE" && iv.notApplicableReason && (
                        <p className="mt-1 text-[11px] italic text-slate-500">
                          Marked not applicable: {iv.notApplicableReason}
                        </p>
                      )}

                      {isOpen && canDrill && (
                        <div className="mt-2 rounded-lg border p-2" style={{ borderColor: MX.iceDeep, background: MX.ice }}>
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: MX.navy }}>
                            Records this figure was derived from
                          </div>
                          <ul className="space-y-0.5">
                            {refs.slice(0, 50).map((r) => (
                              <li key={`${r.entity}-${r.id}`} className="text-[11px] text-slate-700">
                                <span className="mr-1.5 rounded bg-white px-1 py-0.5 font-mono text-[9px] text-slate-500">
                                  {r.module}
                                </span>
                                {r.label}
                              </li>
                            ))}
                          </ul>
                          {refs.length > 50 && (
                            <p className="mt-1 text-[10px] text-slate-500">
                              …and {refs.length - 50} more. The full list travels with the export.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {!locked && (
                        <Button variant="bare"
                          onClick={() => setEditing({ indicator: ind, value: iv })}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <PenLine size={11} /> {iv ? "Edit" : "Enter"}
                        </Button>
                      )}
                      {!locked && iv?.provenance === "AUTO" && !iv.isVerified && (
                        <Button variant="bare"
                          onClick={() => verify(ind.code)}
                          disabled={busy === ind.code}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                          style={{ background: MX.navy }}
                        >
                          <Check size={11} /> Verify
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4" style={{ fontFamily: MX.body }}>
      {/* ── header strip ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-sm leading-snug text-slate-700">{resp.title}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <span className={`font-semibold tabular-nums ${completionTone(resp.completionPct)}`}>
                {resp.completionPct.toFixed(0)}% complete
              </span>
              <span className="text-slate-400">
                {resp.answeredIndicators}/{resp.totalIndicators} required indicators answered
              </span>
              {resp.isPlatformSourced && (
                <span className="text-slate-500">
                  {resp.autoPopulatedIndicators} from platform data
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {locked && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Lock size={12} /> filed — read only
              </span>
            )}
            {!locked && resp.isPlatformSourced && (
              <Button variant="bare"
                onClick={sweepThis}
                disabled={busy === "sweep"}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                style={{ borderColor: MX.iceDeep, color: MX.navy, background: MX.ice }}
              >
                <RefreshCw size={12} className={busy === "sweep" ? "animate-spin" : ""} />
                Refresh from platform data
              </Button>
            )}
          </div>
        </div>

        {/* The banner the spec asks for on P2/P4/P7/P8. Driven by the API's own
            isPlatformSourced flag, not by "we found no values" — an empty
            sourced principle and an unsourceable one look identical otherwise. */}
        {!resp.isPlatformSourced && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
            <span>
              <strong>Not sourced from platform data.</strong> SafeOps360 holds no records that map to{" "}
              {resp.principle}, so every indicator below needs direct input. Nothing here will ever be
              auto-populated.
            </span>
          </div>
        )}
      </div>

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div>
      )}

      {renderSection("Essential indicators", detail.essentialIndicators, false)}
      {renderSection("Leadership indicators", detail.leadershipIndicators, true)}

      {/* ── narrative ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-sm font-semibold" style={{ fontFamily: MX.display, color: MX.navy }}>
            Principle narrative
          </h3>
          <p className="text-[11px] text-slate-400">
            Free-text context that accompanies this principle in the assembled report.
          </p>
        </div>
        <div className="p-4">
          <Textarea
            className="min-h-0 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={5}
            value={narrative}
            disabled={locked}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="Context, caveats, and anything a reader needs alongside the figures…"
          />
          {!locked && (
            <div className="mt-2 flex justify-end">
              <Button variant="bare"
                onClick={saveNarrative}
                disabled={busy === "narrative"}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: MX.navy }}
              >
                {busy === "narrative" ? "Saving…" : "Save narrative"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <IndicatorEditor
          cycleId={cycleId}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
