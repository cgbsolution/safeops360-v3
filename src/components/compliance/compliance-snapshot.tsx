"use client";

// The CAMS-side Compliance Snapshot.
//
// Read-only context for an auditor conducting a Fire Safety engagement: the
// state of the fire register and how much of the routine checklist programme
// has actually been completed, next to the engagement they are running.
//
// It fetches `/api/fire/compliance/engagement/{id}` — the SAME aggregation the
// Operations-side panel uses, addressed by the engagement so this component
// never has to map an engagement to a plant (or to its "Include in audit" asset
// scope) and cannot get that mapping subtly different from the other surface.
//
// Each block carries a "via X" badge — the same chip CAMS uses for an
// engagement's sourceModule — naming the live source it was read from. Nothing
// on this panel is stored on the engagement.
//
// It renders NOTHING on failure rather than an error box. An auditor's
// engagement workspace must not sprout a red banner because a context panel
// could not load — the engagement itself is unaffected.

import { useEffect, useState } from "react";
import { CompletionPanel, CompliancePayload } from "./completion-panel";

type RegisterBlock = {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  overdue: number;
  outOfService: number;
  certificatesExpired: number;
  certificatesDue30d: number;
};

type SnapshotPayload = CompliancePayload & {
  engagement?: { code: string; scope?: "ASSETS" | "SITE"; assetCount?: number };
  register?: RegisterBlock;
  sources?: { block: string; via: string; module: string }[];
};

function Via({ label }: { label: string }) {
  return <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">via {label}</span>;
}

const TYPE_LABEL: Record<string, string> = {
  FIRE_EXTINGUISHER: "Extinguishers",
  FIRE_ALARM_PANEL: "Alarm panels",
  BEAM_DETECTOR: "Beam detectors",
  FIRE_HYDRANT_SYSTEM: "Hydrant & sprinkler",
};

export function ComplianceSnapshot({ engagementId }: { engagementId: string }) {
  const [data, setData] = useState<SnapshotPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/fire/compliance/engagement/${encodeURIComponent(engagementId)}`);
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as SnapshotPayload;
        if (!cancelled) setData(json);
      } catch {
        // 403 (no FIRE grant) and 404 are both "this panel does not apply here".
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  if (failed || !data) return null;

  const via = (block: string) => data.sources?.find((s) => s.block === block)?.via;
  const reg = data.register;
  const scoped = data.engagement?.scope === "ASSETS";

  return (
    <div className="space-y-3">
      {reg && (
        <section className="rounded-xl border border-slate-200 bg-white">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="text-[13px] font-semibold text-slate-800">
                Compliance snapshot — asset register
                {via("register") && <Via label={via("register")!} />}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {scoped
                  ? `${data.engagement?.assetCount ?? reg.total} assets in this audit's scope`
                  : "All fire assets at this site"}
              </p>
            </div>
            <div className="text-[22px] font-semibold leading-none text-slate-800">{reg.total}</div>
          </header>
          {reg.total === 0 ? (
            <div className="px-4 py-3 text-[11.5px] text-slate-500">No fire assets registered — nothing to show.</div>
          ) : (
            <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
              <Cell label="Overdue inspection" value={reg.overdue} tone={reg.overdue ? "bad" : "ok"} />
              <Cell label="Out of service" value={reg.outOfService} tone={reg.outOfService ? "bad" : "ok"} />
              <Cell label="Certificates expired" value={reg.certificatesExpired} tone={reg.certificatesExpired ? "bad" : "ok"} />
              <Cell label="Certificates due ≤30d" value={reg.certificatesDue30d} tone={reg.certificatesDue30d ? "warn" : "ok"} />
            </div>
          )}
          {reg.total > 0 && (
            <div className="flex flex-wrap gap-3 px-4 py-2 text-[11px] text-slate-500">
              {Object.entries(reg.byType).map(([t, n]) => (
                <span key={t}>
                  {TYPE_LABEL[t] ?? t.replace(/_/g, " ").toLowerCase()}: <b className="text-slate-700">{n}</b>
                </span>
              ))}
            </div>
          )}
        </section>
      )}
      <CompletionPanel
        data={data}
        title="Compliance snapshot — routine checklist completion"
        subtitle={`${scoped ? "Assets in this audit's scope" : "Routine checklists at this site"}${
          via("completion") ? ` · via ${via("completion")}` : ""
        }`}
        maxAssets={6}
        footer="Read-only context. Routine checklists are maintained in Fire & Life Safety — this panel does not change them."
      />
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "bad" }) {
  const color = tone === "bad" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-slate-700";
  return (
    <div className="bg-white px-4 py-2.5">
      <div className={`text-[18px] font-semibold ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
