// Process safety (PSSR + PSI / Chem advisor) client helpers: types, labels and a
// fetch wrapper for /api/pssr/* and /api/psi/* (proxied to the Python backend
// by src/app/api/[...path]/route.ts). Types mirror app/routers/pssr.py and
// app/routers/psi.py serialisers.

import { readApiError } from "@/lib/client-errors";

export type PlantOption = { id: string; code: string; name: string };

export async function psFetch<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
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
  APPROVED_GO: "Approved: GO",
  NO_GO: "No-go",
  PENDING_APPROVAL: "Pending sign-off",
  RESTART_AFTER_SHUTDOWN: "Restart after shutdown",
  NEW_FACILITY: "New facility",
  PLANT_HEAD: "Plant Head",
  PID: "P&ID",
  PFD: "PFD",
  SDS: "SDS",
  DUE_SOON: "Due soon",
  NA: "N/A",
  MATERIAL_AND_ENERGY_BALANCE: "Material & energy balance",
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

/** yyyy-mm-dd for <Input type="date"> from an ISO string (local date). */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** <Input type="date"> value → ISO (noon local, so the date never shifts across time zones). */
export function dateInputToIso(v: string): string | null {
  if (!v) return null;
  return new Date(`${v}T12:00:00`).toISOString();
}

export const TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  IN_PROGRESS: "bg-sky-100 text-sky-800 border-sky-200",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED_GO: "bg-emerald-100 text-emerald-800 border-emerald-200",
  NO_GO: "bg-rose-100 text-rose-800 border-rose-200",
  CLOSED: "bg-slate-200 text-slate-700 border-slate-300",
  OPEN: "bg-amber-100 text-amber-800 border-amber-200",
  YES: "bg-emerald-100 text-emerald-800 border-emerald-200",
  NO: "bg-rose-100 text-rose-800 border-rose-200",
  NA: "bg-slate-100 text-slate-600 border-slate-200",
  A: "bg-rose-100 text-rose-800 border-rose-200",
  B: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECT: "bg-rose-100 text-rose-800 border-rose-200",
  CURRENT: "bg-emerald-100 text-emerald-800 border-emerald-200",
  SUPERSEDED: "bg-slate-100 text-slate-500 border-slate-200",
  DUE_SOON: "bg-amber-100 text-amber-800 border-amber-200",
  EXPIRED: "bg-rose-100 text-rose-800 border-rose-200",
  MISSING: "bg-rose-100 text-rose-800 border-rose-200",
  DANGER: "bg-rose-100 text-rose-800 border-rose-200",
  WARNING: "bg-amber-100 text-amber-800 border-amber-200",
  NONE: "bg-slate-100 text-slate-500 border-slate-200",
  COMPATIBLE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CAUTION: "bg-amber-100 text-amber-800 border-amber-200",
  INCOMPATIBLE: "bg-rose-100 text-rose-800 border-rose-200",
  OVERDUE: "bg-rose-100 text-rose-800 border-rose-200",
};

// ── PSSR ─────────────────────────────────────────────────────────────────────
export type PssrMeta = {
  triggers: string[];
  statuses: string[];
  responses: string[];
  punchCategories: string[];
  punchStatuses: string[];
  decisions: string[];
  disciplines: string[];
  disciplineLabels: Record<string, string>;
  mandatoryDisciplines: string[];
};

export type PssrCounts = { total?: number; answered?: number; punchAOpen?: number; punchBOpen?: number; [k: string]: number | undefined };

export type PssrReviewRow = {
  id: string; pssrNo: string; plantId: string; plantName: string | null; area: string | null; unit: string | null;
  title: string; scope: string | null; trigger: string; mocId: string | null; mocNumber: string | null;
  phaStudyId: string | null; templateId: string | null; plannedStartupDate: string | null; actualStartupDate: string | null;
  leaderId: string; leaderName: string | null; teamUserIds: string[]; team: { id: string; name: string }[];
  requiredDisciplines: string[]; status: string; submittedAt: string | null; decidedAt: string | null;
  noGoReason: string | null; closedAt: string | null; closedByName: string | null; reopenCount: number;
  lastReopenReason: string | null; lastReopenedAt: string | null; createdAt: string | null; counts: PssrCounts;
};

