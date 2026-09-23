// Shared Business Excellence display vocabulary + types.
//
// Labels and chips live here, NOT inline in each screen, so the three registers,
// their detail views and the create forms all name the same thing the same way.
// The raw tokens are the API's — they come from GET /api/be/meta, which is
// served from the same Python tuples the Pydantic layer validates against, so a
// dropdown here can never offer a value the API rejects.
//
// ⚠ This is the SHOP-FLOOR Kaizen, not the Safety Culture Index's Kaizen Wall
// (/api/sci/kaizen). Two different products that share a Japanese word.

export type KaizenStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "SCREENED"
  | "APPROVED"
  | "IN_IMPLEMENTATION"
  | "IMPLEMENTED"
  | "VERIFIED"
  | "CLOSED"
  | "REJECTED"
  | "PARKED";

export type OplStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "SUPERSEDED"
  | "RETIRED"
  | "REJECTED";

export type PokaYokeStatus =
  | "PROPOSED"
  | "APPROVED"
  | "INSTALLED"
  | "VERIFIED"
  | "ACTIVE"
  | "DEGRADED"
  | "RETIRED"
  | "REJECTED";

export type UserRef = {
  id: string;
  name: string;
  role?: string | null;
  plantName?: string | null;
};

// ─── Kaizen ─────────────────────────────────────────────────────────────────

export const KAIZEN_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  SCREENED: "Screened",
  APPROVED: "Approved",
  IN_IMPLEMENTATION: "Implementing",
  IMPLEMENTED: "Implemented",
  VERIFIED: "Savings verified",
  CLOSED: "Closed",
  REJECTED: "Rejected",
  PARKED: "Parked"
};

export const KAIZEN_STATUS_CHIP: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  SUBMITTED: "bg-blue-100 text-blue-800 border-blue-200",
  SCREENED: "bg-indigo-100 text-indigo-800 border-indigo-200",
  APPROVED: "bg-violet-100 text-violet-800 border-violet-200",
  IN_IMPLEMENTATION: "bg-amber-100 text-amber-800 border-amber-200",
  IMPLEMENTED: "bg-teal-100 text-teal-800 border-teal-200",
  // Emerald is reserved for VERIFIED, not IMPLEMENTED. "Built it" and "proved
  // it saved something" are different claims and the register should not let
  // the first borrow the colour of the second.
  VERIFIED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CLOSED: "bg-slate-200 text-slate-600 border-slate-300",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-200",
  PARKED: "bg-stone-100 text-stone-700 border-stone-200"
};

export const KAIZEN_CATEGORY_LABEL: Record<string, string> = {
  SAFETY: "Safety",
  QUALITY: "Quality",
  COST: "Cost",
  DELIVERY: "Delivery",
  MORALE: "Morale",
  PRODUCTIVITY: "Productivity",
  ENVIRONMENT: "Environment"
};

// ⚠ FAST_TRACK is NOT the Suggestion Scheme. Phase 1 labelled it that way; the
// Suggestion Scheme is now its own register at /business-excellence/suggestions,
// with anonymity, a two-stage committee decision and incentive tracking that a
// Kaizen lane cannot express. This lane is simply a Kaizen small enough for a
// supervisor to approve alone. Two things labelled "Suggestion Scheme" in one
// sidebar is worse than either name on its own.
// The APPROVAL ROUTE a record runs through — not a claim about the idea.
// STANDARD convenes the screening committee; FAST_TRACK lets a supervisor
// accept a small idea without one. Both are live workflow definitions.
export const KAIZEN_LANE_LABEL: Record<string, string> = {
  STANDARD: "Committee screening",
  FAST_TRACK: "Supervisor fast lane"
};

// The "Fast track" BADGE is a different thing and is NOT read off `lane`.
// It is server-computed from the record's own investment and implementation
// window (KaizenListItem.fastTrack). Reading it off the lane is what let five
// records display "Fast track" with no investment and no saving recorded.
export const FAST_TRACK_BADGE_LABEL = "Fast track";

export const SAVING_TYPE_LABEL: Record<string, string> = {
  HARD: "Hard (bookable)",
  SOFT: "Soft (unbookable)"
};

/** What each transition button says. Keys are the API's `availableActions`. */
export const KAIZEN_ACTION_LABEL: Record<string, string> = {
  SUBMITTED: "Submit for screening",
  SCREENED: "Mark screened",
  APPROVED: "Approve",
  IN_IMPLEMENTATION: "Start implementation",
  IMPLEMENTED: "Mark implemented",
  VERIFIED: "Verify savings",
  CLOSED: "Close",
  REJECTED: "Reject",
  PARKED: "Park"
};

// ─── One Point Lesson ───────────────────────────────────────────────────────

export const OPL_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  SUPERSEDED: "Superseded",
  RETIRED: "Retired",
  REJECTED: "Rejected"
};

