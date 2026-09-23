/**
 * Site Safety Check — user-facing terminology for what the schema calls an FLRA.
 *
 * "FLRA" (Field Level Risk Assessment) is safety-industry jargon. Receivers,
 * contractors and shop-floor crew do not recognise the acronym on sight, even
 * though the activity — confirm on-site conditions and PPE before starting work
 * — is universally understood in plain language. The Guided Capture PWA already
 * ships this way ("Job risk check" / "काम से पहले जोखिम जाँच", @/lib/capture/i18n);
 * this module extends the same plain-language rule to the desk and mobile UIs.
 *
 * DISPLAY LAYER ONLY. The `FLRA` table, the `FLRA.*` permission keys, the
 * `/api/flra` routes, `Permit.flraRequired` and every exported PDF / audit-trail
 * line keep the original term — auditors and the historical record need it.
 */

/** Primary user-facing name. Use this in headings, buttons, nav and body copy. */
export const SITE_SAFETY_CHECK = "Site Safety Check";
export const SITE_SAFETY_CHECK_LOWER = "site safety check";
export const SITE_SAFETY_CHECK_PLURAL = "Site Safety Checks";

/**
 * Secondary/technical gloss for the minority of users who *do* know the term.
 * Render as a `title=` tooltip next to the primary label — never as the label.
 */
export const FLRA_TOOLTIP = "Also known as FLRA — Field Level Risk Assessment";

/**
 * Workflow step display names.
 *
 * `WorkflowStep.name` is a BEHAVIOURAL KEY, not a caption: the engine matches on
 * it by string (`workflow_engine.PTW_FLRA_STEP`, `PTW_ACCEPT_STEP`,
 * `PTW_LEGACY_RECEIVER_PREFIX`) and production still runs the pre-rebuild
 * combined step with live tasks parked on it. Renaming the stored value would
 * change engine behaviour and orphan those tasks, so the rename happens here, at
 * render time, and the DB and seeds are left exactly as they are.
 *
 * Keys are the stored names; values are what a human should read.
 */
const STEP_DISPLAY_NAMES: Record<string, string> = {
  // Pre-rebuild combined receiver step — what prod actually runs today.
  "Receiver Acknowledges + FLRA": "Acknowledge & Confirm Site Safety",
  "Receiver Acknowledges + FLRA + LOTO": "Acknowledge & Confirm Site Safety (with Lockout)",
  "Receiver Acknowledges + FLRA + Gas Test": "Acknowledge & Confirm Site Safety (with Gas Test)",
  // Post-rebuild split steps (seeded but not yet applied to prod).
  "FLRA & Crew Sign-off": "Site Safety Check & Crew Sign-off",
};

/**
 * Maps a stored workflow step name to its user-facing caption. Unknown steps —
 * every non-PTW module, and anything an admin renames in the workflow builder —
 * pass straight through untouched.
 */
export function stepDisplayName(storedName: string | null | undefined): string {
  if (!storedName) return "";
  return STEP_DISPLAY_NAMES[storedName] ?? storedName;
}
