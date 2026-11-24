"use client";

import { useEffect, useRef } from "react";
import { SEVERITY_LABEL, fmtAgo, sortExceptions, type ControlCenterPayload, type OpsException } from "@/lib/ptw/ops";
import { OpsPanel, SEV_COLOR, SEV_TEXT } from "./panel";

/** Exceptions — needs action now. Critical → low, then oldest first. Cards that
 *  appear on a refresh (not on first load) slide in with a short gold highlight. */
export function ExceptionsList({
  data,
  loading,
  error,
  limit,
  onOpen,
  id = "ptw-exceptions",
}: {
  data: ControlCenterPayload | null;
  loading?: boolean;
  error?: string | null;
  limit?: number;
  onOpen: (e: OpsException) => void;
  id?: string;
}) {
  const seen = useRef<Set<string> | null>(null);
  const list = data ? sortExceptions(data.exceptions) : [];
  const shown = limit ? list.slice(0, limit) : list;
  const isNew = (eid: string) => seen.current !== null && !seen.current.has(eid);

  useEffect(() => {
    if (!data) return;
    seen.current = new Set(data.exceptions.map((e) => e.id));
  }, [data]);

  return (
    <OpsPanel
      id={id}
      title="Exceptions — needs action now"
      right={
        data ? (
          <span
            className="ops-chip ops-num font-semibold"
            style={list.some((e) => e.severity === "critical") ? { background: "var(--ops-crit-bg)", borderColor: "var(--ops-crit-border)", color: "var(--ops-crit-text)" } : undefined}
          >
            {list.length} open
          </span>
        ) : null
      }
      state={!data && loading ? "loading" : !data && error ? "error" : "ready"}
      error={error}
      empty={data && !list.length ? "Nothing needs action right now." : undefined}
      className="flex h-full flex-col"
      bodyClassName="ops-scroll -mr-2 max-h-[560px] min-h-0 flex-1 overflow-y-auto pr-2"
    >
      <ul className="space-y-2">
        {shown.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onOpen(e)}
              className={`ops-inset flex w-full min-h-[44px] overflow-hidden text-left hover:border-[color:var(--ops-zone-border)] ${isNew(e.id) ? "ops-arrive" : ""}`}
            >
              <span className="w-1 shrink-0" style={{ background: SEV_COLOR[e.severity] }} aria-hidden />
              <span className="min-w-0 flex-1 px-3 py-2.5">
                <span className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold tracking-[1.2px]" style={{ color: SEV_TEXT[e.severity] === "var(--ops-muted)" ? "var(--ops-text-2)" : SEV_COLOR[e.severity] }}>
                    {SEVERITY_LABEL[e.severity]}
                    {e.acknowledged && <span className="ml-2 font-medium ops-muted">· acknowledged</span>}
                  </span>
                  <span className="ops-muted">{e.since ? `since ${fmtAgo(e.since).replace(" ago", "")}` : ""}</span>
                </span>
                <span className="mt-1 block text-[14px] font-semibold leading-snug">{e.title}</span>
                <span className="mt-1 block truncate text-[12px] ops-muted">
                  {e.ref && <span className="ops-mono ops-text-2">{e.ref}</span>}
                  {e.ref && " · "}
                  {e.areaName}
                  {e.owner ? ` · ${e.owner}` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {limit && list.length > limit && (
        <p className="mt-2 text-[12px] ops-muted">+ {list.length - limit} more on the Control Center</p>
      )}
    </OpsPanel>
  );
}
