// Types for the calibrated Copilot review of a HIRA entry.
//
// GET /api/copilot/hira-review/{entryId} returns this shape ("version": "v2")
// when the plant's calibration flag is ON, or for a calibration manager with
// `?preview=v2`. Otherwise it returns the older v1 shape (see HiraReview in
// hira-copilot-review.tsx).
//
// POST /api/hira/entries/{entryId}/calibration/apply returns
// CalibrationApplyResponse, whose `review` is this same shape after the change.
//
// `scope` says what the calibrated rules cover for this entry:
//   - scope.calibrated false (e.g. a HAZOP study): structural checks only;
//     no rating, residual, recommendation or defaults.
//   - scope.validated false (the plant is on a DRAFT rubric pack): inherent and
//     suggested controls only; no residual, tolerability, ALARP draft or blocker.
// Use canShowResidualClaim() before rendering any residual / tolerability.
//
// Mirrors the backend services/hira_calibration (review_v2.py, risk_engine.py,
// recommend.py, rubric_packs.py, service.py). Keep the two in step.

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

/** Per-plant flag: OFF -> v1, SHADOW -> v1 shown (v2 logged), ON -> v2. */
export type CalibrationMode = "OFF" | "SHADOW" | "ON";

export type ControlHierarchy = "ELIMINATION" | "SUBSTITUTION" | "ENGINEERING" | "ADMINISTRATIVE" | "PPE";

export type ControlEffectiveness = "EFFECTIVE" | "PARTIALLY_EFFECTIVE" | "INEFFECTIVE" | "NOT_VERIFIED";

export type CostBand = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export type CalibrationRating = {
  likelihood: number;
  severity: number;
  score: number;
  level: RiskLevel;
};

export type MatrixRule = {
  /** e.g. "STD_5X5", or a plant sheet rule such as "JSL_QSD24_GT". */
  code: string;
  /** "FREQUENCY" scales get the evidence cap; a plant index scale does not. */
  likelihoodScale: "FREQUENCY" | "PLANT_INDEX";
  /** Plant rule that treats a MODERATE residual as not acceptable. */
  moderateNotAcceptable: boolean;
};

export type EvidenceByHazard = {
  family: string;
  window?: number;
  "12m"?: number;
  failures?: string[];
};

export type CalibrationEvidence = {
  /** Incidents + near misses in the evidence window. */
  eventsInWindow: number;
  eventsIn12Months: number;
  /** Overdue statutory exams, failed inspections. */
  controlFailures: string[];
  windowMonths: number;
  /** Human-readable lines for the rationale. */
  lines: string[];
  /** Keyed by hazard key. */
  byHazard: Record<string, EvidenceByHazard>;
};

/**
 * NOT_VALIDATED: the plant's rubric pack is a draft (scope.validated false).
 * NOT_CALIBRATED: the study type is not task-based HIRA (scope.calibrated false).
 */
export type EntryStatus =
  | "INHERENT_ONLY"
  | "RESOLVED"
  | "OVERRIDE_PENDING"
  | "OPEN"
  | "NOT_VALIDATED"
  | "NOT_CALIBRATED";

/** Worst hazard tolerability across the entry; null when nothing is rated. */
export type EntryState = "ACCEPTABLE" | "TOLERABLE_ALARP" | "NOT_ACCEPTABLE" | "OVERRIDE";

export type EntryDriver = {
  key: string;
  name: string;
  rating: CalibrationRating;
};

export type CalibrationEntry = {
  /** Informational only: no blocker, recommendation or CAPA rests on it. */
  inherent: CalibrationRating | null;
  /** "Inherent (before controls)". Absent on a structural (not calibrated) review. */
  inherentLabel?: string;
  /** null when no controls are recorded, or the scope is not validated: never show a residual band then. */
  residual: CalibrationRating | null;
  drivers: EntryDriver[];
  inherentOnly: boolean;
  status: EntryStatus;
  /** null when nothing is rated or the scope is not validated. Absent on a structural review. */
  state?: EntryState | null;
  /** "Inherent only. Existing controls not captured" when inherentOnly; the scope banner when not validated. */
  residualLabel: string | null;
};

export type HazardLikelihood = {
  value: number;
  proposed: number;
  /** Lowered to what the plant's records support. */
  capped: boolean;
  reason: string;
};

export type SeverityFinding = {
  kind: "OVERSTATED" | "UNDERSTATED";
  reason: string;
};

export type HazardSeverity = {
  value: number;
  proposed: number;
  credibleMin: number | null;
  credibleMax: number | null;
  /** Severity rubric rule that set the credible floor, e.g. "HEIGHT_AT_OR_ABOVE_THRESHOLD_OR_EDGE_S4". */
  rubricRule: string | null;
  finding: SeverityFinding | null;
  spreadClamped?: boolean;
};

