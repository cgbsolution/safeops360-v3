"use client";

// New Permit to Work — 4-step wizard with SafeOps Copilot drafting.
//
// Steps (consolidated from the old 9):
//   1. Job details         → type, validity, plant / area / location, scope, contractor
//   2. People              → issuer, receiver, crew, fire watch / standby
//   3. Controls            → isolations + LOTO link, PPE & equipment, gas test plan,
//                            rescue / weather / site safety check
//   4. Checklist & submit  → hazard annexures + precaution checklists, review, submit
//
// Every step can be opened at any time; "Next" checks the current step and
// Submit checks them all, jumping to the first one with a problem.
//
// The copilot (components/copilot) reads this form through a bridge
// (getDraft / applyPatch) and fills it live. It never answers the precaution
// checklist and never submits. The draft is also autosaved locally so a
// refresh doesn't lose the work.
//
// Submit → POST /api/ptw (Pydantic PermitCreate in safeops_360_bakend/app/schemas/permit.py).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HazardAnnexuresStep } from "@/components/ptw/hazard-annexures-step";
import {
  type AnswerMap,
  type HazardType,
  type PrecautionItem,
  HAZARD_LABELS,
  checklistBlocker,
  effectiveHazards,
  hazardForBaseType,
  requiredControls,
  validityCapHours
} from "@/lib/ptw/hazards";
import {
  DEFAULT_GAS_PARAMS,
  DEFAULT_GAS_REFRESH,
  PPE_CATALOG,
  PPE_DEFAULTS,
  type PtwDraft
} from "@/lib/ptw/wizard-config";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { UserPicker } from "@/components/ui/user-picker";
import { useToast } from "@/components/ui/toast";
import { GpsCaptureStatus } from "@/components/ui/gps-capture";
import { useGeolocation } from "@/hooks/use-geolocation";
import { readApiError } from "@/lib/client-errors";
import { WizardLotoLink, type WizardLotoLinkValue } from "@/components/loto/wizard-loto-link";
import { EXECUTION_STATUS_LABEL as LOTO_STATUS_LABEL } from "@/app/(dashboard)/loto/_meta";
import { useCopilot } from "@/components/copilot/copilot-provider";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { type PlanAdvisory, planAdvisories } from "@/lib/ptw/advisories";
import {
  AlertCircle, ChevronLeft, ChevronRight, Check, Trash2, Clock, Flame, Wrench, Users, ShieldAlert, Zap, HardHat,
  Pickaxe, Hammer, Anchor, ListChecks, ClipboardList, Sparkles, History, AlertTriangle, Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

type Plant = { id: string; name: string; areas: { id: string; name: string }[] };
type Department = { id: string; name: string };
type EquipmentRow = { id: string; code: string; name: string };

const TYPES = [
  { value: "HOT_WORK", label: "Hot Work", icon: Flame, maxHours: 24, requiresGasTest: true, requiresFireWatch: true, requiresStandby: false, requiresRescue: false },
  { value: "CONFINED_SPACE", label: "Confined Space Entry", icon: ShieldAlert, maxHours: 24, requiresGasTest: true, requiresFireWatch: false, requiresStandby: true, requiresRescue: true },
  { value: "WORK_AT_HEIGHT", label: "Work at Height", icon: HardHat, maxHours: 72, requiresGasTest: false, requiresFireWatch: false, requiresStandby: false, requiresRescue: true },
  { value: "EXCAVATION", label: "Excavation", icon: Pickaxe, maxHours: 72, requiresGasTest: false, requiresFireWatch: false, requiresStandby: false, requiresRescue: false },
  { value: "ELECTRICAL_LOTO", label: "Electrical / LOTO", icon: Zap, maxHours: 72, requiresGasTest: false, requiresFireWatch: false, requiresStandby: false, requiresRescue: false },
  { value: "LIFTING", label: "Lifting Operations", icon: Anchor, maxHours: 72, requiresGasTest: false, requiresFireWatch: false, requiresStandby: true, requiresRescue: false },
  { value: "GENERAL_COLD", label: "General Cold Work", icon: Hammer, maxHours: 72, requiresGasTest: false, requiresFireWatch: false, requiresStandby: false, requiresRescue: false }
] as const;

type TypeMeta = typeof TYPES[number];

type CrewRow = { tempId: string; userId: string; role: string };
type IsolationRow = { tempId: string; isolationType: string; description: string; isolationPointTag: string; lotoTagNumber: string };
type ToolRow = { tempId: string; equipmentId: string; freeTextDescription: string };
type SubjectEqRow = { tempId: string; equipmentId: string; workNature: string };
type GasParam = { parameter: string; lowLimit: string; highLimit: string; unit: string };

function tempId() { return `tmp-${Math.random().toString(36).slice(2, 11)}`; }

/** Placeholder isolation tag the copilot writes until the user types the real one. */
function isTbc(tag: string) { return /^\s*tbc/i.test(tag); }

function gasDefaults(type: string): GasParam[] {
  return (DEFAULT_GAS_PARAMS[type] ?? []).map((d) => ({
    parameter: d.parameter,
    lowLimit: d.lowLimit?.toString() ?? "",
    highLimit: d.highLimit?.toString() ?? "",
    unit: d.unit
  }));
}

const STEPS = [
  { id: 1, label: "Job details", hint: "Type · timing · location · scope", icon: ClipboardList },
  { id: 2, label: "People", hint: "Issuer · receiver · crew", icon: Users },
  { id: 3, label: "Controls", hint: "Isolations · PPE · gas test · rescue", icon: ShieldAlert },
  { id: 4, label: "Checklist & submit", hint: "Precautions · review", icon: ListChecks }
] as const;
const LAST_STEP = 4;

const AUTOSAVE_PREFIX = "safeops.ptwDraft.v1.";
const AUTOSAVE_MAX_AGE_MS = 3 * 24 * 3_600_000;

/** Context handed over when the wizard is opened from a HIRA hazard row that
 *  the hazard library flags as permit-requiring. Everything here is a starting
 *  point the originator can change — only the two ids are carried verbatim. */
export type HiraPrefill = {
  hiraEntryId: string;
  hiraEntryHazardId: string;
  plantId: string | null;
  areaId: string | null;
  location: string | null;
  specificLocation: string | null;
  scopeOfWork: string | null;
  suggestedPermitType: string | null;
  hazardName: string | null;
  studyNumber: string | null;
  residualRiskLevel: string | null;
};

export function PermitForm({
  plants,
  defaultPlantId,
  hiraPrefill
}: {
  plants: Plant[];
  defaultPlantId?: string | null;
  hiraPrefill?: HiraPrefill | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();
  const copilot = useCopilot();
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ─── Job — type + validity ───
  // A HIRA-driven permit opens on the type the hazard implies rather than the
  // generic Hot Work default — and with THAT type's PPE / gas defaults.
  const initialType =
    hiraPrefill?.suggestedPermitType && TYPES.some((t) => t.value === hiraPrefill.suggestedPermitType)
      ? hiraPrefill.suggestedPermitType
      : "HOT_WORK";
  const [type, setType] = useState<string>(initialType);
  const typeMeta = useMemo<TypeMeta>(() => TYPES.find((t) => t.value === type) ?? TYPES[0], [type]);
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const defaultEnd = new Date(Date.now() + 4 * 3_600_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [validFrom, setValidFrom] = useState(nowLocal);
  const [validTo, setValidTo] = useState(defaultEnd);
  const validityHours = useMemo(() => {
    const a = new Date(validFrom).getTime();
    const b = new Date(validTo).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.max(0, Math.round((b - a) / 3_600_000));
  }, [validFrom, validTo]);

  // ─── Job — location ───
  // Default to the originator's own plant — that's where the issuers, crew and
  // equipment that match the permit actually live. A HIRA prefill wins over the
  // session plant: the permit has to be raised against the plant the assessed
  // activity actually sits in.
  const initialPlantId =
    (hiraPrefill?.plantId && plants.some((p) => p.id === hiraPrefill.plantId)
      ? hiraPrefill.plantId
      : null) ??
    (defaultPlantId && plants.some((p) => p.id === defaultPlantId) ? defaultPlantId : null) ??
    plants[0]?.id ??
    "";
  const [plantId, setPlantId] = useState(initialPlantId);
  const [departmentId, setDepartmentId] = useState("");
  const [areaId, setAreaId] = useState(hiraPrefill?.areaId ?? "");
  const [specificLocation, setSpecificLocation] = useState(hiraPrefill?.specificLocation ?? "");
  const [scopeOfWork, setScopeOfWork] = useState(hiraPrefill?.scopeOfWork ?? "");
  const [workOrderNumber, setWorkOrderNumber] = useState("");
  const [contractorCompanyId, setContractorCompanyId] = useState("");
  const [contractors, setContractors] = useState<{ id: string; name: string }[]>([]);
  const { coords: gps, status: gpsStatus, error: gpsError, request: requestGps } = useGeolocation();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentRow[]>([]);
  const [loadingMasters, setLoadingMasters] = useState(false);
  const selectedPlant = useMemo(() => plants.find((p) => p.id === plantId), [plants, plantId]);

  // ─── People ───
  const [issuerId, setIssuerId] = useState<string | null>(null);
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [crew, setCrew] = useState<CrewRow[]>([]);
  const [fireWatchPersonId, setFireWatchPersonId] = useState<string | null>(null);
  const [standbyPersonId, setStandbyPersonId] = useState<string | null>(null);

  // ─── Controls ───
  const [isolations, setIsolations] = useState<IsolationRow[]>([]);
  const [ppe, setPpe] = useState<string[]>(PPE_DEFAULTS[initialType] ?? ["helmet", "shoes"]);
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [subjectEq, setSubjectEq] = useState<SubjectEqRow[]>([]);
  // LOTO cross-reference (LOTO spec §6 / Part A). Optional at every permit type.
  const [lotoLink, setLotoLink] = useState<WizardLotoLinkValue | null>(null);
  const [gasRefreshMinutes, setGasRefreshMinutes] = useState(String(DEFAULT_GAS_REFRESH[initialType] ?? 120));
  const [gasParams, setGasParams] = useState<GasParam[]>(gasDefaults(initialType));
  const [gasInstrumentSerial, setGasInstrumentSerial] = useState("");
  const [gasInstrumentCalibrated, setGasInstrumentCalibrated] = useState("");
  const [rescuePlan, setRescuePlan] = useState("");
  const [weatherConditions, setWeatherConditions] = useState("");
  const [windSpeedKmh, setWindSpeedKmh] = useState("");
  // FLRA policy override (closed-loop rebuild): "" = follow site policy,
  // "yes"/"no" send an explicit boolean the backend snapshots per permit.
  const [flraOverride, setFlraOverride] = useState<"" | "yes" | "no">("");

  // ─── Checklist — hazard annexures + precaution checklists ───
  // `hazards` holds the EXTRA hazards attached on top of the base type; the
  // base type's own annexure is implicit and cannot be removed.
  const [hazards, setHazards] = useState<HazardType[]>([]);
  const [precautionCatalog, setPrecautionCatalog] = useState<Record<string, PrecautionItem[]>>({});
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, AnswerMap>>({});
  const [activeHazard, setActiveHazard] = useState<HazardType>(hazardForBaseType(initialType));
  // Precaution answers the copilot pre-filled (per hazard), and whether the
  // user has confirmed them on site. Unconfirmed suggestions block submit.
  const [aiSuggested, setAiSuggested] = useState<Record<string, string[]>>({});
  const [aiConfirmed, setAiConfirmed] = useState<Record<string, boolean>>({});

  // ─── Union rules across every hazard in force ───
  // A cold-work permit carrying a hot-work annexure needs a fire watch, and a
  // 72h height job that also involves hot work is a 24h permit. The server
  // recomputes all of this at create time — this is UX only.
  const hazardsInForce = useMemo(() => effectiveHazards(type, hazards), [type, hazards]);
  const unionControls = useMemo(() => requiredControls(type, hazards), [type, hazards]);
  const unionMaxHours = useMemo(() => validityCapHours(type, hazards), [type, hazards]);
  const needsGasTest = unionControls.has("GAS_TEST");
  const needsFireWatch = unionControls.has("FIRE_WATCH");
  const needsStandby = unionControls.has("STANDBY");
  const needsRescue = unionControls.has("RESCUE_PLAN");
  // "Does this plan make sense?" — e.g. a 10-minute hot work permit. Advisory,
  // not a hard rule; recomputed every render so "starts in N min" stays current.
  const advisories = planAdvisories({ type, extraHazards: hazards, validFrom, validTo });
  const advisoryWarnings = advisories.filter((a) => a.level === "warning");

  // Latest values for callbacks handed to the copilot bridge.
  const typeRef = useRef(type);
  typeRef.current = type;
  const hazardsRef = useRef(hazards);
  hazardsRef.current = hazards;

  // Precaution catalog — fetched once; the wizard needs it before a permit exists.
  useEffect(() => {
    let alive = true;
    setCatalogLoading(true);
    fetch("/api/ptw/precautions/catalog")
      .then((r) => (r.ok ? r.json() : {}))
      .then((j: Record<string, PrecautionItem[]>) => { if (alive && j && typeof j === "object") setPrecautionCatalog(j); })
      .catch(() => {})
      .finally(() => { if (alive) setCatalogLoading(false); });
    return () => { alive = false; };
  }, []);

  // When type changes, refresh defaults that depend on it
  function onTypeChange(newType: string) {
    setType(newType);
    // The base annexure follows the base type. Any answers recorded against
    // the OLD base hazard are dropped unless that hazard is still attached —
    // otherwise a type change would silently carry ticks nobody re-read.
    const nextBase = hazardForBaseType(newType);
    const remaining = hazardsRef.current.filter((h) => h !== nextBase);
    setHazards(remaining);
    setActiveHazard(nextBase);
    setAnswers((prev) => {
      const keep = new Set<string>([nextBase, ...remaining]);
      return Object.fromEntries(Object.entries(prev).filter(([k]) => keep.has(k)));
    });
    setPpe(PPE_DEFAULTS[newType] ?? ["helmet", "shoes"]);
    if (DEFAULT_GAS_PARAMS[newType]) {
      setGasParams(gasDefaults(newType));
      setGasRefreshMinutes(String(DEFAULT_GAS_REFRESH[newType] ?? 120));
    } else {
      setGasParams([]);
    }
  }

  // Load departments + equipment when plant changes.
  useEffect(() => {
    if (!plantId) {
      setDepartments([]); setEquipmentList([]);
      return;
    }
    let cancelled = false;
    setLoadingMasters(true);
    (async () => {
      try {
        const [d, e] = await Promise.all([
          // PTW's own department master — a permit's department is where the
          // WORK is, not a record-visibility filter.
          fetch(`/api/ptw/masters/departments?plant_id=${encodeURIComponent(plantId)}`).then((r) => r.json()).catch(() => []),
          fetch(`/api/near-miss/masters/equipment?plant_id=${encodeURIComponent(plantId)}`).then((r) => r.json()).catch(() => [])
        ]);
        if (!cancelled) {
          setDepartments(Array.isArray(d) ? d : []);
          setEquipmentList(Array.isArray(e) ? e : []);
        }
      } finally {
        if (!cancelled) setLoadingMasters(false);
      }
    })();
    return () => { cancelled = true; };
  }, [plantId]);

  // Contractor companies (plant-agnostic master) — fetch once.
  useEffect(() => {
    let alive = true;
    fetch("/api/near-miss/masters/contractors")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { if (alive && Array.isArray(rows)) setContractors(rows); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // ─── Validation ──────────────────────────────────────────────────
  function checkJob(): string | null {
    if (!type) return "Pick a permit type.";
    if (!validFrom || !validTo) return "Set the validity window.";
    if (new Date(validTo) <= new Date(validFrom)) return "Valid To must be after Valid From.";
    if (validityHours !== null && validityHours > unionMaxHours) {
      // Union cap — the tightest across every hazard, which may be an extra
      // hazard attached on the checklist step rather than the base type.
      return `Validity exceeds the ${unionMaxHours}h cap for this permit's hazards.`;
    }
    if (!plantId) return "Plant required.";
    if (!areaId) return "Area required.";
    if (!specificLocation && !selectedPlant?.areas.find((a) => a.id === areaId)?.name) return "Specific location required.";
    if (!scopeOfWork || scopeOfWork.trim().length < 10) return "Scope of work must be at least 10 characters.";
    return null;
  }
  function checkPeople(): string | null {
    if (!issuerId) return "Issuer required.";
    if (!receiverId) return "Receiver required.";
    if (issuerId === receiverId) return "Issuer and receiver cannot be the same person.";
    if (needsFireWatch && !fireWatchPersonId) return "Fire watch person required for the hazards on this permit.";
    if (needsStandby && !standbyPersonId) return "Standby person required for the hazards on this permit.";
    if (needsStandby && standbyPersonId && crew.some((c) => c.userId === standbyPersonId)) {
      return "Standby person cannot also be a crew member.";
    }
    return null;
  }
  function checkControls(): string | null {
    if (typeMeta.value !== "GENERAL_COLD" && isolations.some((i) => !i.isolationType || !i.description || !i.isolationPointTag)) {
      return "Each isolation needs type, description, and a physical tag.";
    }
    if (typeMeta.value !== "GENERAL_COLD" && isolations.some((i) => isTbc(i.isolationPointTag))) {
      return "Replace the TBC isolation tags with the real point tags.";
    }
    if (ppe.length === 0) return "At least one PPE item is required.";
    if (subjectEq.some((s) => !s.equipmentId || !s.workNature)) {
      return "Each subject equipment row needs both equipment and work nature.";
    }
    if (needsGasTest) {
      if (gasParams.length === 0) return "Gas test plan must include at least one parameter.";
      if (gasParams.some((p) => !p.parameter || !p.unit)) return "Each gas parameter needs a name and unit.";
      const refreshNum = Number(gasRefreshMinutes);
      if (!refreshNum || refreshNum < 15 || refreshNum > 480) return "Gas re-test frequency must be between 15 and 480 minutes.";
    }
    if (needsRescue && !rescuePlan.trim()) return "Rescue plan required for the hazards on this permit.";
    return null;
  }
  function checkChecklist(): string | null {
    // Same rule the server enforces (ptw_annexures.evaluate): every mandatory
    // precaution answered, no NO, and every NA justified.
    for (const h of hazardsInForce) {
      const err = checklistBlocker(precautionCatalog[h] ?? [], answers[h] ?? {}, HAZARD_LABELS[h]);
      if (err) return err;
      const pending = unconfirmedSuggestions(h);
      if (pending) {
        return `${HAZARD_LABELS[h]}: check the ${pending} answer${pending === 1 ? "" : "s"} Copilot suggested and confirm you've verified them on site.`;
      }
    }
    return null;
  }
  function unconfirmedSuggestions(h: string): number {
    return aiConfirmed[h] ? 0 : (aiSuggested[h]?.length ?? 0);
  }
  function validateStep(n: number): string | null {
    if (n === 1) return checkJob();
    if (n === 2) return checkPeople();
    if (n === 3) return checkControls();
    if (n === 4) return checkChecklist();
    return null;
  }
  const stepErrors = [1, 2, 3, 4].map((n) => validateStep(n));

  function goTo(n: number) {
    setError("");
    setStep(Math.min(LAST_STEP, Math.max(1, n)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function next() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    goTo(step + 1);
  }

  // ─── Copilot bridge ─────────────────────────────────────────────
  function currentDraft(): PtwDraft {
    return {
      type,
      extraHazards: hazards,
      validFrom,
      validTo,
      plantId: plantId || null,
      departmentId: departmentId || null,
      areaId: areaId || null,
      specificLocation: specificLocation || null,
      scopeOfWork: scopeOfWork || null,
      workOrderNumber: workOrderNumber || null,
      contractorCompanyId: contractorCompanyId || null,
      issuerId,
      receiverId,
      workCrew: crew.filter((c) => c.userId).map((c) => ({ userId: c.userId, role: c.role })),
      fireWatchPersonId,
      standbyPersonId,
      isolations: isolations.map((i) => ({
        isolationType: i.isolationType, description: i.description, isolationPointTag: i.isolationPointTag,
        lotoTagNumber: i.lotoTagNumber || null
      })),
      requiredPpe: ppe,
      toolsEquipment: tools.filter((t) => t.equipmentId || t.freeTextDescription).map((t) => ({
        equipmentId: t.equipmentId || null, freeTextDescription: t.freeTextDescription || null
      })),
      subjectEquipment: subjectEq.map((s) => ({ equipmentId: s.equipmentId, workNature: s.workNature })),
      gasTestPlan: gasParams.length || needsGasTest ? {
        refreshFrequencyMinutes: Number(gasRefreshMinutes) || undefined,
        parametersToTest: gasParams.map((p) => ({
          parameter: p.parameter,
          lowLimit: p.lowLimit === "" ? null : Number(p.lowLimit),
          highLimit: p.highLimit === "" ? null : Number(p.highLimit),
          unit: p.unit
        })),
        instrumentSerial: gasInstrumentSerial || null,
        instrumentLastCalibrated: gasInstrumentCalibrated || null
      } : null,
      rescuePlan: rescuePlan || null,
      weatherConditionsAtIssue: weatherConditions || null,
      windSpeedKmh: windSpeedKmh ? Number(windSpeedKmh) : null,
      flraRequired: flraOverride === "" ? null : flraOverride === "yes",
      checklist: Object.fromEntries(hazardsInForce.map((h) => {
        const items = precautionCatalog[h] ?? [];
        const a = answers[h] ?? {};
        const pending = unconfirmedSuggestions(h);
        return [h, {
          total: items.length,
          answered: items.filter((i) => a[i.id]?.response).length,
          suggestedUnconfirmed: pending,
          blocker: checklistBlocker(items, a, HAZARD_LABELS[h])
            ?? (pending ? `${HAZARD_LABELS[h]}: ${pending} suggested answers awaiting the user's on-site confirmation` : null)
        }];
      })),
      lotoLinked: !!lotoLink,
      hiraLinked: !!hiraPrefill
    };
  }

  /** Apply a validated copilot (or autosave) patch. Only keys present in the
   *  patch change; null clears; lists replace. Mirrors the server's merge. */
  function applyDraftPatch(p: Partial<PtwDraft>) {
    const has = (k: keyof PtwDraft) => Object.prototype.hasOwnProperty.call(p, k);
    const nextType = has("type") && p.type && TYPES.some((t) => t.value === p.type) ? p.type : typeRef.current;
    if (nextType !== typeRef.current) onTypeChange(nextType);
    if (has("extraHazards")) {
      const base = hazardForBaseType(nextType);
      setHazards(((p.extraHazards ?? []) as HazardType[]).filter((h) => h !== base && h in HAZARD_LABELS));
    }
    if (has("validFrom")) setValidFrom(p.validFrom ?? "");
    if (has("validTo")) setValidTo(p.validTo ?? "");
    if (has("plantId")) {
      setPlantId(p.plantId ?? "");
      if (!has("areaId")) setAreaId("");
      if (!has("departmentId")) setDepartmentId("");
    }
    if (has("departmentId")) setDepartmentId(p.departmentId ?? "");
    if (has("areaId")) setAreaId(p.areaId ?? "");
    if (has("specificLocation")) setSpecificLocation(p.specificLocation ?? "");
    if (has("scopeOfWork")) setScopeOfWork(p.scopeOfWork ?? "");
    if (has("workOrderNumber")) setWorkOrderNumber(p.workOrderNumber ?? "");
    if (has("contractorCompanyId")) setContractorCompanyId(p.contractorCompanyId ?? "");
    if (has("issuerId")) setIssuerId(p.issuerId ?? null);
    if (has("receiverId")) setReceiverId(p.receiverId ?? null);
    if (has("workCrew")) setCrew((p.workCrew ?? []).map((c) => ({ tempId: tempId(), userId: c.userId, role: c.role || "WORKER" })));
    if (has("fireWatchPersonId")) setFireWatchPersonId(p.fireWatchPersonId ?? null);
    if (has("standbyPersonId")) setStandbyPersonId(p.standbyPersonId ?? null);
    if (has("isolations")) {
      setIsolations((p.isolations ?? []).map((i) => ({
        tempId: tempId(), isolationType: i.isolationType, description: i.description,
        isolationPointTag: i.isolationPointTag, lotoTagNumber: i.lotoTagNumber ?? ""
      })));
    }
    if (has("requiredPpe")) setPpe(p.requiredPpe ?? []);
    if (has("toolsEquipment")) {
      setTools((p.toolsEquipment ?? []).map((t) => ({
        tempId: tempId(), equipmentId: t.equipmentId ?? "", freeTextDescription: t.freeTextDescription ?? ""
      })));
    }
    if (has("subjectEquipment")) {
      setSubjectEq((p.subjectEquipment ?? []).map((s) => ({ tempId: tempId(), equipmentId: s.equipmentId, workNature: s.workNature || "REPAIR" })));
    }
    if (has("gasTestPlan")) {
      const g = p.gasTestPlan;
      if (!g) {
        setGasParams([]);
      } else {
        if (g.refreshFrequencyMinutes) setGasRefreshMinutes(String(g.refreshFrequencyMinutes));
        if (g.parametersToTest) {
          setGasParams(g.parametersToTest.map((x) => ({
            parameter: x.parameter, unit: x.unit,
            lowLimit: x.lowLimit == null ? "" : String(x.lowLimit),
            highLimit: x.highLimit == null ? "" : String(x.highLimit)
          })));
        }
        if ("instrumentSerial" in g) setGasInstrumentSerial(g.instrumentSerial ?? "");
        if ("instrumentLastCalibrated" in g) setGasInstrumentCalibrated(g.instrumentLastCalibrated ?? "");
      }
    }
    if (has("rescuePlan")) setRescuePlan(p.rescuePlan ?? "");
    if (has("weatherConditionsAtIssue")) setWeatherConditions(p.weatherConditionsAtIssue ?? "");
    if (has("windSpeedKmh")) setWindSpeedKmh(p.windSpeedKmh == null ? "" : String(p.windSpeedKmh));
    if (has("flraRequired")) setFlraOverride(p.flraRequired == null ? "" : p.flraRequired ? "yes" : "no");
    if (has("checklistSuggestions") && p.checklistSuggestions) {
      const sugg = p.checklistSuggestions;
      setAnswers((prev) => {
        const next = { ...prev };
        for (const [h, rows] of Object.entries(sugg)) {
          const forHazard = { ...(next[h] ?? {}) };
          for (const r of rows) forHazard[r.itemId] = { response: r.response, remark: r.remark ?? "" };
          next[h] = forHazard;
        }
        return next;
      });
      setAiSuggested((prev) => {
        const next = { ...prev };
        for (const [h, rows] of Object.entries(sugg)) next[h] = rows.map((r) => r.itemId);
        return next;
      });
      setAiConfirmed((prev) => {
        const next = { ...prev };
        for (const h of Object.keys(sugg)) next[h] = false;
        return next;
      });
    }
  }

  /** Answers changed in the checklist UI. An item the user answers or edits
   *  themselves is no longer a copilot suggestion. */
  function handleAnswersChange(next: Record<string, AnswerMap>) {
    setAiSuggested((prev) => {
      let changed = false;
      const out: Record<string, string[]> = {};
      for (const [h, ids] of Object.entries(prev)) {
        const kept = ids.filter((id) => {
          const before = answers[h]?.[id];
          const after = next[h]?.[id];
          return !!after && before?.response === after.response && before?.remark === after.remark;
        });
        if (kept.length !== ids.length) changed = true;
        out[h] = kept;
      }
      return changed ? out : prev;
    });
    setAnswers(next);
  }

  const draftRef = useRef(currentDraft);
  draftRef.current = currentDraft;
  const applyRef = useRef(applyDraftPatch);
  applyRef.current = applyDraftPatch;

  const { registerPtwBridge, available: copilotAvailable, open: copilotOpen, setOpen: setCopilotOpen } = copilot;
  useEffect(
    () => registerPtwBridge({ getDraft: () => draftRef.current(), applyPatch: (patch) => applyRef.current(patch) }),
    [registerPtwBridge]
  );

  // Open the copilot beside the form the first time per tab on wide screens —
  // drafting by conversation is the fast path; the form stays fully editable.
  useEffect(() => {
    if (!copilotAvailable || typeof window === "undefined" || window.innerWidth < 1024) return;
    try {
      if (sessionStorage.getItem("safeops.copilot.ptwAutoOpened")) return;
      sessionStorage.setItem("safeops.copilot.ptwAutoOpened", "1");
    } catch { /* storage blocked — still open once */ }
    setCopilotOpen(true);
  }, [copilotAvailable, setCopilotOpen]);

  // ─── Local autosave (refresh no longer loses the draft) ─────────
  const userId = (session?.user as any)?.id as string | undefined;
  const autosaveKey = userId ? `${AUTOSAVE_PREFIX}${userId}` : null;
  const [restoreOffer, setRestoreOffer] = useState<{ savedAt: number; draft: PtwDraft } | null>(null);
  const [autosaveReady, setAutosaveReady] = useState(false);

  useEffect(() => {
    if (!autosaveKey || autosaveReady) return;
    try {
      const raw = localStorage.getItem(autosaveKey);
      const saved = raw ? JSON.parse(raw) : null;
      if (!hiraPrefill && saved?.draft && Date.now() - (saved.savedAt ?? 0) < AUTOSAVE_MAX_AGE_MS) {
        setRestoreOffer(saved);
        return; // hold autosave until the user restores or discards
      }
    } catch { /* corrupt / blocked storage — ignore */ }
    setAutosaveReady(true);
  }, [autosaveKey, autosaveReady, hiraPrefill]);

  const { checklist: _checklist, ...savable } = currentDraft();
  const fingerprint = JSON.stringify(savable);
  // The untouched form is not worth saving (or offering back next time).
  const pristine = useRef<string | null>(null);
  if (pristine.current === null) pristine.current = fingerprint;
  useEffect(() => {
    if (!autosaveKey || !autosaveReady || fingerprint === pristine.current) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(autosaveKey, JSON.stringify({ savedAt: Date.now(), draft: JSON.parse(fingerprint) })); }
      catch { /* quota / private mode */ }
    }, 800);
    return () => clearTimeout(t);
  }, [fingerprint, autosaveKey, autosaveReady]);

  function restoreSaved() {
    if (restoreOffer) applyDraftPatch(restoreOffer.draft);
    setRestoreOffer(null);
    setAutosaveReady(true);
  }
  function discardSaved() {
    try { if (autosaveKey) localStorage.removeItem(autosaveKey); } catch { /* ignore */ }
    setRestoreOffer(null);
    setAutosaveReady(true);
  }

  // ─── Submit ──────────────────────────────────────────────────────
  async function submit() {
    for (let s = 1; s <= LAST_STEP; s++) {
      const err = validateStep(s);
      if (err) { setError(`${STEPS[s - 1].label}: ${err}`); setStep(s); return; }
    }
    if (advisoryWarnings.length > 0) {
      const ok = await confirmDialog({
        title: `${advisoryWarnings.length} alert${advisoryWarnings.length === 1 ? "" : "s"} on this permit`,
        description:
          `${advisoryWarnings.map((a) => a.title).join(" · ")}. ` +
          "The issuer will see the same plan. Submit anyway, or go back and adjust it?",
        confirmLabel: "Submit anyway",
        cancelLabel: "Go back"
      });
      if (!ok) { setStep(1); return; }
    }
    setSubmitting(true);
    setError("");
    const ppeChecklistJson: Record<string, boolean> = {};
    PPE_CATALOG.forEach((p) => { ppeChecklistJson[p.code] = ppe.includes(p.code); });
    const payload = {
      type,
      plantId,
      areaId: areaId || null,
      location: specificLocation || selectedPlant?.areas.find((a) => a.id === areaId)?.name || "",
      scopeOfWork,
      validFrom: new Date(validFrom).toISOString(),
      validTo: new Date(validTo).toISOString(),
      issuerId,
      receiverId,
      departmentId: departmentId || null,
      specificLocation: specificLocation || null,
      contractorCompanyId: contractorCompanyId || null,
      // Keep the legacy free-text field populated from the picked company.
      contractorName: contractors.find((c) => c.id === contractorCompanyId)?.name || null,
      gpsLatitude: gps?.lat ?? null,
      gpsLongitude: gps?.lng ?? null,
      workOrderNumber: workOrderNumber || null,
      // HIRA provenance — present only when opened from a hazard row's
      // Create-PTW prompt, so the permit stays traceable to the assessment.
      hiraEntryId: hiraPrefill?.hiraEntryId ?? null,
      hiraEntryHazardId: hiraPrefill?.hiraEntryHazardId ?? null,
      workCrew: crew.filter((c) => c.userId).map((c) => ({ userId: c.userId, role: c.role })),
      fireWatchPersonId: fireWatchPersonId || null,
      standbyPersonId: standbyPersonId || null,
      isolations: typeMeta.value === "GENERAL_COLD" ? [] : isolations.map((i) => ({
        isolationType: i.isolationType,
        description: i.description,
        isolationPointTag: i.isolationPointTag,
        lotoTagNumber: i.lotoTagNumber || null
      })),
      requiredPpe: ppe,
      ppeChecklist: JSON.stringify(ppeChecklistJson),
      toolsEquipment: tools.filter((t) => t.equipmentId || t.freeTextDescription).map((t) => ({
        equipmentId: t.equipmentId || null,
        freeTextDescription: t.freeTextDescription || null
      })),
      subjectEquipment: subjectEq.map((s) => ({ equipmentId: s.equipmentId, workNature: s.workNature })),
      // The backend re-validates this id (exists / same site / not already claimed).
      lotoExecutionId: lotoLink?.executionId ?? null,
      gasTestPlan: needsGasTest ? {
        refreshFrequencyMinutes: Number(gasRefreshMinutes),
        parametersToTest: gasParams.map((p) => ({
          parameter: p.parameter,
          lowLimit: p.lowLimit !== "" ? Number(p.lowLimit) : null,
          highLimit: p.highLimit !== "" ? Number(p.highLimit) : null,
          unit: p.unit
        })),
        instrumentSerial: gasInstrumentSerial || null,
        instrumentLastCalibrated: gasInstrumentCalibrated ? new Date(gasInstrumentCalibrated).toISOString() : null
      } : null,
      gasTestRequired: needsGasTest,
      fireWatchRequired: needsFireWatch,
      rescuePlan: needsRescue ? rescuePlan : (rescuePlan || null),
      // Hazard annexures. The base type's own annexure is created server-side
      // whether or not it appears here, but its answers must be sent.
      hazards: hazardsInForce.map((h) => ({
        hazardType: h,
        answers: Object.entries(answers[h] ?? {}).map(([itemId, a]) => ({
          itemId,
          response: a.response,
          remark: a.remark.trim() || null
        }))
      })),
      weatherConditionsAtIssue: weatherConditions || null,
      windSpeedKmh: windSpeedKmh ? Number(windSpeedKmh) : null,
      adjacentAreaNotifications: null,
      // null → backend resolves from PTW_FLRA_REQUIRED_* site policy.
      flraRequired: flraOverride === "" ? null : flraOverride === "yes"
    };
    try {
      const res = await fetch("/api/ptw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        setError(await readApiError(res, "Permit submission failed"));
        setSubmitting(false);
        return;
      }
      const j = await res.json();
      try { if (autosaveKey) localStorage.removeItem(autosaveKey); } catch { /* ignore */ }
      toast({ variant: "success", title: "Permit submitted", description: j.number ?? "Awaiting approval" });
      router.push(`/ptw/${j.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setSubmitting(false);
    }
  }

  const areaName = selectedPlant?.areas.find((a) => a.id === areaId)?.name;

  return (
    <div className="max-w-4xl space-y-4">
      {/* Step indicator — every step is reachable; the badge shows whether it
          has anything blocking submission. */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <ol className="grid grid-cols-4 gap-2">
            {STEPS.map((s, idx) => {
              const active = step === s.id;
              const ok = stepErrors[idx] === null;
              const Icon = s.icon;
              return (
                <li key={s.id}>
                  <Button variant="bare" type="button" onClick={() => goTo(s.id)}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex h-auto w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors sm:px-3",
                      active ? "border-primary-600 bg-primary-50 ring-2 ring-primary-100" : "border-slate-200 hover:border-primary-300 hover:bg-slate-50"
                    )}>
                    <span className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      active ? "bg-primary-600 text-white" : ok ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
                    )}>
                      {ok && !active ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}
                    </span>
                    <span className="hidden min-w-0 sm:block">
                      <span className={cn("block truncate text-xs font-semibold", active ? "text-primary-800" : "text-slate-800")}>
                        {s.id}. {s.label}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500">{s.hint}</span>
                    </span>
                  </Button>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {/* Copilot invitation */}
      {copilotAvailable && !copilotOpen && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="shrink-0 text-primary-700" />
            <span>Describe the job in plain words and SafeOps Copilot will draft this permit with you.</span>
          </div>
          <Button type="button" size="sm" onClick={() => setCopilotOpen(true)}>
            <Sparkles size={14} /> Draft with Copilot
          </Button>
        </div>
      )}

      {/* Unsaved draft from an earlier visit */}
      {restoreOffer && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-center gap-2">
            <History size={16} className="shrink-0" />
            <span>
              You have an unsubmitted permit draft from{" "}
              {new Date(restoreOffer.savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.
              Checklist answers are not kept.
            </span>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={discardSaved}>Discard</Button>
            <Button type="button" size="sm" onClick={restoreSaved}>Restore draft</Button>
          </div>
        </div>
      )}

      {/* Provenance banner — this permit was called for by a HIRA hazard row. */}
      {hiraPrefill && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-medium">
            Raised from HIRA{hiraPrefill.studyNumber ? ` ${hiraPrefill.studyNumber}` : ""}
            {hiraPrefill.hazardName ? ` — ${hiraPrefill.hazardName}` : ""}
          </div>
          <div className="text-xs mt-0.5">
            The hazard library flags this hazard as permit-requiring. Type, plant, area and scope
            are pre-filled from the assessment — adjust anything that does not match the actual
            job. The finished permit stays linked to the HIRA entry.
            {hiraPrefill.residualRiskLevel ? ` Assessed residual risk: ${hiraPrefill.residualRiskLevel}.` : ""}
          </div>
        </div>
      )}

      {/* ─── Step 1 — Job details ─── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>1. Job details</CardTitle>
            <CardDescription>What the work is, when it happens and where. The type drives the controls and the approval chain.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-2">
              <Label className="!mb-0">Permit type <span className="text-rose-600">*</span></Label>
              <div role="radiogroup" aria-label="Permit type" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {TYPES.map((t) => {
                  const selected = type === t.value;
                  const TypeIcon = t.icon;
                  return (
                    <Button variant="bare" key={t.value} type="button" role="radio" aria-checked={selected}
                      onClick={() => onTypeChange(t.value)}
                      className={cn(
                        "group relative h-auto rounded-lg border bg-card p-2.5 text-left shadow-sm transition-all",
                        "hover:border-primary-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                        selected ? "border-primary-600 ring-2 ring-primary-100 bg-primary-50/40" : "border-slate-200"
                      )}>
                      <div className="flex items-start gap-2">
                        <div className={cn(
                          "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md",
                          selected ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-primary-100 group-hover:text-primary-700"
                        )}>
                          {selected ? <Check size={14} strokeWidth={3} /> : <TypeIcon size={15} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold leading-tight text-slate-900">{t.label}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">Max {t.maxHours}h</span>
                            {t.requiresGasTest && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">gas test</span>}
                            {t.requiresFireWatch && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-200">fire watch</span>}
                            {t.requiresStandby && <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200">standby</span>}
                            {t.requiresRescue && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200">rescue</span>}
                          </div>
                        </div>
                      </div>
                    </Button>
                  );
                })}
              </div>
              {hazards.length > 0 && (
                <p className="text-xs text-slate-600">
                  Extra hazards attached: <strong>{hazards.map((h) => HAZARD_LABELS[h]).join(", ")}</strong> (manage on step 4).
                </p>
              )}
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Valid From <span className="text-rose-600">*</span></Label>
                <Input type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} required />
              </div>
              <div>
                <Label>Valid To <span className="text-rose-600">*</span></Label>
                <Input type="datetime-local" value={validTo} onChange={(e) => setValidTo(e.target.value)} required />
              </div>
              {validityHours !== null && (
                <div className={cn(
                  "flex items-center gap-2 self-end rounded-md border px-3 py-2 text-sm",
                  validityHours > unionMaxHours ? "border-rose-300 bg-rose-50 text-rose-900" : "border-slate-200 bg-slate-50 text-slate-700"
                )}>
                  <Clock size={14} />
                  <span>
                    <strong>{validityHours}h</strong> of {unionMaxHours}h max
                  </span>
                </div>
              )}
            </section>

            {advisories.length > 0 && <PlanAlerts items={advisories} />}

            <section className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Plant <span className="text-rose-600">*</span></Label>
                <Select value={plantId} onChange={(e) => { setPlantId(e.target.value); setAreaId(""); setDepartmentId(""); }} required>
                  {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </Select>
              </div>
              <div>
                <Label>Area <span className="text-rose-600">*</span></Label>
                <Select value={areaId} onChange={(e) => setAreaId(e.target.value)} required>
                  <SelectItem value="">— Select —</SelectItem>
                  {selectedPlant?.areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </Select>
              </div>
              <div>
                <Label>Specific Location</Label>
                <Input value={specificLocation} onChange={(e) => setSpecificLocation(e.target.value)} placeholder="e.g. Cement Mill #2 gearbox bay" />
              </div>
              <div>
                <Label>Department</Label>
                <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={loadingMasters}>
                  <SelectItem value="">{loadingMasters ? "Loading…" : "— Select —"}</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Scope of Work <span className="text-rose-600">*</span></Label>
                <Textarea rows={3} value={scopeOfWork} onChange={(e) => setScopeOfWork(e.target.value)}
                  placeholder="What will be done, where, how, and on which equipment (10+ chars)" minLength={10} required />
              </div>
              <div>
                <Label>Contractor (if applicable)</Label>
                <Select value={contractorCompanyId} onChange={(e) => setContractorCompanyId(e.target.value)}>
                  <SelectItem value="">— None (own employee) —</SelectItem>
                  {contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </Select>
              </div>
              <div>
                <Label>Work Order Number</Label>
                <Input value={workOrderNumber} onChange={(e) => setWorkOrderNumber(e.target.value)} placeholder="If linked to maintenance system" />
              </div>
            </section>
            <GpsCaptureStatus status={gpsStatus} coords={gps} error={gpsError} onRetry={requestGps} />
          </CardContent>
        </Card>
      )}

      {/* ─── Step 2 — People ─── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>2. People</CardTitle>
            <CardDescription>Issuer and receiver must differ. Receiver and crew training is checked for every hazard on the permit at submission.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Issuer <span className="text-rose-600">*</span></Label>
                <UserPicker value={issuerId} onChange={(id) => setIssuerId(id)}
                  filter={{ plantId, role: "PERMIT_ISSUER", roleFallback: true }} placeholder="Search & select issuer…" required />
                <p className="text-xs text-slate-500 mt-0.5">
                  Lists this plant&apos;s designated Permit Issuers. If none are configured, any plant user can be picked.
                </p>
              </div>
              <div>
                <Label>Receiver <span className="text-rose-600">*</span></Label>
                <UserPicker value={receiverId} onChange={(id) => setReceiverId(id)}
                  filter={{ plantId }} placeholder="Search & select receiver…" required />
                <p className="text-xs text-slate-500 mt-0.5">
                  Must be certified for {hazardsInForce.map((h) => HAZARD_LABELS[h]).join(" + ")}.
                </p>
              </div>
              {needsFireWatch && (
                <div>
                  <Label>Fire Watch Person <span className="text-rose-600">*</span></Label>
                  <UserPicker value={fireWatchPersonId} onChange={(id) => setFireWatchPersonId(id)}
                    filter={{ plantId }} placeholder="Search & select fire watch…" required />
                  <p className="text-xs text-slate-500 mt-0.5">Required because this permit includes hot work.</p>
                </div>
              )}
              {needsStandby && (
                <div>
                  <Label>Standby Person <span className="text-rose-600">*</span></Label>
                  <UserPicker value={standbyPersonId} onChange={(id) => setStandbyPersonId(id)}
                    filter={{ plantId }} placeholder="Search & select standby…" required />
                  <p className="text-xs text-slate-500 mt-0.5">Required for confined space / lifting. Cannot be on the work crew.</p>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="!mb-0">Work Crew</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setCrew((c) => [...c, { tempId: tempId(), userId: "", role: "WORKER" }])}>+ Add Crew Member</Button>
              </div>
              {crew.length === 0 && <div className="text-sm text-slate-500 italic">No crew members added.</div>}
              {crew.map((c) => (
                <div key={c.tempId} className="rounded-md border border-slate-200 p-2 flex items-center gap-2 mb-2 bg-slate-50/50">
                  <div className="flex-1">
                    <UserPicker value={c.userId || null} onChange={(id) => setCrew((p) => p.map((r) => r.tempId === c.tempId ? { ...r, userId: id ?? "" } : r))}
                      filter={{ plantId }} placeholder="Search…" />
                  </div>
                  <Select value={c.role} onChange={(e) => setCrew((p) => p.map((r) => r.tempId === c.tempId ? { ...r, role: e.target.value } : r))}
                    className="w-32">
                    <SelectItem value="WORKER">Worker</SelectItem>
                    <SelectItem value="HELPER">Helper</SelectItem>
                    <SelectItem value="OPERATOR">Operator</SelectItem>
                    <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
                    <SelectItem value="TECHNICIAN">Technician</SelectItem>
                    <SelectItem value="CONTRACTOR">Contractor</SelectItem>
                  </Select>
                  <Button variant="bare" type="button" aria-label="Remove crew member" onClick={() => setCrew((p) => p.filter((r) => r.tempId !== c.tempId))} className="text-slate-400 hover:text-rose-600">
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 3 — Controls ─── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            <span>Required for this permit:</span>
            {unionControls.size === 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5">no extra controls</span>}
            {needsGasTest && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 ring-1 ring-inset ring-amber-200">gas test</span>}
            {needsFireWatch && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-800 ring-1 ring-inset ring-rose-200">fire watch (step 2)</span>}
            {needsStandby && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-800 ring-1 ring-inset ring-sky-200">standby (step 2)</span>}
            {needsRescue && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-800 ring-1 ring-inset ring-violet-200">rescue plan</span>}
          </div>

          {typeMeta.value !== "GENERAL_COLD" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Isolations & LOTO</CardTitle>
                <CardDescription>Energy sources to isolate before work begins. The issuer verifies each one before activation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {isolations.length === 0 && <div className="text-sm text-slate-500 italic">No isolations added. Leave empty if the work needs none.</div>}
                {isolations.map((iso) => (
                  <div key={iso.tempId} className="rounded-md border border-slate-200 p-2.5 grid sm:grid-cols-[1fr_2fr_1fr_1fr_auto] gap-2 items-end">
                    <div>
                      <Label>Type</Label>
                      <Select value={iso.isolationType} onChange={(e) => setIsolations((p) => p.map((r) => r.tempId === iso.tempId ? { ...r, isolationType: e.target.value } : r))}>
                        <SelectItem value="">—</SelectItem>
                        <SelectItem value="ELECTRICAL">Electrical</SelectItem>
                        <SelectItem value="MECHANICAL">Mechanical</SelectItem>
                        <SelectItem value="FLUID">Fluid</SelectItem>
                        <SelectItem value="PNEUMATIC">Pneumatic</SelectItem>
                        <SelectItem value="HYDRAULIC">Hydraulic</SelectItem>
                        <SelectItem value="STEAM">Steam</SelectItem>
                      </Select>
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Input value={iso.description} onChange={(e) => setIsolations((p) => p.map((r) => r.tempId === iso.tempId ? { ...r, description: e.target.value } : r))} placeholder="e.g. Mill main motor breaker" />
                    </div>
                    <div>
                      <Label>Point Tag</Label>
                      <Input value={iso.isolationPointTag} onChange={(e) => setIsolations((p) => p.map((r) => r.tempId === iso.tempId ? { ...r, isolationPointTag: e.target.value } : r))} placeholder="MCC-04-A1" />
                    </div>
                    <div>
                      <Label>LOTO Tag #</Label>
                      <Input value={iso.lotoTagNumber} onChange={(e) => setIsolations((p) => p.map((r) => r.tempId === iso.tempId ? { ...r, lotoTagNumber: e.target.value } : r))} placeholder="optional" />
                    </div>
                    <Button variant="bare" type="button" aria-label="Remove isolation" onClick={() => setIsolations((p) => p.filter((r) => r.tempId !== iso.tempId))} className="text-slate-400 hover:text-rose-600 mb-1.5">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => setIsolations((p) => [...p, { tempId: tempId(), isolationType: "", description: "", isolationPointTag: "", lotoTagNumber: "" }])}>+ Add Isolation</Button>
                {/* Links the permit to a LOTO module lockout, where individual
                    lock confirmation actually happens. */}
                <div className="pt-2">
                  <WizardLotoLink
                    plantId={plantId}
                    subjectEquipmentIds={subjectEq.map((s) => s.equipmentId).filter(Boolean)}
                    value={lotoLink}
                    onChange={setLotoLink}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">PPE & equipment</CardTitle>
              <CardDescription>PPE starts from the permit type&apos;s defaults. Tools and subject equipment have their inspection currency checked at issuance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Required PPE</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1">
                  {PPE_CATALOG.map((p) => (
                    <Label key={p.code} className={cn(
                      "flex items-center gap-2 text-sm font-normal text-inherit rounded-md border px-2.5 py-1.5 cursor-pointer",
                      ppe.includes(p.code) ? "border-primary-300 bg-primary-50/50" : "border-slate-200 bg-white"
                    )}>
                      <Checkbox checked={ppe.includes(p.code)}
                        onChange={() => setPpe((cur) => cur.includes(p.code) ? cur.filter((x) => x !== p.code) : [...cur, p.code])} />
                      <span>{p.label}</span>
                    </Label>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="!mb-0">Tools / Equipment Used by Crew</Label>
                  <Button type="button" size="sm" variant="outline"
                    onClick={() => setTools((p) => [...p, { tempId: tempId(), equipmentId: "", freeTextDescription: "" }])}>+ Add Tool</Button>
                </div>
                {tools.length === 0 && <div className="text-sm text-slate-500 italic">None added.</div>}
                {tools.map((t) => (
                  <div key={t.tempId} className="rounded-md border border-slate-200 p-2 grid sm:grid-cols-[2fr_2fr_auto] gap-2 mb-2 items-end">
                    <div>
                      <Label>Equipment from Master</Label>
                      <Select value={t.equipmentId} onChange={(e) => setTools((p) => p.map((r) => r.tempId === t.tempId ? { ...r, equipmentId: e.target.value } : r))}>
                        <SelectItem value="">— or use free text —</SelectItem>
                        {equipmentList.map((eq) => <SelectItem key={eq.id} value={eq.id}>{eq.name} ({eq.code})</SelectItem>)}
                      </Select>
                    </div>
                    <div>
                      <Label>Free-text description</Label>
                      <Input value={t.freeTextDescription} onChange={(e) => setTools((p) => p.map((r) => r.tempId === t.tempId ? { ...r, freeTextDescription: e.target.value } : r))} placeholder="for tools not in master" />
                    </div>
                    <Button variant="bare" type="button" aria-label="Remove tool" onClick={() => setTools((p) => p.filter((r) => r.tempId !== t.tempId))} className="text-slate-400 hover:text-rose-600 mb-1.5">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="!mb-0">Subject Equipment (being worked on)</Label>
                  <Button type="button" size="sm" variant="outline" disabled={equipmentList.length === 0}
                    onClick={() => setSubjectEq((p) => [...p, { tempId: tempId(), equipmentId: "", workNature: "REPAIR" }])}>+ Add Subject</Button>
                </div>
                {subjectEq.length === 0 && <div className="text-sm text-slate-500 italic">None added.</div>}
                {subjectEq.map((s) => (
                  <div key={s.tempId} className="rounded-md border border-slate-200 p-2 grid sm:grid-cols-[2fr_1fr_auto] gap-2 mb-2 items-end">
                    <div>
                      <Label>Equipment <span className="text-rose-600">*</span></Label>
                      <Select value={s.equipmentId} onChange={(e) => setSubjectEq((p) => p.map((r) => r.tempId === s.tempId ? { ...r, equipmentId: e.target.value } : r))}>
                        <SelectItem value="">— Select —</SelectItem>
                        {equipmentList.map((eq) => <SelectItem key={eq.id} value={eq.id}>{eq.name} ({eq.code})</SelectItem>)}
                      </Select>
                    </div>
                    <div>
                      <Label>Work Nature</Label>
                      <Select value={s.workNature} onChange={(e) => setSubjectEq((p) => p.map((r) => r.tempId === s.tempId ? { ...r, workNature: e.target.value } : r))}>
                        <SelectItem value="INSPECTION">Inspection</SelectItem>
                        <SelectItem value="REPAIR">Repair</SelectItem>
                        <SelectItem value="REPLACEMENT">Replacement</SelectItem>
                        <SelectItem value="MODIFICATION">Modification</SelectItem>
                      </Select>
                    </div>
                    <Button variant="bare" type="button" aria-label="Remove subject equipment" onClick={() => setSubjectEq((p) => p.filter((r) => r.tempId !== s.tempId))} className="text-slate-400 hover:text-rose-600 mb-1.5">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {needsGasTest && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gas test plan</CardTitle>
                <CardDescription>Parameters monitored, re-test frequency and the instrument used. The pre-entry reading is captured at activation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <Label>Re-test every (minutes)</Label>
                    <Input type="number" min={15} max={480} value={gasRefreshMinutes} onChange={(e) => setGasRefreshMinutes(e.target.value)} />
                    <p className="text-xs text-slate-500 mt-0.5">15–480 min. Default 240 (Hot Work) / 120 (Confined Space).</p>
                  </div>
                  <div>
                    <Label>Instrument Serial</Label>
                    <Input value={gasInstrumentSerial} onChange={(e) => setGasInstrumentSerial(e.target.value)} placeholder="e.g. GM-04-001" />
                  </div>
                  <div>
                    <Label>Last Calibrated</Label>
                    <Input type="date" value={gasInstrumentCalibrated} onChange={(e) => setGasInstrumentCalibrated(e.target.value)} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="!mb-0">Parameters to Test</Label>
                    <Button type="button" size="sm" variant="outline" onClick={() => setGasParams((p) => [...p, { parameter: "OTHER", lowLimit: "", highLimit: "", unit: "" }])}>+ Add Parameter</Button>
                  </div>
                  {gasParams.map((p, i) => (
                    <div key={i} className="rounded-md border border-slate-200 p-2 grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 mb-2 items-end">
                      <div>
                        <Label>Parameter</Label>
                        <Input value={p.parameter} onChange={(e) => setGasParams((arr) => arr.map((x, idx) => idx === i ? { ...x, parameter: e.target.value } : x))} />
                      </div>
                      <div>
                        <Label>Low Limit</Label>
                        <Input type="number" value={p.lowLimit} onChange={(e) => setGasParams((arr) => arr.map((x, idx) => idx === i ? { ...x, lowLimit: e.target.value } : x))} />
                      </div>
                      <div>
                        <Label>High Limit</Label>
                        <Input type="number" value={p.highLimit} onChange={(e) => setGasParams((arr) => arr.map((x, idx) => idx === i ? { ...x, highLimit: e.target.value } : x))} />
                      </div>
                      <div>
                        <Label>Unit</Label>
                        <Input value={p.unit} onChange={(e) => setGasParams((arr) => arr.map((x, idx) => idx === i ? { ...x, unit: e.target.value } : x))} placeholder="%, ppm" />
                      </div>
                      <Button variant="bare" type="button" aria-label="Remove parameter" onClick={() => setGasParams((arr) => arr.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-rose-600 mb-1.5">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Rescue, weather & site safety check</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {needsRescue && (
                <div>
                  <Label>Rescue Plan <span className="text-rose-600">*</span></Label>
                  <Textarea rows={3} value={rescuePlan} onChange={(e) => setRescuePlan(e.target.value)}
                    placeholder="Step-by-step rescue procedure, equipment available, escape routes…" />
                  <p className="text-xs text-slate-500 mt-0.5">Required for confined space and work at height.</p>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Weather Conditions</Label>
                  <Input value={weatherConditions} onChange={(e) => setWeatherConditions(e.target.value)} placeholder="e.g. Clear, 28°C" />
                </div>
                <div>
                  <Label>Wind Speed (km/h)</Label>
                  <Input type="number" value={windSpeedKmh} onChange={(e) => setWindSpeedKmh(e.target.value)} placeholder="for outdoor hot work" />
                  {hazardsInForce.includes("HOT_WORK" as HazardType) && Number(windSpeedKmh) > 25 && (
                    <p className="text-xs text-rose-700 mt-0.5">⚠ Wind &gt; 25 km/h — outdoor hot work not recommended.</p>
                  )}
                </div>
              </div>
              <div>
                <Label title="Also known as FLRA — Field Level Risk Assessment">Site Safety Check</Label>
                <Select value={flraOverride} onChange={(e) => setFlraOverride(e.target.value as "" | "yes" | "no")}
                  className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                  <SelectItem value="">Follow site policy (default)</SelectItem>
                  <SelectItem value="yes">Required — crew must complete &amp; sign a site safety check before activation</SelectItem>
                  <SelectItem value="no">Not required for this permit</SelectItem>
                </Select>
                <p className="text-xs text-slate-500 mt-0.5">
                  Controls whether the site safety check gates the receiver&apos;s acceptance. The choice is snapshotted on the permit for audit.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Step 4 — Checklist & submit ─── */}
      {step === 4 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>4. Hazards & precautions</CardTitle>
              <CardDescription>
                Every hazard this job involves, and the precaution checklist each one brings. Answer each item for
                the actual site conditions — one permit covers them all.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HazardAnnexuresStep
                baseType={type}
                hazards={hazards}
                onHazardsChange={setHazards}
                catalog={precautionCatalog}
                answers={answers}
                onAnswersChange={handleAnswersChange}
                suggested={aiSuggested}
                confirmed={aiConfirmed}
                onConfirmedChange={(h, v) => setAiConfirmed((prev) => ({ ...prev, [h]: v }))}
                activeHazard={activeHazard}
                onActiveHazardChange={setActiveHazard}
                catalogLoading={catalogLoading}
                validityHours={validityHours}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review</CardTitle>
              <CardDescription>After submission the permit enters the approval workflow.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {STEPS.map((s, idx) => stepErrors[idx] && (
                <div key={s.id} className="mb-2 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                  <span><strong>{s.label}:</strong> {stepErrors[idx]}</span>
                  {s.id !== 4 && <Button type="button" size="sm" variant="outline" onClick={() => goTo(s.id)}>Fix</Button>}
                </div>
              ))}
              {advisories.length > 0 && <div className="mb-2"><PlanAlerts items={advisories} /></div>}
              <ReviewRow label="Type" value={typeMeta.label} />
              <ReviewRow label="Hazards" value={hazardsInForce.map((h) => HAZARD_LABELS[h]).join(", ")} />
              <ReviewRow label="Validity" value={`${validFrom.replace("T", " ")} → ${validTo.replace("T", " ")} (${validityHours}h)`} />
              <ReviewRow label="Location" value={[selectedPlant?.name, areaName, specificLocation].filter(Boolean).join(" · ") || "—"} />
              <ReviewRow label="Scope" value={scopeOfWork || "—"} />
              <ReviewRow label="People" value={`Issuer ${issuerId ? "✓" : "—"} · Receiver ${receiverId ? "✓" : "—"} · ${crew.length} crew${needsFireWatch ? ` · Fire watch ${fireWatchPersonId ? "✓" : "—"}` : ""}${needsStandby ? ` · Standby ${standbyPersonId ? "✓" : "—"}` : ""}`} />
              {typeMeta.value !== "GENERAL_COLD" && <ReviewRow label="Isolations" value={`${isolations.length} isolation${isolations.length === 1 ? "" : "s"}`} />}
              <ReviewRow
                label="LOTO"
                value={lotoLink
                  ? `Linked — ${lotoLink.number}${lotoLink.equipmentName ? `, ${lotoLink.equipmentName}` : ""} · ${LOTO_STATUS_LABEL[lotoLink.status] ?? lotoLink.status}`
                  : "Not linked"}
              />
              <ReviewRow label="PPE & equipment" value={`${ppe.length} PPE · ${tools.length} tool${tools.length === 1 ? "" : "s"} · ${subjectEq.length} subject item${subjectEq.length === 1 ? "" : "s"}`} />
              {needsGasTest && <ReviewRow label="Gas Test" value={`${gasParams.length} parameter${gasParams.length === 1 ? "" : "s"}, re-test every ${gasRefreshMinutes} min`} />}
              {needsRescue && <ReviewRow label="Rescue Plan" value={rescuePlan ? "✓ provided" : "—"} />}
            </CardContent>
          </Card>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 -mx-6 px-6 py-3">
        <Button type="button" variant="outline" onClick={() => goTo(step - 1)} disabled={step === 1 || submitting}>
          <ChevronLeft size={14} /> Back
        </Button>
        <div className="text-xs text-slate-500">
          Step {step} of {LAST_STEP} · {typeMeta.label}
        </div>
        {step < LAST_STEP ? (
          <Button type="button" onClick={next} disabled={submitting}>
            Next <ChevronRight size={14} />
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={submitting} variant="success">
            {submitting ? "Submitting…" : "Submit Permit"}
          </Button>
        )}
      </div>
    </div>
  );
}

function PlanAlerts({ items }: { items: PlanAdvisory[] }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {items.map((a) => (
        <div key={a.id} className={cn(
          "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
          a.level === "warning" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900"
        )}>
          {a.level === "warning" ? <AlertTriangle size={15} className="mt-0.5 shrink-0" /> : <Info size={15} className="mt-0.5 shrink-0" />}
          <div>
            <div className="font-medium">{a.title}</div>
            <div className="text-xs leading-relaxed">{a.message}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-slate-100 last:border-b-0">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 w-36 flex-shrink-0">{label}</div>
      <div className="text-sm text-slate-800 flex-1 min-w-0 whitespace-pre-wrap">{value}</div>
    </div>
  );
}
