"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Ban, CheckCircle2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtClock, typeInfo, type ZoneGuidance } from "@/lib/ptw/ops";
import { CcError, CcSkeleton } from "./panel";

export type GuidanceFetcher = (areaId: string) => Promise<ZoneGuidance>;

const STATE = {
  allowed: { label: "Allowed", cls: "text-emerald-700", Icon: CheckCircle2 },
  conditional: { label: "Conditional", cls: "text-amber-700", Icon: AlertCircle },
  blocked: { label: "Blocked", cls: "text-rose-700", Icon: Ban },
} as const;

/** Guidance for the selected zone. Refetches when the zone changes and when the
 *  board refreshes (refreshKey), so a new impairment shows up without a click. */
export function ZoneGuidanceStrip({ areaId, fetcher, refreshKey }: { areaId: string | null; fetcher: GuidanceFetcher; refreshKey?: string }) {
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
    <section aria-label="Zone guidance" aria-live="polite" className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      {!areaId ? (
        <p className="text-sm text-slate-500">Select a zone on the map to see its site guidance.</p>
      ) : !current && loading ? (
        <CcSkeleton rows={3} />
      ) : !current && error ? (
        <CcError message={error} />
      ) : current ? (
        <>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Site guidance · {current.areaName}</h3>
            <span className="text-xs text-slate-500">
              {current.areaOwner ? `Area owner: ${current.areaOwner}` : "No area owner set"}
              {current.updatedAt ? ` · updated ${new Date(current.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
            </span>
          </div>

          {current.impairments.map((i) => (
            <div key={i.id} role="alert" className="mb-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                <strong>Impairment {i.code}</strong> — {i.systemName}
                {i.plannedRestoreAt ? ` out of service until ${fmtClock(i.plannedRestoreAt)}` : " out of service"}. {i.effect}.
                {i.precautions.length > 0 && <> Precautions: {i.precautions.join("; ")}.</>}
              </span>
            </div>
          ))}

          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Permits in this zone</div>
              {current.permitTypeRules.length ? (
                <ul className="space-y-1.5">
                  {current.permitTypeRules.map((r) => {
                    const s = STATE[r.state] ?? STATE.conditional;
                    return (
                      <li key={r.permitType} className="flex items-start gap-2 text-sm">
                        <s.Icon size={15} className={`mt-0.5 shrink-0 ${s.cls}`} aria-hidden />
                        <span className="text-slate-700">
                          <span className="font-medium">{typeInfo(r.permitType).label}</span>{" "}
                          <span className={s.cls}>{s.label}</span>
                          {r.conditionText ? <span className="text-slate-500"> — {r.conditionText}</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No permit-type rules set for this zone.</p>
              )}
              {current.restrictedHours && <p className="mt-2 text-xs text-amber-800">Restricted: {current.restrictedHours}</p>}
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Standing instructions</div>
              {current.instructions.length ? (
                <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">
                  {current.instructions.map((it) => <li key={it}>{it}</li>)}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">None recorded.</p>
              )}
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Mandatory PPE</div>
              <div className="flex flex-wrap gap-1.5">
                {current.mandatoryPpe.length
                  ? current.mandatoryPpe.map((p) => <Badge key={p} className="border-slate-200 bg-white text-slate-700">{p}</Badge>)
                  : <span className="text-sm text-slate-500">None recorded.</span>}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Emergency</div>
              <dl className="space-y-1 text-sm text-slate-700">
                <div><dt className="inline text-slate-500">Assembly: </dt><dd className="inline">{current.assemblyPoint ?? "not set"}</dd></div>
                <div><dt className="inline text-slate-500">Extinguishers: </dt><dd className="inline">{current.extinguisherLocations ?? "not set"}</dd></div>
                <div><dt className="inline text-slate-500">Area owner: </dt><dd className="inline">{current.areaOwner ?? "not set"}</dd></div>
              </dl>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