/** max(rated S, credible floor): S<=3 hazards confirm routine controls; S>=4 follow controls / ALARP / override. */
export type SeverityTier = "S<=3" | "S>=4";

export type CreditStatus =
  | "CREDITED"
  | "PROVISIONAL"
  | "COUNTED_WITH_ABOVE"
  | "BASELINE"
  | "NOT_RELEVANT"
  | "PLANNED"
  /** Single-rating sheet: the control is already inside the recorded rating. */
  | "IN_RATING";

export type ControlCredit = {
  /** Absent on IN_RATING credits (single-rating sheets). */
  key?: string | null;
  control: string;
  hierarchy: ControlHierarchy;
  /** Which axis the control reduces: likelihood or severity. */
  axis?: "L" | "S" | null;
  steps: number;
  status: CreditStatus;
  reason: string;
};

export type TolerabilityState = "ACCEPTABLE" | "TOLERABLE_ALARP" | "NOT_ACCEPTABLE";

/**
 * CONFIRM_CONTROLS: an S<=3 hazard; the assessor confirms the routine controls.
 * VERIFY_CONTROLS: the controls in place would settle the hazard once verified;
 * the assessor records how each is checked instead of adding controls.
 */
export type TolerabilityRoute = "CONTROLS" | "ALARP_CHECKLIST" | "OVERRIDE" | "CONFIRM_CONTROLS" | "VERIFY_CONTROLS";

export type AlarpItem = "eliminationConsidered" | "engineeringInPlaceOrPlanned" | "statutoryCurrent" | "reviewDateSet";

/** ALARP items (route ALARP_CHECKLIST), or what CONFIRM_CONTROLS still needs. */
export type TolerabilityMissing = AlarpItem | "verifiedControl" | "routineControls" | "controlVerification";

export type Tolerability = {
  state: TolerabilityState;
  /** What ends it; null when ACCEPTABLE or TOLERABLE_ALARP. */
  route: TolerabilityRoute | null;
  /** ALARP items still missing (ALARP_CHECKLIST), or "verifiedControl" / "routineControls" (CONFIRM_CONTROLS). */
  missing: TolerabilityMissing[];
  overridden: boolean;
  note: string;
};

export type RegulationSuggestion = {
  regulation: string;
  section: string | null;
  /** "suggested, verify" */
  note: string;
};

export type CalibrationHazard = {
  key: string;
  name: string;
  code: string | null;
  family: string;
  consequence: string | null;
  ratingSource: "STORED" | "ESTIMATED_FROM_ENTRY";
  likelihood: HazardLikelihood;
  severity: HazardSeverity;
  severityTier: SeverityTier;
  /** Informational only (before controls). */
  inherent: CalibrationRating;
  /** null when no controls are recorded, or the scope is not validated. */
  residual: CalibrationRating | null;
  residualAssessed: boolean;
  credits: ControlCredit[];
  /** Some of the credit comes from unverified controls. */
  provisional: boolean;
  /** null when the residual is not assessed or the scope is not validated. */
  tolerability: Tolerability | null;
  /** Low hazard: listed only, no further work asked. */
  collapsed: boolean;
  alarp: Record<AlarpItem, boolean>;
  plannedCovers: boolean;
  regulationSuggestion: RegulationSuggestion | null;
  /** A non-baseline control on this hazard has a recorded verification method. */
  verifiedControl: boolean;
  /** Existing-control keys credited without a verification method. */
  unverifiedControlKeys: string[];
  /** No practicable control is left in the catalogue for this hazard. */
  controlsExhausted?: boolean;
};

export type FindingClass = "BLOCKER" | "ADVISORY" | "INFO";

export type FindingAction =
  | "USE_EXISTING_CONTROLS"
  | "ADD_RECOMMENDATIONS"
  | "APPLY_DEFAULTS"
  | "OVERRIDE"
  | "CONFIRM_ROUTINE_CONTROLS";

/**
 * Finding codes the review emits. STRUCT_* come from the structural review of a
 * study type the calibrated rules do not cover (scope.calibrated false).
 */
