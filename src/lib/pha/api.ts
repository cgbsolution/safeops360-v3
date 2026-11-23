// PHA / HAZOP client helpers: types, labels and a fetch wrapper for /api/pha/*
// (proxied to the Python backend by src/app/api/[...path]/route.ts).
// Types mirror the serialisers in safeops_360_bakend/app/routers/pha.py.

import { readApiError } from "@/lib/client-errors";

export type PlantOption = { id: string; code: string; name: string };

export async function phaFetch<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
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

/** Download a binary export through the proxy and hand it to the browser. */
export async function phaDownload(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(await readApiError(res, "Export failed"));
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const name = /filename="?([^";]+)"?/i.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  HAZOP: "HAZOP",
  HAZID: "HAZID",
  WHAT_IF: "What-If",
  UNDER_REVIEW: "Under review",
  IN_PROGRESS: "In progress",
  DUE_SOON: "Due soon",
  STARTUP_SHUTDOWN: "Start-up / Shutdown",
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

/** ISO → value for <Input type="date">. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** <Input type="date"> value → ISO at local noon (keeps the calendar day in any timezone). */
export function dateInputToIso(v: string): string | null {
  if (!v) return null;
  return new Date(`${v}T12:00:00`).toISOString();
}

export function toLocalInput(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  IN_PROGRESS: "bg-sky-100 text-sky-800 border-sky-200",
  UNDER_REVIEW: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CLOSED: "bg-slate-200 text-slate-700 border-slate-300",
  OPEN: "bg-amber-100 text-amber-800 border-amber-200",
  REJECTED: "bg-slate-100 text-slate-500 border-slate-200",
  HIGH: "bg-rose-100 text-rose-800 border-rose-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  LOW: "bg-slate-100 text-slate-700 border-slate-200",
  OVERDUE: "bg-rose-100 text-rose-800 border-rose-200",
  DUE_SOON: "bg-amber-100 text-amber-800 border-amber-200",
  CURRENT: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

/** Readable text colour on a matrix cell colour. */
export function textOn(hex: string | null | undefined): string {
  if (!hex) return "#0f172a";
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#0f172a" : "#ffffff";
}

// ── types ────────────────────────────────────────────────────────────────────
export type LibraryItem = { code: string; label: string; meaning?: string };
export type Combination = { guideword: string; parameter: string; deviation: string };

export type PhaMeta = {
  methods: { code: string; label: string }[];
  studyStatuses: string[];
  recStatuses: string[];
  priorities: string[];
  teamRoles: string[];
  disciplines: string[];
  revalidationYears: number;
  library: { guidewords: LibraryItem[]; parameters: LibraryItem[]; combinations: Combination[] };
};

export type MatrixScale = { score: number; label: string; description: string };
export type MatrixCell = { likelihood: number; severity: number; score: number; level: string; color: string };
export type RiskMatrix = {
  id: string | null; code: string; name: string; likelihoodLevels: number; severityLevels: number;
  likelihoods: MatrixScale[]; severities: MatrixScale[]; cells: MatrixCell[];
};
export type MatrixOption = { id: string; code: string; name: string; likelihoodLevels: number; severityLevels: number; isDefault: boolean };

export type Study = {
  id: string; studyNo: string; plantId: string; plantName: string | null; unit: string | null; area: string | null;
  method: string; methodLabel: string; title: string; scope: string | null; designIntentSummary: string | null;
  drawingRefs: string[]; riskMatrixId: string | null; status: string;
  facilitatorId: string | null; facilitatorName: string | null; scribeId: string | null; scribeName: string | null;
  approverId: string | null; approverName: string | null; mocId: string | null; submittedAt: string | null;
  reviewComments: string | null; approvedAt: string | null; approvedByName: string | null;
  revalidationDueDate: string | null; revalidationState: string | null; closedAt: string | null;
  nodeCount?: number; recCount?: number; openRecs?: number;
};

export type TeamMember = {
  id: string; studyId: string; userId: string | null; externalName: string | null; name: string | null;
  isExternal: boolean; organisation: string | null; discipline: string | null; role: string; roleLabel?: string;
};

export type PhaSession = {
  id: string; studyId: string; sessionNo: number; sessionDate: string; durationMinutes: number | null;
  attendeeUserIds: string[]; attendees: { id: string; name: string }[]; attendeeNames: string[];
  nodeIds: string[]; nodeLabels: string[]; notes: string | null;
};

export type OperatingParameter = { name: string; value: string | null; unit: string | null };

export type PhaNode = {
  id: string; studyId: string; nodeNo: number; title: string; description: string | null; designIntent: string | null;
  boundaries: string | null; drawingRef: string | null; operatingParameters: OperatingParameter[];
  rowCount: number; ratedCount: number; openRecs: number; recCount: number;
  highestRisk: { level: string; color: string | null; score: number | null } | null;
};

export type Recommendation = {
  id: string; studyId: string; plantId: string; nodeId: string; deviationId: string; recNo: number; recLabel: string;
  text: string; ownerId: string | null; ownerName: string | null; dueDate: string | null; priority: string; status: string;
  justification: string | null; closureNote: string | null; closedAt: string | null;
  capaId: string | null; capaNumber: string | null; capaState: string | null; overdue: boolean;
  nodeLabel?: string | null; deviationText?: string | null; deviationRef?: string | null; riskLevel?: string | null;
  riskColor?: string | null; studyNo?: string | null; studyTitle?: string | null; studyStatus?: string | null;
  warning?: string | null;
};

export type Deviation = {
  id: string; studyId: string; nodeId: string; rowNo: number; guideword: string | null; guidewordLabel: string;
  parameter: string | null; parameterLabel: string; deviation: string; causes: string | null; consequences: string | null;
  safeguards: string | null; severity: number | null; likelihood: number | null; riskScore: number | null;
  riskLevel: string | null; riskColor: string | null; residualSeverity: number | null; residualLikelihood: number | null;
  residualScore: number | null; residualLevel: string | null; residualColor: string | null; remarks: string | null;
  aiSuggested: boolean; recommendations: Recommendation[];
};

export type StudyDetail = Study & {
  team: TeamMember[];
  sessions: PhaSession[];
  nodes: PhaNode[];
  matrix: RiskMatrix;
  recommendationCounts: Record<string, number>;
  overdueRecommendations: number;
  incompleteRows: string[];
  submitBlockers: string[];
  closeBlockers: string[];
  perms: { update: boolean; approve: boolean };
};

export type Worksheet = {
  node: PhaNode; studyId: string; studyStatus: string; editable: boolean; deviations: Deviation[]; matrix: RiskMatrix;
  created?: number; skipped?: { guideword: string; parameter: string; reason: string }[];
};

export type AiSuggestion = {
  guideword: string; parameter: string; deviation: string; causes: string | null; consequences: string | null;
  safeguards: string | null; severity: number | null; likelihood: number | null; recommendation: string | null;
  libraryMatch: boolean;
};

export type PhaDashboard = {
  studiesByStatus: Record<string, number>; studiesByMethod: Record<string, number>; studiesTotal: number;
  studiesActive: number; openRecommendations: number; overdueRecommendations: number;
  revalidationOverdue: number; revalidationDueSoon: number; revalidationWindowDays: number;
  recentStudies: Study[]; revalidationQueue: Study[]; plantId: string | null;
};

export type StudyReport = {
  study: Omit<StudyDetail, "team" | "sessions" | "nodes" | "matrix" | "perms">;
  team: TeamMember[];
  sessions: PhaSession[];
  matrix: RiskMatrix;
  nodes: (PhaNode & { deviations: Deviation[] })[];
  recommendations: Recommendation[];
  generatedAt: string;
};
