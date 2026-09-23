// Shared types + presentation vocabulary for the BRSR Reporting module.
//
// Mirrors app/schemas/brsr.py. The design language here is Midnight Executive
// (navy #0B1F4D, gold #C9A961, ice #E8EEF7; Georgia display, Calibri body) —
// already the house style for the insight and capture surfaces, so the tokens
// below are named rather than inlined per component.

export const MX = {
  navy: "#0B1F4D",
  navySoft: "#1B3A6B",
  gold: "#C9A961",
  goldSoft: "#E3D2A6",
  ice: "#E8EEF7",
  iceDeep: "#CFDCEE",
  display: "Georgia, 'Times New Roman', serif",
  body: "Calibri, 'Segoe UI', system-ui, sans-serif",
} as const;

export type CycleStatus =
  | "DRAFT" | "DATA_COLLECTION" | "REVIEW" | "APPROVED" | "FILED";

export type Provenance =
  | "AUTO" | "MANUAL" | "AUTO_OVERRIDDEN" | "NOT_APPLICABLE";

export type Cycle = {
  id: string;
  financialYear: string;
  periodStart: string;
  periodEnd: string;
  status: CycleStatus;
  entityName?: string | null;
  cin?: string | null;
  stockExchangeCodes?: string[];
  registeredOfficeAddress?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  assuranceProvider?: string | null;
  assuranceType?: string | null;
  completionPct: number;
  autoPopulatedPct: number;
  lastComputedAt?: string | null;
  approvedById?: string | null;
  approvedAt?: string | null;
  filedById?: string | null;
  filedAt?: string | null;
  filingReference?: string | null;
  snapshotHash?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PrincipleProgress = {
  principle: string;
  title: string;
  status: string;
  isPlatformSourced: boolean;
  totalIndicators: number;
  answeredIndicators: number;
  autoPopulatedIndicators: number;
  manualPendingIndicators: number;
  completionPct: number;
  autoPopulatedPct: number;
};

export type EnvTotals = {
  sitesReporting: number;
  energyTotalGj: number;
  energyRenewableGj: number;
  energyNonRenewableGj: number;
  waterWithdrawnKl: number;
  waterDischargedKl: number;
  waterConsumedKl: number;
  waterRecycledKl: number;
  scope1TCo2e: number;
  scope2TCo2e: number;
  scope3TCo2e?: number | null;
  wasteGeneratedT: number;
  wasteRecoveredT: number;
  wasteDisposedT: number;
  wasteDivertedPct?: number | null;
  turnoverInr?: number | null;
  unresolvedEmissionLines: number;
};

export type CycleDashboard = {
  cycle: Cycle;
  principles: PrincipleProgress[];
  environmental: EnvTotals;
  unverifiedAutoCount: number;
  sitesExpected: number;
  sitesReported: number;
};

export type SourceRecordRef = {
  module: string;
  entity: string;
  id: string;
  label: string;
};

export type Indicator = {
  code: string;
  section: "A" | "B" | "C";
  principle?: string | null;
  indicatorClass?: "ESSENTIAL" | "LEADERSHIP" | null;
  label: string;
  groupLabel?: string | null;
  guidance?: string | null;
  valueType: "NUMBER" | "TEXT" | "BOOLEAN" | "TABLE";
  unit?: string | null;
  tableSchemaJson?: { key: string; label: string; type: string }[] | null;
  isMandatory: boolean;
  displayOrder: number;
  sebiFormatVersion?: string | null;
};

export type IndicatorValue = {
  id?: string | null;
  indicatorCode: string;
  valueNumber?: number | null;
  valueText?: string | null;
  valueBoolean?: boolean | null;
  valueJson?: unknown;
  unit?: string | null;
  provenance: Provenance;
  notApplicableReason?: string | null;
  sourceModule?: string | null;
  resolverKey?: string | null;
  sourceRecordRefs?: SourceRecordRef[] | null;
  sourceRecordCount?: number | null;
  derivationNote?: string | null;
  computedAt?: string | null;
  autoValueNumber?: number | null;
  autoValueText?: string | null;
  overrideReason?: string | null;
  overriddenById?: string | null;
  overriddenAt?: string | null;
  isVerified: boolean;
  verifiedById?: string | null;
  verifiedAt?: string | null;
  evidenceNote?: string | null;
};

export type IndicatorWithValue = { indicator: Indicator; value?: IndicatorValue | null };

export type PrincipleResponse = {
  id: string;
  cycleId: string;
  principle: string;
  title?: string | null;
  status: string;
  isPlatformSourced: boolean;
  ownerUserId?: string | null;
  dueDate?: string | null;
  totalIndicators: number;
  answeredIndicators: number;
  autoPopulatedIndicators: number;
  manualPendingIndicators: number;
  completionPct: number;
  autoPopulatedPct: number;
  narrative?: string | null;
  reviewedById?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  lastComputedAt?: string | null;
};

export type PrincipleDetail = {
  response: PrincipleResponse;
  essentialIndicators: IndicatorWithValue[];
  leadershipIndicators: IndicatorWithValue[];
};

export type EnvLine = {
  id: string;
  stream: string;
  categoryCode: string;
  categoryLabel?: string | null;
  flowType: string;
  destination: string;
  treatmentLevel?: string | null;
  quantity?: number | null;
  unit?: string | null;
  scope?: string | null;
  factorValue?: number | null;
  factorPerUnit?: string | null;
  factorSource?: string | null;
  computedTCo2e?: number | null;
  dataQuality?: string | null;
  evidenceNote?: string | null;
  notes?: string | null;
};

export type EnvMetric = {
  id: string;
  cycleId: string;
  siteId: string;
  siteName?: string | null;
  periodLabel: string;
  status: "DRAFT" | "SUBMITTED" | "VERIFIED";
  turnoverInr?: number | null;
  productionVolume?: number | null;
  productionUnit?: string | null;
  scope3TCo2e?: number | null;
  scope3Methodology?: string | null;
  isWaterPositive?: boolean | null;
  hasZeroLiquidDischarge?: boolean | null;
  consentStatus?: string | null;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  notes?: string | null;
  lines: EnvLine[];
};

export type EnvSlot = {
  stream: string;
  categoryCode: string;
  categoryLabel: string;
  flowType: string;
  destination: string;
  destinationLabel?: string | null;
  unit?: string | null;
  scope?: string | null;
  guidance?: string | null;
};

export type SweepResult = {
  populated: number;
  skippedManual: number;
  noData: number;
  failed: { indicatorCode: string; resolverKey: string; error: string }[];
  misconfigured: string[];
  completion: Record<string, Record<string, number>>;
};

export type TrendPoint = {
  financialYear: string;
  status: string;
  energyTotalGj?: number | null;
  scope1TCo2e?: number | null;
  scope2TCo2e?: number | null;
  waterConsumedKl?: number | null;
  wasteGeneratedT?: number | null;
  turnoverInr?: number | null;
  energyIntensity?: number | null;
  emissionsIntensity?: number | null;
  waterIntensity?: number | null;
  ltifr?: number | null;
};

// ── presentation vocabulary ─────────────────────────────────────────────────

export const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = {
  DRAFT: "Draft",
  DATA_COLLECTION: "Data Collection",
  REVIEW: "Review",
  APPROVED: "Approved",
  FILED: "Filed",
};

export const CYCLE_STATUS_CHIP: Record<CycleStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  DATA_COLLECTION: "bg-sky-50 text-sky-800 border-sky-200",
  REVIEW: "bg-amber-50 text-amber-900 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  FILED: "bg-[#0B1F4D] text-[#E3D2A6] border-[#0B1F4D]",
};

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  AUTO: "From platform data",
  MANUAL: "Entered manually",
  AUTO_OVERRIDDEN: "Platform figure overridden",
  NOT_APPLICABLE: "Not applicable",
};