export type PssrItem = {
  id: string; reviewId: string; section: string; sectionOrder: number; itemOrder: number; question: string;
  guidance: string | null; discipline: string; defaultPunchCategory: string; response: string | null; remarks: string | null;
  verifiedById: string | null; verifiedByName: string | null; verifiedAt: string | null; isPunch: boolean;
  punchCategory: string | null; punchDescription: string | null; punchStatus: string | null; punchOwnerId: string | null;
  punchOwnerName: string | null; punchDueDate: string | null; punchClosedAt: string | null; punchClosedByName: string | null;
  punchClosureNote: string | null; punchComplete: boolean; punchOverdue: boolean; capaId: string | null; capaNumber: string | null;
  // punch-list view extras
  pssrNo?: string; reviewTitle?: string; reviewStatus?: string; plantId?: string;
};

export type SignoffRow = {
  discipline: string; label: string; required: boolean; decision: string | null; userId: string | null;
  userName?: string | null; comment: string | null; signedAt: string | null;
};

export type PssrGate = {
  decision: "GO" | "NO_GO" | "PENDING"; blockers: string[]; noGoReason: string | null; openA: number; openB: number;
  missingSignoffs: string[];
  summary: { total: number; answered: number; yes: number; no: number; na: number; unanswered: number;
    punchAOpen: number; punchAClosed: number; punchBOpen: number; punchBClosed: number; punchIncomplete: number };
};

export type PssrDetail = PssrReviewRow & {
  items: PssrItem[];
  signoffs: SignoffRow[];
  signoffHistory: { id: string; discipline: string; decision: string; userName: string | null; comment: string | null; signedAt: string | null; isCurrent: boolean }[];
  gate: PssrGate;
  submitBlockers: string[];
  closeBlockers: string[];
  permissions: { canManage: boolean; onTeam: boolean; canEdit: boolean; canSignoff: boolean };
};

export type MocCandidate = {
  id: string; number: string; title: string; plantId: string; status: string; pssrRequired: boolean;
  classification: string | null; proposedImplementationDate: string | null; targetCompletionDate: string | null;
  linkedPssr: { id: string; pssrNo: string; status: string } | null;
};

export type PssrTemplate = {
  id: string; code: string; name: string; description: string | null; plantId: string | null; plantName: string | null;
  isDefault: boolean; isActive: boolean; itemCount: number; updatedAt: string | null;
  items?: { id: string; section: string; sectionOrder: number; itemOrder: number; question: string; guidance: string | null;
    discipline: string; defaultPunchCategory: string }[];
};

export type PssrByMoc = {
  mocId: string; reviews: PssrReviewRow[]; latest: PssrReviewRow | null; pssrComplete: boolean;
  outcome: "GO" | "NO_GO" | null; message: string | null;
};

// ── PSI ──────────────────────────────────────────────────────────────────────
export type PsiMeta = {
  docTypes: string[]; docTypeLabels: Record<string, string>; docStatuses: string[]; requiredUnitDocTypes: string[];
  sdsStatuses: string[]; sdsReviewYears: number; hazardGroups: Record<string, string>; verdicts: string[]; signalWords: string[];
};

