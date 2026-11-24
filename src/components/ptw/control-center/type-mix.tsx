"use client";

import { typeInfo, type ControlCenterPayload } from "@/lib/ptw/ops";
import { OpsPanel } from "./panel";

/** On site now by type, sorted by risk-weighted load (count × type weight). */
export function TypeMix({ data, loading, error }: { data: ControlCenterPayload | null; loading?: boolean; error?: string | null }) {
  const mix = data?.typeMix ?? [];
  const max = Math.max(1, ...mix.map((m) => m.load));
  const total = mix.reduce((a, m) => a + m.count, 0);
  const overdue = data?.kpis.expiredOpen ?? 0;
  return (
    <OpsPanel
      title="On site now by type"
      subtitle={data ? `${total} permit${total === 1 ? "" : "s"}${overdue ? ` (${Math.max(0, total - overdue)} working + ${overdue} overdue)` : ""} · bar = risk-weighted load` : undefined}
      state={!data && loading ? "loading" : !data && error ? "error" : "ready"}
      error={error}
      empty={data && !mix.length ? "No permits on site right now." : undefined}
    >
      <ul className="space-y-3">
        {mix.map((m) => (
          <li key={m.type}>
            <div className="mb-1 flex justify-between gap-2 text-[13px]">
              <span className="ops-text-2">{typeInfo(m.type).label}</span>
              <span className="ops-num ops-muted">{m.count} · risk {m.load}</span>
            </div>
            <div className="h-2.5 rounded-full" style={{ background: "var(--ops-surface-3)" }}>
              <div className="h-full rounded-full" style={{ width: `${(m.load / max) * 100}%`, background: typeInfo(m.type).color }} />
            </div>
          </li>
        ))}
      </ul>
    </OpsPanel>
  );
}
