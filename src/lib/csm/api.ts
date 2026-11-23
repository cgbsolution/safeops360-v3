// Contractor Safety Management (CSM) client helpers: types mirroring
// app/routers/csm*.py serialisers, labels and a fetch wrapper for /api/csm/*
// (proxied to the Python backend by src/app/api/[...path]/route.ts).

import { readApiError } from "@/lib/client-errors";

export type PlantOption = { id: string; code: string; name: string };

export async function csmFetch<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
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
  HSE_REVIEW: "HSE review",
  APPROVAL: "Awaiting approval",
  PPE_NON_COMPLIANCE: "PPE non-compliance",
  LTI_FATALITY: "LTI / fatality",
  TBT_PARTICIPATION: "TBT participation",
  ISO_45001: "ISO 45001",
  ISO_14001: "ISO 14001",
  PF_REGISTRATION: "PF registration",
  ESIC_REGISTRATION: "ESIC registration",
  WC_INSURANCE: "WC / EC insurance",
  HSE_POLICY: "HSE policy",
  HSE_PLAN: "HSE plan",
  GST_PAN: "GST / PAN",
  AMC: "AMC",
  YES_NO: "Yes / No",
  SCALE_1_5: "Scale 1-5",
  DOCUMENT_REQUIRED: "Document",
  NOT_QUALIFIED: "Not qualified",
  PENDING_APPROVAL: "Pending approval",
  SIGNED_OFF: "Signed off",
  CONTRACT_END: "Contract end",
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

/** <Input type="date"> value → ISO at local midnight. */
export function dateToIso(v: string): string | null {
  return v ? new Date(`${v}T00:00:00`).toISOString() : null;
}

/** ISO → <Input type="date"> value. */
export function isoToDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  SUBMITTED: "bg-sky-100 text-sky-800 border-sky-200",
  HSE_REVIEW: "bg-indigo-100 text-indigo-800 border-indigo-200",
  APPROVAL: "bg-amber-100 text-amber-800 border-amber-200",
  QUALIFIED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CONDITIONAL: "bg-lime-100 text-lime-800 border-lime-200",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-200",
  WITHDRAWN: "bg-slate-100 text-slate-500 border-slate-200",
  EXPIRED: "bg-rose-100 text-rose-800 border-rose-200",
  NOT_QUALIFIED: "bg-slate-100 text-slate-600 border-slate-200",
  ACTIVE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  SUSPENDED: "bg-orange-100 text-orange-800 border-orange-200",
  BLACKLISTED: "bg-rose-200 text-rose-900 border-rose-300",
  COMPLETED: "bg-slate-100 text-slate-700 border-slate-200",
  CANCELLED: "bg-slate-100 text-slate-500 border-slate-200",
  PROPOSED: "bg-sky-100 text-sky-800 border-sky-200",
  CLEARED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  BLOCKED: "bg-rose-100 text-rose-800 border-rose-200",
  RELEASED: "bg-slate-100 text-slate-500 border-slate-200",
  SIGNED_OFF: "bg-emerald-100 text-emerald-800 border-emerald-200",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  RETIRED: "bg-slate-100 text-slate-500 border-slate-200",
  DUE: "bg-amber-100 text-amber-800 border-amber-200",
  OK: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MISSING: "bg-rose-100 text-rose-800 border-rose-200",
  EXCELLENT: "bg-emerald-100 text-emerald-800 border-emerald-200",
  GOOD: "bg-lime-100 text-lime-800 border-lime-200",
  AVERAGE: "bg-amber-100 text-amber-800 border-amber-200",
  POOR: "bg-orange-100 text-orange-800 border-orange-200",
  UNACCEPTABLE: "bg-rose-200 text-rose-900 border-rose-300",
};

// ── types ────────────────────────────────────────────────────────────────────
export type CsmMeta = {
  answerTypes: string[];
  prequalStatuses: string[];
  decisions: string[];
  docTypes: string[];
  companyStatuses: string[];
  workTypes: string[];
  highRiskActivities: string[];
  safetyChecklist: { key: string; label: string }[];
  supervisorRatioMax: number;
  workOrderStatuses: string[];
  evaluationTypes: string[];
  evaluationStatuses: string[];
  kpis: { code: string; label: string; weight: number; perEvent?: number }[];
  manualCriteria: { code: string; label: string; weight: number }[];
  ratingBands: { min: number; band: string }[];
  sanctionActions: string[];
  sanctionReasons: string[];
  templateStatuses: string[];
};

export type Question = {
  code: string;
  text: string;
  answerType: string;
  weight?: number;
  critical?: boolean;
  required?: boolean;
  help?: string | null;
  docType?: string | null;
  preferredAnswer?: string;
  bands?: { max: number | null; score: number }[];
};
export type Section = { code: string; title: string; weight?: number; questions: Question[] };
export type Answer = { value: string | number | null; comment?: string | null };

