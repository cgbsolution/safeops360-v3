// IMS / MIS client helpers: types, labels and a fetch wrapper for /api/ims/*
// (proxied to the Python backend by src/app/api/[...path]/route.ts).

import { readApiError } from "@/lib/client-errors";

export type PlantOption = { id: string; code: string; name: string };

export async function imsFetch<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
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

/** "PPE_NON_COMPLIANCE" → "Ppe non compliance" → nicer with the overrides below. */
const LABEL_OVERRIDES: Record<string, string> = {
  PPE_NON_COMPLIANCE: "PPE non-compliance",
  PTW_VIOLATION: "PTW violation",
  LOTO_VIOLATION: "LOTO violation",
  APEX_SAFETY_COMMITTEE: "Apex safety committee",
  MINUTES_PUBLISHED: "Minutes published",
  REPLY_RECEIVED: "Reply received",
  FYTD: "Financial year to date",
  MTD: "Month to date",
  L30: "Last 30 days",
  L90: "Last 90 days",
  L365: "Last 12 months",
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

/** Value for <Input type="datetime-local"> in the browser's local time. */
export function toLocalInput(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local / date string → ISO with the browser's offset applied. */
export function localToIso(v: string): string {
  return new Date(v).toISOString();
}

export const STATUS_TONE: Record<string, string> = {
  ISSUED: "bg-amber-100 text-amber-800 border-amber-200",
  REPLY_RECEIVED: "bg-sky-100 text-sky-800 border-sky-200",
  CLOSED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  SCHEDULED: "bg-sky-100 text-sky-800 border-sky-200",
  HELD: "bg-amber-100 text-amber-800 border-amber-200",
  MINUTES_PUBLISHED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-500 border-slate-200",
  OPEN: "bg-amber-100 text-amber-800 border-amber-200",
  IN_PROGRESS: "bg-sky-100 text-sky-800 border-sky-200",
  DROPPED: "bg-slate-100 text-slate-500 border-slate-200",
  PLANNED: "bg-sky-100 text-sky-800 border-sky-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  OVERDUE: "bg-rose-100 text-rose-800 border-rose-200",
};

// ── types (mirror app/routers/ims.py serialisers) ────────────────────────────
export type ImsMeta = {
  recipientTypes: string[];
  violationCategories: string[];
  noticeDecisions: string[];
  noticeStatuses: string[];
  sourceTypes: string[];
  meetingTypes: string[];
  meetingStatuses: string[];
  actionStatuses: string[];
  drillTypes: string[];
  periods: string[];
};

export type ToolboxTalk = {
  id: string; talkNo: string; plantId: string; plantName: string | null; topic: string; keyPoints: string | null;
  department: string | null; language: string | null; conductedAt: string; conductedById: string;
  conductedByName: string | null; durationMinutes: number | null; employeeCount: number; contractorCount: number;
  participants: number; permitId: string | null;
};

export type ShowCauseNotice = {
  id: string; noticeNo: string; plantId: string; plantName: string | null; recipientType: string; recipientName: string;
  violationCategory: string; violationDetails: string; violationAt: string | null; sourceType: string | null;
  sourceId: string | null; issuedAt: string; issuedByName: string | null; replyDueDate: string;
  replyReceivedAt: string | null; replyText: string | null; decision: string | null; decisionNotes: string | null;
  penaltyAmount: number | null; status: string; closedAt: string | null; closedByName: string | null; replyOverdue: boolean;
};

export type ActionItem = {
  id: string; meetingId: string; plantId: string; itemNo: number; description: string; ownerUserId: string;
  ownerName: string | null; dueDate: string; status: string; closureNote: string | null; closedAt: string | null;
  overdue: boolean; meetingNo?: string; meetingTitle?: string; meetingType?: string;
};

export type Meeting = {
  id: string; meetingNo: string; plantId: string; plantName: string | null; meetingType: string; title: string;
  scheduledAt: string; heldAt: string | null; venue: string | null; chairpersonId: string | null;
  chairpersonName: string | null; secretaryName: string | null; attendeeUserIds: string[];
  attendees: { id: string; name: string }[]; workerRepCount: number | null; managementRepCount: number | null;
  agenda: string | null; minutes: string | null; status: string; minutesPublishedAt: string | null;
  cancelReason: string | null; actionsOpen: number; actionsTotal: number; actions?: ActionItem[];
};

export type FireDrill = {
  id: string; drillCode: string; plantId: string; drillType: string; status: string; outcome: string | null;
  scheduledDate: string | null; conductedDate: string | null; evacuationTimeMinutes: number | null;
  evacuationTargetMinutes: number | null; unaccountedPersons: number | null; isAnnualMandatory: boolean;
};

export type ImsDashboard = {
  window: { start: string; end: string };
  generatedAt: string;
  period: string;
  lagging: {
    manHours: number; ltiCount: number; fatalityCount: number; lostDays: number; recordableCount: number;
    firstAidCount: number; frequencyRate: number | null; severityRate: number | null; fsi: number | null;
    trifr: number | null; incidentsByType: Record<string, number>; incidentsTotal: number;
  };
  manpower: { headcount: number; manHours: number; employeeHours: number; contractorHours: number; monthsReported: number };
  trainings: { total: number; completed: number; external: number; internal: number };
  toolboxTalks: { register: number; participants: number; preJobFlra: number; total: number };
  inspections: { completed: number; scheduled: number; overdue: number; fireInspections: number };
  audits: { planned: number; closed: number; overdue: number };
  showCause: { issued: number; open: number; replyOverdue: number; closed: number };
  hira: { reviewed: number; overdue: number; dueNext30: number };
  meetings: { scheduled: number; held: number; committeeHeld: number };
  mom: { open: number; overdue: number; closed: number };
  mockDrills: { scheduled: number; completed: number; overdue: number; upcoming30: number };
  observations: { reported: number; open: number };
  nearMisses: { reported: number };
  permits: { live: number; issued: number };
};