export const OPL_STATUS_CHIP: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  IN_REVIEW: "bg-amber-100 text-amber-800 border-amber-200",
  // Approved is not yet on the floor — violet, not green. Publishing is the
  // separate act that puts it in front of people.
  APPROVED: "bg-violet-100 text-violet-800 border-violet-200",
  PUBLISHED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  SUPERSEDED: "bg-stone-100 text-stone-700 border-stone-200",
  RETIRED: "bg-slate-200 text-slate-600 border-slate-300",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-200"
};

export const OPL_CATEGORY_LABEL: Record<string, string> = {
  BASIC_KNOWLEDGE: "Basic knowledge",
  IMPROVEMENT_CASE: "Improvement case",
  TROUBLE_CASE: "Trouble case",
  SAFETY: "Safety",
  QUALITY: "Quality"
};

export const ACK_STATUS_LABEL: Record<string, string> = {
  ASSIGNED: "Not read",
  READ: "Read",
  ACKNOWLEDGED: "Acknowledged",
  WAIVED: "Waived"
};

export const ACK_STATUS_CHIP: Record<string, string> = {
  ASSIGNED: "bg-slate-100 text-slate-700 border-slate-200",
  READ: "bg-blue-100 text-blue-800 border-blue-200",
  ACKNOWLEDGED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  WAIVED: "bg-stone-100 text-stone-700 border-stone-200"
};

// ─── Poka Yoke ──────────────────────────────────────────────────────────────

export const POKA_YOKE_STATUS_LABEL: Record<string, string> = {
  PROPOSED: "Proposed",
  APPROVED: "Approved",
  INSTALLED: "Installed",
  VERIFIED: "Verified",
  ACTIVE: "Active",
  DEGRADED: "Not protecting",
  RETIRED: "Retired",
  REJECTED: "Rejected",
  // Not a lifecycle status — a DISPLAY status the API derives when the device
  // has an open bypass. It never appears in the status filter tabs, because
  // there is nothing to filter on: the bypass filter is its own control. Read
  // it off `displayStatus`, never off `status`.
  BYPASSED: "Bypassed"
};

export const POKA_YOKE_STATUS_CHIP: Record<string, string> = {
  PROPOSED: "bg-slate-100 text-slate-700 border-slate-200",
  APPROVED: "bg-violet-100 text-violet-800 border-violet-200",
  // Installed but unverified is amber: it is fitted and nobody has proved it
  // works yet, which is not the same as protecting the line.
  INSTALLED: "bg-amber-100 text-amber-800 border-amber-200",
  VERIFIED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ACTIVE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  DEGRADED: "bg-rose-100 text-rose-800 border-rose-200",
  RETIRED: "bg-slate-200 text-slate-600 border-slate-300",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-200",
  // Amber, not green and not the rose of DEGRADED. A bypassed device is a
  // deliberate, authorised state somebody has to end — distinct from one that
  // failed a check, and emphatically distinct from one that is working.
  BYPASSED: "bg-amber-100 text-amber-900 border-amber-300"
};

export const DEVICE_TYPE_LABEL: Record<string, string> = {
  CONTACT: "Contact",
  FIXED_VALUE: "Fixed value",
  MOTION_STEP: "Motion step"
};

export const APPROACH_LABEL: Record<string, string> = {
  PREVENTION: "Prevention",
  DETECTION: "Detection"
};

/** Spelled out, because the distinction is the register's whole point. */
export const APPROACH_HINT: Record<string, string> = {
  PREVENTION: "Makes the defect impossible",
  DETECTION: "Catches the defect after it happens"
};

export const REACTION_LABEL: Record<string, string> = {
  CONTROL: "Control — stops the process",
  WARNING: "Warning — signals a person"
};

export const FREQUENCY_LABEL: Record<string, string> = {
  SHIFT: "Every shift",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUAL: "Annual"
};

export const VERIFICATION_RESULT_CHIP: Record<string, string> = {
  PASS: "bg-emerald-100 text-emerald-800 border-emerald-200",
  FAIL: "bg-rose-100 text-rose-800 border-rose-200"
};

// ─── Shared formatting ──────────────────────────────────────────────────────

/**
 * A span of hours, said the way somebody on a shop floor would say it.
 *
 * Rounds UP to the next whole unit rather than down. A bypass that has been
 * open for 47 hours reads "2 days", not "1 day" — the number exists to make
 * somebody uncomfortable, and rounding in the flattering direction is how a
 * three-day override reads as an afternoon.
 *
 * Returns null for an absent figure, never "0h": "no bypass is open" and "a
 * bypass opened a moment ago" are different facts.
 */
