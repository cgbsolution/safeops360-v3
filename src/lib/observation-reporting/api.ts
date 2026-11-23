// Snap & Report + Live observation dashboard: client types and helpers for
// /api/observations/snap-context, /snap-analyze and /live (proxied to the Python
// backend by src/app/api/[...path]/route.ts). The observation itself is created
// through the ordinary POST /api/observations and its photo through the
// ordinary /api/observations/{id}/attachments two-phase upload.

import { readApiError } from "@/lib/client-errors";

export type ObsType = "UNSAFE_ACT" | "UNSAFE_CONDITION" | "SAFE_ACT" | "SAFE_CONDITION";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const OBS_TYPES: { value: ObsType; label: string }[] = [
  { value: "UNSAFE_CONDITION", label: "Unsafe condition" },
  { value: "UNSAFE_ACT", label: "Unsafe act" },
  { value: "SAFE_ACT", label: "Safe act" },
  { value: "SAFE_CONDITION", label: "Safe condition" },
];
export const SEVERITIES: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const isAtRisk = (t: string) => t === "UNSAFE_ACT" || t === "UNSAFE_CONDITION";
export const axisOf = (t: string) => (t.endsWith("_ACT") ? "ACT" : "CONDITION");

export type SnapContext = {
  plants: { id: string; code: string; name: string }[];
  plantId: string | null;
  areas: { id: string; name: string }[];
  nearest: NearestArea | null;
  aiEnabled: boolean;
  minAtRiskDescription: number;
  hazardCategories: string[];
};

export type NearestArea = { areaId: string; areaName: string; distanceMetres: number; basis: string };

export type SnapSuggestion = {
  observationType: ObsType;
  categoryCode: string | null;
  subCategoryCode: string | null;
  category: string | null;
  categoryLabel?: string;
  subCategoryLabel?: string;
  severity: Severity;
  aiSeverity: Severity;
  matrixSeverity: Severity | null;
  matrixRationale: string | null;
  title: string;
  description: string;
  likelyHazard: string;
  immediateAction: string;
  composedDescription: string;
  lowConfidence: boolean;
};

export type SnapAnalyzeResponse =
  | { ok: true; suggestion: SnapSuggestion; nearest: NearestArea | null }
  | { ok: false; reason: string; nearest: NearestArea | null };

export async function apiJson<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readApiError(res, "Request failed"));
  return (await res.json()) as T;
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Downscale a camera photo to a JPEG (long edge ≤ maxEdge). Phone photos are
 *  4-12 MB; the AI call and the proxy want well under 4 MB. Falls back to the
 *  original file when the browser cannot decode it (e.g. HEIC on desktop). */
export async function compressPhoto(file: File, maxEdge = 1600, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(bin);
}

/** Two-phase observation photo upload (same contract as
 *  components/observations/upload-helper.ts) carrying the GPS fix the page
 *  captured, which camera-captured browser photos usually lack in EXIF. That
 *  GPS is also what later teaches "nearest area" for the plant. */
export async function uploadSnapPhoto(
  observationId: string,
  blob: Blob,
  gps: { lat: number; lng: number; accuracy?: number } | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const fileName = `snap-${Date.now()}.jpg`;
    const mimeType = blob.type || "image/jpeg";
    const init = await apiJson<{ attachmentId: string; uploadUrl: string }>(`/api/observations/${observationId}/attachments`, {
      method: "POST",
      json: { phase: "init", category: "INITIAL_PHOTO", fileName, fileSize: blob.size, mimeType },
    });
    const put = await fetch(init.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: blob });
    if (!put.ok) return { ok: false, error: `Photo upload failed (${put.status})` };
    await apiJson(`/api/observations/${observationId}/attachments`, {
      method: "POST",
      json: {
        phase: "complete",
        attachmentId: init.attachmentId,
        caption: "Snap & Report photo",
        exifData: { source: "snap-report", takenAt: new Date().toISOString(), ...(gps ? { gps } : {}) },
      },
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Photo upload failed" };
  }
}

// ── last-used area, per user, on this device ────────────────────────────────
const AREA_KEY = (userId: string) => `safeops:snap:lastArea:${userId}`;

export function readLastArea(userId: string | null | undefined): { plantId: string; areaId: string } | null {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(AREA_KEY(userId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.plantId === "string" && typeof v.areaId === "string" ? v : null;
  } catch {
    return null;
  }
}

export function writeLastArea(userId: string | null | undefined, plantId: string, areaId: string) {
  if (!userId || !plantId || !areaId) return;
  try {
    window.localStorage.setItem(AREA_KEY(userId), JSON.stringify({ plantId, areaId }));
  } catch {
    /* private mode: nothing to remember */
  }
}

// ── live dashboard ──────────────────────────────────────────────────────────
export type Bucket = { key: string | null; label: string; count: number };

export type LiveDashboard = {
  generatedAt: string;
  windowDays: number;
  window: { start: string; end: string };
  counts: { today: number; week: number; mtd: number; window: number };
  backlog: { open: number; closed: number; overdue: number; byStatus: Record<string, number> };
  closure: {
    closedInWindow: number;
    reportedInWindow: number;
    closureRate: number | null;
    closedByDateInWindow: number;
    onTimeRate: number | null;
  };
  actVsCondition: { unsafeAct: number; unsafeCondition: number; safeAct: number; safeCondition: number };
  byType: Bucket[];
  bySeverity: Bucket[];
  byCategory: Bucket[];
  byArea: Bucket[];
  byDepartment: Bucket[];
  topReporters: Bucket[];
  trend: { date: string; reported: number; closed: number; unsafe: number }[];
  latest: {
    id: string;
    number: string;
    createdAt: string | null;
    type: string;
    severity: string;
    status: string;
    categoryCode: string | null;
    categoryLabel: string;
    description: string;
    areaName: string | null;
    plantName: string | null;
    observerName: string | null;
    photoAttachmentId: string | null;
  }[];
  plantId: string | null;
};

export function humanize(code: string | null | undefined): string {
  if (!code) return "—";
  const s = code.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
