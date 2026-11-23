// Knowledge Bank client helpers: types, labels and a fetch wrapper for /api/kb/*
// (proxied to the Python backend by src/app/api/[...path]/route.ts).
// Types mirror the serialisers in app/routers/knowledge_bank.py.

import { readApiError } from "@/lib/client-errors";

export async function kbFetch<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
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

const LABEL_OVERRIDES: Record<string, string> = {
  SOP: "SOP",
  LEGAL_STATUTORY: "Legal / statutory",
  FORM_FORMAT: "Form / format",
  UNDER_REVIEW: "Under review",
  DUE_SOON: "Review due soon",
  OVERDUE: "Review overdue",
};

export function label(code: string | null | undefined): string {
  if (!code) return "—";
  if (LABEL_OVERRIDES[code]) return LABEL_OVERRIDES[code];
  const s = code.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return withTime
    ? d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** yyyy-mm-dd (for <Input type="date">) → ISO at local noon, so no timezone shifts the day. */
export function dateToIso(v: string): string {
  return new Date(`${v}T12:00`).toISOString();
}

export function isoToDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  UNDER_REVIEW: "bg-amber-100 text-amber-800 border-amber-200",
  PUBLISHED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  OBSOLETE: "bg-rose-100 text-rose-800 border-rose-200",
  SUPERSEDED: "bg-slate-100 text-slate-500 border-slate-200",
  DISCARDED: "bg-slate-100 text-slate-400 border-slate-200",
  OVERDUE: "bg-rose-100 text-rose-800 border-rose-200",
  DUE_SOON: "bg-amber-100 text-amber-800 border-amber-200",
};

// ── types ────────────────────────────────────────────────────────────────────
export type KbCategory = {
  id: string; code: string; name: string; parentId: string | null; description: string | null; icon: string | null;
  sortOrder: number; isActive: boolean; documentCount?: number;
};

export type PlantOption = { id: string; code: string; name: string };

export type KbMeta = {
  docTypes: string[];
  docStatuses: string[];
  versionStatuses: string[];
  standardFamilies: string[];
  categories: KbCategory[];
  plants: PlantOption[];
  departments: string[];
  roles: { code: string; name: string }[];
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  maxFileBytes: number;
  caps: { manage: boolean; manageAllPlants: boolean; approve: boolean; approveAllPlants: boolean; staffPlantIds: string[] | null };
  aiAvailable: boolean;
};

export type KbVersion = {
  id: string; documentId: string; versionNo: number; status: string; fileName: string; mimeType: string;
  sizeBytes: number; extractionStatus: string; changeNote: string | null; reviewNote: string | null;
  uploadedBy: string; uploadedByName: string | null; uploadedAt: string | null; submittedAt: string | null;
  submittedByName: string | null; publishedAt: string | null; publishedByName: string | null; viewable: boolean;
};

export type KbDocument = {
  id: string; docNo: string; title: string; summary: string | null; categoryId: string; categoryName: string | null;
  docType: string; standardRef: string | null; department: string | null; plantId: string | null; plantName: string | null;
  companyWide: boolean; ownerUserId: string; ownerName: string | null; tags: string[]; status: string;
  currentVersionId: string | null; effectiveDate: string | null; reviewDueDate: string | null; reviewIntervalMonths: number;
  reviewState: string | null; lastReviewedAt: string | null; lastReviewedByName: string | null;
  ackRequired: boolean; audienceRoles: string[]; viewCount: number; publishedAt: string | null;
  obsoletedAt: string | null; obsoleteReason: string | null; supersededByDocId: string | null; updatedAt: string | null;
  currentVersion: KbVersion | null; pendingVersion: KbVersion | null; snippet?: string | null;
};

export type KbDocumentDetail = KbDocument & {
  versions: KbVersion[];
  myAcknowledgement: { acknowledgedAt: string; versionId: string } | null;
  appliesToMe: boolean;
  supersededBy?: { id: string; docNo: string; title: string } | null;
  permissions: { manage: boolean; approve: boolean; viewAckReport: boolean };
  ackCount?: number;
};

export type KbSearchResult = { items: KbDocument[]; total: number; limit: number; offset: number; matchMode: string | null };

export type KbHome = {
  recent: KbDocument[]; mostViewed: KbDocument[]; publishedCount: number; myPendingAcks: number;
  reviewDueCount?: number; awaitingReviewCount?: number;
};

export type AckReport = {
  documentId: string; docNo: string; versionId: string; versionNo: number | null; ackRequired: boolean; audienceRoles: string[];
  summary: { audience: number; acknowledged: number; pending: number; percent: number | null };
  byPlant: { plantId: string | null; plantName: string; total: number; acknowledged: number }[];
  byDepartment: { department: string; total: number; acknowledged: number }[];
  rows: { userId: string; name: string; plantId: string | null; plantName: string | null; department: string | null; role: string | null; acknowledged: boolean; acknowledgedAt: string | null }[];
  truncated: boolean;
};

export type KbCitation = {
  ref: string; documentId: string; docNo: string; title: string; versionId: string; versionNo: number; page: number | null;
  quote: string | null; quoteVerified: boolean; label: string; href: string;
};

export type KbPassage = { ref: string; documentId: string; docNo: string; title: string; versionNo: number; page: number | null; text: string; href: string };

export type KbAnswer = {
  question: string; mode: "answer" | "passages" | "none"; covered: boolean; answer: string | null; message?: string;
  citations: KbCitation[]; sources: { documentId: string; docNo: string; title: string; versionNo: number; href: string }[];
  passages: KbPassage[]; aiAvailable: boolean;
};

export type MyAcks = {
  pending: KbDocument[];
  acknowledged: { documentId: string; docNo: string; title: string; status: string; versionId: string; versionNo: number; acknowledgedAt: string; isCurrentVersion: boolean }[];
};

/** Category options in tree order, indented by depth, for a flat dropdown. */
export function categoryOptions(cats: KbCategory[]): { id: string; label: string }[] {
  const byParent = new Map<string | null, KbCategory[]>();
  for (const c of cats) {
    const k = c.parentId && cats.some((x) => x.id === c.parentId) ? c.parentId : null;
    byParent.set(k, [...(byParent.get(k) ?? []), c]);
  }
  const out: { id: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const c of (byParent.get(parent) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))) {
      out.push({ id: c.id, label: `${"— ".repeat(depth)}${c.name}` });
      if (depth < 6) walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Upload one file as a new version: signed URL → browser PUT → register. */
export async function uploadVersion(docId: string, file: File, changeNote?: string): Promise<KbDocumentDetail> {
  const init = await kbFetch<{ uploadUrl: string; storagePath: string; mimeType: string }>(
    `/api/kb/documents/${docId}/upload-url`,
    { method: "POST", json: { fileName: file.name, mimeType: file.type || "", sizeBytes: file.size } }
  );
  const put = await fetch(init.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": init.mimeType || file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) throw new Error(`Storage upload failed (${put.status})`);
  return kbFetch<KbDocumentDetail>(`/api/kb/documents/${docId}/versions`, {
    method: "POST",
    json: { storagePath: init.storagePath, fileName: file.name, mimeType: init.mimeType, changeNote: changeNote || null },
  });
}

export async function openVersion(docId: string, versionId: string, download = false): Promise<void> {
  const r = await kbFetch<{ url: string }>(`/api/kb/documents/${docId}/versions/${versionId}/url${download ? "?download=true" : ""}`);
  window.open(r.url, "_blank", "noopener,noreferrer");
}