export type KnownFindingCode =
  | "NO_CONTROLS"
  | "CONFIRM_ROUTINE_CONTROLS"
  | "VERIFY_CONTROLS"
  | "HAZARD_NOT_ACCEPTABLE"
  | "NO_FURTHER_CONTROL"
  | "ALARP_ENGINEERING"
  | "ALARP_RECORD"
  | "OVERRIDE_ROUTE"
  | "NO_RATING_CREDIT"
  | "SAVED_RESIDUAL_LOWER"
  | "LIKELIHOOD_UNSUPPORTED"
  | "SEVERITY_UNDERSTATED"
  | "CONTROLS_PROVISIONAL"
  | "BASELINE_RECORDED"
  | "ESTIMATED_PER_HAZARD"
  | "REGULATION_SUGGESTED"
  | "STRUCT_NO_HAZARDS"
  | "STRUCT_NOT_RATED"
  | "STRUCT_NO_CONSEQUENCE"
  | "STRUCT_NO_CONTROLS";

/**
 * Findings that rest on a residual band / tolerability. The backend drops them
 * when the scope is not validated (rubric_packs.apply_scope); the card does too.
 */
export const TOLERABILITY_FINDING_CODES: ReadonlySet<string> = new Set<KnownFindingCode>([
  "HAZARD_NOT_ACCEPTABLE",
  "ALARP_ENGINEERING",
  "ALARP_RECORD",
  "OVERRIDE_ROUTE",
  "NO_FURTHER_CONTROL",
  "CONFIRM_ROUTINE_CONTROLS",
  "VERIFY_CONTROLS",
  "SAVED_RESIDUAL_LOWER",
  "NO_RATING_CREDIT"
]);

export type CalibrationFinding = {
  /** A KnownFindingCode; any string is accepted so a newer backend code still renders. */
  code: KnownFindingCode | (string & {});
  class: FindingClass;
  title: string;
  detail: string;
  fix: string | null;
  hazardKeys: string[];
  action: FindingAction | null;
};

/**
 * CAPA / IMPROVEMENT_NOTE: rated controls (residualAfter is the new rating).
 * IMPROVEMENT_NO_RATING_CREDIT: a plant-index sheet rating already includes the
 *   controls, so a new control changes nothing until the team re-scores it.
 * SUGGESTION: the scope is not validated; a catalogue control, not rated.
 */
export type RecommendationKind = "CAPA" | "IMPROVEMENT_NOTE" | "IMPROVEMENT_NO_RATING_CREDIT" | "SUGGESTION";

export type CalibrationRecommendation = {
  /** Catalogue id, e.g. "LIFT-ENG-2". */
  id: string;
  hierarchy: ControlHierarchy;
  description: string;
  targetHazards: { key: string; name: string }[];
  /** e.g. "L -1", "S -1", "L -1, S -1"; plain words for the no-credit / suggestion kinds. */
  expectedEffect: string;
  /** null for SUGGESTION. The unchanged rating for IMPROVEMENT_NO_RATING_CREDIT (do not show it). */
  residualAfter: CalibrationRating | null;
  costBand: CostBand;
  ownerRole: string;
  dueDays: number;
  /** ISO date (yyyy-mm-dd). */
  dueDate: string;
  raisesCapa: boolean;
  kind: RecommendationKind;
  source: string;
  family: string;
  interimMeasure: string | null;
  /** The same control is proposed on sibling entries of the study. */
  studyLevel: boolean;
  /** Sibling entry labels, e.g. ["#2", "#3"]. */
  sharedWith: string[];
};

export type LinkedCapa = {
  id: string;
  number: string;
  text: string;
  /** Hazard names the open CAPA already covers. */
  hazards: string[];
};

/** A hazard left open with no practicable catalogue control. */
export type UncoveredHazard = {
  key: string;
  name: string;
  residual: CalibrationRating | null;
  reason: string;
};

export type SkippedCandidate = {
  candidate: string;
  reason: string;
};

export type ExistingControlProposal = {
  hierarchy: ControlHierarchy;
  description: string;
  /** "Equipment register", "Entry #4 (same study)", "Routine control (confirm it is in place)"… */
  source: string;
  verificationMethod?: string | null;
  /** A routine control to confirm (low-severity hazards), not one found in plant records. */
  routine?: true;
  effectiveness: ControlEffectiveness;
  hazardKeys: string[];
};

export type SuggestedDefaults = {
  /** Existing controls with no effectiveness yet. */
  controlEffectiveness: { key: string; effectiveness: ControlEffectiveness }[];
  /**
   * Recorded controls with no verification method: "Confirm routine controls"
   * (apply part CONFIRM_ROUTINE_CONTROLS) records the assessor's confirmation on
   * them. Absent on a structural review.
   */
  confirmControls?: { key: string; verificationMethod: string }[];
  /** Recommended controls missing an owner or date. */
  recommendedDefaults: { key: string; ownerRole: string; proposedImplementationDate: string }[];
  /** ISO date; null when a review date is already set. */
  nextReviewDue: string | null;
  alarpRecord: {
    alarpFurtherControlsConsidered: boolean;
    alarpFurtherControlsDescription: string;
  } | null;
  /** Only saved once the per-hazard columns exist (schemaReady). */
  hazardRatings: {
    key: string;
    likelihood: number;
    severity: number;
    likelihoodRationale: string;
    severityRationale: string;
  }[];
  regulations: ({ key: string } & RegulationSuggestion)[];
};