export const PROVENANCE_CHIP: Record<Provenance, string> = {
  AUTO: "bg-[#E8EEF7] text-[#0B1F4D] border-[#CFDCEE]",
  MANUAL: "bg-slate-100 text-slate-700 border-slate-200",
  AUTO_OVERRIDDEN: "bg-amber-50 text-amber-900 border-amber-200",
  NOT_APPLICABLE: "bg-slate-50 text-slate-500 border-slate-200",
};

// The nine principles, short-form, for chips and column headers. Full SEBI
// titles come from the API so there is exactly one copy of them.
export const PRINCIPLE_SHORT: Record<string, string> = {
  P1: "Ethics & Accountability",
  P2: "Sustainable & Safe Goods",
  P3: "Employee Well-being",
  P4: "Stakeholder Responsiveness",
  P5: "Human Rights",
  P6: "Environment",
  P7: "Policy Advocacy",
  P8: "Inclusive Growth",
  P9: "Consumer Value",
};

export const PRINCIPLES = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"] as const;

// Which principles the platform can source. Mirrors the backend constant; the
// API also sends `isPlatformSourced` per row, and THAT is what the UI renders —
// this copy exists only for pages that have no row to read yet.
export const MANUAL_ONLY_PRINCIPLES = new Set(["P2", "P4", "P7", "P8"]);

