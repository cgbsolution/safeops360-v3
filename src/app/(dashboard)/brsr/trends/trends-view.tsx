"use client";

import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { MX, fmtInr, fmtNum, type TrendPoint } from "../lib-brsr";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function TrendsView({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) {
    return (
      <div
        className="rounded-xl border p-10 text-center"
        style={{ borderColor: MX.iceDeep, background: MX.ice, fontFamily: MX.body }}
      >
        <TrendingUp size={28} className="mx-auto mb-3" style={{ color: MX.navy }} />
        <h3 className="text-lg font-semibold" style={{ fontFamily: MX.display, color: MX.navy }}>
          {points.length === 0 ? "No reporting cycles yet" : "One cycle so far"}
        </h3>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
          A year-over-year view needs at least two cycles. This page fills in once{" "}
          {points.length === 0 ? "cycles exist" : `a cycle after ${points[0].financialYear} is opened`}.
        </p>
      </div>
    );
  }

  const chartData = points.map((p) => ({
    fy: p.financialYear,
    scope1: p.scope1TCo2e ?? 0,
    scope2: p.scope2TCo2e ?? 0,
    energy: p.energyTotalGj ?? 0,
    water: p.waterConsumedKl ?? 0,
  }));

  return (
    <div className="space-y-4" style={{ fontFamily: MX.body }}>
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-sm font-semibold" style={{ fontFamily: MX.display, color: MX.navy }}>
            Greenhouse gas emissions by year
          </h3>
          <p className="text-[11px] text-slate-400">
            Scope 1 and Scope 2, tCO₂e. Scope 3 is excluded — it is manually entered and not
            comparably scoped across years.
          </p>
        </div>
        <div className="p-4" style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="fy" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip
                formatter={(v: number) => `${fmtNum(v)} tCO₂e`}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="scope1" name="Scope 1" fill={MX.navy} radius={[3, 3, 0, 0]} />
              <Bar dataKey="scope2" name="Scope 2" fill={MX.gold} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-sm font-semibold" style={{ fontFamily: MX.display, color: MX.navy }}>
            Intensity ratios
          </h3>
          <p className="text-[11px] text-slate-400">
            Per rupee of turnover. A dash means no turnover was reported for that year — the ratio is
            omitted rather than computed against a guess.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table className="w-full text-sm">
            <TableHeader className="bg-transparent">
              <TableRow className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <TableHead className="h-auto text-[11px] text-slate-400 px-4 py-2.5 font-semibold">Financial year</TableHead>
                <TableHead className="h-auto text-[11px] text-slate-400 px-4 py-2.5 font-semibold">Status</TableHead>
                <TableHead className="h-auto text-[11px] text-slate-400 px-4 py-2.5 font-semibold">Turnover</TableHead>
                <TableHead className="h-auto text-[11px] text-slate-400 px-4 py-2.5 font-semibold">Scope 1+2</TableHead>
                <TableHead className="h-auto text-[11px] text-slate-400 px-4 py-2.5 font-semibold">Emissions intensity</TableHead>
                <TableHead className="h-auto text-[11px] text-slate-400 px-4 py-2.5 font-semibold">Energy intensity</TableHead>
                <TableHead className="h-auto text-[11px] text-slate-400 px-4 py-2.5 font-semibold">Water intensity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {points.map((p) => {
                const total = (p.scope1TCo2e ?? 0) + (p.scope2TCo2e ?? 0);
                return (
                  <TableRow key={p.financialYear} className="border-b border-slate-50 last:border-0">
                    <TableCell className="px-4 py-3 font-semibold" style={{ color: MX.navy }}>
                      {p.financialYear}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-500">{p.status}</TableCell>
                    <TableCell className="px-4 py-3 tabular-nums text-slate-700">{fmtInr(p.turnoverInr)}</TableCell>
                    <TableCell className="px-4 py-3 tabular-nums text-slate-700">
                      {total ? `${fmtNum(total)} tCO₂e` : "—"}
                    </TableCell>
                    <Cell v={p.emissionsIntensity} suffix="tCO₂e/₹" />
                    <Cell v={p.energyIntensity} suffix="GJ/₹" />
                    <Cell v={p.waterIntensity} suffix="kL/₹" />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function Cell({ v, suffix }: { v: number | null | undefined; suffix: string }) {
  return (
    <TableCell className="px-4 py-3 tabular-nums text-slate-700">
      {v === null || v === undefined ? (
        <span className="text-slate-300">—</span>
      ) : (
        <>
          {v.toExponential(2)} <span className="text-[10px] text-slate-400">{suffix}</span>
        </>
      )}
    </TableCell>
  );
}
