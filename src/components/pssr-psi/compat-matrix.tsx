"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { label, type CompatMatrix } from "@/lib/pssr-psi/api";
import { Tag } from "./shared";

const CELL: Record<string, string> = {
  COMPATIBLE: "bg-emerald-50 text-emerald-800",
  CAUTION: "bg-amber-100 text-amber-900",
  INCOMPATIBLE: "bg-rose-100 text-rose-900 font-semibold",
};

/** Pairwise compatibility matrix + the reasons behind every non-compatible pair. */
export function CompatMatrixView({ m, compact = false }: { m: CompatMatrix; compact?: boolean }) {
  const flagged = m.pairs.filter((p) => p.verdict !== "COMPATIBLE");
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-full text-xs">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead />
              {m.chemicals.map((c) => (
                <TableHead key={c.id} className="max-w-[140px] border-l border-slate-200 text-slate-700">{c.name}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {m.chemicals.map((row, i) => (
              <TableRow key={row.id}>
                <TableCell className="bg-slate-50 font-medium text-slate-700">
                  {row.name}
                  {!compact && <div className="text-[10px] font-normal text-slate-500">{row.hazardGroupLabels.join(", ") || "No GHS class recorded"}</div>}
                </TableCell>
                {m.chemicals.map((col, j) => {
                  const v = m.cells[i][j];
                  return (
                    <TableCell key={col.id} className={cn("border-l border-slate-200 text-center", v ? CELL[v] : "bg-slate-100 text-slate-400")}>
                      {v ? label(v) : "—"}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {flagged.length > 0 && (
        <ul className="space-y-2">
          {flagged.map((p) => (
            <li key={`${p.a}-${p.b}`} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.aName} + {p.bName}</span>
                <Tag code={p.verdict} />
              </div>
              <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">
                {p.reasons.filter((r) => r.verdict !== "COMPATIBLE").map((r, k) => (
                  <li key={k}>{r.reason} <span className="text-slate-500">{r.advice}</span></li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-slate-500">{m.disclaimer}</p>
    </div>
  );
}
