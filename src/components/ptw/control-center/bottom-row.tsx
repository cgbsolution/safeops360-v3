"use client";

import Link from "next/link";
import { complianceBand, fmtPct, type ControlCenterPayload } from "@/lib/ptw/ops";
import { OpsPanel, SEV_TEXT } from "./panel";

const BAND = {
  ok: { color: "var(--ops-ok)", label: "on target" },
  warn: { color: "var(--ops-warn)", label: "watch" },
  crit: { color: "var(--ops-crit)", label: "below target" },
  na: { color: "var(--ops-muted)", label: "nothing to measure" },
};

type P = { data: ControlCenterPayload | null; loading?: boolean; error?: string | null };
const st = ({ data, loading, error }: P) => (!data && loading ? "loading" : !data && error ? "error" : "ready") as "loading" | "error" | "ready";

export function ComplianceHealth(p: P) {
  return (
    <OpsPanel title="Compliance health" subtitle="Green ≥ 90 · amber 75–89 · red < 75" state={st(p)} error={p.error}>
      <ul className="space-y-3">
        {(p.data?.compliance ?? []).map((c) => {
          const band = BAND[complianceBand(c.pct)];
          return (
            <li key={c.key}>
              <div className="mb-1 flex justify-between gap-2 text-[13px]">
                <span className="ops-text-2">{c.label}</span>
                <span className="ops-num font-semibold" style={{ color: band.color }}>
                  {fmtPct(c.pct)}
                  <span className="ml-1 text-[11px] font-normal ops-muted">{c.den ? `${c.num}/${c.den}` : ""} · {band.label}</span>
                </span>
              </div>
              <div className="h-2 rounded-full" style={{ background: "var(--ops-surface-3)" }}>
                <div className="h-full rounded-full" style={{ width: `${c.pct ?? 0}%`, background: band.color }} />
              </div>
            </li>
          );
        })}
      </ul>
    </OpsPanel>
  );
}

export function ContractorsPeople(p: P) {
  const d = p.data;
  return (
    <OpsPanel
      title="Contractors & people"
      right={d ? <span className="ops-chip ops-num">{d.muster.workers} under permit</span> : null}
      state={st(p)}
      error={p.error}
      empty={d && !d.contractors.length ? "No crews on running permits." : undefined}
    >
      <div className="ops-scroll overflow-x-auto">
        <table className="w-full min-w-[320px] text-left text-[13px]">
          <thead>
            <tr className="ops-label">
              <th scope="col" className="pb-2 font-semibold">Contractor</th>
              <th scope="col" className="pb-2 text-right font-semibold">Permits</th>
              <th scope="col" className="pb-2 text-right font-semibold">Workers</th>
              <th scope="col" className="pb-2 pl-3 font-semibold">Flag</th>
            </tr>
          </thead>
          <tbody>
            {(d?.contractors ?? []).map((c) => (
              <tr key={c.name} className="border-t" style={{ borderColor: "var(--ops-border)" }}>
                <td className="py-2 ops-text-2">{c.name}</td>
                <td className="ops-num py-2 text-right">{c.permits}</td>
                <td className="ops-num py-2 text-right">{c.workers}</td>
                <td className="py-2 pl-3 text-[12px] font-semibold" style={{ color: c.flagSeverity ? SEV_TEXT[c.flagSeverity] : "var(--ops-muted)" }}>
                  {c.flag ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d && (
        <p className="mt-3 text-[12px] ops-muted">
          Muster count ready · {d.muster.workers} on site
          {d.muster.cardsExpiring7d ? ` · ${d.muster.cardsExpiring7d} competency card${d.muster.cardsExpiring7d === 1 ? "" : "s"} expire within 7 days` : " · no competency cards expiring within 7 days"}
        </p>
      )}
    </OpsPanel>
  );
}

export function SafetySignals(p: P) {
  const s = p.data?.signals;
  const weekly = s?.weekly ?? [];
  const max = Math.max(1, ...weekly);
  const rate = s && s.expiryRate.total ? (100 * s.expiryRate.expired) / s.expiryRate.total : null;
  const stats = s
    ? [
        { label: "Near misses", value: s.nearMisses30d },
        { label: "Observations", value: s.observations30d },
        { label: "Incidents", value: s.incidents30d, extra: `${s.lti30d} LTI` },
        { label: "CAPA open", value: s.capaOpen },
      ]
    : [];
  return (
    <OpsPanel
      title="Linked safety signals · 30 days"
      right={<Link href="/ptw?tab=signals" className="text-[13px] font-semibold">Open Signals →</Link>}
      state={st(p)}
      error={p.error}
    >
      <div className="grid grid-cols-2 gap-2">
        {stats.map((x) => (
          <div key={x.label} className="ops-inset px-3 py-2">
            <div className="ops-label">{x.label}</div>
            <div className="ops-num text-[24px] font-bold">
              {x.value}
              {x.extra && <span className="ml-2 text-[12px] font-medium ops-muted">{x.extra}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="ops-label mb-1">Permits per week · 12 wk</div>
          <svg viewBox={`0 0 ${weekly.length * 10} 40`} className="h-10 w-full" role="img"
               aria-label={`Permits per week, oldest to newest: ${weekly.join(", ")}`} preserveAspectRatio="none">
            {weekly.map((n, i) => (
              <rect key={i} x={i * 10 + 1} width={8} y={40 - (n / max) * 38} height={(n / max) * 38}
                    fill={i === weekly.length - 1 ? "var(--ops-gold)" : "var(--ops-surface-3)"} rx={1} />
            ))}
          </svg>
        </div>
        <div className="text-right">
          <div className="ops-label">Expiry rate</div>
          <div className="ops-num text-[22px] font-bold" style={{ color: rate ? "var(--ops-crit)" : "var(--ops-text)" }}>
            {rate === null ? "n/a" : `${rate.toFixed(1)}%`}
          </div>
          {s && <div className="text-[11px] ops-muted">{s.expiryRate.expired} / {s.expiryRate.total} · 12 wk</div>}
        </div>
      </div>
    </OpsPanel>
  );
}
