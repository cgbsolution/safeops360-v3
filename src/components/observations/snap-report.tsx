"use client";

// Snap & Report ("picture gives everything"): open → take photo → Submit.
//
// The photo is the report. While the reporter frames the shot the page is
// already resolving WHERE (QR scan > GPS-nearest area > last-used area), and
// once the photo is taken the backend reads it against the platform's real
// observation vocabularies (POST /api/observations/snap-analyze) and returns a
// prefilled card. Submit creates the observation through the ordinary
// POST /api/observations (every create-time gate still applies) and attaches
// the photo through the ordinary two-phase attachment upload.
//
// AI is optional: when it is not configured, or cannot read the photo, the same
// card opens as a short manual form.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Camera, CheckCircle2, ChevronLeft, Loader2, QrCode, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GpsCaptureStatus } from "@/components/ui/gps-capture";
import { UserPicker } from "@/components/ui/user-picker";
import { QrScannerModal, qrSupported } from "@/components/capture/qr-scanner";
import { useGeolocation } from "@/hooks/use-geolocation";
import { cn } from "@/lib/utils";
import {
  OBS_TYPES,
  SEVERITIES,
  apiJson,
  axisOf,
  blobToBase64,
  compressPhoto,
  humanize,
  isAtRisk,
  qs,
  readLastArea,
  uploadSnapPhoto,
  writeLastArea,
  type NearestArea,
  type ObsType,
  type Severity,
  type SnapAnalyzeResponse,
  type SnapContext,
} from "@/lib/observation-reporting/api";

type Stage = "capture" | "analyzing" | "review" | "submitting" | "done";
type AreaBasis = "QR" | "NEAREST" | "LAST_USED" | "MANUAL" | null;
type Cat = { categoryCode: string; categoryLabel: string };
type Sub = { subCategoryCode: string; subCategoryLabel: string };

const NONE = "";

