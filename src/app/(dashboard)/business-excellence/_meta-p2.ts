// Shared display vocabulary + types for Business Excellence Phase 2 —
// Suggestion Scheme, Quality Circle and Structured Improvement Project.
//
// Same rule as _meta.ts: labels and chips live here, not inline in each screen,
// so the registers, their detail views and the create forms all name the same
// thing the same way. The raw tokens are the API's — they come from
// GET /api/be/meta/p2, served from the same Python tuples the Pydantic layer
// validates against, so a dropdown here can never offer a value the API rejects.

import type { UserRef } from "./_meta";

export type { UserRef };

// ─── Suggestion Scheme ──────────────────────────────────────────────────────

export const SUGGESTION_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  SCREENING: "With the committee",
  ACCEPTED: "Accepted",
  DEFERRED: "Deferred",
  IN_IMPLEMENTATION: "Implementing",
  IMPLEMENTED: "Implemented",
  CLOSED: "Closed",
  REJECTED: "Not accepted",
  DUPLICATE: "Duplicate"
};

export const SUGGESTION_STATUS_CHIP: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  SUBMITTED: "bg-blue-100 text-blue-800 border-blue-200",
  SCREENING: "bg-indigo-100 text-indigo-800 border-indigo-200",
  ACCEPTED: "bg-violet-100 text-violet-800 border-violet-200",
  // Stone, not rose. A deferral is "good idea, not this year" — colouring it
  // like a rejection tells the submitter their idea was turned down when it
  // was not.
  DEFERRED: "bg-stone-100 text-stone-700 border-stone-200",
  IN_IMPLEMENTATION: "bg-amber-100 text-amber-800 border-amber-200",
  IMPLEMENTED: "bg-teal-100 text-teal-800 border-teal-200",
  CLOSED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-200",
  DUPLICATE: "bg-slate-200 text-slate-600 border-slate-300"
};

export const SCREENING_OUTCOME_LABEL: Record<string, string> = {
  RELEVANT: "Relevant",
  NOT_RELEVANT: "Not relevant",
  DUPLICATE: "Duplicate"
};

export const SUGGESTION_DECISION_LABEL: Record<string, string> = {
  ACCEPT: "Accepted",
  REJECT: "Not accepted",
  DEFER: "Deferred"
};

export const INCENTIVE_STATUS_LABEL: Record<string, string> = {
  NOT_APPLICABLE: "No incentive",
  PROPOSED: "Incentive proposed",
  APPROVED: "Incentive approved",
  PAID: "Incentive paid"
};

/** What each transition button says. Keys are the API's `availableActions`. */
export const SUGGESTION_ACTION_LABEL: Record<string, string> = {
  SUBMITTED: "Submit",
  SCREENING: "Send to committee",
  ACCEPTED: "Accept",
  DEFERRED: "Defer",
  IN_IMPLEMENTATION: "Start implementation",
  IMPLEMENTED: "Mark implemented",
  CLOSED: "Close",
  REJECTED: "Not accepted",
  DUPLICATE: "Mark duplicate"
};

// ─── Quality Circle ─────────────────────────────────────────────────────────

export const QCC_TEAM_STATUS_LABEL: Record<string, string> = {
  FORMING: "Forming",
  ACTIVE: "Active",
  DORMANT: "Dormant",
  DISBANDED: "Disbanded"
};

export const QCC_TEAM_STATUS_CHIP: Record<string, string> = {
  FORMING: "bg-blue-100 text-blue-800 border-blue-200",
  ACTIVE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  DORMANT: "bg-amber-100 text-amber-800 border-amber-200",
  DISBANDED: "bg-slate-200 text-slate-600 border-slate-300"
};

export const QCC_PROJECT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  CHARTERED: "Chartered",
  IN_PROGRESS: "In progress",
  COMPLETED: "Work complete",
  BENEFIT_VALIDATION: "Awaiting benefit sign-off",
  CLOSED: "Closed",
  ABANDONED: "Abandoned",
  REJECTED: "Not approved"
};

