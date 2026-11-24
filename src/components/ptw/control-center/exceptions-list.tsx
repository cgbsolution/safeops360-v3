"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SEVERITY_LABEL, fmtAgo, sortExceptions, type ControlCenterPayload, type OpsException } from "@/lib/ptw/ops";
import { CcPanel, sev } from "./panel";

/** Exceptions — needs action now. Critical → low, then oldest first. Cards that
 *  appear on a refresh (not on first load) slide in with a short highlight. */
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
  const anyCritical = list.some((e) => e.severity === "critical");

  useEffect(() => {
    if (!data) return;
    seen.current = new Set(data.exceptions.map((e) => e.id));
  }, [data]);

  return (
    <CcPanel
      id={id}
      title="Exceptions — needs action now"
      right={data ? <Badge className={anyCritical ? sev("critical").chip : "border-slate-200 bg-slate-50 text-slate-700"}>{list.length} open</Badge> : null}
      state={!data && loading ? "loading" : !data && error ? "error" : "ready"}
      error={error}
      empty={data && !list.length ? "Nothing needs action right now." : undefined}
      className="flex h-full flex-col"
      bodyClassName="-mr-2 max-h-[560px] min-h-0 flex-1 overflow-y-auto pr-2"
    >
      <ul className="space-y-2">
        {shown.map((e) => {
          const s = sev(e.severity);
          return (
            <li key={e.id}>
              <Button
                type="button"
                variant="bare"
                size="bare"
                onClick={() => onOpen(e)}
                className={cn(
                  "flex h-auto min-h-[44px] w-full items-stretch overflow-hidden whitespace-normal rounded-lg border border-slate-200 bg-white text-left hover:border-primary-300 hover:bg-slate-50",
                  isNew(e.id) && "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 ring-2 ring-amber-300"
                )}
              >
                <span className={cn("w-1 shrink-0", s.bar)} aria-hidden />
                <span className="min-w-0 flex-1 px-3 py-2.5">
                  <span className="flex items-center justify-between gap-2 text-[11px]">
                    <span className={cn("font-bold tracking-wider", s.text)}>
                      {SEVERITY_LABEL[e.severity]}
                      {e.acknowledged && <span className="ml-2 font-medium text-slate-400">· acknowledged</span>}
                    </span>
                    <span className="text-slate-400">{e.since ? `since ${fmtAgo(e.since).replace(" ago", "")}` : ""}</span>
                  </span>
                  <span className="mt-1 block text-sm font-semibold leading-snug text-slate-900">{e.title}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">
                    {e.ref && <span className="font-mono text-slate-700">{e.ref}</span>}
                    {e.ref && " · "}
                    {e.areaName}
                    {e.owner ? ` · ${e.owner}` : ""}
                  </span>
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
      {limit && list.length > limit && <p className="mt-2 text-xs text-slate-500">+ {list.length - limit} more on the Control Center</p>}
    </CcPanel>
  );
}
