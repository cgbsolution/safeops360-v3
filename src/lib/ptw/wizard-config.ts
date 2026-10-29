// Shared PTW wizard vocabularies + the draft shape the copilot exchanges.
//
// Mirrored on the backend in app/services/copilot/ptw_draft.py — keep the
// PPE codes and gas defaults in step with it.

export const PPE_CATALOG: { code: string; label: string }[] = [
  { code: "helmet", label: "Safety Helmet" },
  { code: "shoes", label: "Safety Shoes" },
  { code: "goggles", label: "Safety Goggles" },
  { code: "gloves", label: "Safety Gloves" },
  { code: "welding_gloves", label: "Welding Gloves" },
  { code: "insulated_gloves", label: "Insulated Gloves" },
  { code: "fr_coverall", label: "Fire-Retardant Coverall" },
  { code: "face_shield", label: "Face Shield" },
  { code: "arc_flash_suit", label: "Arc Flash Suit" },
  { code: "harness", label: "Full-body Harness" },
  { code: "lanyard", label: "Energy-absorbing Lanyard" },
  { code: "scba", label: "SCBA / Air Line" },
  { code: "gas_monitor", label: "Personal Gas Monitor" },
  { code: "high_vis", label: "High-vis Vest" },
  { code: "ear_plugs", label: "Ear Plugs" },
  { code: "respirator", label: "Respirator" }
];

export const PPE_DEFAULTS: Record<string, string[]> = {
  HOT_WORK: ["helmet", "shoes", "goggles", "fr_coverall", "welding_gloves", "face_shield"],
  CONFINED_SPACE: ["helmet", "shoes", "harness", "scba", "gas_monitor"],
  WORK_AT_HEIGHT: ["helmet", "shoes", "harness", "lanyard"],
  EXCAVATION: ["helmet", "shoes", "high_vis"],
  ELECTRICAL_LOTO: ["helmet", "shoes", "insulated_gloves", "arc_flash_suit"],
  LIFTING: ["helmet", "shoes", "high_vis", "gloves"],
  GENERAL_COLD: ["helmet", "shoes"]
};

export const DEFAULT_GAS_PARAMS: Record<string, { parameter: string; lowLimit: number; highLimit: number; unit: string }[]> = {
  HOT_WORK: [
    { parameter: "LEL", lowLimit: 0, highLimit: 10, unit: "%" },
    { parameter: "O2", lowLimit: 19.5, highLimit: 23.5, unit: "%" }
  ],
  CONFINED_SPACE: [
    { parameter: "O2", lowLimit: 19.5, highLimit: 23.5, unit: "%" },
    { parameter: "LEL", lowLimit: 0, highLimit: 10, unit: "%" },
    { parameter: "CO", lowLimit: 0, highLimit: 35, unit: "ppm" },
    { parameter: "H2S", lowLimit: 0, highLimit: 10, unit: "ppm" }
  ]
};

export const DEFAULT_GAS_REFRESH: Record<string, number> = { HOT_WORK: 240, CONFINED_SPACE: 120 };

/** The permit draft as the copilot sees it. Times are the datetime-local
 *  wall-clock strings ("YYYY-MM-DDTHH:MM"). */
export type PtwDraft = {
  type?: string;
  extraHazards?: string[];
  validFrom?: string | null;
  validTo?: string | null;
  plantId?: string | null;
  departmentId?: string | null;
  areaId?: string | null;
  specificLocation?: string | null;
  scopeOfWork?: string | null;
  workOrderNumber?: string | null;
  contractorCompanyId?: string | null;
  issuerId?: string | null;
  receiverId?: string | null;
  workCrew?: { userId: string; role: string }[];
  fireWatchPersonId?: string | null;
  standbyPersonId?: string | null;
  isolations?: { isolationType: string; description: string; isolationPointTag: string; lotoTagNumber?: string | null }[];
  requiredPpe?: string[];
  toolsEquipment?: { equipmentId?: string | null; freeTextDescription?: string | null }[];
  subjectEquipment?: { equipmentId: string; workNature: string }[];
  gasTestPlan?: {
    refreshFrequencyMinutes?: number;
    parametersToTest?: { parameter: string; lowLimit?: number | null; highLimit?: number | null; unit: string }[];
    instrumentSerial?: string | null;
    instrumentLastCalibrated?: string | null;
  } | null;
  rescuePlan?: string | null;
  weatherConditionsAtIssue?: string | null;
  windSpeedKmh?: number | null;
  flraRequired?: boolean | null;
  /** Copilot-suggested precaution answers (patch only; the user must confirm them). */
  checklistSuggestions?: Record<string, { itemId: string; response: "YES" | "NA"; remark?: string | null }[]>;
  /** Read-only for the copilot: checklist progress per hazard in force. */
  checklist?: Record<string, { total: number; answered: number; blocker: string | null; suggestedUnconfirmed?: number }>;
  lotoLinked?: boolean;
  hiraLinked?: boolean;
};

/** Server rule-check result (app/services/copilot/ptw_draft.check_draft). */
export type PtwDraftCheck = {
  permitType: string | null;
  effectiveHazards: string[];
  requiredControls: string[];
  validityCapHours: number | null;
  validityHours: number | null;
  sections: { job: string[]; people: string[]; controls: string[]; checklist: string[] };
  warnings: string[];
  /** Plan-sanity alerts (same rules as src/lib/ptw/advisories.ts). */
  alerts?: { id: string; level: "warning" | "info"; title: string; message: string }[];
  readyForChecklist: boolean;
  readyToSubmit: boolean;
  note?: string | null;
};