export const QCC_PROJECT_STATUS_CHIP: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  CHARTERED: "bg-violet-100 text-violet-800 border-violet-200",
  IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-200",
  // Teal, not emerald. The work is done; whether it SAVED anything is a
  // separate claim that nobody has validated yet.
  COMPLETED: "bg-teal-100 text-teal-800 border-teal-200",
  BENEFIT_VALIDATION: "bg-amber-100 text-amber-800 border-amber-200",
  CLOSED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ABANDONED: "bg-stone-100 text-stone-700 border-stone-200",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-200"
};

export const QCC_MEMBER_ROLE_LABEL: Record<string, string> = {
  LEADER: "Circle leader",
  DEPUTY_LEADER: "Deputy leader",
  FACILITATOR: "Facilitator",
  MEMBER: "Member"
};

export const METHODOLOGY_LABEL: Record<string, string> = {
  DMAIC: "DMAIC",
  PDCA: "PDCA"
};

export const STAGE_LABEL: Record<string, string> = {
  DEFINE: "Define",
  MEASURE: "Measure",
  ANALYZE: "Analyse",
  IMPROVE: "Improve",
  CONTROL: "Control",
  PLAN: "Plan",
  DO: "Do",
  CHECK: "Check",
  ACT: "Act"
};

/** One line on the gate, so a circle knows what the stage is actually for. */
export const STAGE_HINT: Record<string, string> = {
  DEFINE: "What is the problem, and how will we know it is fixed?",
  MEASURE: "What does the baseline actually say?",
  ANALYZE: "Why is it happening? Uses the platform's shared RCA register.",
  IMPROVE: "What did we change, and did the number move?",
  CONTROL: "What stops it coming back once we stop looking?",
  PLAN: "The problem, the baseline and the root cause.",
  DO: "The countermeasure, put in place.",
  CHECK: "Did the number move?",
  ACT: "Standardise it, or go round again."
};

export const STAGE_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  SIGNED_OFF: "Signed off",
  SKIPPED: "Skipped"
};

export const STAGE_STATUS_CHIP: Record<string, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-500 border-slate-200",
  IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-200",
  SIGNED_OFF: "bg-emerald-100 text-emerald-800 border-emerald-200",
  SKIPPED: "bg-stone-100 text-stone-700 border-stone-200"
};

export const QCC_ACTION_LABEL: Record<string, string> = {
  CHARTERED: "Charter the project",
  IN_PROGRESS: "Start work",
  COMPLETED: "Mark work complete",
  BENEFIT_VALIDATION: "Send benefit for sign-off",
  CLOSED: "Close",
  ABANDONED: "Abandon",
  REJECTED: "Do not approve"
};

// ─── SIP ────────────────────────────────────────────────────────────────────

export const SIP_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  COMPLETED: "Work complete",
  BENEFIT_VALIDATION: "Awaiting benefit sign-off",
  CLOSED: "Closed",
  REJECTED: "Not approved",
  CANCELLED: "Cancelled"
};

export const SIP_STATUS_CHIP: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  SUBMITTED: "bg-blue-100 text-blue-800 border-blue-200",
  UNDER_REVIEW: "bg-indigo-100 text-indigo-800 border-indigo-200",
  APPROVED: "bg-violet-100 text-violet-800 border-violet-200",
  IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-200",
  ON_HOLD: "bg-amber-100 text-amber-800 border-amber-200",
  COMPLETED: "bg-teal-100 text-teal-800 border-teal-200",
  BENEFIT_VALIDATION: "bg-amber-100 text-amber-800 border-amber-200",
  CLOSED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-200",
  CANCELLED: "bg-stone-100 text-stone-700 border-stone-200"
};

export const MILESTONE_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Complete",
  DELAYED: "Delayed",
  CANCELLED: "Cancelled"
};

export const MILESTONE_STATUS_CHIP: Record<string, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-500 border-slate-200",
  IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  DELAYED: "bg-rose-100 text-rose-800 border-rose-200",
  CANCELLED: "bg-stone-100 text-stone-700 border-stone-200"
};

