"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { complianceBand, fmtPct, type ControlCenterPayload } from "@/lib/ptw/ops";
import { CcPanel, sev } from "./panel";

const BAND = {
  ok: { bar: "bg-emerald-500", text: "text-emerald-700", label: "on target" },
  warn: { bar: "bg-amber-500", text: "text-amber-700", label: "watch" },
  crit: { bar: "bg-rose-500", text: "text-rose-700", label: "below target" },
  na: { bar: "bg-slate-300", text: "text-slate-500", label: "nothing to measure" },
};

type P = { data: ControlCenterPayload | null; loading?: boolean; error?: string | null };
const st = ({ data, loading, error }: P) => (!data && loading ? "loading" : !data && error ? "error" : "ready") as "loading" | "error" | "ready";

export function ComplianceHealth(p: P) {
  return (
    <CcPanel title="Compliance health" subtitle="Green ≥ 90 · amber 75–89 · red < 75" state={st(p)} error={p.error}>
      <ul className="space-y-3">
        {(p.data?.compliance ?? []).map((c) => {
          const band = BAND[complianceBand(c.pct)];
          return (
            <li key={c.key}>
              <div className="mb-1 flex justify-between gap-2 text-sm">
                <span className="text-slate-700">{c.label}</span>
                <span className={cn("font-semibold tabular-nums", band.text)}>
                  {fmtPct(c.pct)}
                  <span className="ml-1 text-[11px] font-normal text-slate-400">{c.den ? `${c.num}/${c.den}` : ""} · {band.label}</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className={cn("h-full rounded-full", band.bar)} style={{ width: `${c.pct ?? 0}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </CcPanel>
  );
}

export function ContractorsPeople(p: P) {
  const d = p.data;
  return (
    <CcPanel
      title="Contractors & people"
      right={d ? <Badge className="border-slate-200 bg-slate-50 tabular-nums text-slate-700">{d.muster.workers} under permit</Badge> : null}
      state={st(p)}
      error={p.error}
      empty={d && !d.contractors.length ? "No crews on running permits." : undefined}
    >
      <div className="overflow-x-auto">
        <Table className="min-w-[320px]">
          <TableHeader>
            <TableRow>
              <TableHead>Contractor</TableHead>
              <TableHead className="text-right">Permits</TableHead>
              <TableHead className="text-right">Workers</TableHead>
              <TableHead>Flag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(d?.contractors ?? []).map((c) => (
              <TableRow key={c.name}>
                <TableCell>{c.name}</TableCell>
                <TableCell className="text-right tabular-nums">{c.permits}</TableCell>
                <TableCell className="text-right tabular-nums">{c.workers}</TableCell>
                <TableCell className={cn("text-xs font-semibold", c.flagSeverity ? sev(c.flagSeverity).text : "text-slate-400")}>{c.flag ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {d && (
        <p className="mt-3 text-xs text-slate-500">
          Muster count ready · {d.muster.workers} on site
          {d.muster.cardsExpiring7d
            ? ` · ${d.muster.cardsExpiring7d} competency card${d.muster.cardsExpiring7d === 1 ? "" : "s"} expire within 7 days`
            : " · no competency cards expiring within 7 days"}
        </p>
      )}
    </CcPanel>
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
    <CcPanel
      title="Linked safety signals · 30 days"
      right={
        <Button asChild variant="link" size="sm" className="h-auto p-0">
          <Link href="/ptw?tab=signals">Open Signals →</Link>
        </Button>
      }
      state={st(p)}
      error={p.error}
    >
      <div className="grid grid-cols-2 gap-2">
        {stats.map((x) => (
          <div key={x.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{x.label}</div>
            <div className="text-xl font-bold tabular-nums text-slate-900">
              {x.value}
              {x.extra && <span className="ml-2 text-xs font-medium text-slate-500">{x.extra}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Permits per week · 12 wk</div>
          <svg viewBox={`0 0 ${Math.max(1, weekly.length) * 10} 40`} className="h-10 w-full" role="img"
               aria-label={`Permits per week, oldest to newest: ${weekly.join(", ")}`} preserveAspectRatio="none">
            {weekly.map((n, i) => (
              <rect key={i} x={i * 10 + 1} width={8} y={40 - (n / max) * 38} height={(n / max) * 38}
                    className={i === weekly.length - 1 ? "fill-primary-600" : "fill-slate-300"} rx={1} />
            ))}
          </svg>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Expiry rate</div>
          <div className={cn("text-xl font-bold tabular-nums", rate ? "text-rose-600" : "text-slate-900")}>{rate === null ? "n/a" : `${rate.toFixed(1)}%`}</div>
          {s && <div className="text-[11px] text-slate-500">{s.expiryRate.expired} / {s.expiryRate.total} · 12 wk</div>}
        </div>
      </div>
    </CcPanel>
  );
}