export const STREAM_LABEL: Record<string, string> = {
  ENERGY: "Energy",
  WATER: "Water",
  EMISSIONS: "Emissions",
  WASTE: "Waste",
};

export const FLOW_LABEL: Record<string, string> = {
  NA: "—",
  WITHDRAWAL: "Withdrawal",
  DISCHARGE: "Discharge",
  CONSUMPTION: "Consumption",
  RECYCLED: "Recycled / reused",
  GENERATED: "Generated",
  REUSED: "Re-used",
  RECOVERED: "Other recovery",
  INCINERATED: "Incinerated",
  LANDFILLED: "Landfilled",
  OTHER_DISPOSAL: "Other disposal",
};

export const DATA_QUALITY_OPTIONS = [
  { value: "METER", label: "Meter reading" },
  { value: "INVOICE", label: "Invoice / bill" },
  { value: "ESTIMATE", label: "Estimate" },
  { value: "THIRD_PARTY", label: "Third-party report" },
];

// ── formatting ──────────────────────────────────────────────────────────────

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

/** Indian-format currency. Returns an em dash for absent values — never ₹0. */
export function fmtInr(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1e7) return `₹${(n / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 2 })} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Renders an indicator's value for display, whatever its type. */
export function displayValue(iv: IndicatorValue | null | undefined, ind: Indicator): string {
  if (!iv) return "—";
  if (iv.provenance === "NOT_APPLICABLE") return "Not applicable";
  switch (ind.valueType) {
    case "NUMBER":
      return iv.valueNumber === null || iv.valueNumber === undefined
        ? "—"
        : `${fmtNum(iv.valueNumber)}${iv.unit ? ` ${iv.unit}` : ""}`;
    case "BOOLEAN":
      return iv.valueBoolean === null || iv.valueBoolean === undefined
        ? "—"
        : iv.valueBoolean ? "Yes" : "No";
    case "TABLE":
      if (!iv.valueJson) return "—";
      if (Array.isArray(iv.valueJson)) return `${iv.valueJson.length} row(s) entered`;
      return "Entered";
    default:
      return iv.valueText?.trim() ? iv.valueText : "—";
  }
}

/** True when the row counts as answered — must match brsr_completion._is_answered. */
export function isAnswered(iv: IndicatorValue | null | undefined): boolean {
  if (!iv) return false;
  if (iv.provenance === "NOT_APPLICABLE") return !!iv.notApplicableReason;
  return (
    iv.valueNumber !== null && iv.valueNumber !== undefined
      ? true
      : iv.valueBoolean !== null && iv.valueBoolean !== undefined
        ? true
        : !!iv.valueText?.trim() ||
          (iv.valueJson !== null && iv.valueJson !== undefined &&
            !(Array.isArray(iv.valueJson) && iv.valueJson.length === 0))
  );
}

export function completionTone(pct: number): string {
  if (pct >= 100) return "text-emerald-700";
  if (pct >= 60) return "text-[#0B1F4D]";
  if (pct > 0) return "text-amber-700";
  return "text-slate-400";
}

/** Groups indicators by their SEBI sub-heading, preserving order. */
export function groupIndicators(rows: IndicatorWithValue[]): { group: string | null; rows: IndicatorWithValue[] }[] {
  const out: { group: string | null; rows: IndicatorWithValue[] }[] = [];
  for (const r of rows) {
    const g = r.indicator.groupLabel ?? null;
    const last = out[out.length - 1];
    if (last && last.group === g) last.rows.push(r);
    else out.push({ group: g, rows: [r] });
  }
  return out;
}