export const SIP_ACTION_LABEL: Record<string, string> = {
  SUBMITTED: "Submit for review",
  UNDER_REVIEW: "Begin review",
  APPROVED: "Approve",
  IN_PROGRESS: "Start the project",
  ON_HOLD: "Put on hold",
  COMPLETED: "Mark work complete",
  BENEFIT_VALIDATION: "Send benefit for sign-off",
  CLOSED: "Close",
  REJECTED: "Do not approve",
  CANCELLED: "Cancel"
};

// ─── RAG ────────────────────────────────────────────────────────────────────

export const RAG_LABEL: Record<string, string> = {
  GREEN: "On track",
  AMBER: "At risk",
  RED: "Off track"
};

export const RAG_CHIP: Record<string, string> = {
  GREEN: "bg-emerald-100 text-emerald-800 border-emerald-200",
  AMBER: "bg-amber-100 text-amber-800 border-amber-200",
  RED: "bg-rose-100 text-rose-800 border-rose-200"
};

/**
 * Why the board is showing this colour. RAG is DERIVED at read time from dates
 * that are already on the record — it is never stored — so the explanation is
 * generic by necessity. Saying so is better than a bare coloured dot nobody can
 * argue with.
 */
export const RAG_HINT: Record<string, string> = {
  GREEN: "No overdue gate or milestone, and the target date has not passed.",
  AMBER: "Something has slipped, or the target date is close with work still open.",
  RED: "The target date has passed, or something is more than two weeks late."
};

// ─── Benefit ────────────────────────────────────────────────────────────────

export const BENEFIT_TYPE_LABEL: Record<string, string> = {
  COST_SAVING: "Cost saving",
  QUALITY_IMPROVEMENT: "Quality improvement",
  PRODUCTIVITY_GAIN: "Productivity gain",
  SAFETY_IMPROVEMENT: "Safety improvement",
  DELIVERY_IMPROVEMENT: "Delivery improvement",
  ENVIRONMENT: "Environment",
  OTHER: "Other"
};

export const BENEFIT_STATUS_LABEL: Record<string, string> = {
  PROJECTED: "Projected",
  PENDING_VALIDATION: "Awaiting sign-off",
  VALIDATED: "Validated",
  REJECTED: "Not accepted",
  LAPSED: "Lapsed"
};

export const BENEFIT_STATUS_CHIP: Record<string, string> = {
  // Slate, not green. A projection is a hope, and the register must not let it
  // wear the colour of a confirmed number.
  PROJECTED: "bg-slate-100 text-slate-700 border-slate-200",
  PENDING_VALIDATION: "bg-amber-100 text-amber-800 border-amber-200",
  VALIDATED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-200",
  LAPSED: "bg-stone-100 text-stone-700 border-stone-200"
};

export const VALUE_KIND_LABEL: Record<string, string> = {
  FINANCIAL: "Financial",
  NON_FINANCIAL: "Non-financial"
};

export const BENEFIT_SOURCE_LABEL: Record<string, string> = {
  KAIZEN: "Kaizen",
  SUGGESTION: "Suggestion",
  OPL: "One Point Lesson",
  POKA_YOKE: "Poka Yoke",
  QCC: "Quality Circle",
  SIP: "Improvement Project"
};

export const BENEFIT_SOURCE_HREF: Record<string, string> = {
  KAIZEN: "/business-excellence/kaizen",
  SUGGESTION: "/business-excellence/suggestions",
  OPL: "/business-excellence/opl",
  POKA_YOKE: "/business-excellence/poka-yoke",
  QCC: "/business-excellence/qcc/projects",
  SIP: "/business-excellence/sip"
};

export const VALIDATION_WINDOW_LABEL: Record<number, string> = {
  1: "1 month",
  3: "3 months",
  6: "6 months",
  12: "12 months"
};

// ─── Formatting ─────────────────────────────────────────────────────────────

/**
 * A metric value with its unit. Returns null for an absent figure rather than
 * "0", for the same reason fmtMoney does: "not measured" and "measured as zero"
 * are different facts.
 */
export function fmtMetric(
  value: number | null | undefined,
  unit?: string | null
): string | null {
  if (value === null || value === undefined) return null;
  const n = Number.isInteger(value) ? value.toLocaleString("en-IN") : value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return unit ? `${n} ${unit}` : n;
}

