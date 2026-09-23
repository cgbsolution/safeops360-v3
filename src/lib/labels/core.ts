// Tenant display-label overrides — shared (client + server) resolution.
//
// Every call site passes the literal it rendered before the override layer
// existed:  L("term.plant", "Plant").  With no override row for the active
// plant — true for every pre-existing site — the default comes back unchanged,
// so the page renders exactly as it did. An override row can only REPLACE a
// label; a missing, null or blank row always falls through to the default.
//
// UI rendering layer only: nothing here renames a field, column or API key, and
// free-text content (descriptions, notes) is never passed through it.

export type LabelMap = Readonly<Record<string, string>>;
export type LabelFn = (key: string, fallback: string) => string;

export function resolveLabel(labels: LabelMap | null | undefined, key: string, fallback: string): string {
  const v = labels?.[key];
  return typeof v === "string" && v.trim() ? v : fallback;
}

export function makeLabelFn(labels: LabelMap | null | undefined): LabelFn {
  return (key, fallback) => resolveLabel(labels, key, fallback);
}

/** Identity resolver — used before labels load and outside a provider. */
export const DEFAULT_LABELS: LabelFn = (_key, fallback) => fallback;

// Well-known vocabulary keys. Nav items use `nav.<href>`, sections
// `nav.section.<key>`; everything else is a `term.*` key below.
export const TERM = {
  plant: "term.plant",
  plants: "term.plants",
  allPlants: "term.all_plants",
  factory: "term.factory",
  factories: "term.factories",
  shiftSupervisor: "term.shift_supervisor",
  productionLine: "term.production_line",
  plantHead: "term.plant_head",
  plantManager: "term.plant_manager",
} as const;

export const navKey = (href: string) => `nav.${href}`;
export const navSectionKey = (key: string) => `nav.section.${key}`;
