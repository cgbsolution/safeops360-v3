"use client";

// The QR scan destination (/q/fire/<code>): a phone-first checklist for one
// fire equipment asset. Loads the asset and its current checklist version,
// takes PASS / FAIL / NA per item with remarks and an optional photo, captures
// GPS, and submits once. A failed critical item marks the asset defective (or
// out of service) and raises a CAPA on the server; the result screen says so.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2, ChevronLeft, Loader2, MinusCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GpsCaptureStatus } from "@/components/ui/gps-capture";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserPicker } from "@/components/ui/user-picker";
import { useGeolocation } from "@/hooks/use-geolocation";
import { cn } from "@/lib/utils";
import {
  fireFetch, fireLabel, fmtDate, type ChecklistItem, type FireEquipment, type FireInspection, type ScanResult,
} from "@/lib/fire/api";
import { FireScanButton, FireStatusBadge } from "./shared";

type Answer = { response?: "PASS" | "FAIL" | "NA"; remarks: string; photoPath?: string; photoPreview?: string; uploading?: boolean; photoError?: string };

const MAX_PHOTO = 10 * 1024 * 1024;

export function InspectionForm({ code, scanned }: { code: string; scanned: boolean }) {
  const [data, setData] = useState<ScanResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [remarks, setRemarks] = useState("");
  const [markOos, setMarkOos] = useState(false);
  const [capaOwner, setCapaOwner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<(FireInspection & { equipment: FireEquipment }) | null>(null);
  const startedAt = useRef(new Date().toISOString());
  const geo = useGeolocation();

  useEffect(() => {
    let live = true;
    fireFetch<ScanResult>(`/api/fire/equipment/by-code/${encodeURIComponent(code)}`)
      .then((r) => { if (live) setData(r); })
      .catch((e: any) => { if (live) setLoadError(e?.message ?? "Could not load this equipment"); });
    return () => { live = false; };
  }, [code]);

  const items: ChecklistItem[] = useMemo(() => data?.template?.items ?? [], [data]);
  const answered = items.filter((i) => answers[i.key]?.response).length;
  const criticalFails = items.filter((i) => i.critical && answers[i.key]?.response === "FAIL");
  const anyUploading = Object.values(answers).some((a) => a.uploading);
  const missingRemarks = items.filter((i) => {
    const a = answers[i.key];
    return a?.response && (a.response === "FAIL" || (a.response === "NA" && i.critical)) && a.remarks.trim().length < 3;
  });

  const setAns = (key: string, patch: Partial<Answer>) =>
    setAnswers((p) => ({ ...p, [key]: { ...(p[key] ?? { remarks: "" }), ...patch } }));

  function passRemaining() {
    setAnswers((p) => {
      const next = { ...p };
      for (const i of items) if (!next[i.key]?.response) next[i.key] = { ...(next[i.key] ?? { remarks: "" }), response: "PASS" };
      return next;
    });
  }

  async function attachPhoto(key: string, file: File) {
    if (!data) return;
    if (file.size > MAX_PHOTO) {
      setAns(key, { photoError: "Photo is larger than 10 MB" });
      return;
    }
    setAns(key, { uploading: true, photoError: undefined });
    try {
      const init = await fireFetch<{ storagePath: string; uploadUrl: string }>("/api/fire/inspections/upload-url", {
        method: "POST",
        json: { equipmentId: data.equipment.id, fileName: file.name || "photo.jpg", contentType: file.type || "image/jpeg", fileSize: file.size },
      });
      const put = await fetch(init.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "image/jpeg" }, body: file });
      if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status})`);
      setAns(key, { uploading: false, photoPath: init.storagePath, photoPreview: URL.createObjectURL(file) });
    } catch (e: any) {
      setAns(key, { uploading: false, photoError: e?.message ?? "Upload failed" });
    }
  }

  async function submit() {
    if (!data?.template) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fireFetch<FireInspection & { equipment: FireEquipment }>("/api/fire/inspections", {
        method: "POST",
        json: {
          equipmentId: data.equipment.id,
          templateId: data.template.id,
          answers: items.map((i) => ({
            key: i.key, response: answers[i.key]?.response, remarks: answers[i.key]?.remarks?.trim() || null,
            photoPath: answers[i.key]?.photoPath ?? null,
          })),
          remarks: remarks.trim() || null,
          startedAt: startedAt.current,
          latitude: geo.coords?.lat ?? null,
          longitude: geo.coords?.lng ?? null,
          gpsAccuracyM: geo.coords?.accuracy ?? null,
          scanned,
          markOutOfService: criticalFails.length > 0 && markOos,
          capaOwnerId: capaOwner,
        },
      });
      setDone(r);
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      setError(e?.message ?? "Could not submit the inspection");
    } finally {
      setBusy(false);
    }
  }

  // ── states ────────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <Shell>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{loadError}</div>
        <div className="mt-4 flex gap-2"><FireScanButton size="default" /></div>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading {code}…</div>
      </Shell>
    );
  }

  const e = data.equipment;
  if (done) return <ResultScreen r={done} />;

  return (
    <Shell>
      <AssetCard e={e} last={data.lastInspection} />

      {data.blockers.length > 0 ? (
        <Notice tone="rose">{data.blockers.join(" ")}</Notice>
      ) : !data.canInspect ? (
        <Notice tone="amber">You can view this asset but not inspect it (FIRE.INSPECT permission needed).</Notice>
      ) : !data.template ? (
        <Notice tone="amber">
          No checklist is set up for {fireLabel(e.type).toLowerCase()} yet. A fire safety manager can add one under{" "}
          <Link href="/fire-safety/checklists" className="font-medium underline">Checklists</Link>.
        </Notice>
      ) : (
        <>
          {e.status === "OUT_OF_SERVICE" && (
            <Notice tone="slate">This asset is out of service. A passing inspection lets a manager return it to service.</Notice>
          )}
          <div className="mb-2 mt-4 flex items-end justify-between gap-2">
            <div>
              <div className="text-base font-semibold text-slate-900">{data.template.name}</div>
              <div className="text-xs text-slate-500">
                {data.template.standardRef ? `${data.template.standardRef} · ` : ""}v{data.template.version} · {answered}/{items.length} answered
              </div>
            </div>
            {answered < items.length && (
              <Button type="button" variant="outline" size="sm" onClick={passRemaining}>Rest are OK</Button>
            )}
          </div>

          <ol className="space-y-3">
            {items.map((it, idx) => (
              <ItemCard
                key={it.key} n={idx + 1} item={it} a={answers[it.key]}
                onResponse={(r) => setAns(it.key, { response: r })}
                onRemarks={(v) => setAns(it.key, { remarks: v })}
                onPhoto={(f) => attachPhoto(it.key, f)}
                onClearPhoto={() => setAns(it.key, { photoPath: undefined, photoPreview: undefined })}
              />
            ))}
          </ol>

          <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Overall remarks</Label>
              <Textarea rows={3} value={remarks} onChange={(ev) => setRemarks(ev.target.value)} placeholder="Anything else the next inspector should know" />
            </div>
            <GpsCaptureStatus status={geo.status} coords={geo.coords} error={geo.error} onRetry={geo.request} />
          </div>

          {criticalFails.length > 0 && (
            <div className="mt-4 space-y-3 rounded-xl border border-rose-300 bg-rose-50 p-4">
              <div className="flex items-start gap-2 text-sm text-rose-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {criticalFails.length} critical check{criticalFails.length > 1 ? "s" : ""} failed. On submit the asset is marked{" "}
                  <b>defective</b> and a corrective action (CAPA) is raised.
                </span>
              </div>
              {e.status !== "OUT_OF_SERVICE" && (
                <div className="flex items-start gap-2">
                  <Checkbox id="mark-oos" checked={markOos} onCheckedChange={(v) => setMarkOos(v === true)} className="mt-0.5" />
                  <Label htmlFor="mark-oos" className="text-sm text-rose-900">
                    Take it out of service now (it cannot be relied on; tag it and arrange a replacement)
                  </Label>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-rose-900">CAPA owner (defaults to you)</Label>
                <UserPicker value={capaOwner} onChange={(id) => setCapaOwner(id)} filter={{ plantId: e.plantId }} />
              </div>
            </div>
          )}

          {error && <div className="mt-4 whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

          <div className="sticky bottom-0 -mx-4 mt-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
            {missingRemarks.length > 0 && (
              <p className="mb-2 text-xs text-amber-700">Add remarks to item{missingRemarks.length > 1 ? "s" : ""} {missingRemarks.map((m) => items.indexOf(m) + 1).join(", ")}.</p>
            )}
            <Button
              type="button" size="lg" className="w-full"
              disabled={busy || anyUploading || answered < items.length || missingRemarks.length > 0}
              onClick={submit}
            >
              {busy ? "Submitting…" : answered < items.length ? `Answer all items (${answered}/${items.length})` : "Submit inspection"}
            </Button>
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-6 pt-3">
      <div className="mb-3 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/fire-safety/due"><ChevronLeft size={16} /> Fire safety</Link>
        </Button>
        <FireScanButton />
      </div>
      {children}
    </div>
  );
}

function Notice({ tone, children }: { tone: "rose" | "amber" | "slate"; children: React.ReactNode }) {
  const cls = tone === "rose" ? "border-rose-200 bg-rose-50 text-rose-800"
    : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-100 text-slate-700";
  return <div className={cn("mt-4 rounded-xl border p-4 text-sm", cls)}>{children}</div>;
}

function AssetCard({ e, last }: { e: FireEquipment; last: FireInspection | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-lg font-bold text-slate-900">{e.equipmentCode}</div>
          <div className="text-sm text-slate-700">{fireLabel(e.type)}{e.capacitySpec ? ` · ${e.capacitySpec}` : ""}</div>
        </div>
        <FireStatusBadge status={e.status} />
      </div>
      <div className="mt-2 text-sm text-slate-600">{e.location}{e.plantName ? `, ${e.plantName}` : ""}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
        <div>Last: <span className="font-medium text-slate-700">{fmtDate(e.lastInspectionDate)}</span>{last?.inspectorName ? ` by ${last.inspectorName}` : ""}</div>
        <div>Due: <span className={cn("font-medium", e.status === "OVERDUE" ? "text-rose-700" : "text-slate-700")}>{fmtDate(e.nextInspectionDueDate)}</span></div>
      </div>
    </div>
  );
}

const RESP: { v: "PASS" | "FAIL" | "NA"; label: string; Icon: typeof CheckCircle2; on: string }[] = [
  { v: "PASS", label: "OK", Icon: CheckCircle2, on: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700" },
  { v: "FAIL", label: "Not OK", Icon: XCircle, on: "border-rose-600 bg-rose-600 text-white hover:bg-rose-700" },
  { v: "NA", label: "N/A", Icon: MinusCircle, on: "border-slate-600 bg-slate-600 text-white hover:bg-slate-700" },
];

function ItemCard({
  n, item, a, onResponse, onRemarks, onPhoto, onClearPhoto,
}: {
  n: number; item: ChecklistItem; a: Answer | undefined;
  onResponse: (r: "PASS" | "FAIL" | "NA") => void; onRemarks: (v: string) => void;
  onPhoto: (f: File) => void; onClearPhoto: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const needsRemark = a?.response === "FAIL" || (a?.response === "NA" && item.critical);
  const [showRemark, setShowRemark] = useState(false);
  return (
    <li className={cn("rounded-xl border bg-white p-3", a?.response === "FAIL" ? "border-rose-300" : "border-slate-200")}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 w-5 shrink-0 text-xs font-semibold text-slate-400">{n}.</span>
        <div className="flex-1">
          <div className="text-sm font-medium text-slate-900">
            {item.text}
            {item.critical && <Badge className="ml-2 border border-rose-200 bg-rose-50 text-[10px] text-rose-700">Critical</Badge>}
          </div>
          {item.guidance && <div className="mt-0.5 text-xs text-slate-500">{item.guidance}</div>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {RESP.map(({ v, label, Icon, on }) => (
          <Button
            key={v} type="button" variant="outline"
            className={cn("h-12 text-sm", a?.response === v && on)}
            aria-pressed={a?.response === v}
            onClick={() => onResponse(v)}
          >
            <Icon size={16} /> {label}
          </Button>
        ))}
      </div>
      {(needsRemark || showRemark || (a?.remarks ?? "") !== "") && (
        <Textarea
          rows={2} className="mt-2" value={a?.remarks ?? ""} onChange={(ev) => onRemarks(ev.target.value)}
          placeholder={a?.response === "FAIL" ? "What is wrong? (required)" : needsRemark ? "Why does this critical check not apply? (required)" : "Remarks"}
        />
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(ev) => { const f = ev.target.files?.[0]; if (f) onPhoto(f); ev.target.value = ""; }}
        />
        <Button type="button" variant="ghost" size="sm" disabled={a?.uploading} onClick={() => fileRef.current?.click()}>
          {a?.uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} {a?.photoPath ? "Retake photo" : "Photo"}
        </Button>
        {!needsRemark && !showRemark && !(a?.remarks) && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowRemark(true)}>Add remark</Button>
        )}
        {a?.photoPreview && (
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.photoPreview} alt="Item photo" className="h-12 w-12 rounded object-cover" />
            <Button type="button" variant="ghost" size="sm" onClick={onClearPhoto}>Remove</Button>
          </span>
        )}
        {a?.photoError && <span className="text-xs text-rose-700">{a.photoError}</span>}
      </div>
    </li>
  );
}

function ResultScreen({ r }: { r: FireInspection & { equipment: FireEquipment } }) {
  const ok = r.result === "PASS";
  return (
    <Shell>
      <div className={cn("rounded-xl border p-5 text-center", ok ? "border-emerald-200 bg-emerald-50" : r.criticalFailCount ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50")}>
        {ok ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /> : <AlertTriangle className={cn("mx-auto h-12 w-12", r.criticalFailCount ? "text-rose-600" : "text-amber-600")} />}
        <div className="mt-2 text-lg font-semibold text-slate-900">{r.inspectionNo} recorded</div>
        <div className="text-sm text-slate-600">{r.equipmentCode} · {r.passCount} OK, {r.failCount} not OK, {r.naCount} N/A</div>
      </div>
      <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Asset status</span><FireStatusBadge status={r.equipmentStatusAfter} /></div>
        <div className="flex justify-between"><span className="text-slate-500">Next inspection due</span><span className="font-medium">{fmtDate(r.nextDueDate)}</span></div>
        {r.capaId && (
          <div className="flex justify-between"><span className="text-slate-500">Corrective action</span>
            <Link href={`/capa/${r.capaId}`} className="font-medium text-primary-700 underline">{r.capaNumber}</Link>
          </div>
        )}
        {r.followUpNote && !r.capaId && <div className="text-xs text-amber-700">{r.followUpNote}</div>}
      </div>
      <div className="mt-4 grid gap-2">
        <FireScanButton size="lg" className="w-full" />
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link href={`/fire-safety/inspections/${r.id}`}>View inspection record</Link>
        </Button>
      </div>
    </Shell>
  );
}
