/**
 * Midnight Executive — the SafeOps360 design system, as computed values.
 *
 * Single source of truth for every colour this system names. Tailwind's
 * `primary` / `gold` / `ice` scales and the CSS custom properties in
 * globals.css are generated from exactly these numbers; nothing here is
 * eyeballed and nothing is duplicated by hand elsewhere.
 *
 * ── The three brand anchors ──────────────────────────────────────────────
 *   navy #0B1F4D   OKLCH L 0.255  C 0.089  H 263.6   contrast on white 15.94
 *   gold #C9A961   OKLCH L 0.748  C 0.099  H  86.1   contrast on white  2.25
 *   ice  #E8EEF7   OKLCH L 0.947  C 0.014  H 258.3   contrast on white  1.17
 *
 * ── Why the anchors are NOT the chart colours ────────────────────────────
 * Fed to the data-viz validator as a categorical set on this app's chart
 * surface (#ffffff), the three anchors FAIL on three of the five computable
 * checks: navy and ice sit outside the categorical lightness band (0.43–0.77),
 * all three fall under the chroma floor, and gold (2.25:1) and ice (1.17:1)
 * fall under the 3:1 mark-contrast rule — ice is very nearly invisible as a
 * mark on a white card.
 *
 * There is a second, structural problem the eye does not catch: **navy and ice
 * are the same hue** (263.6° vs 258.3°, a 5° difference). "Navy / gold / ice"
 * is a TWO-hue system wearing three names. Using it as three categorical slots
 * would spend the identity channel on two colours that a reader — and every
 * CVD simulation — sees as one colour at two lightnesses.
 *
 * So the anchors keep the job they are good at (ink, accent and surface) and
 * the chart marks use the nearest step of the SAME two hue families that
 * passes all six checks. The brand is intact; the chart is legible.
 *
 *     node scripts/validate_palette.js "#2C4C91,#B68F2E,#6393DB" \
 *          --mode light --surface "#ffffff"
 *     [PASS] Lightness band       all 3 inside L 0.43–0.77
 *     [PASS] Chroma floor         all 3 >= 0.1
 *     [PASS] CVD separation       worst adjacent #6393DB↔#B68F2E ΔE 23.6 (protan) · tritan 19.4
 *     [PASS] Normal-vision floor  worst adjacent ΔE 24.0
 *     [PASS] Contrast vs surface  all 3 >= 3:1
 *     → ALL CHECKS PASS
 *
 * Because slots 1 and 3 are one hue at two lightnesses, the trend chart also
 * carries a second encoding that does not depend on colour at all: bars for
 * the monthly counts, a line for the backlog, plus a legend.
 */

/** The three literal brand anchors. Ink, accent, surface — never chart marks. */
export const BRAND = {
  navy: "#0B1F4D",
  gold: "#C9A961",
  ice: "#E8EEF7",
} as const;

/**
 * Navy ramp, hue-locked to the brand navy at H 263.6°.
 * `900` IS the brand navy and `100` IS the brand ice — the ramp is anchored on
 * them rather than approximating them.
 */
export const NAVY = {
  50: "#F2F7FF",
  100: "#E8EEF7", // = BRAND.ice
  200: "#CBDDFF",
  300: "#A7C3F8",
  400: "#799FEA",
  500: "#517DDC",
  600: "#3560BE",
  700: "#284A94", // link / interactive ink — 8.41:1 on white
  800: "#1C346B",
  900: "#0B1F4D", // = BRAND.navy
  950: "#08132A",
} as const;

/** Gold ramp, hue-locked at H 86.1°. `500` IS the brand gold. */
export const GOLD = {
  50: "#FFF6E2",
  100: "#F6ECD7",
  200: "#EEDAB0",
  300: "#DECAA0",
  400: "#D9B86E",
  500: "#C9A961", // = BRAND.gold
  600: "#AF8F46",
  700: "#96772C",
  800: "#7C5E07", // gold as readable ink — 6.07:1 on white
  900: "#624900",
} as const;

/**
 * Chart series, in fixed slot order. Never cycled, never reassigned by rank.
 * All six checks PASS on #ffffff (see the header).
 */
export const SERIES = {
  /** slot 1 — navy family. Opened. */
  opened: "#2C4C91",
  /** slot 2 — gold family. Closed. */
  closed: "#B68F2E",
  /** slot 3 — navy family, ice end. Open backlog (drawn as a LINE, not a bar). */
  backlog: "#6393DB",
} as const;