export function fmtDuration(hours: number | null | undefined): string | null {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return null;
  if (hours < 1) return "under an hour";
  if (hours < 48) {
    const h = Math.ceil(hours);
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  const d = Math.ceil(hours / 24);
  if (d < 14) return `${d} days`;
  const w = Math.floor(d / 7);
  return `${w} week${w === 1 ? "" : "s"}`;
}


/**
 * Money, in the record's own currency.
 *
 * Returns null rather than "₹0" for an absent figure: "no saving was recorded"
 * and "the saving was zero" are different facts, and a register that prints
 * ₹0 for the first will be read as the second.
 */
export function fmtMoney(value: number | null | undefined, currency = "INR"): string | null {
  if (value === null || value === undefined) return null;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(value);
  } catch {
    // An unknown currency code must not blank the number out entirely.
    return `${currency} ${Math.round(value).toLocaleString("en-IN")}`;
  }
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** "in 4 days" / "6 days overdue" — for due dates people have to act on. */
export function fmtDue(value: string | null | undefined): string {
  if (!value) return "No due date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "No due date";
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "Due today";
  if (days > 0) return `Due in ${days} day${days === 1 ? "" : "s"}`;
  return `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`;
}

export type KaizenListItem = {
  id: string;
  kaizenNo: string | null;
  title: string;
  category: string;
  lane: string;
  status: string;
  plantId: string;
  siteName: string | null;
  areaName: string | null;
  lineOrMachine: string | null;
  owner: UserRef | null;
  raisedBy: UserRef | null;
  targetDate: string | null;
  implementedAt: string | null;
  currency: string;
  estimatedAnnualSaving: number | null;
  verifiedAnnualSaving: number | null;
  isOverdue: boolean;
  createdAt: string;
  // Server-computed on every read from investmentCost + the implementation
  // window. Never `lane === "FAST_TRACK"` — see FAST_TRACK_BADGE_LABEL.
  fastTrack: boolean;
  // Plants this idea has actually been deployed at (BeKaizenReplication rows),
  // not `yokotenScope` intentions.
  replicationCount: number;
};

export type KaizenCycleTime = {
  medianDaysRaisedToImplemented: number | null;
  medianDaysRaisedToVerified: number | null;
  implementedSampleSize: number;
  verifiedSampleSize: number;
  minimumSampleSize: number;
};

export type KaizenReplication = {
  id: string;
  replicatedAtPlantId: string;
  replicatedAtPlantName: string | null;
  replicaKaizenId: string | null;
  replicaKaizenNo: string | null;
  replicatedBy: UserRef | null;
  replicatedAt: string;
  notes: string | null;
};

export type KaizenSearchHit = {
  id: string;
  kaizenNo: string | null;
  title: string;
  status: string;
  category: string;
  plantId: string;
  siteName: string | null;
  createdAt: string;
  similarity: number;
};

export type KaizenParticipation = {
  plantId: string | null;
  siteName: string | null;
  submitters: number;
  ideas: number;
  // null, never 0, when the plant has no FactoryProfile — 16 of 28 plants are
  // in that state, so the screen must render "not recorded" rather than 0%.
  headcount: number | null;
  participationRate: number | null;
  ideasPerSubmitter: number | null;
  headcountSource: string;
  topContributors: { user: UserRef | null; ideas: number; verifiedSaving: number | null }[];
  recognitionNote: string | null;
};

export type AckSummary = {
  assigned: number;
  read: number;
  acknowledged: number;
  waived: number;
  overdue: number;
  percent: number | null;
};

export type OplListItem = {
  id: string;
  oplNo: string | null;
  title: string;
  category: string;
  status: string;
  revision: number;
  plantId: string;
  siteName: string | null;
  areaName: string | null;
  lineOrMachine: string | null;
  author: UserRef | null;
  effectiveFrom: string | null;
  reviewDueAt: string | null;
  publishedAt: string | null;
  isReviewOverdue: boolean;
  acknowledgement: AckSummary;
  createdAt: string;
};

export type PokaYokeListItem = {
  id: string;
  deviceNo: string | null;
  title: string;
  status: string;
  deviceType: string;
  approach: string;
  reactionMode: string;
  plantId: string;
  siteName: string | null;
  areaName: string | null;
  lineOrMachine: string | null;
  owner: UserRef | null;
  defectModePrevented: string;
  installedAt: string | null;
  verificationFrequency: string;
  lastVerifiedAt: string | null;
  lastVerificationResult: string | null;
  nextVerificationDueAt: string | null;
  isVerificationOverdue: boolean;
  isBypassed: boolean;
  /**
   * What the badge should say, which is NOT always `status`.
   *
   * A device with an open bypass is not protecting the line whatever its
   * lifecycle column holds. Both values travel so a screen can show the honest
   * one without the register losing what the device was before somebody
   * switched it off. Derived server-side — never recompute it here, or the two
   * halves drift the first time the rule changes.
   */
  displayStatus: string;
  /** Hours the current bypass has been open, measured to now. Null if not bypassed. */
  bypassOpenHours: number | null;
  createdAt: string;
};