function Field({ label, children, hint, required }: { label: string; children: React.ReactNode; hint?: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </Label>
      {children}
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

export function SnapReport() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const userId = (session?.user as any)?.id as string | undefined;
  const geo = useGeolocation();

  const [stage, setStage] = useState<Stage>("capture");
  const [ctx, setCtx] = useState<SnapContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [plantId, setPlantId] = useState<string>(NONE);
  const [areaId, setAreaId] = useState<string>(NONE);
  const [areaBasis, setAreaBasis] = useState<AreaBasis>(null);
  const [nearest, setNearest] = useState<NearestArea | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrMessage, setQrMessage] = useState<string | null>(null);

  const [photo, setPhoto] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [aiUsed, setAiUsed] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [type, setType] = useState<ObsType>("UNSAFE_CONDITION");
  const [categoryCode, setCategoryCode] = useState<string>(NONE);
  const [subCategoryCode, setSubCategoryCode] = useState<string>(NONE);
  const [hazardCategory, setHazardCategory] = useState<string>("OTHERS");
  const [severity, setSeverity] = useState<Severity>("MEDIUM");
  const [severityTouched, setSeverityTouched] = useState(false);
  const [aiSeverity, setAiSeverity] = useState<Severity | null>(null);
  const [matrixSeverity, setMatrixSeverity] = useState<Severity | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [description, setDescription] = useState("");
  const [immediateAction, setImmediateAction] = useState("");
  const [workerId, setWorkerId] = useState<string | null>(null);

  const [catList, setCatList] = useState<{ axis: string; items: Cat[] }>({ axis: "", items: [] });
  const [subs, setSubs] = useState<Sub[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; number: string; photoError?: string } | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") router.replace("/login");
  }, [sessionStatus, router]);

  // ── context: plants, areas, nearest area ────────────────────────────────
  const loadContext = useCallback(
    async (pid?: string) => {
      try {
        const c = await apiJson<SnapContext>(
          `/api/observations/snap-context${qs({ plantId: pid, lat: geo.coords?.lat, lng: geo.coords?.lng })}`
        );
        setCtx(c);
        setCtxError(null);
        if (c.plantId) setPlantId(c.plantId);
        setNearest(c.nearest);
        return c;
      } catch (e: any) {
        setCtxError(e?.message ?? "Could not load your plant and areas");
        return null;
      }
    },
    [geo.coords?.lat, geo.coords?.lng]
  );

  useEffect(() => {
    if (sessionStatus === "authenticated") void loadContext(plantId || undefined);
    // Re-run when a GPS fix arrives so "nearest area" can resolve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, geo.coords?.lat, geo.coords?.lng]);

  // Area preference: QR (explicit) > nearest by GPS > last used > nothing.
  useEffect(() => {
    if (!ctx || areaBasis === "QR" || areaBasis === "MANUAL") return;
    const known = new Set(ctx.areas.map((a) => a.id));
    if (nearest && known.has(nearest.areaId)) {
      setAreaId(nearest.areaId);
      setAreaBasis("NEAREST");
      return;
    }
    const last = readLastArea(userId);
    if (last && last.plantId === ctx.plantId && known.has(last.areaId)) {
      setAreaId(last.areaId);
      setAreaBasis("LAST_USED");
    }
  }, [ctx, nearest, userId, areaBasis]);

  // ── taxonomy dropdowns (the same lookup the observer form uses) ────────
  const axis = axisOf(type);
  useEffect(() => {
    if (!isAtRisk(type)) {
      setCatList({ axis: "", items: [] });
      return;
    }
    let alive = true;
    apiJson<{ items: Cat[] }>(`/api/observation-taxonomy/categories?type=${axis}`)
      .then((r) => alive && setCatList({ axis, items: r.items }))
      .catch(() => alive && setCatList({ axis, items: [] }));
    return () => {
      alive = false;
    };
  }, [type, axis]);

  useEffect(() => {
    if (!isAtRisk(type) || !categoryCode) {
      setSubs([]);
      return;
    }
    let alive = true;
    apiJson<{ items: Sub[] }>(`/api/observation-taxonomy/subcategories?type=${axis}&category=${encodeURIComponent(categoryCode)}`)
      .then((r) => {
        if (!alive) return;
        setSubs(r.items);
        if (!r.items.some((s) => s.subCategoryCode === subCategoryCode)) setSubCategoryCode(r.items[0]?.subCategoryCode ?? NONE);
      })
      .catch(() => alive && setSubs([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, axis, categoryCode]);

  // Category no longer valid on the new axis → drop it (server would 400).
  // Only judged against the list loaded FOR this axis, never a stale one.
  const cats = catList.axis === axis ? catList.items : [];
  useEffect(() => {
    if (catList.axis !== axis || !catList.items.length || !categoryCode) return;
    if (!catList.items.some((c) => c.categoryCode === categoryCode)) {
      setCategoryCode(NONE);
      setSubCategoryCode(NONE);
    }
  }, [catList, axis, categoryCode]);

  // ── severity matrix (re-resolved like the observer form) ───────────────
  useEffect(() => {
    if (stage !== "review" || !isAtRisk(type) || !categoryCode || !subCategoryCode) {
      setMatrixSeverity(null);
      return;
    }
    let alive = true;
    apiJson<{ suggested: Severity | null }>(
      `/api/observations/severity-suggestion${qs({ observationType: type, category: categoryCode, subCategory: subCategoryCode, plantId, areaId })}`
    )
      .then((r) => {
        if (!alive) return;
        setMatrixSeverity(r.suggested);
        if (r.suggested && !severityTouched) setSeverity(r.suggested);
      })
      .catch(() => alive && setMatrixSeverity(null));
    return () => {
      alive = false;
    };
  }, [stage, type, categoryCode, subCategoryCode, plantId, areaId, severityTouched]);

  // ── photo → analysis ───────────────────────────────────────────────────
  async function onPhoto(file: File | null) {
    if (!file) return;
    setSubmitError(null);
    const blob = await compressPhoto(file);
    setPhoto(blob);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(blob);
    });
    setStage("analyzing");
    let res: SnapAnalyzeResponse | null = null;
    if (ctx?.aiEnabled !== false) {
      try {
        res = await apiJson<SnapAnalyzeResponse>("/api/observations/snap-analyze", {
          method: "POST",
          json: {
            imageB64: await blobToBase64(blob),
            mimeType: blob.type || "image/jpeg",
            plantId: plantId || undefined,
            areaId: areaId || undefined,
            lat: geo.coords?.lat,
            lng: geo.coords?.lng,
            lang: typeof navigator !== "undefined" && navigator.language?.startsWith("hi") ? "hi" : "en",
          },
        });
      } catch {
        res = null;
      }
    }
    if (res?.nearest) setNearest(res.nearest);
    if (res && res.ok) {
      const s = res.suggestion;
      setAiUsed(true);
      setAiNote(null);
      setLowConfidence(s.lowConfidence);
      setType(s.observationType);
      setCategoryCode(s.categoryCode ?? NONE);
      setSubCategoryCode(s.subCategoryCode ?? NONE);
      if (!isAtRisk(s.observationType) && s.category) setHazardCategory(s.category);
      setSeverity(s.severity);
      setSeverityTouched(false);
      setAiSeverity(s.aiSeverity);
      setMatrixSeverity(s.matrixSeverity);
      setDescription(s.composedDescription || s.description);
      setImmediateAction(s.immediateAction);
    } else {
      setAiUsed(false);
      setAiNote(
        ctx?.aiEnabled === false || (res && !res.ok && res.reason === "ai_disabled")
          ? "Photo reading is not switched on here. Fill in the short form below."
          : "The photo could not be read automatically. Fill in the short form below."
      );
    }
    setStage("review");
  }

  function resetAll() {
    setStage("capture");
    setPhoto(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setAiUsed(false);
    setAiNote(null);
    setDescription("");
    setImmediateAction("");
    setOverrideReason("");
    setWorkerId(null);
    setSeverityTouched(false);
    setCreated(null);
    setSubmitError(null);
    if (areaBasis === "QR") setAreaBasis(areaId ? "MANUAL" : null);
  }

  // ── validation ─────────────────────────────────────────────────────────
  const minDesc = isAtRisk(type) ? ctx?.minAtRiskDescription ?? 50 : 10;
  const needsReason = !!matrixSeverity && severity !== matrixSeverity;
  const needsWorker = type === "UNSAFE_ACT" && (severity === "HIGH" || severity === "CRITICAL");
  const problems = useMemo(() => {
    const p: string[] = [];
    if (!plantId) p.push("Pick a plant.");
    if (isAtRisk(type) && (!categoryCode || !subCategoryCode)) p.push("Pick a category and sub-category.");
    if (description.trim().length < minDesc) p.push(`Describe it in at least ${minDesc} characters (what, where, who).`);
    if (needsReason && overrideReason.trim().length < 10) p.push("Say why the severity differs from the suggested one (10+ characters).");
    if (needsWorker && !workerId) p.push("Name the worker involved (required for a High or Critical unsafe act).");
    return p;
  }, [plantId, type, categoryCode, subCategoryCode, description, minDesc, needsReason, overrideReason, needsWorker, workerId]);

  async function submit() {
    if (problems.length) {
      setSubmitError(problems[0]);
      return;
    }
    setStage("submitting");
    setSubmitError(null);
    try {
      const body: Record<string, unknown> = {
        plantId,
        areaId: areaId || null,
        type,
        severity,
        description: description.trim(),
        immediateAction: immediateAction.trim() || null,
        date: new Date().toISOString(),
        ...(isAtRisk(type) ? { categoryCode, subCategoryCode } : { category: hazardCategory }),
        ...(matrixSeverity ? { suggestedSeverity: matrixSeverity } : {}),
        ...(needsReason ? { severityOverrideReason: overrideReason.trim() } : {}),
        ...(needsWorker && workerId ? { workersInvolved: [{ partyType: "USER", userId: workerId }] } : {}),
      };
      const obs = await apiJson<{ id: string; number: string }>("/api/observations", { method: "POST", json: body });
      if (areaId) writeLastArea(userId, plantId, areaId);
      let photoError: string | undefined;
      if (photo) {
        const up = await uploadSnapPhoto(obs.id, photo, geo.coords ? { lat: geo.coords.lat, lng: geo.coords.lng, accuracy: geo.coords.accuracy } : null);
        if (!up.ok) photoError = up.error;
      }
      setCreated({ id: obs.id, number: obs.number, photoError });
      setStage("done");
    } catch (e: any) {
      setSubmitError(e?.message ?? "Could not submit the observation");
      setStage("review");
    }
  }

  function onQr(raw: { areaId?: string }) {
    setQrOpen(false);
    if (!raw.areaId) {
      setQrMessage("That QR code is not an area label.");
      return;
    }
    if (!ctx?.areas.some((a) => a.id === raw.areaId)) {
      setQrMessage("That area belongs to a different plant.");
      return;
    }
    setAreaId(raw.areaId);
    setAreaBasis("QR");
    setQrMessage(null);
  }

  const areaName = ctx?.areas.find((a) => a.id === areaId)?.name;
  const basisLabel =
    areaBasis === "QR" ? "from QR scan" :
    areaBasis === "NEAREST" && nearest ? `nearest to your GPS (${nearest.distanceMetres} m)` :
    areaBasis === "LAST_USED" ? "your last-used area" :
    areaBasis === "MANUAL" ? "chosen by you" : null;

  if (sessionStatus !== "authenticated") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-[#C9A961]" />
      </div>
    );
  }

  const locationBlock = (
    <div className="space-y-3 rounded-2xl border border-[#D9E1EF] bg-white p-4">
      {ctx && ctx.plants.length > 1 && (
        <Field label="Plant" required>
          <Select
            value={plantId}
            onValueChange={(v) => {
              setPlantId(v);
              setAreaId(NONE);
              setAreaBasis(null);
              void loadContext(v);
            }}
            aria-label="Plant"
          >
            {ctx.plants.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Area" hint={basisLabel && areaName ? `${areaName}: ${basisLabel}` : "Scan the area QR or pick from the list"}>
        <div className="flex gap-2">
          <Select
            value={areaId}
            onValueChange={(v) => {
              setAreaId(v);
              setAreaBasis(v ? "MANUAL" : null);
            }}
            className="flex-1"
            aria-label="Area"
          >
            <SelectItem value="">Area not known</SelectItem>
            {(ctx?.areas ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </Select>
          {qrSupported() && (
            <Button type="button" variant="outline" size="icon" onClick={() => setQrOpen(true)} aria-label="Scan area QR">
              <QrCode className="h-5 w-5" />
            </Button>
          )}
        </div>
      </Field>
      {qrMessage && <p className="text-xs text-amber-700">{qrMessage}</p>}
      <GpsCaptureStatus status={geo.status} coords={geo.coords} error={geo.error} onRetry={geo.request} />
    </div>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-28 pt-4">
      <div className="mb-4 flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/observations"><ChevronLeft className="h-6 w-6" /></Link>
        </Button>
        <div>
          <h1 className="text-lg font-bold text-[#0B1F4D]">Snap &amp; Report</h1>
          <p className="text-xs text-[#5A6273]">Take a photo. We fill in the rest.</p>
        </div>
      </div>

      {ctxError && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{ctxError}</div>}

      <Input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          void onPhoto(f);
        }}
      />

      {stage === "capture" && (
        <div className="flex flex-1 flex-col gap-4">
          <Button
            type="button"
            variant="bare"
            onClick={() => fileRef.current?.click()}
            data-testid="snap-take-photo"
            className="flex min-h-[46vh] w-full flex-col items-center justify-center gap-4 rounded-3xl bg-[#0B1F4D] text-white shadow-lg active:scale-[0.99]"
          >
            <Camera className="h-20 w-20 text-[#C9A961]" />
            <span className="text-2xl font-bold">Take photo</span>
            <span className="px-6 text-center text-sm text-white/70">Point at the unsafe act or condition. One photo is enough.</span>
          </Button>
          {locationBlock}
        </div>
      )}

      {stage === "analyzing" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Your photo" className="max-h-[40vh] w-full rounded-2xl object-cover" />
          )}
          <div className="flex items-center gap-2 text-[#0B1F4D]">
            <Sparkles className="h-5 w-5 animate-pulse text-[#C9A961]" />
            <span className="font-semibold">Reading your photo…</span>
          </div>
        </div>
      )}

      {(stage === "review" || stage === "submitting") && (
        <div className="space-y-4">
          {previewUrl && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Your photo" className="max-h-64 w-full rounded-2xl object-cover" />
              <Button type="button" size="sm" variant="secondary" className="absolute bottom-2 right-2" onClick={() => fileRef.current?.click()}>
                <RotateCcw className="h-4 w-4" /> Retake
              </Button>
            </div>
          )}
          {aiUsed ? (
            <div className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-sm", lowConfidence ? "border-amber-300 bg-amber-50 text-amber-900" : "border-[#C9A961] bg-[#C9A961]/10 text-[#0B1F4D]")}>
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A961]" />
              <span>{lowConfidence ? "Filled in from your photo, but the picture was unclear. Please check each field." : "Filled in from your photo. Check it and submit."}</span>
            </div>
          ) : (
            aiNote && <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">{aiNote}</div>
          )}

          <div className="space-y-3 rounded-2xl border border-[#D9E1EF] bg-white p-4">
            <Field label="What is it" required>
              <Select value={type} onValueChange={(v) => setType(v as ObsType)} aria-label="Observation type">
                {OBS_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </Select>
            </Field>
            {isAtRisk(type) ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Category" required>
                  <Select value={categoryCode} onValueChange={(v) => setCategoryCode(v)} aria-label="Category">
                    <SelectItem value="" disabled>Pick a category</SelectItem>
                    {cats.map((c) => (
                      <SelectItem key={c.categoryCode} value={c.categoryCode}>{c.categoryLabel}</SelectItem>
                    ))}
                  </Select>
                </Field>
                <Field label="Sub-category" required>
                  <Select value={subCategoryCode} onValueChange={(v) => setSubCategoryCode(v)} disabled={!categoryCode} aria-label="Sub-category">
                    <SelectItem value="" disabled>Pick a sub-category</SelectItem>
                    {subs.map((s) => (
                      <SelectItem key={s.subCategoryCode} value={s.subCategoryCode}>{s.subCategoryLabel}</SelectItem>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <Field label="Hazard category" required>
                <Select value={hazardCategory} onValueChange={setHazardCategory} aria-label="Hazard category">
                  {(ctx?.hazardCategories ?? ["OTHERS"]).map((c) => (
                    <SelectItem key={c} value={c}>{humanize(c)}</SelectItem>
                  ))}
                </Select>
              </Field>
            )}
            <Field
              label="Severity"
              required
              hint={
                <>
                  {matrixSeverity && <span>Suggested by the severity matrix: {humanize(matrixSeverity)}. </span>}
                  {aiSeverity && aiSeverity !== severity && (
                    <span>
                      From the photo it looks {humanize(aiSeverity).toLowerCase()}.{" "}
                      <Button type="button" variant="link" className="h-auto p-0 text-[11px]" onClick={() => { setSeverity(aiSeverity); setSeverityTouched(true); }}>
                        Use {humanize(aiSeverity)}
                      </Button>
                    </span>
                  )}
                </>
              }
            >
              <Select value={severity} onValueChange={(v) => { setSeverity(v as Severity); setSeverityTouched(true); }} aria-label="Severity">
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>{humanize(s)}</SelectItem>
                ))}
              </Select>
            </Field>
            {needsReason && (
              <Field label="Why a different severity" required>
                <Textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} rows={2} placeholder="e.g. Molten metal splash zone, people pass every few minutes" />
              </Field>
            )}
            {needsWorker && (
              <Field label="Worker involved" required hint="Contractor workers: use the full observation form.">
                <UserPicker value={workerId} onChange={(id) => setWorkerId(id)} filter={{ plantId: plantId || undefined }} placeholder="Search employee" />
              </Field>
            )}
            <Field label="What did you see" required hint={`${description.trim().length}/${minDesc} characters minimum`}>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What is unsafe, where exactly, who is exposed" />
            </Field>
            <Field label="Immediate action">
              <Textarea value={immediateAction} onChange={(e) => setImmediateAction(e.target.value)} rows={2} placeholder="What was done or should be done right now" />
            </Field>
          </div>

          {locationBlock}

          {submitError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{submitError}</div>}

          <div className="fixed inset-x-0 bottom-0 border-t border-[#D9E1EF] bg-white/95 px-4 py-3 backdrop-blur">
            <div className="mx-auto max-w-lg">
              <Button
                type="button"
                size="lg"
                className="h-14 w-full text-lg"
                onClick={submit}
                disabled={stage === "submitting"}
                data-testid="snap-submit"
              >
                {stage === "submitting" ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                {stage === "submitting" ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {stage === "done" && created && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <CheckCircle2 className="h-20 w-20 text-emerald-600" />
          <div>
            <p className="text-xl font-bold text-[#0B1F4D]">Reported</p>
            <p className="text-sm text-[#5A6273]">{created.number}</p>
          </div>
          {created.photoError && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The observation is saved, but the photo did not upload ({created.photoError}). Add it from the observation page.
            </p>
          )}
          <div className="grid w-full grid-cols-2 gap-3">
            <Button asChild variant="outline" size="lg">
              <Link href={`/observations/${created.id}`}>View</Link>
            </Button>
            <Button size="lg" onClick={resetAll}>
              <Camera className="h-5 w-5" /> Report another
            </Button>
          </div>
        </div>
      )}

      {qrOpen && ctx && (
        <QrScannerModal
          lang="en"
          knownAreaIds={new Set(ctx.areas.map((a) => a.id))}
          onResult={(r) => onQr(r)}
          onClose={() => setQrOpen(false)}
          title="Scan the area QR"
          unrecognised="That QR code is not an area label."
        />
      )}
    </div>
  );
}
