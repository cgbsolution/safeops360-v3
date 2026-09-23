/**
 * PTW hazard taxonomy — client mirror of `app/services/ptw_hazards.py`.
 *
 * A permit carries ONE base type plus N hazard annexures. Attaching a hazard
 * brings its precaution checklist, tightens the validity cap, adds mandatory
 * controls and can escalate the approval chain.
 *
 * ⚠ This is a UX mirror, not the authority. The server recomputes every rule
 * here at create time (union competency, union cap, union controls, union
 * workflow chain) and refuses the permit if the client got it wrong. Keep the
 * two in step, but never treat this file as the gate.
 */

export type HazardType =
  | "HOT_WORK"
  | "CONFINED_SPACE"
  | "WORK_AT_HEIGHT"
  | "FRAGILE_ROOF"
  | "EXCAVATION"
  | "ELECTRICAL_LOTO"
  | "LIFTING"
  | "CIVIL"
  | "GENERAL";

export type PrecautionAnswer = "YES" | "NO" | "NA";

export const HAZARD_LABELS: Record<HazardType, string> = {
  HOT_WORK: "Hot Work",
  CONFINED_SPACE: "Confined Space",
  WORK_AT_HEIGHT: "Height Work",
  FRAGILE_ROOF: "Work on Fragile Roof",
  EXCAVATION: "Excavation Work",
  ELECTRICAL_LOTO: "Electrical / LOTO",
  LIFTING: "Lifting Operations",
  CIVIL: "Civil Work",
  GENERAL: "General Work"
};

/** The hazard a base permit type always contributes. */
const BASE_TO_HAZARD: Record<string, HazardType> = {
  HOT_WORK: "HOT_WORK",
  CONFINED_SPACE: "CONFINED_SPACE",
  WORK_AT_HEIGHT: "WORK_AT_HEIGHT",
  EXCAVATION: "EXCAVATION",
  ELECTRICAL_LOTO: "ELECTRICAL_LOTO",
  LIFTING: "LIFTING",
  GENERAL_COLD: "GENERAL"
};

/** Higher wins when picking the union approval chain. */
const RISK_RANK: Record<HazardType, number> = {
  CONFINED_SPACE: 100,
  HOT_WORK: 90,
  WORK_AT_HEIGHT: 80,
  FRAGILE_ROOF: 75,
  EXCAVATION: 70,
  ELECTRICAL_LOTO: 60,
  LIFTING: 50,
  CIVIL: 20,
  GENERAL: 10
};

const VALIDITY_CAP_HOURS: Record<HazardType, number> = {
  HOT_WORK: 24,
  CONFINED_SPACE: 24,
  FRAGILE_ROOF: 24,
  WORK_AT_HEIGHT: 72,
  EXCAVATION: 72,
  ELECTRICAL_LOTO: 72,
  LIFTING: 72,
  CIVIL: 72,
  GENERAL: 72
};

export type ControlCode = "GAS_TEST" | "FIRE_WATCH" | "STANDBY" | "RESCUE_PLAN";

const CONTROLS: Record<HazardType, ControlCode[]> = {
  HOT_WORK: ["GAS_TEST", "FIRE_WATCH"],
  CONFINED_SPACE: ["GAS_TEST", "STANDBY", "RESCUE_PLAN"],
  WORK_AT_HEIGHT: ["RESCUE_PLAN"],
  FRAGILE_ROOF: ["RESCUE_PLAN"],
  LIFTING: ["STANDBY"],
  EXCAVATION: [],
  ELECTRICAL_LOTO: [],
  CIVIL: [],
  GENERAL: []
};

export function hazardForBaseType(baseType: string): HazardType {
  return BASE_TO_HAZARD[baseType] ?? "GENERAL";
}

/** Hazards a permit can have attached ON TOP of its base type. */
export function attachableHazards(baseType: string): HazardType[] {
  const base = hazardForBaseType(baseType);
  return (Object.keys(HAZARD_LABELS) as HazardType[])
    .filter((h) => h !== base)
    .sort((a, b) => RISK_RANK[b] - RISK_RANK[a]);
}

