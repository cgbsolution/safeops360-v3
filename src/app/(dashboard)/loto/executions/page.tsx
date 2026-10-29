// Lockout records — the register of actual lockout events.

import Link from "next/link";
import { backendFetch } from "@/lib/backend/fetch";
import { PageHeader } from "@/components/page-header";
import { WorkspaceTabs } from "@/components/analytics/workspace-tabs";
import { REGISTERS } from "@/lib/registers";
import { Button } from "@/components/ui/button";
import { FilterTab, FilterTabsList } from "@/components/ui/filter-tabs";
import { cn } from "@/lib/utils";
import { BookLock, Lock, Users } from "lucide-react";
import {
  EXECUTION_STATUS_CHIP,
  EXECUTION_STATUS_LABEL,
  type ExecutionListItem
} from "../_meta";

export const dynamic = "force-dynamic";

type ListResponse = { items: ExecutionListItem[]; total: number };

export default async function LotoExecutionsPage(props: {
  searchParams: Promise<{
    procedureId?: string;
    status?: string;
    open?: string;
    mine?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const openOnly = searchParams.open === "1";
  const mine = searchParams.mine === "1";

  let data: ListResponse = { items: [], total: 0 };
  let loadError: string | null = null;
  try {
    data =
      (await backendFetch<ListResponse>("/api/loto/executions", {
        query: {
          procedureId: searchParams.procedureId || undefined,
          status: searchParams.status || undefined,
          openOnly: openOnly ? true : undefined,
          mine: mine ? true : undefined,
          limit: 200
        }
      })) ?? { items: [], total: 0 };
  } catch (e: any) {
    loadError = e?.message ?? "Could not load lockout records.";
  }

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { ...searchParams, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `/loto/executions${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Lockout Records"
        description="Every lockout event, and who has locks on what right now."
        breadcrumbs={[{ label: "LOTO", href: "/loto" }, { label: "Lockout records" }]}
      />
      <WorkspaceTabs tabs={REGISTERS.loto.tabs} active="executions" />

      {loadError && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {loadError}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <FilterTabsList label="Scope">
          <FilterTab href={qs({ open: undefined, mine: undefined })} active={!openOnly && !mine} label="All" />
          <FilterTab href={qs({ open: "1", mine: undefined })} active={openOnly && !mine} label="Locks on" tone="rose" />
          <FilterTab href={qs({ mine: "1", open: undefined })} active={mine} label="Mine" />
        </FilterTabsList>
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <Lock size={28} className="mx-auto text-slate-400" />
          <div className="mt-3 font-semibold text-slate-700">No lockout records here.</div>
          <p className="mt-1 text-sm text-slate-500">
            A lockout is started from an active procedure in the library.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.items.map((ex) => (
            <Link
              key={ex.id}
              href={`/loto/executions/${ex.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-slate-900">
                      {ex.number}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs font-medium",
                        EXECUTION_STATUS_CHIP[ex.status]
                      )}
                    >
                      {EXECUTION_STATUS_LABEL[ex.status] ?? ex.status}
                    </span>
                    {ex.isGroupLockout && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                        <Users size={11} /> Group
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    {ex.equipmentName ?? ex.procedureTitle ?? "—"}
                    {ex.equipmentTag && (
                      <span className="ml-2 font-mono text-xs text-slate-400">
                        {ex.equipmentTag}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    <span>
                      {ex.procedureCode} · v{ex.snapshotVersion}
                    </span>
                    <span>{ex.siteName ?? "—"}</span>
                    <span>Started by {ex.initiatedByName ?? "—"}</span>
                    {ex.ptwNumber && (
                      <span className="font-medium text-primary-700">
                        Permit {ex.ptwNumber}
                      </span>
                    )}
                  </div>
                </div>

                {/* The one number that matters at a glance: how many locks are
                    accounted for. An incomplete count is the whole risk. */}
                <div className="text-right text-xs">
                  <div className="font-medium text-slate-700">
                    {ex.locksConfirmedCount}/{ex.lockHolderCount} locked
                  </div>
                  {ex.locksRemovedCount > 0 && (
                    <div className="text-slate-500">
                      {ex.locksRemovedCount}/{ex.lockHolderCount} removed
                    </div>
                  )}
                  <div className="mt-1 text-slate-400">
                    {new Date(ex.initiatedAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short"
                    })}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
