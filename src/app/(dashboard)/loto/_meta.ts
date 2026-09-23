// Shared LOTO display vocabulary + types.
//
// Labels and chips live here, NOT inline in each screen, so the library list,
// the builder, the execution console and the public QR view all name the same
// thing the same way. The raw tokens are the API's — they come from
// GET /api/loto/meta, which is served from the same tuples the Pydantic layer
// validates against, so a dropdown here can never offer a value the API rejects.

export type ProcedureStatus = "draft" | "active" | "under_review" | "retired";
export type ExecutionStatus =
  | "locks_applied"
  | "verified"
  | "work_in_progress"
  | "locks_removed"
  | "closed"
  | "aborted";
export type ParticipantRole = "primary_authorized" | "secondary" | "affected_employee";

export const PROCEDURE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  under_review: "Under review",
  retired: "Retired"
};

export const PROCEDURE_STATUS_CHIP: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  // Amber, not red: the procedure is not broken, it is awaiting re-approval —
  // and the field is still being served the last approved version meanwhile.
  under_review: "bg-amber-100 text-amber-800 border-amber-200",
  retired: "bg-slate-200 text-slate-600 border-slate-300"
};

export const EXECUTION_STATUS_LABEL: Record<string, string> = {
  locks_applied: "Applying locks",
  verified: "Zero-energy verified",
  work_in_progress: "Work in progress",
  locks_removed: "Locks removed",
  closed: "Closed",
  aborted: "Aborted"
};

export const EXECUTION_STATUS_CHIP: Record<string, string> = {
  // Red while locks are going on: this is the state where the record is
  // incomplete and someone is at the equipment.
  locks_applied: "bg-rose-100 text-rose-800 border-rose-200",
  verified: "bg-blue-100 text-blue-800 border-blue-200",
  work_in_progress: "bg-amber-100 text-amber-800 border-amber-200",
  locks_removed: "bg-violet-100 text-violet-800 border-violet-200",
  closed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  aborted: "bg-slate-200 text-slate-600 border-slate-300"
};

export const ENERGY_TYPE_LABEL: Record<string, string> = {
  electrical: "Electrical",
  mechanical: "Mechanical",
  hydraulic: "Hydraulic",
  pneumatic: "Pneumatic",
  thermal: "Thermal",
  chemical: "Chemical",
  gravity: "Gravity / stored",
  other: "Other"
};

// Colour-coded because at a machine a fitter scans for the energy type before
// reading anything else on the row.
export const ENERGY_TYPE_CHIP: Record<string, string> = {
  electrical: "bg-yellow-100 text-yellow-900 border-yellow-300",
  mechanical: "bg-slate-100 text-slate-800 border-slate-300",
  hydraulic: "bg-blue-100 text-blue-800 border-blue-300",
  pneumatic: "bg-sky-100 text-sky-800 border-sky-300",
  thermal: "bg-orange-100 text-orange-800 border-orange-300",
  chemical: "bg-violet-100 text-violet-800 border-violet-300",
  gravity: "bg-stone-100 text-stone-800 border-stone-300",
  other: "bg-slate-100 text-slate-700 border-slate-200"
};

export const ISOLATION_METHOD_LABEL: Record<string, string> = {
  breaker: "Breaker / isolator",
  valve: "Valve",
  blocking: "Blocking / chocking",
  blanking: "Blanking / spading",
  disconnect: "Disconnect",
  plug: "Plug removal",
  chain: "Chain / physical restraint",
  other: "Other"
};

export const HARDWARE_ITEM_LABEL: Record<string, string> = {
  lock: "Padlock",
  tag: "Danger tag",
  hasp: "Hasp",
  chain: "Chain",
  blind: "Blind / spade",
  lockbox: "Group lock box",
  other: "Other"
};

export const PARTICIPANT_ROLE_LABEL: Record<string, string> = {
  primary_authorized: "Primary authorised",
  secondary: "Authorised (secondary)",
  // Named explicitly so a roster reader understands why this row has no
  // confirm button: an affected employee is notified, not locked on.
  affected_employee: "Affected employee (notified)"
};

// ─── API types (mirror of app/schemas/loto.py) ───────────────────────────────

export type ReviewStatus = {
  nextReviewDueAt: string | null;
  lastReviewedAt: string | null;
  lastReviewedById: string | null;
  lastReviewedByName: string | null;
  isOverdue: boolean;
  isDueSoon: boolean;
  daysUntilDue: number | null;
  pendingReviewId: string | null;
};

export type EnergySource = {
  id: string;
  sequence: number;
  energyType: string;
  magnitude: string | null;
  locationDescription: string | null;
};

export type IsolationPoint = {
  id: string;
  sequence: number;
  energySourceId: string | null;
  location: string;
  isolationMethod: string;
  lockType: string | null;
  verificationMethod: string | null;
  notes: string | null;
};

export type HardwareRequirement = {
  id: string;
  itemType: string;
  description: string | null;
  quantityRequired: number;
};

