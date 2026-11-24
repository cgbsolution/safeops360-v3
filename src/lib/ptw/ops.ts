// PTW Control Center v2 — client types + pure formatters.
// Payload: GET /api/ptw/control-center (safeops_360_bakend/app/services/ptw_ops/payload.py).
// Formatters are pure and unit-tested (src/lib/ptw/ops.test.ts, `npm run test:unit`).

export type Severity = "critical" | "high" | "medium" | "low";
export type RangeKey = "shift" | "today" | "7d";

export type OpsZone = {
  id: string;
  name: string;
  polygon: { x: number; y: number }[];
  impairmentCodes: string[];
  activeCount: number;
  permitCount: number;
  dimmed: boolean;
};
export type OpsPin = {
  permitId: string;
  number: string;
  type: string;
  x: number;
  y: number;
  areaId: string;
  status: string;
  overdue: boolean;
  flagged: boolean;
};
export type OpsConflict = { areaIds: string[]; label: string; permitIds: string[]; severity: string; distanceM: number | null };
export type OpsException = {
  id: string;
  ruleKey: string;
  severity: Severity;
  title: string;
  detail: string | null;
  ref: string | null;
  permitId: string | null;
  impairmentId: string | null;
  areaId: string | null;
  areaName: string;
  since: string | null;
  owner: string | null;
  acknowledged: boolean;
};
export type OpsImpairment = {
  id: string;
  code: string;
  systemType: string;
  systemName: string;
  areaId: string | null;
  areaName: string;
  reason: string;
  startedAt: string;
  plannedRestoreAt: string | null;
  minutesToRestore: number | null;
  status: "on_track" | "due_soon" | "overdue" | "awaiting_approval";
  lifecycle: string;
  precautions: string[];
  effect: string;
  effectSeverity: "critical" | "warning" | "info";
  approvedBy: string | null;
};
export type OpsPipelineStep = {
  step: string;
  label: string;
  count: number;
  avgDwellMin: number | null;
  slaMin: number | null;
  breached: boolean;
  breachedCount: number;
  tint: "neutral" | "active" | "closure";
};
export type OpsBar = {
  permitId: string;
  number: string;
  type: string;
  kind: "active" | "overrun" | "scheduled" | "closed";
  start: string;
  end: string;
  validTo: string;
  holder: string | null;
  lane: number;
};
export type OpsTimelineRow = { areaId: string | null; areaName: string; bars: OpsBar[]; hidden: number };

export type ControlCenterPayload = {
  generatedAt: string;
  plant: { id: string; name: string | null; location: string | null };
  filters: { area: string | null; shift: string | null; range: RangeKey; windowStart: string; windowEnd: string };
  shifts: { code: string; label: string | null; startHour: number; endHour: number }[];
  areas: { id: string; name: string }[];
  brief: { text: string; generatedAt: string; shift?: string | null } | null;
  kpis: {
    activeNow: number;
    pendingApproval: number;
    pendingPastSla: number;
    starting2h: number;
    expiring2h: number;
    expiredOpen: number;
    expiredOpenToday: number;
    workersUnderPermit: number;
    contractorsOnSite: number;
    simopsConflicts: number;
    activeImpairments: number;
    impairmentsOverdue: number;
    impairmentsBlocking: number;
    suspended: number;
    deltas: { activeNow: number | null };
    baselines: { activeNow: number };
    context: {
      nextStart: { type: string; at: string } | null;
      startingHotWork: number;
      simopsLabel: string | null;
      topSuspendedReason: string | null;
    };
  };
  map: { layoutImageUrl: string | null; hasGeometry: boolean; autoLayout?: boolean; zones: OpsZone[]; pins: OpsPin[]; conflicts: OpsConflict[] };
  exceptions: OpsException[];
  impairments: OpsImpairment[];
  impairmentRules: { when: string; then: string; effect: string }[];
  pipeline: OpsPipelineStep[];
  timeline: OpsTimelineRow[];
  typeMix: { type: string; label: string; count: number; riskWeight: number; load: number }[];
  compliance: { key: string; label: string; pct: number | null; num: number; den: number }[];
  contractors: { name: string; permits: number; workers: number; flag: string | null; flagSeverity: "critical" | "warning" | null }[];
  muster: { workers: number; cardsExpiring7d: number };
  signals: {
    nearMisses30d: number;
    observations30d: number;
    incidents30d: number;
    lti30d: number;
    capaOpen: number;
    weekly: number[];
    expiryRate: { expired: number; total: number };
  };
  setup: { tablesReady: boolean; hasGeometry: boolean };
  permissions?: { manageZones: boolean; raiseImpairment: boolean; approveImpairment: boolean; manageKiosk: boolean };
  kiosk?: { label: string };
};

export type ZoneGuidance = {
  areaId: string;
  areaName: string;
  areaOwner: string | null;
  restrictedHours: string | null;
  instructions: string[];
  mandatoryPpe: string[];
  assemblyPoint: string | null;
  extinguisherLocations: string | null;
  permitTypeRules: { permitType: string; state: "allowed" | "conditional" | "blocked"; conditionText?: string; live?: boolean }[];
  updatedAt: string | null;
  impairments: { id: string; code: string; systemName: string; reason: string; plannedRestoreAt: string | null; precautions: string[]; effect: string; effectSeverity: string }[];
  canEdit?: boolean;
};