/** Study types; only TASK_BASED is calibrated. */
export type HiraType = "TASK_BASED" | "HAZOP_PHA" | (string & {});

export type RubricPackStatus = "VALIDATED" | "DRAFT" | (string & {});

export type RubricPackRef = {
  code: string;
  name: string;
  status: RubricPackStatus;
};

/**
 * What the calibrated rules cover for this entry.
 * calibrated false: the study type is not covered; structural checks only.
 * validated false: the plant's rubric pack is a draft; no residual / tolerability claim.
 */
export type CalibrationScope = {
  hiraType: HiraType;
  calibrated: boolean;
  validated: boolean;
  pack: RubricPackRef | null;
  /** e.g. "Not validated for this industry: ratings are suggestions"; null when validated. */
  banner: string | null;
  /** e.g. "task-based HIRA, Steel and heavy industry". */
  validatedFor: string;
};

export type HiraCalibrationReviewData = {
  version: "v2";
  mode: CalibrationMode;
  /** False until the per-hazard database columns exist: per-hazard values are estimates. */
  schemaReady: boolean;
  engineVersion?: string;
  entryId: string;
  label: string;
  activity: string;
  hiraType?: HiraType;
  /** false: structural review only (same as scope.calibrated). */
  calibrated?: boolean;
  scope?: CalibrationScope;
  /** WITH_CONTROLS: a single-rating sheet whose rating already includes the listed controls. */
  ratingBasis: "INHERENT" | "WITH_CONTROLS";
  /** Absent on a structural review. */
  matrixRule?: MatrixRule;
  /** Absent on a structural review. */
  evidence?: CalibrationEvidence;
  entry: CalibrationEntry;
  hazards: CalibrationHazard[];
  /** One line per hazard: what the recorded controls justify. Empty when not validated. */
  controlsJustify: string[];
  findings: CalibrationFinding[];
  /** At most 3, blockers first. */
  shownFindings: CalibrationFinding[];
  counts: Record<FindingClass, number>;
  canSubmit: boolean;
  recommendations: CalibrationRecommendation[];
  recommendationCap: number;
  linkedCapas: LinkedCapa[];
  uncoveredHazards?: UncoveredHazard[];
  skippedCandidates?: SkippedCandidate[];
  existingControlProposals: ExistingControlProposal[];
  suggestedDefaults: SuggestedDefaults;
  /** null when not validated. */
  alarpDraft: string | null;
};

/**
 * CONFIRM_ROUTINE_CONTROLS: adds the proposed / routine controls (as
 * EXISTING_CONTROLS does) and records the assessor's confirmation as the
 * verification method on the recorded controls in suggestedDefaults.confirmControls.
 */
export type CalibrationApplyPart = "EXISTING_CONTROLS" | "RECOMMENDATIONS" | "DEFAULTS" | "CONFIRM_ROUTINE_CONTROLS";

export type CalibrationApplyRequest = {
  parts: CalibrationApplyPart[];
  changeReason?: string;
  recommendationIds?: string[];
};

export type CalibrationApplyResponse = {
  /** Plain descriptions of what was done, e.g. "existing controls", "review date". */
  applied: string[];
  mode: CalibrationMode;
  review: HiraCalibrationReviewData;
};

/** GET /api/hira/calibration/scope?plantId=... (shown in the Copilot panel). */
export type CalibrationScopeResponse = {
  mode: CalibrationMode;
  validatedFor: string;
  pack: RubricPackRef | null;
  validated: boolean;
  banner: string | null;
  packs: (RubricPackRef & { industries: string[] })[];
};

/**
 * True only when a residual band, tolerability, "what the controls justify",
 * an ALARP draft or a blocker may be shown: a v2 review that is calibrated and
 * whose scope is validated. Accepts any review shape (v1, v2 or null).
 *
 * Deliberately not a type guard: false does not mean "not v2", so a guard
 * would wrongly narrow a v2 review to `never` in the false branch.
 */
export function canShowResidualClaim(review: { version?: string } | null | undefined): boolean {
  if (!review || review.version !== "v2") return false;
  const r = review as HiraCalibrationReviewData;
  return r.scope?.validated !== false && r.calibrated !== false;
}