export type VerificationStep = {
  id: string;
  sequence: number;
  stepText: string;
  requiresPhoto: boolean;
  requiresSignoff: boolean;
};

export type ProcedureVersion = {
  id: string;
  version: number;
  isPublished: boolean;
  publishedAt: string | null;
  publishedByName: string | null;
  supersededAt: string | null;
  changeType: string;
  changeSummary: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type ProcedureListItem = {
  id: string;
  procedureCode: string;
  title: string;
  status: string;
  version: number;
  publishedVersion: number | null;
  siteId: string;
  siteName: string | null;
  area: string | null;
  equipmentId: string | null;
  equipmentName: string | null;
  equipmentTag: string | null;
  qrCodeToken: string | null;
  energySourceCount: number;
  isolationPointCount: number;
  verificationStepCount: number;
  openExecutionCount: number;
  review: ReviewStatus;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Procedure = ProcedureListItem & {
  description: string | null;
  reviewFrequencyMonths: number;
  energySources: EnergySource[];
  isolationPoints: IsolationPoint[];
  hardware: HardwareRequirement[];
  verificationSteps: VerificationStep[];
  versions: ProcedureVersion[];
  canPublish: boolean;
  publishBlockers: string[];
  hasUnpublishedChanges: boolean;
};

export type Participant = {
  id: string;
  userId: string;
  userName: string | null;
  userRole: string | null;
  participantRole: string;
  assignedIsolationPointIds: string[];
  lockTagNumber: string | null;
  lockAppliedAt: string | null;
  lockAppliedConfirmed: boolean;
  lockRemovedAt: string | null;
  lockRemovedConfirmed: boolean;
  notes: string | null;
  isLockHolder: boolean;
};

export type VerificationRecord = {
  id: string;
  stepId: string;
  sequence: number;
  stepText: string | null;
  completedById: string;
  completedByName: string | null;
  completedAt: string;
  photoUrl: string | null;
  signoff: boolean;
  notes: string | null;
};

export type ExecutionGate = {
  canApplyLocks: boolean;
  canVerify: boolean;
  canStartWork: boolean;
  canRemoveLocks: boolean;
  canClose: boolean;
  blockers: string[];
  awaitingLockConfirmation: string[];
  awaitingUnlockConfirmation: string[];
  outstandingVerificationSteps: string[];
};

export type ExecutionListItem = {
  id: string;
  number: string;
  status: string;
  procedureId: string;
  procedureCode: string | null;
  procedureTitle: string | null;
  snapshotVersion: number;
  equipmentName: string | null;
  equipmentTag: string | null;
  ptwId: string | null;
  ptwNumber: string | null;
  siteId: string;
  siteName: string | null;
  initiatedById: string;
  initiatedByName: string | null;
  initiatedAt: string;
  isGroupLockout: boolean;
  participantCount: number;
  locksConfirmedCount: number;
  locksRemovedCount: number;
  lockHolderCount: number;
  closedAt: string | null;
  createdAt: string;
};

export type Execution = ExecutionListItem & {
  // The FROZEN body this lockout runs against. The execution screen renders
  // THIS, never a fresh read of the procedure — a mid-job authoring edit must
  // not change the steps a crew is standing at the equipment following.
  procedureVersionSnapshot: {
    header?: Record<string, any>;
    energySources?: EnergySource[];
    isolationPoints?: IsolationPoint[];
    hardware?: HardwareRequirement[];
    verificationSteps?: VerificationStep[];
  };
  participants: Participant[];
  verificationRecords: VerificationRecord[];
  workStartedAt: string | null;
  locksRemovedAt: string | null;
  closedById: string | null;
  closedByName: string | null;
  closureNotes: string | null;
  abortedById: string | null;
  abortedAt: string | null;
  abortReason: string | null;
  gate: ExecutionGate;
  procedureHasChangedSinceStart: boolean;
};

export type PermitLotoStatus = {
  permitId: string;
  lotoExecutionId: string | null;
  execution: ExecutionListItem | null;
  blocksPermitClosure: boolean;
  blockReason: string | null;
};

/** The public field URL a QR label encodes.
 *
 * ⚠ `/lockout/…`, NOT `/loto/…`, and it must stay that way.
 *
 * Next.js route groups — `(dashboard)`, `(external)` — do NOT create separate
 * URL namespaces. A public page at `(external)/loto/[token]` and the
 * authenticated `(dashboard)/loto/[id]` both resolve to `/loto/<dynamic>`, and
 * Next refuses two different slug names on the same path:
 *
 *     Error: You cannot use different slug names for the same dynamic path
 *            ('id' !== 'token')
 *
 * That throws when the router initialises, so EVERY page in the app 500s while
 * API routes keep working. It survives both `tsc --noEmit` and `next build` and
 * only appears at runtime — which is exactly how it reached production once.
 *
 * Keeping the public view on its own top-level path removes the collision by
 * construction, and matches the `/supplier/[token]` precedent in the same group.
 */
export function qrFieldUrl(token: string, origin = ""): string {
  return `${origin}/lockout/${token}`;
}
