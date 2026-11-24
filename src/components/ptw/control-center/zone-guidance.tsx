"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Ban, CheckCircle2, ShieldAlert } from "lucide-react";
import { fmtClock, typeInfo, type ZoneGuidance } from "@/lib/ptw/ops";
import { OpsError, OpsSkeleton } from "./panel";

export type GuidanceFetcher = (areaId: string) => Promise<ZoneGuidance>;

const STATE = {
  allowed: { label: "Allowed", color: "var(--ops-ok)", Icon: CheckCircle2 },
  conditional: { label: "Conditional", color: "var(--ops-warn)", Icon: AlertCircle },
  blocked: { label: "Blocked", color: "var(--ops-crit)", Icon: Ban },
} as const;

/** Guidance for the selected zone. Refetches when the zone changes and when the
 *  board refreshes (refreshKey), so a new impairment shows up without a click. */
export function ZoneGuidanceStrip({
  areaId,
  fetcher,
  refreshKey,
}: {
  areaId: string | null;
  fetcher: GuidanceFetcher;
  refreshKey?: string;
}) {
  const [g, setG] = useState<ZoneGuidance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!areaId) return;
    let live = true;
    setLoading(true);
    fetcher(areaId)
      .then((x) => { if (live) { setG(x); setError(null); } })
      .catch((e) => { if (live) setError(e?.message ?? "Could not load guidance"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [areaId, fetcher, refreshKey]);

  const current = g && g.areaId === areaId ? g : null;

  return (
    <section aria-label="Zone guidance" aria-live="polite" className="ops-inset mt-4 p-4">
      {!areaId ? (
        <p className="text-[13px] ops-muted">Select a zone on the map to see its site guidance.</p>
      ) : !current && loading ? (
        <OpsSkeleton rows={3} />
      ) : !current && error ? (
        <OpsError message={error} />
      ) : current ? (
        <>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="ops-title">Site guidance · {current.areaName}</h3>
            <span className="text-[12px] ops-muted">
              {current.areaOwner ? `Area owner: ${current.areaOwner}` : "No area owner set"}
              {current.updatedAt ? ` · updated ${new Date(current.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
            </span>
          </div>

          {current.impairments.map((i) => (
            <div
              key={i.id}
              role="alert"
              className="ops-tint-crit mb-3 flex items-start gap-2 rounded-[10px] border p-3 text-[13px]"
              style={{ color: "var(--ops-crit-text)" }}
            >
              <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                <strong>Impairment {i.code}</strong> — {i.systemName}
                {i.plannedRestoreAt ? ` out of service until ${fmtClock(i.plannedRestoreAt)}` : " out of service"}. {i.effect}.
                {i.precautions.length > 0 && <> Precautions: {i.precautions.join("; ")}.</>}
              </span>
            </div>
          ))}

          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div>
              <div className="ops-label mb-2">Permits in this zone</div>
              {current.permitTypeRules.length ? (
                <ul className="space-y-1.5">
                  {current.permitTypeRules.map((r) => {
                    const s = STATE[r.state] ?? STATE.conditional;
                    return (
                      <li key={r.permitType} className="flex items-start gap-2 text-[13px]">
                        <s.Icon size={15} className="mt-0.5 shrink-0" style={{ color: s.color }} aria-hidden />
                        <span>
                          <span className="font-semibold">{typeInfo(r.permitType).label}</span>{" "}
                          <span style={{ color: s.color }}>{s.label}</span>
                          {r.conditionText ? <span className="ops-muted"> — {r.conditionText}</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[13px] ops-muted">No permit-type rules set for this zone.</p>
              )}
              {current.restrictedHours && (
                <p className="mt-2 text-[12px]" style={{ color: "var(--ops-warn-text)" }}>Restricted: {current.restrictedHours}</p>
              )}
            </div>
            <div>
              <div className="ops-label mb-2">Standing instructions</div>
              {current.instructions.length ? (
                <ul className="list-disc space-y-1 pl-4 text-[13px] ops-text-2">
                  {current.instructions.map((it) => <li key={it}>{it}</li>)}
                </ul>
              ) : (
                <p className="text-[13px] ops-muted">None recorded.</p>
              )}
            </div>
            <div>
              <div className="ops-label mb-2">Mandatory PPE</div>
              <div className="flex flex-wrap gap-1.5">
                {current.mandatoryPpe.length ? current.mandatoryPpe.map((p) => <span key={p} className="ops-chip">{p}</span>) : (
                  <span className="text-[13px] ops-muted">None recorded.</span>
                )}
              </div>
            </div>
            <div>
              <div className="ops-label mb-2">Emergency</div>
              <dl className="space-y-1 text-[13px] ops-text-2">
                <div><dt className="inline ops-muted">Assembly: </dt><dd className="inline">{current.assemblyPoint ?? "not set"}</dd></div>
                <div><dt className="inline ops-muted">Extinguishers: </dt><dd className="inline">{current.extinguisherLocations ?? "not set"}</dd></div>
                <div><dt className="inline ops-muted">Area owner: </dt><dd className="inline">{current.areaOwner ?? "not set"}</dd></div>
              </dl>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
