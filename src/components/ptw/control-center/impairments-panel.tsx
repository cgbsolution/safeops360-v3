"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtClock, restoreLine, type ControlCenterPayload, type OpsImpairment } from "@/lib/ptw/ops";
import { RaiseImpairmentDialog } from "@/components/ptw/impairments/raise-impairment-dialog";
import { CcPanel, sev } from "./panel";

const STATUS_CLS: Record<OpsImpairment["status"], string> = {
  on_track: "text-emerald-700",
  due_soon: "text-amber-700",
  overdue: "text-rose-700",
  awaiting_approval: "text-slate-500",
};

export function ImpairmentsPanel({
  data,
  loading,
  error,
  readOnly,
  onChanged,
}: {
  data: ControlCenterPayload | null;
  loading?: boolean;
  error?: string | null;
  readOnly?: boolean;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const list = data?.impairments ?? [];
  const active = list.filter((i) => i.status !== "awaiting_approval");
  const overdue = active.filter((i) => i.status === "overdue").length;
  const canRaise = !readOnly && !!data?.permissions?.raiseImpairment && data.setup.tablesReady;

  return (
    <CcPanel
      title="Impairments — safety systems out of service"
      subtitle={data ? `${active.length} active${overdue ? ` · ${overdue} past restore time` : ""}` : undefined}
      right={
        <>
          {!readOnly && (
            <Button asChild variant="outline" size="sm">
              <Link href="/ptw?tab=impairments">Open register</Link>
            </Button>
          )}
          {canRaise && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus size={14} className="mr-1" /> Raise impairment
            </Button>
          )}
        </>
      }
      state={!data && loading ? "loading" : !data && error ? "error" : "ready"}
      error={error}
      empty={
        data && !list.length
          ? data.setup.tablesReady
            ? "Every fire and gas protection system is in service."
            : "Impairments are not installed on this instance yet (control-center DDL not applied)."
          : undefined
      }
    >
      <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              {["System", "Zone", "Reason", "Since", "Restore by", "Precautions in place", "Effect on permits", "Approved by"].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((i) => (
              <TableRow key={i.id} className="align-top">
                <TableCell>
                  <div className="flex items-center gap-1.5 font-medium text-slate-900">
                    <ShieldAlert size={14} aria-hidden className="text-rose-600" /> {i.systemName}
                  </div>
                  <div className="font-mono text-xs text-slate-500">{i.code}</div>
                </TableCell>
                <TableCell>{i.areaName}</TableCell>
                <TableCell className="text-slate-600">{i.reason}</TableCell>
                <TableCell className="tabular-nums">{fmtClock(i.startedAt)}</TableCell>
                <TableCell>
                  <span className="tabular-nums">{i.plannedRestoreAt ? fmtClock(i.plannedRestoreAt) : "—"}</span>
                  <span className={cn("block text-xs font-semibold", STATUS_CLS[i.status])}>{restoreLine(i)}</span>
                </TableCell>
                <TableCell className="text-slate-600">
                  {i.precautions.length ? i.precautions.join(" · ") : <span className="text-slate-400">none recorded</span>}
                </TableCell>
                <TableCell className={cn("font-medium", sev(i.effectSeverity).text)}>{i.effect}</TableCell>
                <TableCell>{i.approvedBy ?? <span className="text-slate-400">pending</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {data && data.impairmentRules.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Conflict rules checked on every permit request</div>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {data.impairmentRules.map((r) => (
              <div key={`${r.when}-${r.then}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <div className="text-slate-600">{r.when}</div>
                <div className={cn("mt-1 font-semibold", r.effect === "block_new" ? "text-rose-700" : "text-amber-700")}>→ {r.then}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {canRaise && data && (
        <RaiseImpairmentDialog open={open} onOpenChange={setOpen} plantId={data.plant.id} areas={data.areas} onCreated={onChanged} />
      )}
    </CcPanel>
  );
}
