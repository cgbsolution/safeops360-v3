"use client";

// "Scan paper permit": photograph (or upload) a filled-in paper permit, have it
// read by POST /api/ptw/scan, review what was read beside the scan, and carry it
// into the New Permit wizard. Nothing is saved here: the user still checks and
// submits the ordinary form, and the scan is attached to the permit after it is
// created (permit-form.tsx, category SOURCE_SCAN).
//
// Fields the reader was unsure of (confidence < 70%), could not read, or could
// not match to a master record (area, contractor, people) are highlighted and
// stay editable. The precaution checklist is never read from paper: only
// someone on site can confirm a control is in place.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, FileText, Loader2, RefreshCcw, ScanLine, SwitchCamera, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UserPicker } from "@/components/ui/user-picker";
import { readApiError } from "@/lib/client-errors";
import { cn } from "@/lib/utils";
import type { PtwDraft } from "@/lib/ptw/wizard-config";
import { PPE_CATALOG } from "@/lib/ptw/wizard-config";
import type { ScanField, ScanResult } from "@/lib/ptw/control-center";

const MAX_FILES = 4;
// The browser → API proxy carries JSON text and is capped near 4.5 MB per
// request, so photos are re-encoded before sending and the base64 total kept under this.
const MAX_PAYLOAD_B64 = 4_000_000;
const MAX_PDF_BYTES = 2_900_000;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

const PERMIT_TYPES = [
  { value: "HOT_WORK", label: "Hot Work" },
  { value: "CONFINED_SPACE", label: "Confined Space Entry" },
  { value: "WORK_AT_HEIGHT", label: "Work at Height" },
  { value: "EXCAVATION", label: "Excavation" },
  { value: "ELECTRICAL_LOTO", label: "Electrical / LOTO" },
  { value: "LIFTING", label: "Lifting Operations" },
  { value: "GENERAL_COLD", label: "General Cold Work" },
];

type Option = { id: string; name: string };
type Picked = { file: File; url: string };
type OkResult = Extract<ScanResult, { ok: true }>;

function blobToB64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

/** Re-encode a photo as JPEG within `edge` px so it fits through the proxy. */
async function shrinkImage(file: File, edge: number, quality: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`${file.name} could not be opened as an image`));
      i.src = url;
    });
    const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the photo"))), "image/jpeg", quality)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function encodeForScan(files: File[]): Promise<{ name: string; mimeType: string; dataB64: string }[]> {
  if (files.some((f) => f.type === "application/pdf")) {
    const pdf = files[0];
    if (pdf.size > MAX_PDF_BYTES) {
      throw new Error("The PDF is larger than about 3 MB, which is too big to send for reading. Photograph the pages instead.");
    }
    return [{ name: pdf.name, mimeType: pdf.type, dataB64: await blobToB64(pdf) }];
  }
  for (const [edge, q] of [[1800, 0.82], [1400, 0.72], [1100, 0.65]] as const) {
    const out = [];
    for (const f of files) {
      const blob = await shrinkImage(f, edge, q);
      out.push({ name: f.name.replace(/\.\w+$/, "") + ".jpg", mimeType: "image/jpeg", dataB64: await blobToB64(blob) });
    }
    if (out.reduce((n, x) => n + x.dataB64.length, 0) <= MAX_PAYLOAD_B64) return out;
  }
  throw new Error("The photos are too large to send together. Use fewer pages or a lower camera resolution.");
}

const pct = (c: number) => `${Math.round(c * 100)}%`;