/** Base type's hazard + attached, de-duplicated, most severe first. */
export function effectiveHazards(baseType: string, attached: HazardType[]): HazardType[] {
  const set = new Set<HazardType>([hazardForBaseType(baseType), ...attached]);
  return [...set].sort((a, b) => RISK_RANK[b] - RISK_RANK[a]);
}

/** Tightest cap across every hazard in force. */
export function validityCapHours(baseType: string, attached: HazardType[]): number {
  return Math.min(...effectiveHazards(baseType, attached).map((h) => VALIDITY_CAP_HOURS[h]));
}

/** Which hazard is responsible for the cap — so the message can say why. */
export function bindingCapHazard(baseType: string, attached: HazardType[]): HazardType {
  return effectiveHazards(baseType, attached).reduce((best, h) =>
    VALIDITY_CAP_HOURS[h] < VALIDITY_CAP_HOURS[best] ? h : best
  );
}

/** Union of mandatory controls across all hazards in force. */
export function requiredControls(baseType: string, attached: HazardType[]): Set<ControlCode> {
  const out = new Set<ControlCode>();
  for (const h of effectiveHazards(baseType, attached)) {
    for (const c of CONTROLS[h]) out.add(c);
  }
  return out;
}

/** Which hazard(s) made a given control mandatory — used to explain the ask. */
export function controlDrivers(
  baseType: string,
  attached: HazardType[],
  control: ControlCode
): HazardType[] {
  return effectiveHazards(baseType, attached).filter((h) => CONTROLS[h].includes(control));
}

// ─── Checklist catalog + answers ───────────────────────────────────────────

export type PrecautionItem = {
  id: string;
  hazardType: HazardType;
  sequence: number;
  text: string;
  isMandatory: boolean;
  allowsNA: boolean;
  sourceRef?: string | null;
};

export type AnswerMap = Record<string, { response: PrecautionAnswer; remark: string }>;

/**
 * The client mirror of `ptw_annexures.evaluate_annexure`.
 *
 * Returns the human-readable reason this checklist is not yet acceptable, or
 * null when it is. Kept in the same shape as the server verdict so the wizard
 * and the detail panel can never disagree with the API about "complete".
 */
export function checklistBlocker(
  items: PrecautionItem[],
  answers: AnswerMap,
  label: string
): string | null {
  const unanswered: string[] = [];
  const refused: string[] = [];
  const naNoRemark: string[] = [];

  for (const item of items) {
    const a = answers[item.id];
    if (!a) {
      if (item.isMandatory) unanswered.push(item.text);
      continue;
    }
    if (a.response === "NO" && item.isMandatory) refused.push(item.text);
    else if (a.response === "NA") {
      if (!item.allowsNA) refused.push(item.text);
      else if (!a.remark.trim()) naNoRemark.push(item.text);
    }
  }

  if (unanswered.length) {
    return `${label}: ${unanswered.length} precaution${unanswered.length === 1 ? "" : "s"} unanswered.`;
  }
  if (refused.length) {
    return `${label}: a mandatory precaution is not in place. Put the control in place or remove this hazard from the permit.`;
  }
  if (naNoRemark.length) {
    return `${label}: "Not applicable" needs a reason.`;
  }
  return null;
}

/** Answered-vs-required counter for the progress pill on each tab. */
export function checklistProgress(items: PrecautionItem[], answers: AnswerMap) {
  const required = items.filter((i) => i.isMandatory).length;
  const done = items.filter((i) => {
    const a = answers[i.id];
    if (!a) return false;
    if (a.response === "NA" && (!i.allowsNA || !a.remark.trim())) return false;
    if (a.response === "NO" && i.isMandatory) return false;
    return true;
  }).length;
  return { done, required, total: items.length };
}
