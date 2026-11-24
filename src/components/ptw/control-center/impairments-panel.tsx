"use client";

import { useState } from "react";
import { Plus, ShieldAlert } from "lucide-react";
import { fmtClock, restoreLine, type ControlCenterPayload, type OpsImpairment } from "@/lib/ptw/ops";
import { RaiseImpairmentDialog } from "@/components/ptw/impairments/raise-impairment-dialog";
import { OpsPanel, SEV_COLOR, SEV_TEXT } from "./panel";

const STATUS_COLOR: Record<OpsImpairment["status"], string> = {
  on_track: "var(--ops-ok)",
  due_soon: "var(--ops-warn)",
  overdue: "var(--ops-crit)",
  awaiting_approval: "var(--ops-muted)",
};

export function ImpairmentsPanel({
  data,
  loading,
  error,
  readOnly,
  onChanged,
  onOpen,
}: {
  data: ControlCenterPayload | null;
  loading?: boolean;
  error?: string | null;
  readOnly?: boolean;
  onChanged?: () => void;
  onOpen?: (i: OpsImpairment) => void;
}) {
  const [open, setOpen] = useState(false);
  const list = data?.impairments ?? [];
  const active = list.filter((i) => i.status !== "awaiting_approval");
  const overdue = active.filter((i) => i.status === "overdue").length;
  const canRaise = !readOnly && !!data?.permissions?.raiseImpairment && data.setup.tablesReady;

  return (
    <OpsPanel
      title="Impairments — safety systems out of service"
      subtitle={data ? `${active.length} active${overdue ? ` · ${overdue} past restore time` : ""}` : undefined}
      right={
        canRaise ? (
          <button type="button" className="ops-btn" onClick={() => setOpen(true)}>
            <Plus size={16} aria-hidden /> Raise impairment
          </button>
        ) : null
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
      <div className="ops-scroll overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="ops-label">
              {["System", "Zone", "Reason", "Since", "Restore by", "Precautions in place", "Effect on permits", "Approved by"].map((h) => (
                <th key={h} scope="col" className="border-b px-2 pb-2 font-semibold" style={{ borderColor: "var(--ops-border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id} className="align-top">
                <td className="border-b px-2 py-2.5" style={{ borderColor: "var(--ops-border)" }}>
                  <button type="button" onClick={() => onOpen?.(i)} className="text-left">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <ShieldAlert size={14} aria-hidden style={{ color: "var(--ops-crit)" }} /> {i.systemName}
                    </span>
                    <span className="ops-mono text-[12px] ops-muted">{i.code}</span>
                  </button>
                </td>
                <td className="border-b px-2 py-2.5 ops-text-2" style={{ borderColor: "var(--ops-border)" }}>{i.areaName}</td>
                <td className="border-b px-2 py-2.5 ops-text-2" style={{ borderColor: "var(--ops-border)" }}>{i.reason}</td>
                <td className="ops-num border-b px-2 py-2.5" style={{ borderColor: "var(--ops-border)" }}>{fmtClock(i.startedAt)}</td>
                <td className="border-b px-2 py-2.5" style={{ borderColor: "var(--ops-border)" }}>
                  <span className="ops-num">{i.plannedRestoreAt ? fmtClock(i.plannedRestoreAt) : "—"}</span>
                  <span className="block text-[12px] font-semibold" style={{ color: STATUS_COLOR[i.status] }}>{restoreLine(i)}</span>
                </td>
                <td className="border-b px-2 py-2.5 ops-text-2" style={{ borderColor: "var(--ops-border)" }}>
                  {i.precautions.length ? i.precautions.join(" · ") : <span className="ops-muted">none recorded</span>}
                </td>
                <td className="border-b px-2 py-2.5 font-semibold" style={{ borderColor: "var(--ops-border)", color: SEV_TEXT[i.effectSeverity] }}>
                  {i.effect}
                </td>
                <td className="border-b px-2 py-2.5 ops-text-2" style={{ borderColor: "var(--ops-border)" }}>{i.approvedBy ?? <span className="ops-muted">pending</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.impairmentRules.length > 0 && (
        <div className="mt-4">
          <div className="ops-label mb-2">Conflict rules checked on every permit request</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {data.impairmentRules.map((r) => (
              <div key={`${r.when}-${r.then}`} className="ops-inset px-3 py-2 text-[13px]">
                <div className="ops-text-2">{r.when}</div>
                <div className="mt-1 font-semibold" style={{ color: r.effect === "block_new" ? SEV_COLOR.critical : SEV_COLOR.warning }}>
                  → {r.then}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {canRaise && data && (
        <RaiseImpairmentDialog open={open} onOpenChange={setOpen} plantId={data.plant.id} areas={data.areas} onCreated={onChanged} />
      )}
    </OpsPanel>
  );
}
