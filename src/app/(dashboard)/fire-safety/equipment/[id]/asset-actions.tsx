"use client";

// The two actions an asset page offers, one per engine:
//
//   Run checklist     → the ROUTINE engine: the technician's Daily / Monthly /
//                       Quarterly / Yearly sheet for this asset's type, opened on
//                       this asset (same routing the QR scan page uses).
//   Include in audit  → CAMS: add this asset to the scope of an open Fire Safety
//                       audit engagement at the same site (lead auditor,
//                       standards, independence-checked when it was scheduled).
//
// They are deliberately separate: a routine sheet is not an audit, and an audit
// is not a substitute for the routine sheet.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Asset type → the screen that renders its routine checklists. Mirrors SCREEN in
// ../../scan/[token]/page.tsx.
const CHECKLIST_SCREEN: Record<string, string> = {
  FIRE_EXTINGUISHER: "/fire-safety/fe-inspection",
  FIRE_ALARM_PANEL: "/fire-safety/fire-alarm",
  BEAM_DETECTOR: "/fire-safety/fire-alarm",
  FIRE_HYDRANT_SYSTEM: "/fire-safety/fire-hydrant",
};

type Audit = {
  id: string;
  engagementCode: string;
  title: string;
  status: string;
  plannedDate: string | null;
  assetCount: number;
};

export function RunChecklistButton({ assetId, assetType }: { assetId: string; assetType: string }) {
  const screen = CHECKLIST_SCREEN[assetType];
  if (!screen) {
    return (
      <span
        title="No routine checklist is configured for this asset type"
        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400"
      >
        Run checklist
      </span>
    );
  }
  return (
    <Link
      href={`${screen}?asset=${encodeURIComponent(assetId)}`}
      className="rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-800"
    >
      Run checklist
    </Link>
  );
}

export function IncludeInAuditButton({ assetId, code }: { assetId: string; code: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<{ included: Audit[]; available: Audit[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/fire/audits/for-asset/${encodeURIComponent(assetId)}`, { cache: "no-store" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(typeof d.detail === "string" ? d.detail : `Could not load audits (${res.status})`);
      setData({ included: [], available: [] });
      return;
    }
    setData(await res.json());
  }, [assetId]);

  React.useEffect(() => {
    if (open && !data) void load();
  }, [open, data, load]);

  async function include(a: Audit) {
    setBusy(a.id);
    setError(null);
    const res = await fetch(`/api/fire/audits/${encodeURIComponent(a.id)}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId }),
    });
    setBusy(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(typeof d.detail === "string" ? d.detail : `Failed (${res.status})`);
      return;
    }
    await load();
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Add ${code} to a CAMS Fire Safety audit`}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400"
      >
        Include in audit
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-96 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg">
          <div className="mb-2 font-semibold text-slate-800">CAMS Fire Safety audits at this site</div>
          {error && <div className="mb-2 rounded bg-rose-50 px-2 py-1 text-rose-700">{error}</div>}
          {!data ? (
            <div className="text-slate-500">Loading…</div>
          ) : (
            <>
              {data.included.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Already in scope</div>
                  {data.included.map((a) => (
                    <Link
                      key={a.id}
                      href={`/cams/engagements/${a.id}`}
                      className="flex items-center justify-between rounded px-2 py-1 hover:bg-slate-50"
                    >
                      <span>
                        <span className="font-mono">{a.engagementCode}</span> · {a.title}
                      </span>
                      <span className="text-slate-400">{a.status.replace(/_/g, " ")}</span>
                    </Link>
                  ))}
                </div>
              )}
              <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Open audits</div>
              {data.available.length === 0 ? (
                <div className="px-2 py-1 text-slate-500">
                  No open Fire Safety audit at this site.{" "}
                  <Link href="/cams/engagements?sourceModule=FIRE" className="text-primary-700 underline">
                    Schedule one in CAMS
                  </Link>
                  .
                </div>
              ) : (
                data.available.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-slate-50">
                    <span className="min-w-0 truncate">
                      <span className="font-mono">{a.engagementCode}</span> · {a.title}{" "}
                      <span className="text-slate-400">({a.assetCount} assets)</span>
                    </span>
                    <button
                      type="button"
                      disabled={busy === a.id}
                      onClick={() => include(a)}
                      className="shrink-0 rounded border border-primary-200 px-2 py-0.5 font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-60"
                    >
                      {busy === a.id ? "Adding…" : "Include"}
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
