"use client";

/**
 * Wizard step — hazard annexures + precaution checklists.
 *
 * The digital form of the Page permit's back side (PIL/EHSD/CL/038-R2): pick
 * every hazard the job actually involves, then answer that hazard's precaution
 * checklist Yes / No / NA.
 *
 * Two rules the UI has to make obvious, because they are the point of the
 * screen rather than incidental validation:
 *
 *   • NO on a mandatory precaution is a STOP, not a warning. It means the
 *     control is not in place, so the permit cannot be raised until it is (or
 *     until the hazard is dropped from the permit).
 *   • NA needs a written reason. "Not applicable" is a judgement someone signs
 *     for, not a way to clear the list.
 *
 * The base permit type's own annexure is always present and cannot be removed
 * — it is what the permit number and the register column mean.
 */

import { useMemo } from "react";
import { AlertTriangle, Check, CircleSlash, Info, Lock, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type AnswerMap,
  type HazardType,
  type PrecautionAnswer,
  type PrecautionItem,
  HAZARD_LABELS,
  attachableHazards,
  bindingCapHazard,
  checklistProgress,
  controlDrivers,
  effectiveHazards,
  hazardForBaseType,
  requiredControls,
  validityCapHours
} from "@/lib/ptw/hazards";
import { Button } from "@/components/ui/button";

const CONTROL_LABELS: Record<string, string> = {
  GAS_TEST: "Gas testing",
  FIRE_WATCH: "Fire watch",
  STANDBY: "Standby person",
  RESCUE_PLAN: "Rescue plan"
};

export type HazardAnnexuresStepProps = {
  baseType: string;
  /** Hazards attached ON TOP of the base type. */
  hazards: HazardType[];
  onHazardsChange: (next: HazardType[]) => void;
  /** Catalog keyed by hazard type, as returned by /api/ptw/precautions/catalog. */
  catalog: Record<string, PrecautionItem[]>;
  /** answers[hazardType][itemId] */
  answers: Record<string, AnswerMap>;
  onAnswersChange: (next: Record<string, AnswerMap>) => void;
  /** Which annexure tab is open. */
  activeHazard: HazardType;
  onActiveHazardChange: (h: HazardType) => void;
  catalogLoading?: boolean;
  /** Hours currently requested, so the cap warning can be concrete. */
  validityHours: number | null;
};