export type Chemical = {
  id: string; chemicalName: string; casNumber: string | null; plantId: string; plantName: string | null;
  factoryProfileId: string; facilityName: string | null; hazmatClassification: string | null;
  ghsSignalWord: string | null; ghsHazardClasses: string[]; ghsPictograms: string[]; hazardGroups: string[];
  hazardGroupLabels: string[]; quantityStored: number | null; unit: string | null; maxAllowableQty: number | null;
  overMax: boolean; utilisationPct: number | null; storage: string | null; containerType: string | null;
  secondaryContainmentPresent: boolean; ventilationAvailable: boolean; ppeRequired: string[];
  incompatibleSubstances: string[]; spillKitLocation: string | null; emergencyContact: string | null;
  sdsDocId: string | null; sdsVersion: string | null; sdsStatus: string;
  sdsDocument: { id: string; docNo: string; revision: string; hasFile: boolean; issuedDate: string | null; reviewDue: string | null } | null;
  sdsHistory?: PsiDocument[];
};

export type ChemicalList = {
  items: Chemical[]; total: number; registerTotal: number;
  summary: { sdsMissing: number; sdsExpired: number; sdsDueSoon: number; overMax: number; danger: number; noContainment: number };
  facets: { ghsClasses: string[]; storageLocations: string[]; hazardGroups: string[] };
};

export type CompatReason = { ruleId: string; verdict: string; reason: string; advice: string };
export type CompatMatrix = {
  chemicals: { id: string; name: string; casNumber: string | null; hazardGroups: string[]; hazardGroupLabels: string[];
    storage?: string | null; facilityName?: string | null }[];
  cells: (string | null)[][];
  pairs: { a: string; b: string; aName: string; bName: string; verdict: string; reasons: CompatReason[] }[];
  worst: string | null;
  disclaimer: string;
};

export type PsiDocument = {
  id: string; plantId: string; plantName: string | null; unitArea: string | null; docType: string; docTypeLabel: string;
  docNo: string; revision: string; title: string; description: string | null; hazardousMaterialId: string | null;
  chemicalName: string | null; status: string; supersedesId: string | null; issuedDate: string | null; reviewDue: string | null;
  reviewOverdue: boolean; hasFile: boolean; fileName: string | null; fileSize: number | null; mimeType: string | null;
  fileUploadedAt: string | null; uploadedByName: string | null; createdAt: string | null; createdByName: string | null;
  history?: PsiDocument[];
};

export type CompletenessUnit = {
  unitArea: string; required: number; present: number; percent: number; missing: string[]; reviewOverdue: number;
  otherDocs: number;
  cells: { docType: string; label: string; present: boolean; count: number; withFile: number; reviewOverdue: boolean;
    docs: { id: string; docNo: string; revision: string }[] }[];
};

export type Completeness = {
  plants: { plantId: string; plantName: string | null; units: CompletenessUnit[]; overallPercent: number }[];
  requiredDocTypes: { docType: string; label: string }[];
};

export type AdvisorAnswer = {
  question: string; answer: string; mode: string; aiUsed: boolean; generalGuidance: boolean;
  citations: { id: string; chemicalName: string; casNumber: string | null; storage: string | null; facilityName: string | null;
    sds: { docNo: string; revision: string; status: string; reviewDue: string | null } | null }[];
  compatibility: CompatMatrix | null; topics: string[]; unmatched: string[]; followUps: string[]; disclaimer: string;
};

/** Two-phase upload of a PSI document revision's file (init -> PUT -> complete). */
export async function uploadPsiFile(docId: string, file: File): Promise<PsiDocument> {
  const init = await psFetch<{ uploadUrl: string }>(`/api/psi/documents/${docId}/file`, {
    method: "POST",
    json: { phase: "init", fileName: file.name, fileSize: file.size, mimeType: file.type || "application/octet-stream" },
  });
  const put = await fetch(init.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) throw new Error(`Storage upload failed (${put.status})`);
  return psFetch<PsiDocument>(`/api/psi/documents/${docId}/file`, { method: "POST", json: { phase: "complete" } });
}

export async function openPsiFile(docId: string): Promise<void> {
  const { url } = await psFetch<{ url: string }>(`/api/psi/documents/${docId}/download`);
  window.open(url, "_blank", "noopener,noreferrer");
}
