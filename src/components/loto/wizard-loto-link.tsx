"use client";

// LOTO linkage section for the PTW creation wizard's Isolations step (step 4).
//
// This is a SECTION INSIDE an existing step, not a ninth step — the wizard's
// flow, order and validation are untouched, and linking is optional at every
// permit type in Part A.
//
// ─── Why "Start new" does not navigate away ──────────────────────────────────
//
// The spec describes deep-linking into LOTO's start-execution flow and
// pre-filling the new executionId back on return. Implemented literally, that
// destroys the wizard: the permit does not exist yet, so all seven other steps
// of unsaved state live only in this component, and a route change loses them.
// The user would come back to an empty form holding a valid execution id.
//
// So the same outcome is reached without leaving the page: pick an active
// procedure, POST /api/loto/executions inline, and hold the returned id in
// wizard state. It reaches the permit through the create payload exactly as a
// round-trip would have, and the lockout is immediately openable from the
// permit afterwards. The execution is created WITHOUT a ptwId — the backend
// binds the two when the permit row is created, so an abandoned wizard leaves a
// standalone lockout rather than a dangling reference.

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Link2Off,
  Loader2,
  Lock,
  Plus,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/client-errors";
import { cn } from "@/lib/utils";
import {
  EXECUTION_STATUS_CHIP,
  EXECUTION_STATUS_LABEL,
  type ExecutionListItem,
  type ProcedureListItem
} from "@/app/(dashboard)/loto/_meta";

export type WizardLotoLinkValue = {
  executionId: string;
  number: string;
  status: string;
  procedureTitle: string | null;
  equipmentName: string | null;
  equipmentTag: string | null;
};

