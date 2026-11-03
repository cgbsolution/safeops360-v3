"use client";

// Copilot review card for a HIRA entry: the calibrated review ("version": "v2"
// from GET /api/copilot/hira-review/{entryId}). It shows the inherent rating
// (neutral, for information) and the residual the recorded controls justify
// (per hazard), what must be fixed before submitting, and one-click actions
// that fill the entry from plant records and the control catalogue
// (POST /api/hira/entries/{entryId}/calibration/apply).
//
// Scope gating (review.scope):
//   - not calibrated (e.g. a HAZOP study): the banner and the structural
//     findings only.
//   - not validated (plant on a draft rubric pack): the banner, inherent
//     ratings and suggested controls; never a residual, tolerability, "what the
//     controls justify", ALARP draft or blocker (canShowResidualClaim).
//
// The older card (hira-copilot-review.tsx) is still used when the plant's flag
// is off; the page picks one by `review.version`.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ChevronDown, ClipboardCopy, Info, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useCopilot } from "@/components/copilot/copilot-provider";
import { parseApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import {
  canShowResidualClaim,
  TOLERABILITY_FINDING_CODES,
  type CalibrationApplyPart,
  type CalibrationApplyResponse,
  type CalibrationFinding,
  type CalibrationHazard,
  type CalibrationRating,
  type CalibrationRecommendation,
  type ControlHierarchy,
  type CostBand,
  type EntryState,
  type EntryStatus,
  type FindingClass,
  type HiraCalibrationReviewData,
  type Tolerability,
  type TolerabilityMissing
} from "./hira-calibration-types";

export const INHERENT_ONLY_TEXT = "Inherent only. Existing controls not captured";
export const INHERENT_LABEL = "Inherent (before controls)";
const NOT_CALIBRATED_TEXT = "Calibrated rules are not applied to this study type.";
const ROUTINE_NOTE = "Confirm only what is actually in place; they are recorded as confirmed by you.";

// Residual chips only: status colours come from the residual and tolerability.
const LEVEL_CHIP: Record<string, string> = {
  LOW: "bg-emerald-100 text-emerald-800 border-emerald-300",
  MODERATE: "bg-amber-100 text-amber-800 border-amber-300",
  HIGH: "bg-orange-100 text-orange-900 border-orange-300",
  CRITICAL: "bg-rose-200 text-rose-900 border-rose-400"
};
/** The inherent rating is information, not a status: always grey. */
const NEUTRAL_CHIP = "bg-slate-100 text-slate-700 border-slate-300";
const LEVEL_WORD: Record<string, string> = { LOW: "Low", MODERATE: "Moderate", HIGH: "High", CRITICAL: "Critical" };

const STATUS: Record<EntryStatus, { text: string; cls: string }> = {
  INHERENT_ONLY: { text: "Existing controls not captured", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  OPEN: { text: "Needs action", cls: "bg-rose-50 text-rose-800 border-rose-300" },
  OVERRIDE_PENDING: { text: "Override at approval", cls: "bg-violet-50 text-violet-800 border-violet-300" },
  RESOLVED: { text: "Acceptable / ALARP", cls: "bg-emerald-50 text-emerald-800 border-emerald-300" },
  // Not shown as a badge: the scope banner explains these.
  NOT_VALIDATED: { text: "Suggestions only", cls: NEUTRAL_CHIP },
  NOT_CALIBRATED: { text: "Checks only", cls: NEUTRAL_CHIP }
};

const STATE: Record<EntryState, { text: string; cls: string }> = {
  ACCEPTABLE: { text: "Acceptable", cls: "bg-emerald-50 text-emerald-800 border-emerald-300" },
  TOLERABLE_ALARP: { text: "Tolerable (ALARP)", cls: "bg-sky-50 text-sky-800 border-sky-300" },
  OVERRIDE: { text: "Override at approval", cls: "bg-violet-50 text-violet-800 border-violet-300" },
  NOT_ACCEPTABLE: { text: "Needs action", cls: "bg-rose-50 text-rose-800 border-rose-300" }
};

// Blocker = rose, Advisory = amber, Info = slate. Only blockers stop submission.
const FINDING_STYLE: Record<FindingClass, { label: string; badge: string; box: string }> = {
  BLOCKER: { label: "Must fix", badge: "bg-rose-100 text-rose-800 border-rose-300", box: "border-rose-200 bg-rose-50/60" },
  ADVISORY: { label: "Advice", badge: "bg-amber-100 text-amber-800 border-amber-300", box: "border-amber-200 bg-amber-50/60" },
  INFO: { label: "Note", badge: "bg-slate-100 text-slate-700 border-slate-300", box: "border-slate-200 bg-slate-50" }
};
const CLASS_ORDER: Record<FindingClass, number> = { BLOCKER: 0, ADVISORY: 1, INFO: 2 };

const HIERARCHY_WORD: Record<ControlHierarchy, string> = {
  ELIMINATION: "Elimination",
  SUBSTITUTION: "Substitution",
  ENGINEERING: "Engineering",
  ADMINISTRATIVE: "Administrative",
  PPE: "PPE"
};
const COST_WORD: Record<CostBand, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", VERY_HIGH: "Very high" };
/** ALARP checklist items in words (CONFIRM_CONTROLS items are not listed). */
const ALARP_ITEM_WORD: Partial<Record<TolerabilityMissing, string>> = {
  eliminationConsidered: "elimination / substitution considered",
  engineeringInPlaceOrPlanned: "an engineering control in place or planned",
  statutoryCurrent: "statutory examinations current",
  reviewDateSet: "review date set"
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2027-01-02" -> "02 Jan 2027" (string-based, so server and browser agree). */
function formatDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return iso ?? "";
  return `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** "L -1" / "S -1" / "L -1, S -1" -> plain words. */
function effectText(effect: string): string {
  const l = /L\s*-\s*(\d)/.exec(effect);
  const s = /S\s*-\s*(\d)/.exec(effect);
  const parts = [l ? `likelihood by ${l[1]}` : null, s ? `severity by ${s[1]}` : null].filter(Boolean);
  return parts.length ? `Lowers ${parts.join(" and ")}` : effect;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function findingKey(f: CalibrationFinding): string {
  return `${f.code}|${f.title}`;
}

function byClass(a: CalibrationFinding, b: CalibrationFinding): number {
  return CLASS_ORDER[a.class] - CLASS_ORDER[b.class];
}

/** A rated recommendation (its residual-after is a real new rating). */
function isRated(rec: CalibrationRecommendation): boolean {
  return rec.kind === "CAPA" || rec.kind === "IMPROVEMENT_NOTE";
}

/**
 * Findings the card may show. Not calibrated: structural checks only. Not
 * validated: nothing that rests on a residual band, and no blockers (mirrors
 * the backend's rubric_packs.apply_scope). Always a new array (callers sort it).
 */
function scopedFindings(list: CalibrationFinding[], calibrated: boolean, residualOk: boolean): CalibrationFinding[] {
  if (!calibrated) return list.filter((f) => f.code.startsWith("STRUCT_"));
  if (residualOk) return [...list];
  return list
    .filter((f) => !TOLERABILITY_FINDING_CODES.has(f.code))
    .map((f) => (f.class === "BLOCKER" ? { ...f, class: "INFO" as const } : f));
}

/** What "Apply suggested defaults" would fill, in plain words (empty = nothing). */
function defaultsList(r: HiraCalibrationReviewData, residualOk: boolean): string[] {
  const d = r.suggestedDefaults;
  const out: string[] = [];
  if (d.recommendedDefaults.length) out.push("owners and target dates");
  if (d.controlEffectiveness.length) out.push("control effectiveness (Not verified)");
  if (d.nextReviewDue) out.push(`next review date (${formatDate(d.nextReviewDue)})`);
  // An ALARP record is a tolerability claim: only where the scope is validated.
  if (residualOk && d.alarpRecord) out.push("a draft ALARP record");
  // Per-hazard values can only be stored once the database update is applied.
  if (r.schemaReady && d.hazardRatings.length) out.push("per-hazard ratings");
  if (r.schemaReady && d.regulations.length) out.push("suggested legal references");
  return out;
}

/** The apply response's `applied` list, in plain words. */
function appliedText(parts: CalibrationApplyPart[], applied: string[]): string {
  const words: string[] = [];
  let skipped = false;
  for (const a of applied) {
    if (/skipped/i.test(a)) skipped = true;
    else if (a === "existing controls")
      words.push(
        parts.includes("CONFIRM_ROUTINE_CONTROLS")
          ? "routine controls confirmed"
          : parts.includes("EXISTING_CONTROLS")
            ? "existing controls added"
            : "control effectiveness filled"
      );
    else if (a === "recommended controls")
      words.push(parts.includes("RECOMMENDATIONS") ? "recommended controls added" : "owners and dates filled");
    else if (a === "defaults") words.push("ALARP record drafted");
    else if (a === "review date") words.push("review date set");
    else words.push(a);
  }
  let text = words.length ? `Done: ${words.join(", ")}. The entry below has been updated.` : "Nothing needed changing.";
  if (skipped) text += " Per-hazard ratings will be saved once the database update is applied.";
  return text;
}

function tolerabilityWords(t: Tolerability | null): { text: string; cls: string; detail?: string } | null {
  if (!t) return null;
  if (t.overridden) return { text: "Accepted under override", cls: "text-violet-700" };
  if (t.state === "ACCEPTABLE") return { text: "Acceptable", cls: "text-emerald-700" };
  if (t.state === "TOLERABLE_ALARP") {
    const months = /review in (\d+) months/i.exec(t.note)?.[1] ?? "12";
    return { text: `Tolerable (ALARP) – review in ${months} months`, cls: "text-sky-700" };
  }
  if (t.route === "CONFIRM_CONTROLS") return { text: "Confirm routine controls", cls: "text-amber-700" };
  if (t.route === "VERIFY_CONTROLS") return { text: "Verify the controls in place", cls: "text-amber-700" };
  if (t.route === "ALARP_CHECKLIST") {
    const missing = t.missing.map((m) => ALARP_ITEM_WORD[m]).filter((w): w is string => !!w);
    return {
      text: "Complete ALARP checklist",
      cls: "text-amber-700",
      detail: missing.length ? `Missing: ${missing.join("; ")}` : undefined
    };
  }
  if (t.route === "OVERRIDE") return { text: "Override at approval", cls: "text-violet-700" };
  return { text: "Needs control", cls: "text-rose-700" };
}

/** Header status: entry.state in words. Null when the scope makes no residual claim. */
function entryBadge(r: HiraCalibrationReviewData): { text: string; cls: string } | null {
  if (!canShowResidualClaim(r)) return null;
  const e = r.entry;
  if (e.status === "INHERENT_ONLY") return STATUS.INHERENT_ONLY;
  if (e.state === "OVERRIDE" && e.status === "RESOLVED") {
    return { text: "Accepted under override", cls: STATE.OVERRIDE.cls };
  }
  if (e.state) return STATE[e.state];
  return STATUS[e.status] ?? { text: e.status, cls: NEUTRAL_CHIP };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h4>;
}

/** Residual (status colour), or inherent with `neutral` (grey). */
function RatingChip({ r, neutral = false }: { r: CalibrationRating; neutral?: boolean }) {
  return (
    <Badge
      className={cn("font-medium", neutral ? NEUTRAL_CHIP : (LEVEL_CHIP[r.level] ?? NEUTRAL_CHIP))}
      title={`${neutral ? `${INHERENT_LABEL}: ` : ""}Likelihood ${r.likelihood} × Severity ${r.severity} = ${r.score}`}
    >
      {LEVEL_WORD[r.level] ?? r.level} {r.score}
      <span className="hidden font-normal opacity-75 sm:inline">
        L{r.likelihood}×S{r.severity}
      </span>
    </Badge>
  );
}

function HierarchyBadge({ h }: { h: ControlHierarchy }) {
  return (
    <Badge className="shrink-0 border-slate-200 bg-slate-100 font-medium text-slate-700">{HIERARCHY_WORD[h] ?? h}</Badge>
  );
}

/** Tap-to-open reason (works on touch screens, unlike a hover tooltip). */
function Why({ text }: { text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="link" size="bare" className="h-auto p-0 align-baseline text-[11px]">
          Why?
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 text-xs text-slate-700">
        {text}
      </PopoverContent>
    </Popover>
  );
}

function HazardNotes({ h }: { h: CalibrationHazard }) {
  const l = h.likelihood;
  const s = h.severity;
  if (!l.capped && !s.finding) return null;
  return (
    <div className="mt-0.5 space-y-0.5 text-[11px] text-slate-500">
      {l.capped && (
        <div>
          Likelihood lowered L{l.proposed} → L{l.value}. <Why text={l.reason} />
        </div>
      )}
      {s.finding && (
        <div>
          {s.finding.kind === "OVERSTATED"
            ? s.proposed !== s.value
              ? `Severity lowered S${s.proposed} → S${s.value}.`
              : "Severity looks high."
            : `Severity S${s.value} looks low${s.credibleMin ? ` (credible S${s.credibleMin}+)` : ""}.`}{" "}
          <Why text={s.finding.reason} />
        </div>
      )}
    </div>
  );
}

function TolerabilityText({ t }: { t: Tolerability | null }) {
  const w = tolerabilityWords(t);
  if (!w) return <span className="text-slate-400">—</span>;
  return (
    <div>
      <div className={cn("font-medium", w.cls)}>{w.text}</div>
      {w.detail && <div className="text-[11px] text-slate-500">{w.detail}</div>}
    </div>
  );
}

function HazardRow({ h, showResidual }: { h: CalibrationHazard; showResidual: boolean }) {
  return (
    <TableRow>
      <TableCell className="min-w-[9rem] align-top">
        <div className="font-medium text-slate-900">{h.name}</div>
        <HazardNotes h={h} />
        {showResidual && (
          <div className="mt-1 sm:hidden">
            <TolerabilityText t={h.tolerability} />
          </div>
        )}
      </TableCell>
      <TableCell className="align-top">
        <RatingChip r={h.inherent} neutral />
      </TableCell>
      {showResidual && (
        <TableCell className="align-top">
          {h.residual ? (
            <>
              <RatingChip r={h.residual} />
              {h.provisional && <div className="mt-0.5 text-[10px] text-slate-500">unverified controls</div>}
            </>
          ) : (
            <span className="italic text-slate-500">not assessed</span>
          )}
        </TableCell>
      )}
      {showResidual && (
        <TableCell className="hidden align-top sm:table-cell">
          <TolerabilityText t={h.tolerability} />
        </TableCell>
      )}
    </TableRow>
  );
}

function RecommendationItem({ rec, showResidual }: { rec: CalibrationRecommendation; showResidual: boolean }) {
  const rated = isRated(rec);
  // A residual-after chip only for a rated control where the scope is validated.
  const after = rated && showResidual ? rec.residualAfter : null;
  return (
    <li className="rounded-md border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <HierarchyBadge h={rec.hierarchy} />
        {rec.kind === "SUGGESTION" ? (
          <Badge className="border-slate-300 bg-white font-medium text-slate-700">Suggested control</Badge>
        ) : rec.kind === "IMPROVEMENT_NO_RATING_CREDIT" ? (
          <Badge className="border-slate-300 bg-white font-medium text-slate-700">Improvement (no rating change)</Badge>
        ) : rec.raisesCapa && showResidual ? (
          <Badge className="border-rose-200 bg-rose-50 font-medium text-rose-800">Raises CAPA</Badge>
        ) : (
          <Badge className="border-slate-300 bg-white font-medium text-slate-700">Improvement note</Badge>
        )}
        {rec.studyLevel && (
          <Badge className="border-indigo-200 bg-indigo-50 font-medium text-indigo-800">
            Study-level common control{rec.sharedWith.length ? ` (also ${rec.sharedWith.join(", ")})` : ""}
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-sm font-medium text-slate-900">{rec.description}</p>
      <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-2">
        <div>
          <span className="text-slate-500">For:</span> {rec.targetHazards.map((t) => t.name).join(", ")}
        </div>
        {rec.kind !== "SUGGESTION" && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-slate-500">Effect:</span> {rated ? effectText(rec.expectedEffect) : rec.expectedEffect}
            {after && (
              <>
                {" "}
                → <RatingChip r={after} />
              </>
            )}
          </div>
        )}
        <div>
          <span className="text-slate-500">Cost:</span> {COST_WORD[rec.costBand] ?? rec.costBand}
        </div>
        <div>
          <span className="text-slate-500">Owner:</span> {rec.ownerRole}
        </div>
        <div>
          <span className="text-slate-500">Due:</span> {formatDate(rec.dueDate)}
        </div>
      </div>
      {rec.interimMeasure && (
        <p className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          {rec.interimMeasure}
        </p>
      )}
    </li>
  );
}

/** "Add these N …" in the words that fit the kinds on offer. */
function addRecsLabel(recs: CalibrationRecommendation[]): string {
  const n = recs.length;
  if (recs.every((x) => x.kind === "SUGGESTION"))
    return n === 1 ? "Add this suggested control" : `Add these ${n} suggested controls`;
  if (recs.every((x) => x.kind === "IMPROVEMENT_NO_RATING_CREDIT"))
    return n === 1 ? "Add this improvement" : `Add these ${n} improvements`;
  return n === 1 ? "Add this recommendation" : `Add these ${n} recommendations`;
}

export function HiraCalibrationReview({
  review,
  entryId,
  changeReasonRequired = false
}: {
  review: HiraCalibrationReviewData;
  entryId: string;
  /** Approved/active study or a versioned entry: ask for the reason up front. */
  changeReasonRequired?: boolean;
}) {
  const router = useRouter();
  const copilot = useCopilot();
  const [open, setOpen] = useState(true);
  const [showAllFindings, setShowAllFindings] = useState(false);
  const [busy, setBusy] = useState<CalibrationApplyPart[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Change-reason dialog: the parts waiting for a reason (null = closed).
  const [reasonParts, setReasonParts] = useState<CalibrationApplyPart[] | null>(null);
  const [reason, setReason] = useState("");

  // Show the review returned by an apply until the refreshed page brings a new
  // `review` prop (same pattern as CopilotRefreshOnChange).
  const [view, setView] = useState<{ base: HiraCalibrationReviewData; applied: HiraCalibrationReviewData | null }>({
    base: review,
    applied: null
  });
  if (view.base !== review) setView({ base: review, applied: null });
  const r = view.applied ?? review;

  async function run(parts: CalibrationApplyPart[], changeReason?: string) {
    setBusy(parts);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/hira/entries/${entryId}/calibration/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parts, ...(changeReason ? { changeReason } : {}) })
      });
      if (!res.ok) {
        const msg = await parseApiError(res, "Could not apply");
        // Approved/active study or a versioned entry: ask for a reason, retry.
        if (res.status === 422 && !changeReason && /change reason/i.test(msg)) {
          setReasonParts(parts);
          return;
        }
        setError(msg);
        return;
      }
      const data = (await res.json().catch(() => null)) as CalibrationApplyResponse | null;
      if (data?.review?.version === "v2") setView({ base: review, applied: data.review });
      setNotice(appliedText(parts, data?.applied ?? []));
      setReasonParts(null);
      setReason("");
      // Remount the entry editor with the saved copy (see CopilotRefreshOnChange).
      copilot.markRecordChanged(entryId);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  function start(parts: CalibrationApplyPart[]) {
    if (busy) return;
    if (changeReasonRequired) {
      setError(null);
      setReasonParts(parts);
      return;
    }
    void run(parts);
  }

  function submitReason() {
    const why = reason.trim();
    if (!why || !reasonParts || busy) return;
    void run(reasonParts, why);
  }

  async function copyDraft(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Select the text and copy it by hand.");
    }
  }

  // ── scope ──
  const calibrated = r.calibrated !== false && r.scope?.calibrated !== false;
  /** Residual, tolerability, "what the controls justify", ALARP draft, blockers. */
  const residualOk = canShowResidualClaim(r);
  const banner = r.scope?.banner ?? (calibrated ? null : NOT_CALIBRATED_TEXT);
  const validatedFor = r.scope?.validatedFor ?? null;

  const entry = r.entry;
  const badge = entryBadge(r);
  const drivers = entry.drivers.slice(0, 2).map((d) => d.name);
  const hazardName = new Map(r.hazards.map((h) => [h.key, h.name]));
  const mainHazards = r.hazards.filter((h) => !h.collapsed);
  const lowHazards = r.hazards.filter((h) => h.collapsed);

  const findings = scopedFindings(r.findings, calibrated, residualOk);
  const shown = scopedFindings(r.shownFindings, calibrated, residualOk).sort(byClass).slice(0, 3);
  const shownKeys = new Set(shown.map(findingKey));
  const moreFindings = findings.filter((f) => !shownKeys.has(findingKey(f))).sort(byClass);
  const visibleFindings = showAllFindings ? [...shown, ...moreFindings] : shown;
  const blockers = residualOk ? (r.counts.BLOCKER ?? findings.filter((f) => f.class === "BLOCKER").length) : 0;

  // Not calibrated: no ratings, controls or defaults are offered at all.
  const proposals = calibrated ? r.existingControlProposals : [];
  const plantProposals = proposals.filter((p) => !p.routine);
  const routineProposals = proposals.filter((p) => p.routine);
  const recs = calibrated ? r.recommendations : [];
  const defaults = calibrated ? defaultsList(r, residualOk) : [];

  // Recorded controls the assessor confirms (names from the hazard credits).
  const recordedControl = new Map<string, { name: string; hierarchy: ControlHierarchy }>();
  for (const h of r.hazards)
    for (const c of h.credits) if (c.key) recordedControl.set(c.key, { name: c.control, hierarchy: c.hierarchy });
  const confirmRecorded = calibrated
    ? (r.suggestedDefaults.confirmControls ?? []).map((c) => ({ key: c.key, ...recordedControl.get(c.key) }))
    : [];
  const routineFinding = findings.find((f) => f.action === "CONFIRM_ROUTINE_CONTROLS") ?? null;
  const showRoutine = calibrated && (!!routineFinding || routineProposals.length > 0);
  const routineFor = (routineFinding?.hazardKeys ?? [])
    .map((k) => hazardName.get(k))
    .filter(Boolean)
    .join(", ");

  const hasActions = proposals.length > 0 || recs.length > 0 || defaults.length > 0 || showRoutine;
  const canAsk = copilot.available && !copilot.unavailableReason;

  const existingControlsLabel =
    plantProposals.length === 1 ? "Use this existing control" : `Use these ${plantProposals.length} existing controls`;
  const isBusy = (p: CalibrationApplyPart) => !!busy?.includes(p);

  function findingAction(f: CalibrationFinding): { label: string; parts: CalibrationApplyPart[] } | null {
    if (f.action === "USE_EXISTING_CONTROLS" && plantProposals.length)
      return { label: "Use existing controls", parts: ["EXISTING_CONTROLS"] };
    if (f.action === "ADD_RECOMMENDATIONS" && recs.length) return { label: "Add recommendations", parts: ["RECOMMENDATIONS"] };
    if (f.action === "APPLY_DEFAULTS" && defaults.length) return { label: "Apply suggested defaults", parts: ["DEFAULTS"] };
    return null;
  }

  /** Routine controls are confirmed below, with the list in view, not from the finding. */
  function pointsToRoutine(f: CalibrationFinding): boolean {
    if (!showRoutine) return false;
    if (f.action === "CONFIRM_ROUTINE_CONTROLS") return true;
    return f.action === "USE_EXISTING_CONTROLS" && plantProposals.length === 0 && routineProposals.length > 0;
  }

  return (
    <Card className="mb-4 border-primary-200">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Sparkles size={16} className="shrink-0 text-primary-600" />
              <CardTitle className="text-base">Copilot review · {r.label}</CardTitle>
              {calibrated && (
                <Badge className="border-primary-200 bg-primary-50 font-medium text-primary-800">Calibrated review</Badge>
              )}
              {r.mode !== "ON" && (
                <Badge
                  className="border-slate-300 bg-white font-medium text-slate-600"
                  title="Shown to you as a preview. Other users still see the standard review."
                >
                  Preview
                </Badge>
              )}
              {badge && <Badge className={cn("font-medium", badge.cls)}>{badge.text}</Badge>}
            </div>
            <div className="flex items-center gap-1.5">
              {canAsk && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={copilot.sending}
                  className="h-7 border-primary-200 px-2.5 text-xs text-primary-700 hover:bg-primary-50"
                  onClick={() => {
                    copilot.setOpen(true);
                    void copilot.send(
                      residualOk
                        ? `Review ${r.label} "${r.activity}": tell me what is wrong, what to correct in the residual risk, and recommend improvements.`
                        : `Review ${r.label} "${r.activity}": tell me what is missing and suggest controls.`
                    );
                  }}
                >
                  <Sparkles size={12} /> Ask Copilot
                </Button>
              )}
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="h-7 w-7"
                  aria-label={open ? "Hide review" : "Show review"}
                >
                  <ChevronDown size={16} className={cn("text-slate-500 transition-transform", open && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>

          {/* Scope banner: information, not an error. Visible even when collapsed. */}
          {banner && (
            <div
              role="note"
              className="mt-2 flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900"
            >
              <Info size={16} className="mt-0.5 shrink-0 text-sky-700" />
              <div className="min-w-0">
                <div className="font-medium">{banner}</div>
                {validatedFor && <div className="text-xs text-sky-800">Validated for: {validatedFor}</div>}
              </div>
            </div>
          )}
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-5 pt-0">
            {notice && (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                <Check size={16} className="mt-0.5 shrink-0" /> {notice}
              </div>
            )}
            {error && reasonParts === null && (
              <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
              </div>
            )}

            {/* Entry rating: inherent (neutral) and, where validated, the residual */}
            {calibrated && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">{entry.inherentLabel ?? INHERENT_LABEL}</span>
                    {entry.inherent ? (
                      <RatingChip r={entry.inherent} neutral />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                  {residualOk && (
                    <>
                      <span aria-hidden className="text-slate-400">
                        →
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500">Residual</span>
                        {entry.residual ? (
                          <RatingChip r={entry.residual} />
                        ) : entry.inherentOnly ? (
                          <span className="text-sm font-medium text-amber-800">{INHERENT_ONLY_TEXT}</span>
                        ) : (
                          <span className="text-sm italic text-slate-500">not assessed</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {residualOk && drivers.length > 0 && (
                  <p className="mt-1.5 text-xs text-slate-600">
                    Driven by: <span className="font-medium text-slate-800">{drivers.join(", ")}</span>
                  </p>
                )}
                <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                  {r.ratingBasis === "WITH_CONTROLS" && <p>The sheet rating already includes the listed controls.</p>}
                  {residualOk && r.matrixRule?.moderateNotAcceptable && (
                    <p>Plant rule: a Moderate residual is not acceptable.</p>
                  )}
                  {r.evidence && (
                    <p>
                      Records:{" "}
                      {r.evidence.lines.length
                        ? r.evidence.lines.join(" · ")
                        : `no incidents or near misses in the last ${r.evidence.windowMonths} months.`}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Findings */}
            <div>
              <SectionTitle>{calibrated ? "What to fix" : "Checks"}</SectionTitle>
              {findings.length === 0 ? (
                <p className="text-sm text-slate-600">Nothing to fix.</p>
              ) : (
                <>
                  {residualOk ? (
                    <p className={cn("mb-1.5 text-xs", blockers ? "text-rose-800" : "text-emerald-700")}>
                      {blockers
                        ? `${blockers} must-fix ${plural(blockers, "item stops", "items stop")} submission. Advice and notes do not.`
                        : "Nothing here stops submission."}
                    </p>
                  ) : (
                    r.canSubmit && <p className="mb-1.5 text-xs text-slate-600">Advice only. Nothing here stops submission.</p>
                  )}
                  <ul className="space-y-1.5">
                    {visibleFindings.map((f, i) => {
                      const s = FINDING_STYLE[f.class] ?? FINDING_STYLE.INFO;
                      const action = findingAction(f);
                      return (
                        <li key={`${findingKey(f)}-${i}`} className={cn("rounded-md border px-3 py-2", s.box)}>
                          <div className="flex flex-wrap items-start gap-2">
                            <Badge className={cn("mt-0.5 shrink-0", s.badge)}>{s.label}</Badge>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-slate-900">{f.title}</div>
                              {f.detail && <div className="text-xs text-slate-700">{f.detail}</div>}
                              {f.fix && <div className="mt-0.5 text-xs font-medium text-slate-800">→ {f.fix}</div>}
                              {residualOk && f.action === "OVERRIDE" && r.alarpDraft && (
                                <div className="mt-0.5 text-xs text-slate-600">Use the drafted justification below.</div>
                              )}
                              {pointsToRoutine(f) && (
                                <div className="mt-0.5 text-xs text-slate-600">
                                  Use &quot;Confirm routine controls&quot; below.
                                </div>
                              )}
                            </div>
                            {action && (
                              <Button
                                variant="outline"
                                size="sm"
                                type="button"
                                className="h-7 shrink-0 text-xs"
                                disabled={!!busy}
                                onClick={() => start(action.parts)}
                              >
                                {action.parts.some(isBusy) ? "Saving…" : action.label}
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {moreFindings.length > 0 && (
                    <Button
                      variant="link"
                      size="sm"
                      type="button"
                      className="mt-1 h-auto px-0 text-xs"
                      onClick={() => setShowAllFindings((v) => !v)}
                    >
                      {showAllFindings ? "Show less" : `Show ${moreFindings.length} more`}
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Per-hazard ratings */}
            {calibrated && r.hazards.length > 0 && (
              <div>
                <SectionTitle>Hazards</SectionTitle>
                {mainHazards.length > 0 && (
                  <div className="rounded-md border border-slate-200">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-xs text-slate-500">Hazard</TableHead>
                          <TableHead className="h-8 text-xs text-slate-500">{INHERENT_LABEL}</TableHead>
                          {residualOk && <TableHead className="h-8 text-xs text-slate-500">Residual</TableHead>}
                          {residualOk && (
                            <TableHead className="hidden h-8 text-xs text-slate-500 sm:table-cell">Status</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mainHazards.map((h) => (
                          <HazardRow key={h.key} h={h} showResidual={residualOk} />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {lowHazards.length > 0 && (
                  <Collapsible className="mt-2">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" type="button" className="group h-7 gap-1 px-2 text-xs text-slate-600">
                        <ChevronDown size={14} className="-rotate-90 transition-transform group-data-[state=open]:rotate-0" />
                        Low hazards (listed only) · {lowHazards.length}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="mt-1 space-y-1 pl-6 text-xs text-slate-700">
                        {lowHazards.map((h) => (
                          <li key={h.key} className="flex flex-wrap items-center gap-1.5">
                            {h.name}{" "}
                            {residualOk && h.residual ? (
                              <RatingChip r={h.residual} />
                            ) : (
                              <>
                                <span className="text-slate-500">{INHERENT_LABEL}</span>
                                <RatingChip r={h.inherent} neutral />
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {residualOk && r.controlsJustify.length > 0 && (
                  <Collapsible className="mt-1">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" type="button" className="group h-7 gap-1 px-2 text-xs text-slate-600">
                        <ChevronDown size={14} className="-rotate-90 transition-transform group-data-[state=open]:rotate-0" />
                        What the controls justify
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="mt-1 list-disc space-y-0.5 pl-10 text-xs text-slate-700">
                        {r.controlsJustify.map((line, i) => (
                          <li key={i}>{line.replace(/\s->\s/g, " → ")}</li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            )}

            {/* Existing controls from plant records (not the routine ones) */}
            {plantProposals.length > 0 && (
              <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3">
                <SectionTitle>Existing controls found in plant records</SectionTitle>
                <ul className="space-y-1.5">
                  {plantProposals.map((p, i) => {
                    const covers = p.hazardKeys.map((k) => hazardName.get(k)).filter(Boolean).join(", ");
                    return (
                      <li key={`${p.description}-${i}`} className="flex items-start gap-2 text-sm">
                        <HierarchyBadge h={p.hierarchy} />
                        <div className="min-w-0">
                          <div className="text-slate-900">{p.description}</div>
                          <div className="text-xs text-slate-500">
                            From: {p.source}
                            {covers ? ` · Covers: ${covers}` : ""}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-slate-600">
                  Added as Unverified (effectiveness &quot;Not verified&quot;). Check each on site, then rate how well it
                  works.
                </p>
                <Button
                  size="sm"
                  type="button"
                  className="mt-2"
                  disabled={!!busy}
                  onClick={() => start(["EXISTING_CONTROLS"])}
                >
                  {isBusy("EXISTING_CONTROLS") ? "Saving…" : existingControlsLabel}
                </Button>
              </div>
            )}

            {/* Routine controls the assessor confirms (low-severity hazards) */}
            {showRoutine && (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <SectionTitle>Confirm routine controls</SectionTitle>
                {routineFor && <p className="mb-1.5 text-xs text-slate-600">For: {routineFor}</p>}
                {(routineProposals.length > 0 || confirmRecorded.length > 0) && (
                  <ul className="space-y-1.5">
                    {routineProposals.map((p, i) => {
                      const covers = p.hazardKeys.map((k) => hazardName.get(k)).filter(Boolean).join(", ");
                      return (
                        <li key={`routine-${p.description}-${i}`} className="flex items-start gap-2 text-sm">
                          <HierarchyBadge h={p.hierarchy} />
                          <div className="min-w-0">
                            <div className="text-slate-900">{p.description}</div>
                            <div className="text-xs text-slate-500">
                              Routine control (added)
                              {covers ? ` · Covers: ${covers}` : ""}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                    {confirmRecorded.map((c) => (
                      <li key={`recorded-${c.key}`} className="flex items-start gap-2 text-sm">
                        {c.hierarchy && <HierarchyBadge h={c.hierarchy} />}
                        <div className="min-w-0">
                          <div className="text-slate-900">{c.name ?? "A control already recorded on this entry"}</div>
                          <div className="text-xs text-slate-500">Already recorded · not checked yet</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-slate-600">
                  {ROUTINE_NOTE}
                </p>
                <Button
                  size="sm"
                  type="button"
                  className="mt-2"
                  disabled={!!busy}
                  onClick={() => start(["CONFIRM_ROUTINE_CONTROLS"])}
                >
                  {isBusy("CONFIRM_ROUTINE_CONTROLS") ? "Saving…" : "Confirm routine controls"}
                </Button>
              </div>
            )}

            {/* Recommended (validated) or suggested (not validated) controls */}
            {(recs.length > 0 || (calibrated && r.linkedCapas.length > 0) || (residualOk && entry.status === "RESOLVED")) && (
              <div>
                <SectionTitle>{residualOk ? "Recommended controls" : "Suggested controls"}</SectionTitle>
                {recs.length === 0 && residualOk && entry.status === "RESOLVED" && (
                  <p className="text-sm text-emerald-700">No further controls needed.</p>
                )}
                {recs.length > 0 && (
                  <>
                    <ul className="space-y-2">
                      {recs.map((rec) => (
                        <RecommendationItem key={rec.id} rec={rec} showResidual={residualOk} />
                      ))}
                    </ul>
                    <Button
                      size="sm"
                      type="button"
                      className="mt-2"
                      disabled={!!busy}
                      onClick={() => start(["RECOMMENDATIONS"])}
                    >
                      {isBusy("RECOMMENDATIONS") ? "Saving…" : addRecsLabel(recs)}
                    </Button>
                  </>
                )}
                {calibrated && r.linkedCapas.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {r.linkedCapas.map((c) => (
                      <li key={c.id} className="flex items-start gap-1.5 text-xs text-slate-700">
                        <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                        <span>
                          Already covered by <span className="font-medium text-slate-900">{c.number}</span>: {c.text}
                          {c.hazards.length ? ` (${c.hazards.join(", ")})` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Suggested defaults */}
            {calibrated && (
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">Suggested defaults</div>
                  <div className="text-xs text-slate-600">
                    {defaults.length
                      ? `Fills ${defaults.join(", ")}. You can edit everything afterwards.`
                      : "Nothing to fill right now."}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="shrink-0"
                  disabled={!defaults.length || !!busy}
                  onClick={() => start(["DEFAULTS"])}
                >
                  {isBusy("DEFAULTS") ? "Saving…" : "Apply suggested defaults"}
                </Button>
              </div>
            )}

            {/* Drafted ALARP / override justification (validated scope only) */}
            {residualOk && r.alarpDraft && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor={`alarp-draft-${entryId}`} className="text-xs font-semibold text-slate-700">
                    Drafted ALARP / override justification (edit before use)
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    className="h-7 text-xs"
                    onClick={() => void copyDraft(r.alarpDraft ?? "")}
                  >
                    {copied ? <Check size={12} /> : <ClipboardCopy size={12} />} {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <Textarea
                  id={`alarp-draft-${entryId}`}
                  readOnly
                  value={r.alarpDraft}
                  rows={4}
                  className="bg-slate-50 text-xs text-slate-800"
                />
              </div>
            )}

            {calibrated && !r.schemaReady && (
              <p className="flex items-start gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <Info size={14} className="mt-0.5 shrink-0" />
                Per-hazard ratings will be saved once the database update is applied.
              </p>
            )}

            {hasActions && (
              <p className="text-[11px] text-slate-500">
                The entry below reloads after each action. Save your own edits first.
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      {/* Change reason: entries on approved/active studies, or with versions. */}
      <Dialog
        open={reasonParts !== null}
        onOpenChange={(o) => {
          if (!o && !busy) {
            setReasonParts(null);
            setError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change reason</DialogTitle>
            <DialogDescription>
              This study is approved/active, or this entry already has versions. A change reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`cal-change-reason-${entryId}`}>Reason</Label>
            <Input
              id={`cal-change-reason-${entryId}`}
              autoFocus
              maxLength={500}
              placeholder="Change reason (required — captured on the new version)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitReason();
                }
              }}
            />
            {error && <p className="text-xs text-rose-700">{error}</p>}
          </div>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              variant="outline"
              type="button"
              disabled={!!busy}
              onClick={() => {
                setReasonParts(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" disabled={!!busy || !reason.trim()} onClick={submitReason}>
              {busy ? "Saving…" : "Save change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
