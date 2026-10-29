// Plan-sanity alerts for a permit draft — "does this plan make sense?"
//
// These are not the hard submission rules (those live in the wizard's step
// checks and on the server). They catch plans that pass the rules but can't
// work in practice: a 10-minute hot work permit, a start time that has
// already passed, high-risk work starting before approvals can happen.
//
// Mirrored on the backend in app/services/copilot/ptw_draft.plan_advisories
// so the copilot reports exactly what the form shows. Keep them in step.

import { HAZARD_LABELS, type HazardType, effectiveHazards, requiredControls } from "@/lib/ptw/hazards";

export type PlanAdvisory = {
  id: string;
  level: "warning" | "info";
  title: string;
  message: string;
};

/** Shortest window (minutes) in which each kind of work can actually be done safely. */
export const MIN_WINDOW_MINUTES: Record<string, number> = {
  HOT_WORK: 60,
  CONFINED_SPACE: 60,
  EXCAVATION: 60,
  ELECTRICAL_LOTO: 30,
  WORK_AT_HEIGHT: 30,
  FRAGILE_ROOF: 30,
  LIFTING: 30,
  CIVIL: 30,
  GENERAL: 15
};

/** What has to fit inside the window, per hazard — used in the alert text. */
export const WINDOW_NEEDS: Record<string, string> = {
  HOT_WORK: "a gas test before starting, the hot work itself, and a fire watch for at least 30 minutes after the hot work ends",
  CONFINED_SPACE: "isolation, ventilation and a gas test before entry, the work itself, and a headcount and close-out on exit",
  EXCAVATION: "locating buried services, shoring or benching the sides, the dig itself, and barricading or back-filling",
  ELECTRICAL_LOTO: "isolation, lock-out and a zero-energy test before work, the work itself, and safe restoration",
  WORK_AT_HEIGHT: "setting up access, checking anchors and harnesses, the work itself, and a safe descent",
  FRAGILE_ROOF: "laying crawl boards and edge protection, the work itself, and removing them safely",
  LIFTING: "the lift-plan briefing, rigging checks, setting the exclusion zone, and the lift itself",
  CIVIL: "the pre-job briefing, the work itself, and making the area safe afterwards",
  GENERAL: "the pre-job briefing, the work itself, and restoring the area"
};

const HIGH_RISK = new Set(["HOT_WORK", "CONFINED_SPACE", "WORK_AT_HEIGHT", "FRAGILE_ROOF"]);

function fmtDuration(min: number): string {
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} hour${h === 1 ? "" : "s"}`;
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function parseLocal(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function planAdvisories(input: {
  type: string;
  extraHazards: HazardType[];
  validFrom?: string | null;
  validTo?: string | null;
  now?: Date;
}): PlanAdvisory[] {
  const out: PlanAdvisory[] = [];
  const from = parseLocal(input.validFrom);
  const to = parseLocal(input.validTo);
  if (!input.type || !from || !to || to <= from) return out;
  const now = input.now ?? new Date();
  const hazards = effectiveHazards(input.type, input.extraHazards);
  const controls = requiredControls(input.type, input.extraHazards);
  const minutes = Math.round((to.getTime() - from.getTime()) / 60_000);

  // 1. Window too short for the work — the strictest hazard decides.
  const binding = hazards.reduce<HazardType | null>((best, h) =>
    best === null || (MIN_WINDOW_MINUTES[h] ?? 15) > (MIN_WINDOW_MINUTES[best] ?? 15) ? h : best, null);
  const minNeeded = binding ? MIN_WINDOW_MINUTES[binding] ?? 15 : 15;
  if (binding && minutes < minNeeded) {
    const suggestedEnd = new Date(from.getTime() + minNeeded * 60_000);
    out.push({
      id: "window-too-short",
      level: "warning",
      title: `Only ${fmtDuration(minutes)} for ${HAZARD_LABELS[binding]}`,
      message:
        `What can be done safely in ${fmtDuration(minutes)}? This window has to cover ${WINDOW_NEEDS[binding]}. ` +
        `Plan at least ${fmtDuration(minNeeded)} — for example ${fmtTime(from)}–${fmtTime(suggestedEnd)}. ` +
        `If the job really is that short, say what will be done in the scope so the issuer can judge it.`
    });
  }

  // 2. Start already in the past.
  const pastBy = Math.round((now.getTime() - from.getTime()) / 60_000);
  if (pastBy > 15) {
    out.push({
      id: "start-in-past",
      level: "warning",
      title: "Start time has already passed",
      message:
        `Valid From is ${fmtTime(from)}, ${fmtDuration(pastBy)} ago. A permit authorises work that hasn't started yet — ` +
        `set the time the crew will actually begin, after approval.`
    });
  }

  // 3. High-risk work starting before the approval chain can realistically finish.
  const leadMin = Math.round((from.getTime() - now.getTime()) / 60_000);
  if (leadMin >= -15 && leadMin < 30 && hazards.some((h) => HIGH_RISK.has(h))) {
    out.push({
      id: "no-time-for-approval",
      level: "warning",
      title: leadMin <= 0 ? "Starts now — no time for approval" : `Starts in ${fmtDuration(leadMin)}`,
      message:
        "High-risk permits go through the issuer, the safety officer and often the plant head, then the pre-start checks " +
        `(${controls.has("GAS_TEST") ? "gas test, " : ""}isolation checks, toolbox talk). Allow at least 30–60 minutes ` +
        "before the planned start, or the crew will be waiting on site."
    });
  }

  // 4. Night work on high-risk jobs.
  const spansNight = (() => {
    for (let t = from.getTime(); t < to.getTime(); t += 30 * 60_000) {
      const h = new Date(t).getHours();
      if (h >= 22 || h < 6) return true;
    }
    return false;
  })();
  if (spansNight && hazards.some((h) => HIGH_RISK.has(h))) {
    out.push({
      id: "night-work",
      level: "info",
      title: "Part of the work is at night (22:00–06:00)",
      message:
        "Confirm adequate lighting, a supervisor on site, and that the fire / rescue team is available on the night shift. " +
        "Fatigue is higher at night — keep the crew briefing short and specific."
    });
  }

  // 5. Long high-risk windows that cross shifts.
  if (minutes > 12 * 60 && hazards.some((h) => HIGH_RISK.has(h))) {
    out.push({
      id: "multi-shift",
      level: "info",
      title: `${fmtDuration(minutes)} spans more than one shift`,
      message:
        `Plan the shift handover: who holds the permit on each shift${controls.has("FIRE_WATCH") ? ", the fire-watch rota" : ""}` +
        `${controls.has("GAS_TEST") ? ", and a fresh gas test after any break in work" : ""}. ` +
        "Consider a shorter permit per shift instead."
    });
  }

  return out;
}