/** "62% of the way there" / "moving the wrong way". */
export function fmtMetricProgress(p: {
  percent: number | null;
  onTrack: boolean | null;
}): string {
  if (p.percent === null) return "Not enough data to measure progress";
  if (p.onTrack === false) return `Moving away from target (${Math.abs(p.percent)}%)`;
  if (p.percent >= 100) return "Target reached";
  return `${p.percent}% of the way to target`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type SuggestionListItem = {
  id: string;
  suggestionNo: string | null;
  title: string;
  category: string;
  status: string;
  plantId: string;
  siteName: string | null;
  areaName: string | null;
  isAnonymous: boolean;
  /** Null when the record is anonymous and the caller is not the submitter. */
  submittedBy: UserRef | null;
  owner: UserRef | null;
  screeningOutcome: string | null;
  decision: string | null;
  incentiveStatus: string;
  targetDate: string | null;
  implementedAt: string | null;
  isOverdue: boolean;
  deferralDue: boolean;
  createdAt: string;
};

export type SuggestionDetail = SuggestionListItem & {
  description: string;
  expectedBenefit: string | null;
  screeningNote: string | null;
  screenedBy: UserRef | null;
  screenedAt: string | null;
  duplicateOfSuggestionId: string | null;
  decisionRationale: string | null;
  decidedBy: UserRef | null;
  decidedAt: string | null;
  deferredUntil: string | null;
  implementationNote: string | null;
  incentivePoints: number | null;
  incentiveAmount: number | null;
  currency: string;
  incentiveNote: string | null;
  convertedToKaizenId: string | null;
  rejectionReason: string | null;
  closedAt: string | null;
  workflowInstanceId: string | null;
  updatedAt: string;
  availableActions: string[];
};

export type QccTeamListItem = {
  id: string;
  teamNo: string | null;
  name: string;
  department: string | null;
  status: string;
  plantId: string;
  siteName: string | null;
  areaName: string | null;
  leader: UserRef | null;
  facilitator: UserRef | null;
  memberCount: number;
  activeProjects: number;
  closedProjects: number;
  formedOn: string | null;
  createdAt: string;
};

export type QccMember = {
  id: string;
  userId: string;
  user: UserRef | null;
  memberRole: string;
  joinedAt: string;
  leftAt: string | null;
};

export type QccTeamDetail = QccTeamListItem & {
  motto: string | null;
  disbandedOn: string | null;
  members: QccMember[];
  updatedAt: string;
};

export type QccStage = {
  id: string;
  stage: string;
  sequence: number;
  status: string;
  summary: string | null;
  startedAt: string | null;
  targetDate: string | null;
  signedOffBy: UserRef | null;
  signedOffAt: string | null;
  signOffNote: string | null;
  /** Empty means the gate can be signed off. Non-empty is why it cannot. */
  signOffBlockers: string[];
};

export type QccProjectListItem = {
  id: string;
  projectNo: string | null;
  title: string;
  category: string;
  status: string;
  plantId: string;
  siteName: string | null;
  areaName: string | null;
  teamId: string;
  teamName: string | null;
  methodology: string;
  rag: string;
  currentStage: string | null;
  signedOffStages: number;
  totalStages: number;
  stagePercent: number | null;
  baselineValue: number | null;
  targetValue: number | null;
  actualValue: number | null;
  metricUnit: string | null;
  targetDate: string | null;
  createdAt: string;
};

export type QccProjectDetail = QccProjectListItem & {
  problemStatement: string;
  selectionRationale: string | null;
  priorityScore: number | null;
  scope: string | null;
  baselineMetric: string | null;
  charteredAt: string | null;
  rcaId: string | null;
  rcaStage: string | null;
  evaluationScore: number | null;
  evaluationRubric: Record<string, any> | null;
  evaluatedBy: UserRef | null;
  evaluatedAt: string | null;
  presentedAt: string | null;
  presentationRef: string | null;
  completedAt: string | null;
  closedAt: string | null;
  rejectionReason: string | null;
  workflowInstanceId: string | null;
  createdBy: UserRef | null;
  updatedAt: string;
  stages: QccStage[];
  benefits: BenefitLine[];
  benefitSummary: BenefitSummary;
  availableActions: string[];
  transitionBlockers: Record<string, string[]>;
};

export type SipMilestone = {
  id: string;
  name: string;
  description: string | null;
  sequence: number;
  owner: UserRef | null;
  plannedDate: string | null;
  revisedDate: string | null;
  actualDate: string | null;
  status: string;
  progressPercent: number | null;
  note: string | null;
  isLate: boolean;
  slipDays: number | null;
};

export type SipListItem = {
  id: string;
  sipNo: string | null;
  title: string;
  category: string;
  status: string;
  plantId: string;
  siteName: string | null;
  areaName: string | null;
  department: string | null;
  sponsor: UserRef | null;
  owner: UserRef | null;
  rag: string;
  metricName: string | null;
  metricUnit: string | null;
  baselineValue: number | null;
  targetValue: number | null;
  latestActualValue: number | null;
  metricPercent: number | null;
  milestoneTotal: number;
  milestoneCompleted: number;
  milestoneLate: number;
  startDate: string | null;
  targetDate: string | null;
  priorityScore: number | null;
  createdAt: string;
};

export type SipDetail = SipListItem & {
  scope: string;
  problemStatement: string | null;
  latestReadingAt: string | null;
  feasibilityScore: number | null;
  impactScore: number | null;
  currency: string;
  investmentCost: number | null;
  lessonsLearned: string | null;
  lessonsLearnedOplId: string | null;
  rcaId: string | null;
  completedAt: string | null;
  closedAt: string | null;
  holdReason: string | null;
  rejectionReason: string | null;
  workflowInstanceId: string | null;
  createdBy: UserRef | null;
  updatedAt: string;
  milestones: SipMilestone[];
  benefits: BenefitLine[];
  benefitSummary: BenefitSummary;
  metricProgress: { percent: number | null; direction: string | null; onTrack: boolean | null };
  availableActions: string[];
  transitionBlockers: Record<string, string[]>;
};

export type BenefitReading = {
  id: string;
  readingAt: string;
  periodLabel: string | null;
  actualValue: number;
  targetValue: number | null;
  note: string | null;
  recordedBy: UserRef | null;
};

export type BenefitLine = {
  id: string;
  plantId: string;
  siteName: string | null;
  sourceType: string;
  sourceId: string;
  sourceRef: string | null;
  benefitType: string;
  valueKind: string;
  currency: string | null;
  unit: string | null;
  projectedValue: number | null;
  realizedValue: number | null;
  annualisedValue: number | null;
  validationWindowMonths: number | null;
  validationDueAt: string | null;
  validatingAuthority: UserRef | null;
  validatedBy: UserRef | null;
  validatedAt: string | null;
  validationNote: string | null;
  status: string;
  note: string | null;
  isValidationDue: boolean;
  createdBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
  readings: BenefitReading[];
  /** Why the CALLER may not validate this line. Empty means they may. */
  validationBlockers: string[];
};

export type BenefitSummary = {
  lines: number;
  validatedLines: number;
  pendingValidation: number;
  overdueValidation: number;
  projectedFinancial: number | null;
  realisedFinancial: number | null;
  nonFinancialLines: number;
};

export type WorkflowSummary = {
  workflowType: string;
  total: number;
  open: number;
  closed: number;
  rejected: number;
  conversionRate: number | null;
  avgCycleTimeDays: number | null;
  overdue: number;
};

export type BeDashboard = {
  workflows: WorkflowSummary[];
  benefit: Partial<BenefitSummary>;
  qccLeaderboard: { teamId: string; teamName: string; closedProjects: number }[];
  sipPortfolio: Record<string, number>;
  generatedAt: string;
};

export const WORKFLOW_LABEL: Record<string, string> = {
  KAIZEN: "Kaizen",
  SUGGESTION: "Suggestion Scheme",
  OPL: "One Point Lessons",
  POKA_YOKE: "Poka Yoke",
  QCC: "Quality Circles",
  SIP: "Improvement Projects"
};

export const WORKFLOW_HREF: Record<string, string> = BENEFIT_SOURCE_HREF;
