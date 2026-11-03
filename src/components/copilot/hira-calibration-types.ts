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
// Mirrors the backend services/hira_calibration (review_v2.py, risk_engine.py,
// recommend.py, service.py). Keep the two in step.

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

export type EntryStatus = "INHERENT_ONLY" | "RESOLVED" | "OVERRIDE_PENDING" | "OPEN";

export type EntryDriver = {
  key: string;
  name: string;
  rating: CalibrationRating;
};

export type CalibrationEntry = {
  inherent: CalibrationRating | null;
  /** null when no controls are recorded: never show a residual band then. */
  residual: CalibrationRating | null;
  drivers: EntryDriver[];
  inherentOnly: boolean;
  status: EntryStatus;
  /** "Inherent only. Existing controls not captured" when inherentOnly. */
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
  finding: SeverityFinding | null;
  spreadClamped?: boolean;
};

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

export type TolerabilityRoute = "CONTROLS" | "ALARP_CHECKLIST" | "OVERRIDE";

export type AlarpItem = "eliminationConsidered" | "engineeringInPlaceOrPlanned" | "statutoryCurrent" | "reviewDateSet";

export type Tolerability = {
  state: TolerabilityState;
  /** What ends it; null when ACCEPTABLE or TOLERABLE_ALARP. */
  route: TolerabilityRoute | null;
  /** ALARP checklist items still missing (route ALARP_CHECKLIST). */
  missing: AlarpItem[];
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
  inherent: CalibrationRating;
  /** null when no controls are recorded. */
  residual: CalibrationRating | null;
  residualAssessed: boolean;
  credits: ControlCredit[];
  /** Some of the credit comes from unverified controls. */
  provisional: boolean;
  tolerability: Tolerability | null;
  /** Low hazard: listed only, no further work asked. */
  collapsed: boolean;
  alarp: Record<AlarpItem, boolean>;
  plannedCovers: boolean;
  regulationSuggestion: RegulationSuggestion | null;
};

export type FindingClass = "BLOCKER" | "ADVISORY" | "INFO";

export type FindingAction = "USE_EXISTING_CONTROLS" | "ADD_RECOMMENDATIONS" | "APPLY_DEFAULTS" | "OVERRIDE";

export type CalibrationFinding = {
  code: string;
  class: FindingClass;
  title: string;
  detail: string;
  fix: string | null;
  hazardKeys: string[];
  action: FindingAction | null;
};

export type CalibrationRecommendation = {
  /** Catalogue id, e.g. "LIFT-ENG-2". */
  id: string;
  hierarchy: ControlHierarchy;
  description: string;
  targetHazards: { key: string; name: string }[];
  /** e.g. "L -1", "S -1", "L -1, S -1". */
  expectedEffect: string;
  residualAfter: CalibrationRating;
  costBand: CostBand;
  ownerRole: string;
  dueDays: number;
  /** ISO date (yyyy-mm-dd). */
  dueDate: string;
  raisesCapa: boolean;
  kind: "CAPA" | "IMPROVEMENT_NOTE";
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

export type SkippedCandidate = {
  candidate: string;
  reason: string;
};

export type ExistingControlProposal = {
  hierarchy: ControlHierarchy;
  description: string;
  /** "Equipment register", "Entry #4 (same study)", "Earlier version v2"… */
  source: string;
  verificationMethod?: string | null;
  effectiveness: ControlEffectiveness;
  hazardKeys: string[];
};

export type SuggestedDefaults = {
  /** Existing controls with no effectiveness yet. */
  controlEffectiveness: { key: string; effectiveness: ControlEffectiveness }[];
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

export type HiraCalibrationReviewData = {
  version: "v2";
  mode: CalibrationMode;
  /** False until the per-hazard database columns exist: per-hazard values are estimates. */
  schemaReady: boolean;
  engineVersion?: string;
  entryId: string;
  label: string;
  activity: string;
  /** WITH_CONTROLS: a single-rating sheet whose rating already includes the listed controls. */
  ratingBasis: "INHERENT" | "WITH_CONTROLS";
  matrixRule: MatrixRule;
  evidence: CalibrationEvidence;
  entry: CalibrationEntry;
  hazards: CalibrationHazard[];
  /** One line per hazard: what the recorded controls justify. */
  controlsJustify: string[];
  findings: CalibrationFinding[];
  /** At most 3, blockers first. */
  shownFindings: CalibrationFinding[];
  counts: Record<FindingClass, number>;
  canSubmit: boolean;
  recommendations: CalibrationRecommendation[];
  recommendationCap: number;
  linkedCapas: LinkedCapa[];
  skippedCandidates?: SkippedCandidate[];
  existingControlProposals: ExistingControlProposal[];
  suggestedDefaults: SuggestedDefaults;
  alarpDraft: string | null;
};

export type CalibrationApplyPart = "EXISTING_CONTROLS" | "RECOMMENDATIONS" | "DEFAULTS";

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
