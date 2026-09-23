/**
 * The register workspace registry — one entry per Tier-2 register.
 *
 * ## Why this file exists
 *
 * Before the Analytics Navigation Reset the sidebar carried ~20
 * analytics-adjacent rows: eleven per-module "X Analytics" screens plus a
 * handful of cross-cutting dashboards. The eleven were removed from the
 * sidebar in an earlier pass, but their ROUTES stayed — reachable by URL,
 * linked from a button on the register header, owned by nobody. That is the
 * worst of both worlds: the nav claims they are gone and the app disagrees.
 *
 * This registry is the cutover. Every register is a WORKSPACE with tabs, and
 * analytics is one of those tabs rather than a destination of its own. A tab
 * is either:
 *
 *   - a PANE on the register route (`/observations?tab=analytics`), rendered
 *     by @/components/analytics/register-workspace, or
 *   - a CROSS-ROUTE tab that keeps its own path, because something other than
 *     navigation depends on that path. Training Intelligence and the LOTO
 *     lockout register are both in this class: `src/lib/licensing/route-map.ts`
 *     gates `/training-intelligence` on COMPETENCY and `/training` on TRAINING,
 *     so collapsing the former into `?tab=` on the latter would silently move
 *     it to a different licence module.
 *
 * ## Flow keys
 *
 * `flow` is the key the backend analytics engine knows the register by
 * (app/services/analytics/specs.py). It is NOT always the register slug —
 * "near-miss" is `nearmiss`, "incidents" is `incident`. Where `flow` is null
 * the register's analytics is domain-specific and rendered by a custom pane
 * instead of the shared contract view.
 *
 * `signalsModule` is the token the Signal Engine rules declare in
 * `source_modules`. Registers no rule reads (EAI, Inspections) get NO Signals
 * tab — an empty tab on a screen that promises cross-module findings reads as
 * "nothing is wrong here", which is a claim the engine never made.
 */

export type WorkspaceTab = {
  /** `?tab=` value for a pane, or a stable id for a cross-route tab. */
  key: string;
  label: string;
  /** Absolute href. Panes point back at the register route with `?tab=`. */
  href: string;
  /** True when the tab is a separate route rather than a pane on the register. */
  crossRoute?: boolean;
};

export type RegisterKey =
  | "observations"
  | "near-miss"
  | "incidents"
  | "capa"
  | "hira"
  | "eai"
  | "moc"
  | "risk-register"
  | "erm-register"
  | "inspections"
  | "training"
  | "audits"
  | "loto"
  | "ptw";

export type RegisterSpec = {
  key: RegisterKey;
  /** Title shown on non-register tabs. Matches the sidebar entry. */
  title: string;
  /** The register route — the workspace own path. */
  base: string;
  /** Backend analytics flow key, or null when analytics is domain-specific. */
  flow: string | null;
  /** Signal Engine module token, or null when no rule reads this register. */
  signalsModule: string | null;
  /** Permission gate for the analytics + signals panes. */
  permission?: string;
  /** Breadcrumb trail prefix for non-register tabs. */
  section?: string;
  tabs: WorkspaceTab[];
};

/** Register tab + analytics pane + optional signals pane, in that order. */
function standardTabs(
  base: string,
  opts: {
    registerLabel?: string;
    analytics?: boolean;
    signals?: boolean;
    extra?: WorkspaceTab[];
  } = {}
): WorkspaceTab[] {
  const tabs: WorkspaceTab[] = [
    { key: "register", label: opts.registerLabel ?? "Register", href: base },
  ];
  if (opts.analytics !== false) {
    tabs.push({ key: "analytics", label: "Analytics", href: `${base}?tab=analytics` });
  }
  if (opts.signals) {
    tabs.push({ key: "signals", label: "Signals", href: `${base}?tab=signals` });
  }
  if (opts.extra) tabs.push(...opts.extra);
  return tabs;
}