export function WizardLotoLink({
  plantId,
  /** Equipment ids picked on step 5 — used to surface matching procedures first. */
  subjectEquipmentIds = [],
  value,
  onChange
}: {
  plantId: string;
  subjectEquipmentIds?: string[];
  value: WizardLotoLinkValue | null;
  onChange: (v: WizardLotoLinkValue | null) => void;
}) {
  const [mode, setMode] = useState<"none" | "existing" | "new">("none");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [executions, setExecutions] = useState<ExecutionListItem[]>([]);
  const [procedures, setProcedures] = useState<ProcedureListItem[]>([]);

  const loadExisting = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Only lockouts still holding locks are linkable — a closed one protects
      // nothing, and offering it would produce a close-out gate that is already
      // satisfied and therefore meaningless.
      const res = await fetch(
        `/api/loto/executions?siteId=${encodeURIComponent(plantId)}&openOnly=true&limit=100`
      );
      if (!res.ok) throw new Error(await readApiError(res, "Could not load lockouts"));
      const data = await res.json();
      // Drop any already claimed by another permit — the API would 409 anyway.
      setExecutions((data.items ?? []).filter((e: ExecutionListItem) => !e.ptwId));
    } catch (e: any) {
      setError(e?.message ?? "Could not load lockouts.");
    } finally {
      setLoading(false);
    }
  }, [plantId]);

  const loadProcedures = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/loto/procedures?siteId=${encodeURIComponent(plantId)}&status=active&limit=200`
      );
      if (!res.ok) throw new Error(await readApiError(res, "Could not load procedures"));
      const data = await res.json();
      setProcedures(data.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Could not load procedures.");
    } finally {
      setLoading(false);
    }
  }, [plantId]);

  useEffect(() => {
    if (mode === "existing") loadExisting();
    if (mode === "new") loadProcedures();
  }, [mode, loadExisting, loadProcedures]);

  // Procedures for equipment this permit is actually working on float to the
  // top; everything else stays reachable, because the equipment field is
  // optional and a hard filter would hide the procedure a user needs.
  const rankedProcedures = (() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? procedures.filter((p) =>
          [p.procedureCode, p.title, p.equipmentName, p.equipmentTag]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(q))
        )
      : procedures;
    if (!subjectEquipmentIds.length) return filtered;
    const match = (p: ProcedureListItem) =>
      p.equipmentId && subjectEquipmentIds.includes(p.equipmentId) ? 0 : 1;
    return [...filtered].sort((a, b) => match(a) - match(b));
  })();

  const filteredExecutions = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return executions;
    return executions.filter((e) =>
      [e.number, e.procedureCode, e.procedureTitle, e.equipmentName, e.equipmentTag]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    );
  })();

  async function linkExisting(e: ExecutionListItem) {
    onChange({
      executionId: e.id,
      number: e.number,
      status: e.status,
      procedureTitle: e.procedureTitle,
      equipmentName: e.equipmentName,
      equipmentTag: e.equipmentTag
    });
    setMode("none");
    setQuery("");
  }

  async function startNew(p: ProcedureListItem) {
    setBusy(p.id);
    setError(null);
    try {
      // No ptwId — the permit does not exist yet. The create endpoint binds
      // them, so an abandoned wizard leaves a standalone lockout, never a
      // permit pointing at nothing.
      const res = await fetch("/api/loto/executions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ procedureId: p.id, isGroupLockout: false })
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not start the lockout"));
      const ex = await res.json();
      onChange({
        executionId: ex.id,
        number: ex.number,
        status: ex.status,
        procedureTitle: ex.procedureTitle ?? p.title,
        equipmentName: ex.equipmentName ?? p.equipmentName,
        equipmentTag: ex.equipmentTag ?? p.equipmentTag
      });
      setMode("none");
      setQuery("");
    } catch (e: any) {
      setError(e?.message ?? "Could not start the lockout.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <Lock size={14} /> Energy isolation (LOTO)
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Optional. Link the lockout that de-energises this equipment, or start one
            from a published procedure. The permit cannot be closed while a linked
            lockout is still open.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* ── Linked state ── */}
      {value ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span className="font-mono text-sm font-semibold text-slate-900">
                {value.number}
              </span>
              <span
                className={cn(
                  "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  EXECUTION_STATUS_CHIP[value.status] ?? ""
                )}
              >
                {EXECUTION_STATUS_LABEL[value.status] ?? value.status}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <a
                href={`/loto/executions/${value.executionId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline"
              >
                Open <ExternalLink size={11} />
              </a>
              <Button variant="bare"
                type="button"
                onClick={() => onChange(null)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rose-700"
              >
                <Link2Off size={12} /> Unlink
              </Button>
            </div>
          </div>
          <div className="mt-1 text-xs text-slate-600">
            {value.equipmentName ?? value.procedureTitle ?? "—"}
            {value.equipmentTag && (
              <span className="ml-2 font-mono text-slate-400">{value.equipmentTag}</span>
            )}
          </div>
        </div>
      ) : mode === "none" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setMode("existing")}>
            <Link2 size={13} /> Link existing lockout
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setMode("new")}>
            <Plus size={13} /> Start new lockout
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-white p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {mode === "existing" ? "Open lockouts at this site" : "Active procedures"}
            </span>
            <Button variant="bare"
              type="button"
              onClick={() => { setMode("none"); setQuery(""); }}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Cancel
            </Button>
          </div>

          <div className="relative mb-2">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={mode === "existing" ? "Search by number, equipment…" : "Search by code, equipment…"}
              className="pl-7"
            />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-3 text-xs text-slate-500">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : mode === "existing" ? (
            filteredExecutions.length === 0 ? (
              <EmptyPicker text="No unlinked, open lockouts at this site. Start a new one instead." />
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {filteredExecutions.map((e) => (
                  <PickerRow
                    key={e.id}
                    primary={e.number}
                    secondary={`${e.equipmentName ?? e.procedureTitle ?? "—"} · ${
                      EXECUTION_STATUS_LABEL[e.status] ?? e.status
                    }`}
                    onClick={() => linkExisting(e)}
                  />
                ))}
              </ul>
            )
          ) : rankedProcedures.length === 0 ? (
            <EmptyPicker text="No published procedures at this site. One has to be authored and published in the LOTO module first." />
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {rankedProcedures.map((p) => {
                const matches =
                  p.equipmentId && subjectEquipmentIds.includes(p.equipmentId);
                return (
                  <PickerRow
                    key={p.id}
                    primary={p.procedureCode}
                    secondary={`${p.equipmentName ?? p.title}${
                      p.equipmentTag ? ` · ${p.equipmentTag}` : ""
                    }`}
                    badge={matches ? "matches this permit's equipment" : undefined}
                    busy={busy === p.id}
                    onClick={() => startNew(p)}
                  />
                );
              })}
            </ul>
          )}
        </div>
      )}

      {value && value.status !== "closed" && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          This lockout is still open. Everyone on it confirms their own lock in the
          LOTO module, and this permit cannot be closed until it is.
        </p>
      )}
    </div>
  );
}

function PickerRow({
  primary,
  secondary,
  badge,
  busy,
  onClick
}: {
  primary: string;
  secondary: string;
  badge?: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <Button variant="bare"
        type="button"
        onClick={onClick}
        disabled={busy}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-left transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className="block font-mono text-xs font-semibold text-slate-900">
            {primary}
          </span>
          <span className="block truncate text-[11px] text-slate-500">{secondary}</span>
          {badge && (
            <span className="mt-0.5 inline-block rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
              {badge}
            </span>
          )}
        </span>
        {busy && <Loader2 size={13} className="shrink-0 animate-spin text-slate-400" />}
      </Button>
    </li>
  );
}

function EmptyPicker({ text }: { text: string }) {
  return <p className="py-2 text-xs text-slate-500">{text}</p>;
}