// ── permit types: colour (pins, bars, mix) + pin glyph ──
export const PERMIT_TYPES: Record<string, { label: string; color: string; glyph: string }> = {
  HOT_WORK: { label: "Hot work", color: "#F59E0B", glyph: "H" },
  CONFINED_SPACE: { label: "Confined space", color: "#A78BFA", glyph: "C" },
  ELECTRICAL_LOTO: { label: "Electrical", color: "#FACC15", glyph: "E" },
  WORK_AT_HEIGHT: { label: "Height", color: "#60A5FA", glyph: "W" },
  LIFTING: { label: "Lifting", color: "#2DD4BF", glyph: "L" },
  EXCAVATION: { label: "Excavation", color: "#F472B6", glyph: "X" },
  GENERAL_COLD: { label: "Cold work", color: "#94A3B8", glyph: "G" },
};
export const typeInfo = (t: string) => PERMIT_TYPES[t] ?? { label: t.replace(/_/g, " ").toLowerCase(), color: "#94A3B8", glyph: "?" };

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];
export const SEVERITY_LABEL: Record<Severity, string> = { critical: "CRITICAL", high: "HIGH", medium: "MEDIUM", low: "LOW" };

// ── formatters (pure) ──

/** Delta vs a baseline. `null` (zero baseline) → "—", never "−100%" or "+∞". */
export function fmtDelta(delta: number | null | undefined): string {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return "—";
  if (delta === 0) return "±0";
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

/** Minutes → "45 m", "2h 05m", "3d 4h". `null` → "" (callers decide the empty wording). */
export function fmtDuration(min: number | null | undefined): string {
  if (min === null || min === undefined || Number.isNaN(min)) return "";
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 48) return mm ? `${h}h ${String(mm).padStart(2, "0")}m` : `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** "12s ago", "3 min ago", "2 h ago". */
export function fmtAgo(from: Date | string | null | undefined, now: Date = new Date()): string {
  if (!from) return "";
  const t = typeof from === "string" ? new Date(from) : from;
  const s = Math.max(0, Math.round((now.getTime() - t.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Clock time in the browser's zone (plant-local on site): "21:44". */
export function fmtClock(d: Date | string | null | undefined): string {
  if (!d) return "";
  const t = typeof d === "string" ? new Date(d) : d;
  return t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Percent for a compliance bar; null (no denominator) → "n/a". */
export function fmtPct(p: number | null | undefined): string {
  return p === null || p === undefined ? "n/a" : `${Math.round(p)}%`;
}

/** Compliance band: green ≥ 90, amber 75–89, red < 75, neutral when n/a. */
export function complianceBand(p: number | null | undefined): "ok" | "warn" | "crit" | "na" {
  if (p === null || p === undefined) return "na";
  if (p >= 90) return "ok";
  if (p >= 75) return "warn";
  return "crit";
}

/** Restore-by line for an impairment. */
export function restoreLine(i: Pick<OpsImpairment, "status" | "minutesToRestore">): string {
  if (i.status === "awaiting_approval") return "Awaiting approval";
  if (i.status === "overdue") return `Overdue ${fmtDuration(Math.abs(i.minutesToRestore ?? 0))}`;
  if (i.status === "due_soon") return `Due in ${fmtDuration(i.minutesToRestore ?? 0)}`;
  return "On track";
}

/** Split a brief into plain and highlighted parts: the model wraps the risk in [[…]]. */
export function briefParts(text: string): { text: string; risk: boolean }[] {
  const out: { text: string; risk: boolean }[] = [];
  const re = /\[\[(.+?)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), risk: false });
    out.push({ text: m[1], risk: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), risk: false });
  return out;
}

/** Exceptions sorted critical → low, then oldest first. */
export function sortExceptions<T extends { severity: Severity; since: string | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const s = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (s) return s;
    return (a.since ? Date.parse(a.since) : Infinity) - (b.since ? Date.parse(b.since) : Infinity);
  });
}

/** Default zone for the guidance strip: first with an impairment, else first. */
export function defaultZone(zones: Pick<OpsZone, "id" | "impairmentCodes">[]): string | null {
  return (zones.find((z) => z.impairmentCodes.length) ?? zones[0])?.id ?? null;
}

/** Position (0–100 %) of a time inside a window, clamped. */
export function pctInWindow(t: string | Date, start: string | Date, end: string | Date): number {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  const x = new Date(t).getTime();
  if (b <= a) return 0;
  return Math.min(100, Math.max(0, ((x - a) / (b - a)) * 100));
}

/** Query string for the control-center filters (only the set ones). */
export function filterQuery(f: { plant?: string | null; area?: string | null; shift?: string | null; range?: string | null }): string {
  const q = new URLSearchParams();
  if (f.plant) q.set("plant", f.plant);
  if (f.area) q.set("area", f.area);
  if (f.shift) q.set("shift", f.shift);
  if (f.range && f.range !== "today") q.set("range", f.range);
  const s = q.toString();
  return s ? `?${s}` : "";
}
