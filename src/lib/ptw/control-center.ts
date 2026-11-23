// PTW control center, insights and paper-permit scan: client types + helpers.
// Backend: safeops_360_bakend/app/routers/ptw_cc.py (via the /api catch-all proxy).

export type Severity = "critical" | "high" | "medium" | "low";

export type CcPermit = {
  id: string;
  number: string;
  type: string;
  typeLabel: string;
  status: string;
  areaId: string | null;
  location: string | null;
  issuerName: string | null;
  receiverName: string | null;
  contractorName: string | null;
  validFrom: string;
  validTo: string;
  minutesRemaining: number;
  crewCount: number;
  gas: { required: boolean; state: "N/A" | "MISSING" | "OVERDUE" | "DUE" | "OK"; lastAt: string | null; dueBy: string | null };
  suspendedReason: string | null;
  simopsWith: string[];
  flags: string[];
  worstSeverity: Severity | null;
};

export type CcArea = {
  areaId: string | null;
  areaName: string;
  plantId: string | null;
  plantName: string | null;
  counts: Record<string, number>;
  workers: number;
  worstSeverity: Severity | null;
  permits: CcPermit[];
};

export type CcException = {
  code: string;
  severity: Severity;
  permitId: string;
  permitNumber: string;
  areaId: string | null;
  areaName: string;
  title: string;
  detail: string | null;
  at: string | null;
  minutes: number | null;
  relatedPermitIds: string[];
  relatedPermitNumbers: string[];
};

export type ControlCenter = {
  generatedAt: string;
  truncated: boolean;
  plantId: string | null;
  plantName: string | null;
  kpis: {
    livePermits: number; active: number; issued: number; suspended: number; awaitingIssue: number;
    workersOnSite: number; expiringSoon: number; expiredNotClosed: number; gasOverdue: number;
    simopsConflicts: number; critical: number; high: number; closedLast24h: number;
  };
  areas: CcArea[];
  exceptions: CcException[];
  thresholds: { expiringWithinMinutes: number; gasDueSoonMinutes: number; issueAcceptGraceMinutes: number };
};

export type KeyCount = { key: string; count: number; label?: string };
export type CycleStage = { key: string; label: string; n: number; medianHours: number | null; p90Hours: number | null; meanHours: number | null };

export type PtwInsights = {
  plantId: string | null;
  plantName: string | null;
  window: { from: string; to: string; start: string; end: string };
  truncated: boolean;
  generatedAt: string;
  totals: { raised: number; closed: number; cancelled: number; rejected: number; expired: number; open: number };
  byType: KeyCount[];
  byStatus: KeyCount[];
  byArea: KeyCount[];
  byContractor: KeyCount[];
  byHour: { hour: number; count: number }[];
  byShift: KeyCount[];
  trend: { granularity: "day" | "week"; points: { period: string; raised: number; closed: number }[] };
  cycleTimes: CycleStage[];
  extensions: { total: number; approved: number; rejected: number; pending: number; permitsExtended: number };
  suspensions: { total: number; permitsSuspended: number; topReasons: KeyCount[] };
  gasTests: {
    permitsRequiringGasTest: number; permitsWithInitialTest: number; initialTestPct: number | null; readings: number;
    refreshesEvaluated: number; refreshesOnTime: number; refreshCompliancePct: number | null; exceedances: number;
  };
  closure: { closed: number; onTime: number; late: number; onTimePct: number | null; graceMinutes: number; expiredNotClosed: number };
  topIssuers: KeyCount[];
  topReceivers: KeyCount[];
  definitions: Record<string, string>;
};

// ── scan ──────────────────────────────────────────────────────────────────────
export type ScanFieldStatus = "ok" | "low" | "unreadable" | "unresolved" | "blank";
export type ScanField = {
  key: string;
  label: string;
  text: string | null;
  value: unknown;
  display: unknown;
  confidence: number;
  status: ScanFieldStatus;
  note: string | null;
};

export type ScanResult =
  | {
      ok: true;
      draft: import("@/lib/ptw/wizard-config").PtwDraft;
      fields: ScanField[];
      lists: {
        extraHazards: { value: string[]; confidence: number };
        crew: { name: string; role: string; confidence: number; matchedName: string | null }[];
        isolations: { isolationType: string; description: string; isolationPointTag: string; lotoTagNumber: string | null; confidence: number }[];
        ppe: { value: string[]; confidence: number };
        gasReadings: { parameter: string; value: number; unit: string; confidence: number }[];
      };
      paperPermitNumber: string | null;
      unreadable: { key: string; label: string }[];
      unresolved: { field: string; label: string; text: string; reason: string | null; candidates: { id: string; name: string }[] }[];
      warnings: string[];
      notes: string | null;
      source: { kind: "images" | "pdf"; files: number; textOnly: boolean };
    }
  | { ok: false; reason: string; message: string };

// ── helpers ───────────────────────────────────────────────────────────────────
export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Status colour never travels alone: every use also prints the word. */
export const SEVERITY_STYLE: Record<Severity, { chip: string; ring: string; dot: string; label: string }> = {
  critical: { chip: "bg-rose-100 text-rose-800 border-rose-300", ring: "border-rose-400", dot: "bg-rose-600", label: "Critical" },
  high: { chip: "bg-orange-100 text-orange-800 border-orange-300", ring: "border-orange-300", dot: "bg-orange-500", label: "High" },
  medium: { chip: "bg-amber-50 text-amber-800 border-amber-300", ring: "border-amber-200", dot: "bg-amber-500", label: "Medium" },
  low: { chip: "bg-sky-50 text-sky-800 border-sky-200", ring: "border-slate-200", dot: "bg-sky-500", label: "Low" },
};

export const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ISSUED: "bg-sky-100 text-sky-800 border-sky-200",
  SUSPENDED: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-violet-100 text-violet-800 border-violet-200",
  EXPIRED: "bg-rose-100 text-rose-800 border-rose-200",
};

export const FLAG_LABEL: Record<string, string> = {
  EXPIRED_NOT_CLOSED: "Expired, not closed",
  EXPIRING_SOON: "Expiring soon",
  GAS_TEST_OVERDUE: "Gas re-test overdue",
  GAS_TEST_MISSING: "No gas test",
  GAS_TEST_DUE: "Gas re-test due",
  GAS_EXCEEDANCE: "Gas exceedance",
  SIMOPS_CONFLICT: "SIMOPS",
  SUSPENDED: "Suspended",
  ISSUED_NOT_ACCEPTED: "Not accepted",
  APPROVED_AWAITING_ISSUE: "Awaiting issue",
  LAPSED_BEFORE_ISSUE: "Lapsed before issue",
};

export function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return "-";
  const a = Math.abs(Math.round(m));
  if (a < 60) return `${a} min`;
  const h = Math.floor(a / 60);
  const mm = a % 60;
  if (h < 48) return mm ? `${h} h ${mm} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh ? `${d} d ${hh} h` : `${d} d`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return "-";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

export function plantQuery(plantId: string | null | undefined): string {
  return plantId ? `?plantId=${encodeURIComponent(plantId)}` : "";
}

export const ALL_PLANTS = "__all__";
