// Maps a dashboard pathname to the licence module that gates it. Mirrors the
// backend app/licensing/router_map.py — the frontend version operates on URL
// prefixes so the route guard can block direct navigation to a module the
// licence doesn't include (UX layer; the API is the real boundary).
//
// `null` (or an unmatched path) means CORE / always-reachable: dashboard,
// inbox, configuration, the licence screen itself, and anything we don't gate.
// Most-specific prefix wins, so /erm/bcm resolves to BCM before /erm → ERM.

type Entry = [prefix: string, moduleCode: string];

// Ordered longest-prefix-first. Sub-modules of ERM are listed before the /erm
// base so they gate on their own code.
const ROUTE_MODULE: Entry[] = [
  ["/erm/bcm", "BCM"],
  ["/erm/controls", "CONTROL"],
  ["/erm/vendors", "VENDOR"],
  ["/erm/insurance", "INSURANCE"],
  ["/erm/kris", "KRI"],
  ["/erm/appetite", "APPETITE"],
  ["/erm/compliance", "ERM_COMPLIANCE"],
  ["/erm/loss", "LOSS"],
  ["/erm", "ERM"],
  ["/observations", "OBSERVATION"],
  ["/near-miss", "NEAR_MISS"],
  ["/ptw", "PTW"],
  ["/flra", "FLRA"],
  ["/incidents", "INCIDENT"],
  ["/hira", "HIRA"],
  ["/eai", "EAI"],
  // /risk-dashboard is gone — the aggregation dashboard is now the Analytics
  // tab of /risk-register, which already gates on the same module.
  ["/risk-register", "RISK_AGG"],
  ["/capa", "CAPA"],
  ["/moc", "MOC"],
  ["/compliance", "STATUTORY_REGISTERS"],
  ["/facilities", "FACILITIES"],
  ["/cams", "CAMS"],
  ["/audit-compliance", "CAMS"],
  ["/training-intelligence", "COMPETENCY"],
  ["/training", "TRAINING"],
  ["/skill-matrix", "COMPETENCY"],
  ["/sci", "SCI"],
  ["/ppe", "PPE"],
  ["/inspections", "INSPECTION"],
  ["/manhours", "MANHOURS"],
  ["/anomalies", "ANOMALIES"],
  ["/epc", "EPC"],
  // AI agent configuration belongs to the AI assist module (licensed; switched
  // off per site where a tenant does not use it).
  ["/configuration/agents", "AI_ASSIST"],
  // Ungated modules (no licence code): always on, unless the active plant has
  // an explicit OFF row — see UNGATED_MODULES and app/licensing/plant_modules.py.
  ["/dashboard/daily", "ALERTS"],
  ["/loto", "LOTO"],
  ["/fire-safety", "FIRE"],
  ["/capture", "CAPTURE"],
  ["/field-reports", "CAPTURE"],
  ["/brsr", "BRSR"],
  ["/business-excellence", "BUSINESS_EXCELLENCE"],
  ["/scorecard", "SCORECARD"],
  ["/signals", "SIGNALS"],
];

/** Modules mounted ungated: on unless the plant switched them off. Mirrors
 *  UNGATED_MODULES in the backend's app/licensing/plant_modules.py. */
export const UNGATED_MODULES: ReadonlySet<string> = new Set([
  "ALERTS", "LOTO", "FIRE", "CAPTURE", "BRSR", "BUSINESS_EXCELLENCE", "TRAINING_ENGINE", "SCORECARD", "SIGNALS",
  "CAMS_GENERAL",
]);

// CAMS surfaces a Fire-Safety-only plant keeps. Every other /cams or
// /audit-compliance path additionally needs CAMS_GENERAL (on unless the plant
// switched it off — backend: plant_modules.cams_fire_only_guard).
const CAMS_FIRE_ONLY_PATHS = ["/cams/engagements", "/cams/findings"];

/** Every module code `pathname` needs (empty when the route is core). */
export function modulesForPath(pathname: string): string[] {
  const base = moduleForPath(pathname);
  if (!base) return [];
  const isCams = pathname === "/cams" || pathname.startsWith("/cams/") || pathname.startsWith("/audit-compliance");
  const fireOk = CAMS_FIRE_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  return isCams && !fireOk ? [base, "CAMS_GENERAL"] : [base];
}

/** The module code that gates `pathname`, or null when the route is core. */
export function moduleForPath(pathname: string): string | null {
  for (const [prefix, code] of ROUTE_MODULE) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return code;
  }
  return null;
}
