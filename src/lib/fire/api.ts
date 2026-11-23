// Fire safety client helpers: types mirroring app/routers/fire_safety.py, labels
// and the fetch wrapper for /api/fire/* (proxied by src/app/api/[...path]).

export { imsFetch as fireFetch, qs, fmtDate, toLocalInput, localToIso, type PlantOption } from "@/lib/ims/api";

const LABELS: Record<string, string> = {
  FIRE_EXTINGUISHER: "Fire extinguisher",
  HYDRANT: "Hydrant point",
  HOSE_REEL: "Hose reel",
  SMOKE_DETECTOR: "Smoke detector",
  HEAT_DETECTOR: "Heat detector",
  MANUAL_CALL_POINT: "Manual call point",
  FIRE_ALARM_PANEL: "Fire alarm panel",
  SPRINKLER: "Sprinkler",
  FIRE_PUMP: "Fire pump",
  FIRE_DOOR: "Fire door",
  EMERGENCY_LIGHT: "Emergency light",
  GAS_SUPPRESSION: "Gas suppression",
  DUE_INSPECTION: "Due",
  OUT_OF_SERVICE: "Out of service",
  DUE_SOON: "Due soon",
  NEVER: "Never inspected",
  NOT_IN_SERVICE: "Not in service",
  NA: "N/A",
  MARKED_DEFECTIVE: "Marked defective",
  DEFECT_CLEARED: "Defect cleared",
  RETURNED_TO_SERVICE: "Returned to service",
};

export function fireLabel(code: string | null | undefined): string {
  if (!code) return "—";
  if (LABELS[code]) return LABELS[code];
  const s = code.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const FIRE_STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  DUE_INSPECTION: "bg-amber-100 text-amber-800 border-amber-200",
  OVERDUE: "bg-rose-100 text-rose-800 border-rose-200",
  DEFECTIVE: "bg-rose-100 text-rose-800 border-rose-300",
  OUT_OF_SERVICE: "bg-slate-200 text-slate-700 border-slate-300",
  DECOMMISSIONED: "bg-slate-100 text-slate-500 border-slate-200",
  PASS: "bg-emerald-100 text-emerald-800 border-emerald-200",
  FAIL: "bg-rose-100 text-rose-800 border-rose-200",
  NA: "bg-slate-100 text-slate-600 border-slate-200",
  NEVER: "bg-amber-100 text-amber-800 border-amber-200",
  DUE_SOON: "bg-amber-100 text-amber-800 border-amber-200",
  OK: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

/** URL printed in a label's QR: opens the asset's checklist after login. */
export function fireQrUrl(origin: string, equipmentCode: string): string {
  return `${origin.replace(/\/$/, "")}/q/fire/${encodeURIComponent(equipmentCode)}`;
}

/** Holds FIRE.MANAGE, or the legacy INCIDENT.UPDATE the equipment endpoints still accept. */
export function canManageEquipment(perms: Record<string, boolean>): boolean {
  return !!(perms["FIRE.MANAGE"] || perms["INCIDENT.UPDATE"]);
}

export function canInspect(perms: Record<string, boolean>): boolean {
  return !!(perms["FIRE.INSPECT"] || perms["FIRE.MANAGE"]);
}

// ── types ────────────────────────────────────────────────────────────────────
export type FireMeta = {
  equipmentTypes: string[];
  equipmentStatuses: string[];
  responses: string[];
  results: string[];
  defaultFrequencyDays: Record<string, number>;
};

export type FireEquipment = {
  id: string; equipmentCode: string; type: string; make: string | null; model: string | null;
  serialNo: string | null; location: string; buildingId: string | null; plantId: string; plantName: string | null;
  latitude: number | null; longitude: number | null; floorLevel: number | null; installationDate: string | null;
  lastInspectionDate: string | null; nextInspectionDueDate: string | null; inspectionFrequencyDays: number;
  status: string; capacitySpec: string | null; maintenanceContractor: string | null; qrCode: string | null;
  isActive: boolean; outOfServiceReason: string | null; dueBucket: string;
};

export type ChecklistItem = { key: string; text: string; critical: boolean; guidance?: string | null };

export type ChecklistTemplate = {
  id: string; code: string; version: number; equipmentType: string; name: string; standardRef: string | null;
  description: string | null; frequencyDays: number | null; isActive: boolean; itemCount: number;
  criticalCount: number; updatedAt: string | null; createdAt: string | null; items?: ChecklistItem[];
  versions?: ChecklistTemplate[];
};

export type FireInspection = {
  id: string; inspectionNo: string; equipmentId: string; equipmentCode: string; equipmentType: string;
  location: string | null; plantId: string; plantName: string | null; templateId: string; templateCode: string;
  templateVersion: number; inspectorId: string; inspectorName: string | null; startedAt: string | null;
  completedAt: string; result: string; passCount: number; failCount: number; naCount: number;
  criticalFailCount: number; remarks: string | null; latitude: number | null; longitude: number | null;
  gpsAccuracyM: number | null; scanned: boolean; equipmentStatusBefore: string | null;
  equipmentStatusAfter: string | null; nextDueDate: string | null; capaId: string | null; capaNumber: string | null;
  followUpNote: string | null;
  items?: { key: string; text: string; critical: boolean; response: string; remarks: string | null; photoPath: string | null; sortOrder: number }[];
};

export type EquipmentEvent = {
  id: string; eventType: string; fromStatus: string | null; toStatus: string | null; note: string | null;
  inspectionId: string | null; actorName: string | null; createdAt: string;
};

export type EquipmentDetail = FireEquipment & {
  createdAt: string | null; createdByName: string | null; template: ChecklistTemplate | null;
  inspections: FireInspection[]; events: EquipmentEvent[];
  legacyInspections: { id: string; engagementCode: string; title: string; status: string; plannedDate: string | null; scorePercent: number | null }[];
};

export type ScanResult = {
  equipment: FireEquipment;
  template: ChecklistTemplate | null;
  lastInspection: FireInspection | null;
  canInspect: boolean;
  blockers: string[];
};

export type FireDashboard = {
  totalEquipment: number; byStatus: Record<string, number>; dueThisMonth: number; overdue: number;
  drillsCompletedThisYear: number; drillsDue: number; plansReviewDue: number; defective: number;
  outOfService: number; inspectionsLast30: number; failedLast30: number; criticalFailsLast30: number;
  scannedLast30: number; overdueItems: FireEquipment[];
};