export type Contractor = {
  id: string; name: string; code: string | null; tradeName: string | null; status: string; score: number;
  panNumber: string | null; gstNumber: string | null; registrationNumber: string | null; tradeCategories: string[];
  sizeCategory: string | null; contactPerson: string | null; contactEmail: string | null; contactPhone: string | null;
  representativeName: string | null; representativePhone: string | null; representativeEmail: string | null;
  safetyOfficerName: string | null; safetyOfficerPhone: string | null; prequalificationStatus: string;
  prequalificationScore: number | null; prequalificationValidUntil: string | null; qualification: string;
  blockReason: string | null; suspensionHistory: Record<string, any>[];
  activeWorkOrders?: number; openApplicationStatus?: string | null;
  lastEvaluation?: { finalScore: number | null; ratingBand: string | null; periodEnd: string | null } | null;
};

export type PrequalRow = {
  id: string; applicationNo: string; contractorCompanyId: string; contractorName: string | null; plantId: string;
  plantName: string | null; status: string; autoScore: number | null; finalScore: number | null;
  criticalFailureCount: number; recommendation: string | null; decision: string | null; validUntil: string | null;
  isCurrent: boolean; isRenewal: boolean; submittedVia: string | null; submittedAt: string | null;
  decidedAt: string | null; createdAt: string | null; templateName: string | null; templateVersion: number | null;
};

export type ScoreQuestion = { code: string; auto: number | null; final: number | null; overridden: boolean; answered: boolean; weight: number; critical: boolean };
export type Scoring = {
  sections: { code: string; title: string; weight: number; autoScore: number | null; finalScore: number | null; questions: ScoreQuestion[] }[];
  autoScore: number | null; finalScore: number | null;
  criticalFailures: { code: string; text: string; section: string }[];
  unanswered: string[]; missingDocuments: string[]; autoRecommendation: string | null;
};

export type CsmDocument = {
  id: string; contractorCompanyId: string; prequalificationId: string | null; questionCode: string | null; docType: string;
  title: string | null; documentNo: string | null; fileName: string; mimeType: string | null; fileSize: number | null;
  issuedOn: string | null; expiresOn: string | null; state: string | null; status: string; uploadedVia: string;
  uploadedByName: string | null; verifiedAt: string | null; createdAt: string | null;
};

export type HistoryEntry = { at: string; byId: string | null; byName: string | null; from: string | null; to: string; note: string | null };

export type PrequalDetail = PrequalRow & {
  contractor: Contractor | null;
  template: { name: string; version: number; sections: Section[]; passScore: number; conditionalScore: number; validityMonths: number; conditionalValidityMonths: number };
  answers: Record<string, Answer>;
  overrides: Record<string, { score: number; reason: string; byName?: string | null; at: string }>;
  scoring: Scoring;
  criticalFailures: { code: string; text: string }[];
  reviewNotes: string | null; conditions: string | null; decisionNotes: string | null; validFrom: string | null;
  reviewerName: string | null; recommendedByName: string | null; recommendedById: string | null; recommendedAt: string | null;
  decidedByName: string | null; submittedByName: string | null; history: HistoryEntry[]; documents: CsmDocument[];
  portal: { live: boolean; expiresAt: string | null; contactEmail: string | null; lastAccessedAt: string | null };
};

export type Worker = {
  id: string; workerCode: string; fullName: string; primaryTrade: string | null; mobileNumber: string | null;
  overallStatus: string; rosterStatus: string; currentMedicalValidUntil: string | null; medicalState: string;
};

export type ClearanceCheck = { result: "pass" | "warn" | "fail"; detail: string };
export type Clearance = { checks: Record<string, ClearanceCheck>; overall: string; blocking: string[]; warnings: string[]; passValidUntil: string | null; note?: string };

export type RosterRow = {
  id: string; contractorWorkerId: string; workerCode: string; fullName: string; primaryTrade: string | null;
  tradeAtSite: string | null; status: string; medicalValidUntil: string | null; medicalState: string; workerStatus: string;
  rosterStatus: string; inductionAt: string | null; inductionValidUntil: string | null; inductionByName: string | null;
  lastCheck: Clearance | null; lastCheckedAt: string | null; gatePassNo: string | null; gatePassValidUntil: string | null;
  releasedAt: string | null;
};

export type WorkOrder = {
  id: string; workOrderNo: string; contractorCompanyId: string; contractorName: string | null; contractorStatus: string | null;
  plantId: string; plantName: string | null; areaId: string | null; areaName: string | null; title: string; scope: string;
  workType: string; contractRef: string | null; startDate: string; endDate: string; engineerInChargeId: string | null;
  engineerInChargeName: string | null; estimatedManpower: number; supervisorCount: number | null;
  highRiskActivities: string[]; safetyChecklist: Record<string, boolean>; safetyNotes: string | null; status: string;
  activatedAt: string | null; suspendedReason: string | null; completedAt: string | null; closureNotes: string | null;
  createdAt: string | null;
};

