"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RefreshCw, Leaf, AlertTriangle, Lock, ShieldCheck, ArrowRight, FileDown, PenLine,
} from "lucide-react";
import {
  CYCLE_STATUS_CHIP, CYCLE_STATUS_LABEL, MX, PRINCIPLE_SHORT, completionTone,
  fmtDate, fmtInr, fmtNum, type CycleDashboard, type SweepResult,
} from "../lib-brsr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const NEXT_STATUS: Record<string, { target: string; label: string } | null> = {
  DRAFT: { target: "DATA_COLLECTION", label: "Begin data collection" },
  DATA_COLLECTION: { target: "REVIEW", label: "Send for review" },
  REVIEW: { target: "APPROVED", label: "Approve disclosure" },
  APPROVED: { target: "FILED", label: "Mark as filed" },
  FILED: null,
};

export function CycleDashboardView({ data }: { data: CycleDashboard }) {
  const router = useRouter();
  const { cycle, principles, environmental: env } = data;
  const [sweep, setSweep] = useState<SweepResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filingRef, setFilingRef] = useState("");
  const [askFiling, setAskFiling] = useState(false);

  const locked = cycle.status === "FILED";
  const next = NEXT_STATUS[cycle.status];

  async function runSweep() {
    setBusy("sweep");
    setErr(null);
    try {
      const res = await fetch(`/api/brsr/cycles/${cycle.id}/sweep`, { method: "POST" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.detail ?? `Sweep failed (${res.status})`);
      }
      setSweep(await res.json());
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Sweep failed");
    } finally {
      setBusy(null);
    }
  }

  async function transition(target: string, reference?: string) {
    setBusy("transition");
    setErr(null);
    try {
      const res = await fetch(`/api/brsr/cycles/${cycle.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target, filingReference: reference ?? null }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.detail ?? `Could not move to ${target} (${res.status})`);
      }
      setAskFiling(false);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Transition failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5" style={{ fontFamily: MX.body }}>
      {/* ── hero ── */}
      <div
        className="rounded-xl border p-5"
        style={{ background: MX.navy, borderColor: MX.navy }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold" style={{ fontFamily: MX.display, color: "#fff" }}>
                {cycle.entityName ?? "Listed entity"} — {cycle.financialYear}
              </h2>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${CYCLE_STATUS_CHIP[cycle.status]}`}>
                {CYCLE_STATUS_LABEL[cycle.status]}
              </span>
            </div>
            <p className="mt-1 text-xs" style={{ color: MX.goldSoft }}>
              {fmtDate(cycle.periodStart)} – {fmtDate(cycle.periodEnd)}
              {cycle.cin ? ` · CIN ${cycle.cin}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!locked && (
              <Button variant="bare"
                onClick={runSweep}
                disabled={busy === "sweep"}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60"
                style={{ background: MX.gold, color: MX.navy }}
              >
                <RefreshCw size={14} className={busy === "sweep" ? "animate-spin" : ""} />
                {busy === "sweep" ? "Pulling…" : "Pull from platform data"}
              </Button>
            )}
            <Link
              href={`/brsr/${cycle.id}/environment`}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium"
              style={{ borderColor: MX.navySoft, color: "#fff" }}
            >
              <Leaf size={14} /> Environmental data
            </Link>
            <Link
              href={`/brsr/${cycle.id}/report`}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium"
              style={{ borderColor: MX.navySoft, color: "#fff" }}
            >
              <FileDown size={14} /> Report
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <HeroStat label="Disclosure complete" value={`${cycle.completionPct.toFixed(1)}%`} />
          <HeroStat
            label="From platform data"
            value={`${cycle.autoPopulatedPct.toFixed(1)}%`}
            sub="of answered indicators"
          />
          <HeroStat
            label="Awaiting verification"
            value={data.unverifiedAutoCount}
            sub={data.unverifiedAutoCount ? "blocks approval" : "none outstanding"}
            alert={data.unverifiedAutoCount > 0}
          />
          <HeroStat
            label="Sites reporting"
            value={`${data.sitesReported} / ${data.sitesExpected}`}
            sub="environmental data"
            alert={data.sitesReported < data.sitesExpected}
          />
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      )}

      {/* ── sweep result ── */}
      {sweep && (
        <div className="rounded-xl border p-4" style={{ borderColor: MX.iceDeep, background: MX.ice }}>
          <div className="text-sm" style={{ color: MX.navy }}>
            <strong>{sweep.populated}</strong> indicator{sweep.populated === 1 ? "" : "s"} populated
            from platform data · <strong>{sweep.noData}</strong> had no data yet ·{" "}
            <strong>{sweep.skippedManual}</strong> left alone because a person had already answered them.
          </div>
          {sweep.misconfigured.length > 0 && (
            <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <strong>Mapping configuration problem — these indicators are NOT being sourced:</strong>
              <ul className="ml-4 mt-1 list-disc">
                {sweep.misconfigured.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          )}
          {sweep.failed.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>{sweep.failed.length} source(s) could not be read this run:</strong>
              <ul className="ml-4 mt-1 list-disc">
                {sweep.failed.map((f) => (
                  <li key={f.indicatorCode}>
                    {f.indicatorCode} ({f.resolverKey}) — {f.error.slice(0, 160)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── nine principles ── */}
      <div>
        <h3 className="mb-2 text-sm font-semibold" style={{ fontFamily: MX.display, color: MX.navy }}>
          Section C — Principle-wise performance
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {principles.map((p) => (
            <Link
              key={p.principle}
              href={`/brsr/${cycle.id}/principles/${p.principle}`}
              className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-[#CFDCEE] hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="rounded px-1.5 py-0.5 text-[11px] font-bold"
                      style={{ background: MX.ice, color: MX.navy }}
                    >
                      {p.principle}
                    </span>
                    {!p.isPlatformSourced && (
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        manual entry
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 text-sm font-semibold text-slate-800">
                    {PRINCIPLE_SHORT[p.principle]}
                  </div>
                </div>
                <ArrowRight
                  size={14}
                  className="mt-1 shrink-0 text-slate-300 transition group-hover:translate-x-0.5"
                  style={{ color: MX.gold }}
                />
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, p.completionPct)}%`,
                    background: p.completionPct >= 100 ? "#2E8B57" : MX.navy,
                  }}
                />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between text-xs">
                <span className={`font-semibold tabular-nums ${completionTone(p.completionPct)}`}>
                  {p.completionPct.toFixed(0)}% complete
                </span>
                <span className="text-slate-400">
                  {p.answeredIndicators}/{p.totalIndicators} answered
                </span>
              </div>

              {/* The split the spec asks each principle to show. Manual-only
                  principles say so rather than showing a bare 0%. */}
              <div className="mt-2 border-t border-slate-50 pt-2 text-[11px] text-slate-500">
                {p.isPlatformSourced ? (
                  <>
                    <span style={{ color: MX.navy }} className="font-medium">
                      {p.autoPopulatedIndicators} auto-populated
                    </span>
                    {" · "}
                    <span>{p.manualPendingIndicators} still need input</span>
                  </>
                ) : (
                  <span>Not sourced from platform data — {p.manualPendingIndicators} need direct input</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── environmental summary ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <div>
            <h3 className="text-sm font-semibold" style={{ fontFamily: MX.display, color: MX.navy }}>
              Environmental data — Principle 6
            </h3>
            <p className="text-[11px] text-slate-400">
              Summed from submitted and verified facility returns. Draft returns are excluded.
            </p>
          </div>
          <Link
            href={`/brsr/${cycle.id}/environment`}
            className="text-xs font-medium"
            style={{ color: MX.navy }}
          >
            Capture / review →
          </Link>
        </div>

        {env.sitesReporting === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No facility has submitted environmental data for this cycle yet. Principle 6 figures stay
            blank until at least one site submits — they are not defaulted to zero.
          </div>
        ) : (
          <>
            {env.unresolvedEmissionLines > 0 && (
              <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  <strong>{env.unresolvedEmissionLines} emission line(s) could not be resolved</strong> —
                  a missing emission factor or an unconvertible unit. They are excluded from the Scope 1
                  and Scope 2 totals below, so those figures currently understate the entity.
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-px bg-slate-100 p-px sm:grid-cols-4">
              <EnvStat label="Scope 1" value={fmtNum(env.scope1TCo2e)} unit="tCO₂e" />
              <EnvStat label="Scope 2" value={fmtNum(env.scope2TCo2e)} unit="tCO₂e" />
              <EnvStat
                label="Scope 3"
                value={env.scope3TCo2e === null || env.scope3TCo2e === undefined ? "—" : fmtNum(env.scope3TCo2e)}
                unit="tCO₂e"
                hint="entered manually"
              />
              <EnvStat label="Total energy" value={fmtNum(env.energyTotalGj)} unit="GJ" />
              <EnvStat label="Renewable energy" value={fmtNum(env.energyRenewableGj)} unit="GJ" />
              <EnvStat label="Water withdrawn" value={fmtNum(env.waterWithdrawnKl)} unit="kL" />
              <EnvStat label="Waste generated" value={fmtNum(env.wasteGeneratedT)} unit="MT" />
              <EnvStat
                label="Waste diverted"
                value={env.wasteDivertedPct === null || env.wasteDivertedPct === undefined ? "—" : `${env.wasteDivertedPct}`}
                unit="%"
              />
            </div>
            <div className="px-4 py-2.5 text-[11px] text-slate-500">
              Turnover reported for intensity: <strong>{fmtInr(env.turnoverInr)}</strong>
              {!env.turnoverInr && " — intensity ratios are omitted until a site reports turnover."}
            </div>
          </>
        )}
      </div>

      {/* ── lifecycle ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold" style={{ fontFamily: MX.display, color: MX.navy }}>
              Disclosure lifecycle
            </h3>
            {locked ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <Lock size={12} />
                Filed {fmtDate(cycle.filedAt)}
                {cycle.filingReference ? ` · reference ${cycle.filingReference}` : ""}
                {cycle.snapshotHash ? ` · integrity ${cycle.snapshotHash.slice(0, 12)}…` : ""}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-slate-500">
                {cycle.status === "REVIEW" && data.unverifiedAutoCount > 0
                  ? `${data.unverifiedAutoCount} auto-populated figure(s) must be verified by a person before this can be approved.`
                  : "SafeOps360 does not submit to SEBI — file through your own process and record the reference here."}
              </p>
            )}
          </div>
          {next && (
            <Button variant="bare"
              onClick={() => (next.target === "FILED" ? setAskFiling(true) : transition(next.target))}
              disabled={busy === "transition"}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: MX.navy }}
            >
              {next.target === "APPROVED" ? <ShieldCheck size={14} /> : <PenLine size={14} />}
              {next.label}
            </Button>
          )}
        </div>
      </div>

      {askFiling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="text-base font-semibold" style={{ fontFamily: MX.display, color: MX.navy }}>
                Record this cycle as filed
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                This freezes an immutable snapshot of the report. The cycle cannot be edited afterwards.
              </p>
            </div>
            <div className="px-5 py-4">
              <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Filing reference
              </Label>
              <Input
                className="h-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filingRef}
                onChange={(e) => setFilingRef(e.target.value)}
                placeholder="e.g. BSE submission ID / annual report page"
              />
              <p className="mt-1.5 text-[11px] text-slate-400">
                What was filed, through your own SEBI process, and where it can be found.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <Button variant="bare" onClick={() => setAskFiling(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                Cancel
              </Button>
              <Button variant="bare"
                onClick={() => transition("FILED", filingRef)}
                disabled={!filingRef.trim() || busy === "transition"}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: MX.navy }}
              >
                Freeze and mark filed
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HeroStat({
  label, value, sub, alert,
}: { label: string; value: string | number; sub?: string; alert?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MX.goldSoft }}>
        {label}
      </div>
      <div className="mt-0.5 text-2xl font-bold tabular-nums" style={{ color: alert ? MX.gold : "#fff" }}>
        {value}
      </div>
      {sub && <div className="text-[11px]" style={{ color: "#9DB2D4" }}>{sub}</div>}
    </div>
  );
}

function EnvStat({
  label, value, unit, hint,
}: { label: string; value: string; unit: string; hint?: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums" style={{ color: MX.navy }}>
        {value} <span className="text-xs font-normal text-slate-400">{unit}</span>
      </div>
      {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}