/** Area wash under the backlog line — the literal brand ice, used as a surface. */
export const SERIES_FILL = { backlog: BRAND.ice } as const;

/**
 * Ordinal ramp for open-record age. One hue (navy), light→dark, because age is
 * an ordered magnitude and not four unrelated categories.
 *
 *     node scripts/validate_palette.js "#799fea,#517ddc,#3560be,#1c346b" --ordinal
 *     [PASS] Lightness monotone · [PASS] Adjacent ΔL >= 0.06
 *     [PASS] Light-end contrast 2.64:1 · [PASS] Single hue (spread 1°)
 *     → ALL CHECKS PASS
 */
export const AGE_RAMP = [NAVY[400], NAVY[500], NAVY[600], NAVY[800]] as const;

/**
 * Status scale — RESERVED. Never reused as "series 4".
 *
 * Deliberately three steps, not a rainbow, and deliberately no orange: the two
 * upper steps are crimson and the brand gold's ink step, so an attention state
 * on this product never reads as a generic amber alert borrowed from somewhere
 * else. Every pair below clears 4.5:1 as text on its own tint:
 *   high    #9B2C2C on #FBECEC → 6.56:1
 *   medium  #7C5E07 on #F6ECD7 → 5.17:1
 *   low     #284A94 on #E8EEF7 → 7.21:1
 *
 * `ink` and `bar` are separate on purpose. Ink has to clear 4.5:1 as text; a
 * bar fill does not, because every bar in this app ships a visible label AND a
 * value beside it, so colour is carrying nothing on its own. Using the ink step
 * as a fill made the medium bar read brown rather than gold — technically safe,
 * and wrong about the brand. `bar` takes the true brand gold (2.25:1), which is
 * legal only under that label-and-value condition.
 *
 * Status colour never travels alone — every consumer ships the word too.
 */
export const STATUS = {
  high: { ink: "#9B2C2C", tint: "#FBECEC", line: "#EFD3D3", bar: "#9B2C2C" },
  medium: { ink: GOLD[800], tint: GOLD[100], line: GOLD[300], bar: GOLD[500] },
  low: { ink: NAVY[700], tint: NAVY[100], line: NAVY[200], bar: NAVY[400] },
} as const;

/**
 * Data-quality treatment. Distinct from `STATUS` on purpose: a data-quality
 * flag is not a severity — it says the measurement itself is unsafe, which is
 * a different claim from "this is bad". It wears the brand gold so it reads as
 * "look here" without borrowing the red that means "something is wrong in the
 * plant".
 */
export const DATA_QUALITY = {
  ink: GOLD[800],
  tint: GOLD[50],
  line: GOLD[300],
  strongInk: GOLD[900],
} as const;

/** Recessive chart chrome — grid, axis, muted label. */
export const CHROME = {
  grid: "#E3E8F0",
  axis: "#C6D0E0",
  muted: "#5B6980",
} as const;

/** Neutral ink scale, cooled toward navy so text and brand sit in one family. */
export const INK = {
  strong: "#0B1F4D",
  base: "#1F2A44",
  muted: "#5B6980",
  faint: "#8593A8",
} as const;

/** Single hue for identity breakdowns (category / type / area / plant). */
export const NEUTRAL_BAR = SERIES.opened;

/**
 * Type. Georgia for display, Calibri for body — both resolve without a webfont
 * request, which matters because this product is deployed into plants with
 * poor connectivity and is expected to survive an airgap.
 */
export const TYPE = {
  display: 'Georgia, "Times New Roman", "Nimbus Roman", serif',
  body: 'Calibri, "Carlito", "Segoe UI", system-ui, -apple-system, sans-serif',
} as const;

/** Severity-ish token → status step. Null when the value is not a severity. */
export function severityStep(key: string): (typeof STATUS)[keyof typeof STATUS] | null {
  switch (key.toUpperCase()) {
    case "CRITICAL":
    case "URGENT":
    case "SIGNIFICANT":
    case "HIGH":
    case "MAJOR":
      return STATUS.high;
    case "MEDIUM":
    case "MODERATE":
    case "WATCH":
      return STATUS.medium;
    case "LOW":
    case "MINOR":
    case "INFO":
      return STATUS.low;
    default:
      return null;
  }
}