export type WorkOrderDetail = WorkOrder & {
  contractorQualification: string | null; activationBlockers: string[]; history: HistoryEntry[];
  roster: RosterRow[]; rosterCounts: Record<string, number>;
  clearance?: Clearance & { rosterId: string };
};

export type Kpi = { code: string; label: string; weight: number; value: number; score: number | null; target: number };

export type Evaluation = {
  id: string; evaluationNo: string; contractorCompanyId: string; contractorName: string | null; plantId: string;
  plantName: string | null; workOrderId: string | null; workOrderNo?: string | null; evaluationType: string;
  periodStart: string; periodEnd: string; kpis: Kpi[]; counts: Record<string, number>;
  manual: Record<string, { score: number | null; comment: string | null }>; autoScore: number | null;
  manualScore: number | null; finalScore: number | null; ratingBand: string | null; evaluatorRemarks: string | null;
  status: string; evaluatorId: string | null; evaluatorName: string | null; submittedAt: string | null;
  signedOffByName: string | null; signedOffAt: string | null; signOffNotes: string | null; createdAt: string | null;
  fatalityCapApplied: boolean;
};

export type Sanction = {
  id: string; sanctionNo: string; contractorCompanyId: string; contractorName?: string | null; contractorStatus?: string | null;
  plantId: string; plantName: string | null; action: string; reasonCategory: string; reason: string;
  evidence: { type: string; id?: string; label: string }[]; effectiveUntil: string | null; status: string;
  previousStatus?: string | null; requestedById: string; requestedByName: string | null; requestedAt: string;
  decidedByName: string | null; decidedAt: string | null; decisionNotes: string | null;
};

export type Template = {
  id: string; code: string; version: number; name: string; description: string | null; status: string;
  passScore: number; conditionalScore: number; validityMonths: number; conditionalValidityMonths: number;
  sectionCount: number; questionCount: number; activatedAt: string | null; updatedAt: string | null; sections?: Section[];
};

export type ExpiringData = {
  windowDays: number;
  prequalifications: { id: string; applicationNo: string; contractorCompanyId: string; contractorName: string | null; plantId: string; plantName?: string | null; status: string; validUntil: string; state: string; renewalInProgress: boolean }[];
  documents: { id: string; contractorCompanyId: string; contractorName: string | null; docType: string; title: string | null; fileName: string; expiresOn: string; state: string }[];
};

export type Hub = {
  pipeline: Record<string, number>;
  qualification: { qualified: number; conditional: number; expired: number; suspended: number; blacklisted: number };
  workOrders: Record<string, number> & { workersOnSite: number };
  evaluations: { last90Days: number; signedOff: number; averageScore: number | null; byBand: Record<string, number>; awaitingSignOff: number };
  approvals: { prequalifications: number; reviews: number; sanctions: number };
  expiring: { prequalExpired: number; prequalDue: number; docsExpired: number; docsDue: number };
};

type Recent = Record<string, any>;
export type Contractor360 = {
  contractor: Contractor;
  windowDays: number;
  observations: { total: number; open: number; byType: Record<string, number>; recent: Recent[] };
  nearMisses: { total: number; recent: Recent[] };
  incidents: { total: number; byType: Record<string, number>; recent: Recent[] };
  permits: { total: number; live: number; recent: Recent[] };
  showCause: { total: number; open: number; recent: Recent[] };
  toolboxTalks: { total: number; participants: number; recent: Recent[] };
  workOrders: { active: number; total: number; workersOnSite: number; items: (Recent & { plantName?: string | null })[] };
  scoreTrend: { evaluationId: string; evaluationNo: string; periodEnd: string; evaluationType: string; finalScore: number; ratingBand: string; status: string }[];
  sanctions: Sanction[];
  prequalifications: PrequalRow[];
  documents: CsmDocument[];
};

// ── uploads (two-phase: signed URL, PUT bytes, record) ───────────────────────
export const DOC_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic";
export const DOC_MAX_BYTES = 10 * 1024 * 1024;

export type SignedUpload = { storagePath: string; uploadUrl?: string; signedUrl?: string; signed_url?: string; token?: string };

/** PUT the file to the signed URL the backend minted. Bytes never transit our API. */
export async function putToStorage(sig: SignedUpload, file: File): Promise<void> {
  const url = sig.uploadUrl ?? sig.signedUrl ?? sig.signed_url;
  if (!url) throw new Error("Upload is unavailable right now.");
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream", ...(sig.token ? { Authorization: `Bearer ${sig.token}` } : {}) },
    body: file,
  });
  if (!res.ok) throw new Error(`The file could not be uploaded (${res.status}).`);
}
