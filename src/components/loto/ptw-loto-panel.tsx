"use client";

// The LOTO cross-reference panel on the PTW detail screen (spec §6).
//
// A REFERENCE, not a merge. It writes one nullable column on the permit and
// reads the LOTO module's own verdict on whether that lockout still blocks
// closure. It does not duplicate any lockout state locally, and it does not
// touch PTW's workflow.
//
// The blocking verdict shown here comes from the same service function the
// workflow engine calls at the CLOSURE step, so this panel can never say
// "clear" about a permit the engine is going to refuse to close.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Link2Off,
  Loader2,
  Lock,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/client-errors";
import { cn } from "@/lib/utils";
import {
  EXECUTION_STATUS_CHIP,
  EXECUTION_STATUS_LABEL,
  type ExecutionListItem,
  type PermitLotoStatus,
  type ProcedureListItem
} from "@/app/(dashboard)/loto/_meta";

export function PtwLotoPanel({
  permitId,
  plantId,
  /** Hide the link/start controls once the permit is finished. */
  readOnly = false
}: {
  permitId: string;
  plantId: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<PermitLotoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picker, setPicker] = useState<"none" | "existing" | "new">("none");
  const [candidates, setCandidates] = useState<ExecutionListItem[]>([]);
  const [procedures, setProcedures] = useState<ProcedureListItem[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/loto/permits/${permitId}/status`);
      if (!res.ok) throw new Error(await readApiError(res, "Could not load LOTO status"));
      setStatus(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load LOTO status.");
    } finally {
      setLoading(false);
    }
  }, [permitId]);

  useEffect(() => {
    load();
  }, [load]);

  async function openExistingPicker() {
    setPicker("existing");
    setError(null);
    try {
      // Unlinked, still-open lockouts at this site — linking a closed one, or
      // one already claimed by another permit, is not a useful offer.
      const res = await fetch(
        `/api/loto/executions?siteId=${encodeURIComponent(plantId)}&openOnly=true&limit=50`
      );
      if (!res.ok) throw new Error(await readApiError(res, "Could not load lockouts"));
      const data = await res.json();
      setCandidates((data.items ?? []).filter((e: ExecutionListItem) => !e.ptwId));
    } catch (e: any) {
      setError(e?.message ?? "Could not load lockouts.");
    }
  }

  async function openNewPicker() {
    setPicker("new");
    setError(null);
    try {
      const res = await fetch(
        `/api/loto/procedures?siteId=${encodeURIComponent(plantId)}&status=active&limit=100`
      );
      if (!res.ok) throw new Error(await readApiError(res, "Could not load procedures"));
      const data = await res.json();
      setProcedures(data.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Could not load procedures.");
    }
  }

  async function link(executionId: string | null) {
    setBusy(executionId ?? "unlink");
    setError(null);
    try {
      const res = await fetch(`/api/loto/permits/${permitId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotoExecutionId: executionId })
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not update the link"));
      setPicker("none");
      await load();
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Could not update the link.");
    } finally {
      setBusy(null);
    }
  }

  async function startNew(procedureId: string) {
    setBusy(procedureId);
    setError(null);
    try {
      // Starting with ptwId set links both sides in one step, so there is no
      // window where a lockout exists but the permit does not know about it.
      const res = await fetch("/api/loto/executions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ procedureId, ptwId: permitId, isGroupLockout: false })
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not start the lockout"));
      const ex = await res.json();
      router.push(`/loto/executions/${ex.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Could not start the lockout.");
      setBusy(null);
    }
  }

  const ex = status?.execution ?? null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Lock size={16} /> Energy isolation (LOTO)
          </h2>
          <p className="text-xs text-slate-500">
            Links this permit to the lockout that de-energised the equipment.
          </p>
        </div>
      </header>

      <div className="space-y-3 p-4">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : ex ? (
          <>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/loto/executions/${ex.id}`}
                  className="font-mono font-semibold text-primary-700 hover:underline"
                >
                  {ex.number}
                </Link>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-medium",
                    EXECUTION_STATUS_CHIP[ex.status]
                  )}
                >
                  {EXECUTION_STATUS_LABEL[ex.status] ?? ex.status}
                </span>
              </div>
              <div className="mt-1 text-sm text-slate-700">
                {ex.equipmentName ?? ex.procedureTitle ?? "—"}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                <span>
                  {ex.procedureCode} · v{ex.snapshotVersion}
                </span>
                <span>
                  {ex.locksConfirmedCount}/{ex.lockHolderCount} locks confirmed
                </span>
                {ex.locksRemovedCount > 0 && (
                  <span>
                    {ex.locksRemovedCount}/{ex.lockHolderCount} removed
                  </span>
                )}
              </div>
            </div>

            {status?.blocksPermitClosure ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">
                    This permit cannot be closed yet.
                  </div>
                  <div className="mt-0.5">{status.blockReason}</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <CheckCircle2 size={16} className="shrink-0" />
                The linked lockout is finished — it does not block closing this permit.
              </div>
            )}

            {!readOnly && !status?.blocksPermitClosure && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => link(null)}
                disabled={busy !== null}
              >
                {busy === "unlink" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Link2Off size={14} />
                )}
                Unlink
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              No lockout is linked to this permit. If the work needs the equipment
              de-energised, link an existing lockout or start one from a published
              procedure.
            </p>

            {!readOnly && picker === "none" && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={openExistingPicker}>
                  <Link2 size={14} /> Link existing lockout
                </Button>
                <Button variant="outline" size="sm" onClick={openNewPicker}>
                  <Plus size={14} /> Start a new lockout
                </Button>
              </div>
            )}

            {picker === "existing" && (
              <Picker
                title="Open lockouts at this site"
                emptyText="No unlinked, open lockouts at this site."
                onCancel={() => setPicker("none")}
              >
                {candidates.map((c) => (
                  <PickerRow
                    key={c.id}
                    primary={c.number}
                    secondary={`${c.equipmentName ?? c.procedureTitle ?? "—"} · ${
                      EXECUTION_STATUS_LABEL[c.status] ?? c.status
                    }`}
                    busy={busy === c.id}
                    onClick={() => link(c.id)}
                  />
                ))}
              </Picker>
            )}

            {picker === "new" && (
              <Picker
                title="Active procedures at this site"
                emptyText="No published procedures at this site yet — one has to be authored and published first."
                onCancel={() => setPicker("none")}
              >
                {procedures.map((p) => (
                  <PickerRow
                    key={p.id}
                    primary={p.procedureCode}
                    secondary={`${p.equipmentName ?? p.title}${
                      p.equipmentTag ? ` · ${p.equipmentTag}` : ""
                    }`}
                    busy={busy === p.id}
                    onClick={() => startNew(p.id)}
                  />
                ))}
              </Picker>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Picker({
  title,
  emptyText,
  onCancel,
  children
}: {
  title: string;
  emptyText: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </span>
        <Button variant="bare"
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          Cancel
        </Button>
      </div>
      {isEmpty ? (
        <p className="py-2 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">{children}</ul>
      )}
    </div>
  );
}

function PickerRow({
  primary,
  secondary,
  busy,
  onClick
}: {
  primary: string;
  secondary: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <Button variant="bare"
        type="button"
        onClick={onClick}
        disabled={busy}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className="block font-mono text-sm font-medium text-slate-900">
            {primary}
          </span>
          <span className="block truncate text-xs text-slate-500">{secondary}</span>
        </span>
        {busy && <Loader2 size={14} className="shrink-0 animate-spin text-slate-400" />}
      </Button>
    </li>
  );
}