export function HazardAnnexuresStep({
  baseType,
  hazards,
  onHazardsChange,
  catalog,
  answers,
  onAnswersChange,
  activeHazard,
  onActiveHazardChange,
  catalogLoading = false,
  validityHours
}: HazardAnnexuresStepProps) {
  const baseHazard = hazardForBaseType(baseType);
  const inForce = useMemo(() => effectiveHazards(baseType, hazards), [baseType, hazards]);
  const attachable = useMemo(() => attachableHazards(baseType), [baseType]);

  const cap = validityCapHours(baseType, hazards);
  const capDriver = bindingCapHazard(baseType, hazards);
  const controls = useMemo(() => requiredControls(baseType, hazards), [baseType, hazards]);

  const activeItems = catalog[activeHazard] ?? [];
  const activeAnswers = answers[activeHazard] ?? {};

  function toggleHazard(h: HazardType) {
    if (h === baseHazard) return; // base annexure is not detachable
    const next = hazards.includes(h) ? hazards.filter((x) => x !== h) : [...hazards, h];
    onHazardsChange(next);
    // Drop answers for a hazard that is no longer attached, so a re-tick starts
    // clean rather than silently reusing stale ticks nobody re-read.
    if (!next.includes(h) && answers[h]) {
      const { [h]: _dropped, ...rest } = answers;
      onAnswersChange(rest);
      if (activeHazard === h) onActiveHazardChange(baseHazard);
    }
  }

  function setAnswer(itemId: string, response: PrecautionAnswer) {
    const forHazard = { ...(answers[activeHazard] ?? {}) };
    forHazard[itemId] = { response, remark: forHazard[itemId]?.remark ?? "" };
    onAnswersChange({ ...answers, [activeHazard]: forHazard });
  }

  function setRemark(itemId: string, remark: string) {
    const forHazard = { ...(answers[activeHazard] ?? {}) };
    if (!forHazard[itemId]) return;
    forHazard[itemId] = { ...forHazard[itemId], remark };
    onAnswersChange({ ...answers, [activeHazard]: forHazard });
  }

  function setAllYes() {
    const forHazard = { ...(answers[activeHazard] ?? {}) };
    for (const item of activeItems) {
      // Only fills the blanks — never overwrites a deliberate NO or NA.
      if (!forHazard[item.id]) forHazard[item.id] = { response: "YES", remark: "" };
    }
    onAnswersChange({ ...answers, [activeHazard]: forHazard });
  }

  return (
    <div className="space-y-6">
      {/* ── Hazard selection ── */}
      <div>
        <Label>Hazards covered by this permit <span className="text-rose-600">*</span></Label>
        <p className="text-xs text-slate-500 mb-2">
          Tick every hazard the job actually involves. One permit covers them all — one
          number, one validity window, one closure.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="bare"
            type="button"
            disabled
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-sm text-slate-700 cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            title="The base permit type's own annexure cannot be removed."
          >
            <Lock className="h-3.5 w-3.5" />
            {HAZARD_LABELS[baseHazard]}
            <Badge className="ml-1 border-slate-300 bg-slate-200 text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">base</Badge>
          </Button>
          {attachable.map((h) => {
            const on = hazards.includes(h);
            return (
              <Button
                variant="bare"
                key={h}
                type="button"
                onClick={() => toggleHazard(h)}
                aria-pressed={on}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
                  on
                    ? "border-[#1E295A] bg-[#1E295A] text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                )}
              >
                {on ? <Check className="h-3.5 w-3.5" /> : null}
                {HAZARD_LABELS[h]}
              </Button>
            );
          })}
        </div>
      </div>

      {/* ── What the combination implies ── */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
          <div className="space-y-1.5">
            <div>
              <span className="text-slate-500">Validity cap:</span>{" "}
              <span className="font-medium">{cap}h</span>
              {inForce.length > 1 && (
                <span className="text-slate-500">
                  {" "}— tightest across {inForce.length} hazards, set by{" "}
                  {HAZARD_LABELS[capDriver]}
                </span>
              )}
            </div>
            {controls.size > 0 && (
              <div>
                <span className="text-slate-500">Mandatory controls:</span>{" "}
                {[...controls].map((c, i) => (
                  <span key={c}>
                    {i > 0 && ", "}
                    <span className="font-medium">{CONTROL_LABELS[c] ?? c}</span>
                    <span className="text-slate-500">
                      {" "}(
                      {controlDrivers(baseType, hazards, c)
                        .map((h) => HAZARD_LABELS[h])
                        .join(", ")}
                      )
                    </span>
                  </span>
                ))}
              </div>
            )}
            <div className="text-xs text-slate-500">
              The site EHS officer signs once for the whole permit — one certification
              covering every checklist below.
            </div>
          </div>
        </div>
        {validityHours !== null && validityHours > cap && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              The requested window is {validityHours}h but {HAZARD_LABELS[capDriver]} caps
              this permit at {cap}h. Shorten the window on Step 1, or raise a separate
              permit for that hazard.
            </span>
          </div>
        )}
      </div>

      {/* ── Checklist tabs ── */}
      <div>
        <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
          {inForce.map((h) => {
            const items = catalog[h] ?? [];
            const { done, required } = checklistProgress(items, answers[h] ?? {});
            const ok = required > 0 && done >= required;
            const empty = items.length === 0;
            return (
              <Button
                variant="bare"
                key={h}
                type="button"
                onClick={() => onActiveHazardChange(h)}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                  activeHazard === h
                    ? "border-[#1E295A] font-medium text-[#1E295A] dark:border-slate-200 dark:text-slate-100"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                {HAZARD_LABELS[h]}
                {empty ? (
                  <Badge className="border-slate-300 bg-transparent text-[10px] font-normal text-slate-500 dark:border-slate-700">no checklist</Badge>
                ) : (
                  <Badge
                    className={cn(
                      "text-[10px]",
                      ok
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    )}
                  >
                    {done}/{required}
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>

        <div className="pt-3">
          {catalogLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading checklist…</p>
          ) : activeItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              No precaution checklist is configured for{" "}
              <span className="font-medium">{HAZARD_LABELS[activeHazard]}</span>.
              <div className="mt-1 text-xs">
                The hazard still applies to the permit — it sets the approval chain, the
                validity cap and any mandatory controls. Only the checklist is missing.
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {activeItems.length} precaution{activeItems.length === 1 ? "" : "s"}
                  {activeItems[0]?.sourceRef ? ` · ${activeItems[0].sourceRef}` : ""}
                </p>
                <Button
                  variant="bare"
                  type="button"
                  onClick={setAllYes}
                  className="text-xs text-[#1E295A] underline-offset-2 hover:underline dark:text-slate-300"
                >
                  Mark remaining as Yes
                </Button>
              </div>
              <ol className="space-y-2">
                {activeItems.map((item, idx) => (
                  <PrecautionRow
                    key={item.id}
                    index={idx + 1}
                    item={item}
                    answer={activeAnswers[item.id]}
                    onAnswer={(r) => setAnswer(item.id, r)}
                    onRemark={(v) => setRemark(item.id, v)}
                  />
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PrecautionRow({
  index,
  item,
  answer,
  onAnswer,
  onRemark
}: {
  index: number;
  item: PrecautionItem;
  answer?: { response: PrecautionAnswer; remark: string };
  onAnswer: (r: PrecautionAnswer) => void;
  onRemark: (v: string) => void;
}) {
  const blocked = answer?.response === "NO" && item.isMandatory;
  const naNotAllowed = answer?.response === "NA" && !item.allowsNA;
  const needsRemark = answer?.response === "NA" && item.allowsNA && !answer.remark.trim();

  return (
    <li
      className={cn(
        "rounded-lg border p-3",
        blocked || naNotAllowed
          ? "border-rose-300 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30"
          : needsRemark
            ? "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30"
            : "border-slate-200 dark:border-slate-800"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-5 flex-shrink-0 text-right text-xs text-slate-400">{index}.</span>
        <p className="flex-1 text-sm leading-snug">
          {item.text}
          {!item.isMandatory && (
            <Badge className="ml-2 border-slate-300 bg-transparent align-middle text-[10px] font-normal text-slate-500 dark:border-slate-700">
              advisory
            </Badge>
          )}
        </p>
        <div className="flex flex-shrink-0 gap-1">
          {(["YES", "NO", "NA"] as PrecautionAnswer[]).map((r) => {
            if (r === "NA" && !item.allowsNA) return null;
            const on = answer?.response === r;
            return (
              <Button
                variant="bare"
                key={r}
                type="button"
                onClick={() => onAnswer(r)}
                aria-pressed={on}
                className={cn(
                  "flex h-7 w-11 items-center justify-center rounded border text-xs font-medium transition-colors",
                  on
                    ? r === "YES"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : r === "NO"
                        ? "border-rose-600 bg-rose-600 text-white"
                        : "border-slate-500 bg-slate-500 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                )}
              >
                {r === "YES" ? <Check className="h-3.5 w-3.5" /> : r === "NO" ? <X className="h-3.5 w-3.5" /> : <CircleSlash className="h-3.5 w-3.5" />}
              </Button>
            );
          })}
        </div>
      </div>

      {blocked && (
        <p className="mt-2 pl-8 text-xs text-rose-700 dark:text-rose-300">
          This precaution is mandatory. The permit cannot be raised until the control is
          in place — or remove this hazard from the permit.
        </p>
      )}
      {answer?.response === "NA" && item.allowsNA && (
        <div className="mt-2 pl-8">
          <Textarea
            rows={2}
            value={answer.remark}
            onChange={(e) => onRemark(e.target.value)}
            placeholder="Why does this not apply to this job? (required)"
            className={cn(needsRemark && "border-amber-400")}
          />
        </div>
      )}
    </li>
  );
}