export const REGISTERS: Record<RegisterKey, RegisterSpec> = {
  observations: {
    key: "observations",
    title: "Safety Observations",
    base: "/observations",
    flow: "observation",
    signalsModule: "OBSERVATION",
    permission: "OBSERVATION.READ",
    section: "Operational Safety",
    tabs: standardTabs("/observations", { signals: true }),
  },
  "near-miss": {
    key: "near-miss",
    title: "Near Miss",
    base: "/near-miss",
    flow: "nearmiss",
    signalsModule: "NEAR_MISS",
    permission: "NEAR_MISS.READ",
    section: "Operational Safety",
    tabs: standardTabs("/near-miss", { signals: true }),
  },
  incidents: {
    key: "incidents",
    title: "Incident Investigation",
    base: "/incidents",
    flow: "incident",
    signalsModule: "INCIDENT",
    permission: "INCIDENT.READ",
    section: "Operational Safety",
    tabs: standardTabs("/incidents", { signals: true }),
  },
  ptw: {
    key: "ptw",
    title: "Permit to Work",
    base: "/ptw",
    flow: "ptw",
    signalsModule: "PTW",
    permission: "PTW.READ",
    section: "Operational Safety",
    tabs: standardTabs("/ptw", { registerLabel: "Permits", signals: true }),
  },
  loto: {
    key: "loto",
    title: "LOTO — Lockout/Tagout",
    base: "/loto",
    // The analytics flow is over LOTO EXECUTIONS, not the procedure library:
    // a published procedure is in force rather than outstanding, so
    // "opened vs closed" over the library would be a chart of nothing.
    flow: "loto",
    signalsModule: "LOTO",
    permission: "LOTO.READ",
    section: "Operational Safety",
    tabs: standardTabs("/loto", {
      registerLabel: "Procedures",
      signals: true,
      extra: [
        {
          key: "executions",
          label: "Lockout Records",
          href: "/loto/executions",
          crossRoute: true,
        },
      ],
    }),
  },
  hira: {
    key: "hira",
    title: "HIRA — Risk Register",
    base: "/hira",
    flow: "hira",
    signalsModule: "HIRA",
    permission: "HIRA.READ",
    section: "Risk Management",
    tabs: standardTabs("/hira", { registerLabel: "Studies", signals: true }),
  },
  eai: {
    key: "eai",
    title: "EAI — Environmental Register",
    base: "/eai",
    flow: "eai",
    // No signal rule reads EAI. See the file header: no tab rather than an
    // empty one.
    signalsModule: null,
    permission: "EAI.READ",
    section: "Risk Management",
    tabs: standardTabs("/eai", { registerLabel: "Studies" }),
  },
  "risk-register": {
    key: "risk-register",
    title: "Combined Risk Register",
    base: "/risk-register",
    // Deliberately null. This register lists HIRA + EAI rows; the shared
    // contract "risk" flow is over EnterpriseRisk, a different population
    // that belongs to /erm/register. Its Analytics tab is the aggregation
    // dashboard that reads the same HIRA + EAI data the list does.
    flow: null,
    signalsModule: "ERM",
    permission: "RISK.COMBINED_VIEW",
    section: "Risk Management",
    tabs: standardTabs("/risk-register", { signals: true }),
  },
  "erm-register": {
    key: "erm-register",
    title: "Risk Register (ERM)",
    base: "/erm/register",
    flow: "risk",
    signalsModule: "ERM",
    permission: "ERM.READ",
    section: "Enterprise Risk (ERM)",
    tabs: standardTabs("/erm/register", { signals: true }),
  },
  capa: {
    key: "capa",
    title: "CAPA — Universal",
    base: "/capa",
    flow: "capa",
    signalsModule: "CAPA",
    permission: "CAPA.READ",
    section: "Risk Management",
    tabs: standardTabs("/capa", { signals: true }),
  },
  moc: {
    key: "moc",
    title: "MOC — Management of Change",
    base: "/moc",
    flow: "moc",
    signalsModule: "MOC",
    permission: "MOC.READ",
    section: "Risk Management",
    tabs: standardTabs("/moc", { signals: true }),
  },
  inspections: {
    key: "inspections",
    title: "Inspection Schedule",
    base: "/inspections",
    flow: "inspection",
    signalsModule: null,
    permission: "INSPECTION.READ",
    section: "Assets & Inspection",
    tabs: standardTabs("/inspections", { registerLabel: "Schedule" }),
  },
  training: {
    key: "training",
    title: "Training",
    base: "/training",
    flow: "training",
    signalsModule: "TRAINING",
    permission: "TRAINING.READ",
    section: "People & Competency",
    tabs: standardTabs("/training", {
      signals: true,
      extra: [
        {
          key: "intelligence",
          label: "Intelligence",
          href: "/training-intelligence",
          crossRoute: true,
        },
      ],
    }),
  },
  audits: {
    key: "audits",
    title: "Audits",
    base: "/cams/audits",
    flow: "audit",
    signalsModule: "CAMS_AUDIT",
    permission: "AUDIT_COMPLIANCE.READ",
    section: "CAMS — Audit & Compliance",
    tabs: standardTabs("/cams/audits", {
      signals: true,
      extra: [
        { key: "benchmarking", label: "Benchmarking", href: "/cams/audits?tab=benchmarking" },
      ],
    }),
  },
};

export function registerSpec(key: RegisterKey): RegisterSpec {
  return REGISTERS[key];
}

/**
 * Normalise a `?tab=` value against what the register actually offers.
 *
 * An unknown or absent tab resolves to "register". A tab that exists in the
 * abstract but not on THIS register (`?tab=signals` on EAI) also resolves to
 * "register" rather than rendering an empty pane — the reader is put back on
 * real records instead of being shown a blank that looks like an answer.
 */
export function resolveTab(key: RegisterKey, raw: string | undefined): string {
  const wanted = (raw ?? "").trim().toLowerCase();
  if (!wanted || wanted === "register") return "register";
  const tab = REGISTERS[key].tabs.find((t) => t.key === wanted && !t.crossRoute);
  return tab ? tab.key : "register";
}

/** Every register that contributes an analytics flow, in reading order. */
export const ANALYTICS_REGISTERS: RegisterKey[] = [
  "observations",
  "near-miss",
  "incidents",
  "ptw",
  "loto",
  "hira",
  "eai",
  "risk-register",
  "erm-register",
  "capa",
  "moc",
  "inspections",
  "training",
  "audits",
];

/** Backend analytics flow key → the register whose Analytics tab serves it. */
export const REGISTER_BY_FLOW: Record<string, RegisterKey> = Object.fromEntries(
  (Object.keys(REGISTERS) as RegisterKey[])
    .filter((k) => REGISTERS[k].flow)
    .map((k) => [REGISTERS[k].flow as string, k])
);

/** Where a flow's analytics now lives, or null if no register claims it. */
export function analyticsHrefForFlow(flow: string): string | null {
  const key = REGISTER_BY_FLOW[flow];
  return key ? `${REGISTERS[key].base}?tab=analytics` : null;
}