export function ScanPermitDialog({
  open, onOpenChange, plantId, plantName, areas, contractors, onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plantId: string;
  plantName?: string | null;
  areas: Option[];
  contractors: Option[];
  /** Fill the wizard with the reviewed draft; `files` are attached to the permit once it is created. */
  onApply: (draft: PtwDraft, files: File[], summary: { paperPermitNumber: string | null; flagged: number }) => void;
}) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [stage, setStage] = useState<"pick" | "reading" | "review">("pick");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OkResult | null>(null);
  const [draft, setDraft] = useState<PtwDraft>({});
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setPicked((p) => { p.forEach((x) => URL.revokeObjectURL(x.url)); return []; });
    setStage("pick"); setError(null); setResult(null); setDraft({}); setEdited(new Set());
  }, []);
  useEffect(() => { if (!open) reset(); }, [open, reset]);

  function addFiles(files: File[]) {
    const ok = files.filter((f) => ACCEPT.split(",").includes(f.type));
    let msg: string | null = ok.length < files.length ? "Only JPEG, PNG, WebP photos or a PDF can be read." : null;
    let next: Picked[] = [...picked, ...ok.map((f) => ({ file: f, url: URL.createObjectURL(f) }))];
    const pdfs = next.filter((p) => p.file.type === "application/pdf");
    if (pdfs.length && next.length > 1) {
      msg = "Send one PDF on its own, or up to four photos. Kept the PDF.";
      const keep = pdfs.slice(-1);
      next.filter((p) => !keep.includes(p)).forEach((p) => URL.revokeObjectURL(p.url));
      next = keep;
    }
    if (next.length > MAX_FILES) {
      msg = `Up to ${MAX_FILES} photos of one permit.`;
      next.slice(MAX_FILES).forEach((p) => URL.revokeObjectURL(p.url));
      next = next.slice(0, MAX_FILES);
    }
    setPicked(next);
    setError(msg);
  }

  async function read() {
    if (!picked.length) return;
    setStage("reading");
    setError(null);
    try {
      const files = await encodeForScan(picked.map((p) => p.file));
      const res = await fetch("/api/ptw/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantId, files }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "The scan could not be read"));
      const j = (await res.json()) as ScanResult;
      if (!j.ok) throw new Error(j.message);
      setResult(j);
      setDraft(j.draft);
      setStage("review");
    } catch (e: any) {
      setError(e?.message ?? "The scan could not be read");
      setStage("pick");
    }
  }

  const fieldByKey = useMemo(() => new Map((result?.fields ?? []).map((f) => [f.key, f])), [result]);
  const flagged = useMemo(
    () => (result?.fields ?? []).filter((f) => ["low", "unreadable", "unresolved"].includes(f.status) && !edited.has(f.key)).length,
    [result, edited]
  );

  function set<K extends keyof PtwDraft>(fieldKey: string, k: K, v: PtwDraft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
    setEdited((s) => new Set(s).add(fieldKey));
  }

  function apply() {
    if (!result) return;
    // The scan is read for the plant already chosen on the form; re-sending
    // plantId would make the form reset its area/department.
    const clean: PtwDraft = { ...draft };
    delete clean.plantId;
    // Empty strings from cleared inputs mean "leave the form's own value alone".
    (Object.keys(clean) as (keyof PtwDraft)[]).forEach((k) => {
      if (clean[k] === "" || clean[k] === undefined) delete clean[k];
    });
    onApply(clean, picked.map((p) => p.file), { paperPermitNumber: result.paperPermitNumber, flagged });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[92vh] overflow-y-auto", stage === "review" ? "max-w-6xl" : "max-w-xl")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine size={18} /> Scan paper permit</DialogTitle>
          <DialogDescription>
            {stage === "review"
              ? "Check what was read against the scan. Highlighted fields need your attention; everything stays editable on the form."
              : `Photograph each side of the filled-in permit (up to ${MAX_FILES} photos) or upload a PDF. It is read into a draft for ${plantName ?? "this plant"}; nothing is saved until you submit the form.`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}

        {stage !== "review" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={stage === "reading"}>
                <Upload size={14} /> Upload photos or PDF
              </Button>
              <Button type="button" variant="outline" onClick={() => setCameraOpen(true)} disabled={stage === "reading"}>
                <Camera size={14} /> Use camera
              </Button>
              <Input
                ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden"
                onChange={(e) => {
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  e.target.value = "";
                  if (files.length) addFiles(files);
                }}
              />
            </div>
            {picked.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {picked.map((p, i) => (
                  <div key={p.url} className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {p.file.type === "application/pdf" ? (
                      <div className="flex aspect-[3/4] flex-col items-center justify-center gap-1 p-2 text-center text-xs text-slate-600">
                        <FileText size={28} /> <span className="line-clamp-2 break-all">{p.file.name}</span>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt={`Page ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
                    )}
                    <Button
                      type="button" size="icon" variant="outline" className="absolute right-1 top-1 h-7 w-7"
                      aria-label="Remove" disabled={stage === "reading"}
                      onClick={() => setPicked((prev) => { URL.revokeObjectURL(p.url); return prev.filter((x) => x !== p); })}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {stage === "reading" && (
              <div className="flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-900">
                <Loader2 size={16} className="animate-spin" /> Reading the permit. This takes up to about 20 seconds.
              </div>
            )}
          </div>
        )}

        {stage === "review" && result && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="space-y-2 lg:sticky lg:top-0 lg:max-h-[75vh] lg:overflow-auto">
              {picked.map((p, i) => p.file.type === "application/pdf" ? (
                <iframe key={p.url} src={p.url} title="Scanned permit PDF" className="h-[70vh] w-full rounded-lg border" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.url} src={p.url} alt={`Scanned page ${i + 1}`} className="w-full rounded-lg border" />
              ))}
            </div>
            <div className="space-y-3">
              <Summary result={result} flagged={flagged} />
              <div className="grid gap-3 sm:grid-cols-2">
                <ReviewField f={fieldByKey.get("permitType")} edited={edited.has("permitType")} label="Permit type">
                  <Select value={draft.type ?? ""} onValueChange={(v) => set("permitType", "type", v || undefined)} aria-label="Permit type">
                    <SelectItem value="" disabled>Not read, pick one</SelectItem>
                    {PERMIT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </Select>
                </ReviewField>
                <ReviewField f={fieldByKey.get("area")} edited={edited.has("area")} label="Area">
                  <Select value={draft.areaId ?? ""} onValueChange={(v) => set("area", "areaId", v || null)} aria-label="Area">
                    <SelectItem value="">Not set</SelectItem>
                    {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </Select>
                </ReviewField>
                <ReviewField f={fieldByKey.get("validFrom")} edited={edited.has("validFrom")} label="Valid from">
                  <Input type="datetime-local" value={draft.validFrom ?? ""} onChange={(e) => set("validFrom", "validFrom", e.target.value || null)} />
                </ReviewField>
                <ReviewField f={fieldByKey.get("validTo")} edited={edited.has("validTo")} label="Valid to">
                  <Input type="datetime-local" value={draft.validTo ?? ""} onChange={(e) => set("validTo", "validTo", e.target.value || null)} />
                </ReviewField>
                <ReviewField f={fieldByKey.get("specificLocation")} edited={edited.has("specificLocation")} label="Exact location">
                  <Input value={draft.specificLocation ?? ""} maxLength={200} onChange={(e) => set("specificLocation", "specificLocation", e.target.value)} />
                </ReviewField>
                <ReviewField f={fieldByKey.get("workOrderNumber")} edited={edited.has("workOrderNumber")} label="Work order number">
                  <Input value={draft.workOrderNumber ?? ""} maxLength={60} onChange={(e) => set("workOrderNumber", "workOrderNumber", e.target.value)} />
                </ReviewField>
                <div className="sm:col-span-2">
                  <ReviewField f={fieldByKey.get("scopeOfWork")} edited={edited.has("scopeOfWork")} label="Scope of work">
                    <Textarea rows={3} value={draft.scopeOfWork ?? ""} maxLength={2000} onChange={(e) => set("scopeOfWork", "scopeOfWork", e.target.value)} />
                  </ReviewField>
                </div>
                <ReviewField f={fieldByKey.get("contractor")} edited={edited.has("contractor")} label="Contractor">
                  <Select value={draft.contractorCompanyId ?? ""} onValueChange={(v) => set("contractor", "contractorCompanyId", v || null)} aria-label="Contractor">
                    <SelectItem value="">None / own staff</SelectItem>
                    {contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </Select>
                </ReviewField>
                <ReviewField f={fieldByKey.get("department")} edited={false} label="Department">
                  <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                    {(fieldByKey.get("department")?.display as string) ?? "Pick on the form"}
                  </div>
                </ReviewField>
                {([
                  ["issuerName", "issuerId", "Issuer"],
                  ["receiverName", "receiverId", "Receiver"],
                  ["fireWatchName", "fireWatchPersonId", "Fire watch"],
                  ["standbyName", "standbyPersonId", "Standby person"],
                ] as const).map(([fk, dk, label]) => (
                  <ReviewField key={fk} f={fieldByKey.get(fk)} edited={edited.has(fk)} label={label}>
                    <UserPicker value={draft[dk] ?? null} onChange={(id) => set(fk, dk, id)} filter={{ plantId }} placeholder={`Pick the ${label.toLowerCase()}`} />
                  </ReviewField>
                ))}
              </div>
              <Lists result={result} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {stage === "review" ? (
            <>
              <Button type="button" variant="outline" onClick={reset}><RefreshCcw size={14} /> Scan again</Button>
              <Button type="button" onClick={apply}>Continue to permit form</Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" onClick={read} disabled={!picked.length || stage === "reading"}>
                {stage === "reading" ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />} Read the permit
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
      <PermitCameraDialog
        open={cameraOpen} onOpenChange={setCameraOpen}
        remaining={MAX_FILES - picked.filter((p) => p.file.type !== "application/pdf").length}
        onCapture={(files) => addFiles(files)}
      />
    </Dialog>
  );
}

function ReviewField({ f, edited, label, children }: { f?: ScanField; edited: boolean; label: string; children: React.ReactNode }) {
  const status = edited ? "edited" : f?.status ?? "blank";
  const tone =
    status === "unreadable" || status === "unresolved" ? "border-rose-300 bg-rose-50"
      : status === "low" ? "border-amber-300 bg-amber-50"
        : "border-transparent";
  const hint =
    status === "unreadable" ? "Written on the paper but could not be read"
      : status === "unresolved" ? f?.note ?? "Could not be matched"
        : status === "low" ? `Check this: read with ${pct(f?.confidence ?? 0)} confidence`
          : status === "ok" && f?.note ? f.note
            : status === "edited" ? "Edited by you"
              : null;
  return (
    <div className={cn("space-y-1 rounded-lg border p-2", tone)}>
      <Label className="text-xs font-medium text-slate-700">{label}</Label>
      {children}
      {f?.text && status !== "ok" && status !== "edited" && (
        <div className="text-[11px] text-slate-500">On the paper: &ldquo;{f.text}&rdquo;</div>
      )}
      {hint && (
        <div className={cn("text-[11px]", status === "unreadable" || status === "unresolved" ? "text-rose-700" : status === "low" ? "text-amber-800" : "text-slate-500")}>
          {hint}
        </div>
      )}
    </div>
  );
}

function Summary({ result, flagged }: { result: OkResult; flagged: number }) {
  return (
    <div className="space-y-2">
      <div className={cn("rounded-lg border px-3 py-2 text-sm",
        flagged ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>
        {flagged ? `${flagged} field${flagged === 1 ? "" : "s"} need checking before you continue.` : "Every field read was clear. Still compare it with the paper."}
        {result.paperPermitNumber && <span className="ml-1">Paper permit no. {result.paperPermitNumber}.</span>}
        {result.source.textOnly && <span className="ml-1">The PDF was read from its text layer only, so ticks and handwriting may be missing.</span>}
      </div>
      {result.warnings.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-lg border border-slate-200 bg-white py-2 pl-7 pr-3 text-xs text-slate-700">
          {result.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}

function Lists({ result }: { result: OkResult }) {
  const l = result.lists;
  const ppe = l.ppe.value.map((c) => PPE_CATALOG.find((p) => p.code === c)?.label ?? c);
  const crewUnmatched = result.unresolved.filter((u) => u.field === "crew");
  return (
    <div className="grid gap-2 text-xs sm:grid-cols-2">
      <Box title={`Crew (${l.crew.filter((c) => c.matchedName).length} of ${l.crew.length} matched)`}>
        {l.crew.length === 0 ? "None read." : l.crew.map((c) => (
          <div key={c.name} className={cn(!c.matchedName && "text-rose-700")}>
            {c.name}{c.matchedName && c.matchedName !== c.name ? ` → ${c.matchedName}` : ""}{!c.matchedName ? " (not found, add on the form)" : ""}
          </div>
        ))}
        {crewUnmatched.length > 0 && <div className="mt-1 text-slate-500">Contract workers without a user account are added on the form.</div>}
      </Box>
      <Box title={`Isolations (${l.isolations.length})`}>
        {l.isolations.length === 0 ? "None read." : l.isolations.map((i, n) => (
          <div key={n} className={cn(i.isolationPointTag === "TBC" && "text-amber-800")}>
            {i.isolationType.toLowerCase()}: {i.description} · tag {i.isolationPointTag}
          </div>
        ))}
      </Box>
      <Box title="PPE">{ppe.length ? ppe.join(", ") : "None read; the form keeps its defaults."}</Box>
      <Box title="Other hazards ticked">{l.extraHazards.value.length ? l.extraHazards.value.map((h) => h.replace(/_/g, " ").toLowerCase()).join(", ") : "None."}</Box>
      {l.gasReadings.length > 0 && (
        <Box title="Gas readings on the paper (for reference, not recorded)">
          {l.gasReadings.map((g) => `${g.parameter} ${g.value}${g.unit}`).join(" · ")}
        </Box>
      )}
      <Box title="Precaution checklist">Not read from paper. Answer it on the form after checking on site.</Box>
      {result.notes && <Box title="Reader's note">{result.notes}</Box>}
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <div className="mb-0.5 font-semibold text-slate-700">{title}</div>
      <div className="text-slate-600">{children}</div>
    </div>
  );
}

// Camera capture: same pattern as components/copilot/camera-capture-dialog.tsx
// (copied, not shared, because that file belongs to the copilot stream), but
// takes several shots in a row since a permit has a front, back and annexures.
type Facing = "environment" | "user";

function PermitCameraDialog({
  open, onOpenChange, onCapture, remaining,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCapture: (files: File[]) => void; remaining: number }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackRef = useRef<HTMLInputElement | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [state, setState] = useState<"starting" | "live" | "unavailable">("starting");
  const [shots, setShots] = useState<{ url: string; file: File }[]>([]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState("starting");
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) { setState("unavailable"); return; }
    media.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setState("live");
      })
      .catch(() => { if (!cancelled) setState("unavailable"); });
    return () => { cancelled = true; stopStream(); };
  }, [open, facing, stopStream]);

  useEffect(() => {
    if (open) return;
    stopStream();
    setShots((s) => { s.forEach((x) => URL.revokeObjectURL(x.url)); return []; });
  }, [open, stopStream]);

  const takeShot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || shots.length >= remaining) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `permit-page-${Date.now()}.jpg`, { type: "image/jpeg" });
      setShots((s) => [...s, { url: URL.createObjectURL(blob), file }]);
    }, "image/jpeg", 0.92);
  };

  const done = () => {
    if (shots.length) onCapture(shots.map((s) => s.file));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Photograph the permit</DialogTitle>
          <DialogDescription>Lay the sheet flat in good light, fill the frame, and take one photo per side.</DialogDescription>
        </DialogHeader>
        <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-slate-900 sm:aspect-[4/3]">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          {state === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-200">
              <Loader2 size={16} className="animate-spin" /> Opening the camera…
            </div>
          )}
          {state === "unavailable" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-200">
              <span>The camera couldn&apos;t be opened here. Use your device camera instead.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => fallbackRef.current?.click()}>
                <Camera size={14} /> Open device camera
              </Button>
            </div>
          )}
        </div>
        {shots.length > 0 && (
          <div className="flex gap-2">
            {shots.map((s, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={s.url} src={s.url} alt={`Shot ${i + 1}`} className="h-16 w-12 rounded border object-cover" />
            ))}
          </div>
        )}
        <Input
          ref={fallbackRef} type="file" accept="image/*" className="hidden"
          {...({ capture: "environment" } as Record<string, string>)}
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (files.length) { onCapture(files); onOpenChange(false); }
          }}
        />
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" disabled={state !== "live"}
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}>
            <SwitchCamera size={14} /> Switch camera
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={takeShot} disabled={state !== "live" || shots.length >= remaining}>
              <Camera size={14} /> Capture{shots.length ? ` (${shots.length})` : ""}
            </Button>
            <Button type="button" onClick={done} disabled={!shots.length}>Use {shots.length || ""} photo{shots.length === 1 ? "" : "s"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
