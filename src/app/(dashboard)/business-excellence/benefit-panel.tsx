"use client";

// The shared benefit-realisation panel (§2 / §6 / §7 / §8).
//
// One component for every register, because the rule it enforces is one rule:
// a benefit is CLAIMED by the people who did the work and VALIDATED, later, by
// somebody else. Those are two separate buttons on purpose — a single "record
// the benefit" control is exactly how a projected figure ends up on an
// executive dashboard as a realised one.
//
// `validationBlockers` arrives per-benefit and PER-CALLER from the server, so
// two people see different answers on the same row. That is what a
// separation-of-duties rule means, and it is why the reason is rendered instead
// of a bare disabled button.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Loader2, Plus, BadgeCheck, TrendingUp } from "lucide-react";
import {
  BENEFIT_TYPE_LABEL,
  VALIDATION_WINDOW_LABEL,
  VALUE_KIND_LABEL,
  type BenefitLine
} from "./_meta-p2";
import { BenefitCard, BlockerNote } from "./ui-p2";
import { Select, SelectItem } from "@/components/ui/select";

const BENEFIT_TYPES = Object.keys(BENEFIT_TYPE_LABEL);
const WINDOWS = [1, 3, 6, 12];

export function BenefitPanel({
  sourceType,
  sourceId,
  benefits,
  canRecord,
  canValidate,
  defaultCurrency = "INR",
  /** SIP tracks actual-vs-target over the life of the project, not just at
      closure — so only SIP surfaces the readings control. */
  showReadings = false
}: {
  sourceType: string;
  sourceId: string;
  benefits: BenefitLine[];
  canRecord: boolean;
  canValidate: boolean;
  defaultCurrency?: string;
  showReadings?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [openPanel, setOpenPanel] = useState<string | null>(null);

  const [nb, setNb] = useState({
    benefitType: "COST_SAVING",
    valueKind: "FINANCIAL",
    unit: "",
    projectedValue: "",
    annualisedValue: "",
    validationWindowMonths: "6",
    note: ""
  });

  const [claim, setClaim] = useState({ realizedValue: "", note: "" });
  const [validation, setValidation] = useState({ accept: true, note: "" });
  const [reading, setReading] = useState({ actualValue: "", periodLabel: "", note: "" });

  async function call(path: string, body: any, label: string, method = "POST") {
    setBusy(path);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "That did not work.");
      toast({ variant: "success", title: label });
      setAdding(false);
      setOpenPanel(null);
      setClaim({ realizedValue: "", note: "" });
      setReading({ actualValue: "", periodLabel: "", note: "" });
      router.refresh();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not update the benefit", description: e?.message });
    } finally {
      setBusy(null);
    }
  }

  const usedTypes = new Set(benefits.map((b) => b.benefitType));
  const availableTypes = BENEFIT_TYPES.filter((t) => !usedTypes.has(t));

  return (
    <div className="space-y-3">
      {benefits.map((b) => {
        const claimOpen = openPanel === `claim:${b.id}`;
        const validateOpen = openPanel === `validate:${b.id}`;
        const readingOpen = openPanel === `reading:${b.id}`;
        const canBeValidated = canValidate && b.validationBlockers.length === 0;

        return (
          <BenefitCard
            key={b.id}
            benefit={b}
            action={
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {canRecord && b.status !== "VALIDATED" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpenPanel(claimOpen ? null : `claim:${b.id}`)}
                    >
                      {b.realizedValue === null ? "Record what was realised" : "Update the figure"}
                    </Button>
                  ) : null}

                  {canRecord && showReadings ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setOpenPanel(readingOpen ? null : `reading:${b.id}`)}
                    >
                      <TrendingUp size={13} className="mr-1" />
                      Add a reading
                    </Button>
                  ) : null}

                  {canValidate && b.status !== "VALIDATED" ? (
                    <Button
                      size="sm"
                      disabled={!canBeValidated}
                      onClick={() => setOpenPanel(validateOpen ? null : `validate:${b.id}`)}
                    >
                      <BadgeCheck size={13} className="mr-1" />
                      Validate
                    </Button>
                  ) : null}
                </div>

                {/* Per-caller, from the server. Someone else may well be able to
                    validate this exact line. */}
                {canValidate && b.status !== "VALIDATED" ? (
                  <BlockerNote blockers={b.validationBlockers} />
                ) : null}

                {claimOpen ? (
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <Label htmlFor={`rv-${b.id}`}>
                        Realised {b.valueKind === "FINANCIAL" ? "value" : `value (${b.unit ?? ""})`}
                      </Label>
                      <Input
                        id={`rv-${b.id}`}
                        type="number"
                        step="any"
                        value={claim.realizedValue}
                        onChange={(e) => setClaim((c) => ({ ...c, realizedValue: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`cn-${b.id}`}>How it was measured</Label>
                      <Textarea
                        id={`cn-${b.id}`}
                        rows={2}
                        value={claim.note}
                        onChange={(e) => setClaim((c) => ({ ...c, note: e.target.value }))}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      This submits the figure for sign-off. It does not confirm it —
                      that is somebody else&rsquo;s decision, after the window closes.
                    </p>
                    <Button
                      size="sm"
                      disabled={busy !== null || !claim.realizedValue}
                      onClick={() =>
                        call(
                          `/api/be/benefits/${b.id}/claim`,
                          {
                            realizedValue: Number(claim.realizedValue),
                            note: claim.note.trim() || null
                          },
                          "Submitted for sign-off"
                        )
                      }
                    >
                      {busy?.includes(`${b.id}/claim`) ? (
                        <Loader2 size={13} className="mr-1 animate-spin" />
                      ) : null}
                      Submit for sign-off
                    </Button>
                  </div>
                ) : null}

                {validateOpen ? (
                  <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <RadioGroup
                      value={validation.accept ? "yes" : "no"}
                      onValueChange={(val) => setValidation((v) => ({ ...v, accept: val === "yes" }))}
                      className="flex gap-4 text-sm"
                    >
                      <Label className="flex items-center gap-1.5 font-normal leading-normal text-inherit text-[length:inherit]">
                        <RadioGroupItem value="yes" id={`va-yes-${b.id}`} />
                        The benefit held
                      </Label>
                      <Label className="flex items-center gap-1.5 font-normal leading-normal text-inherit text-[length:inherit]">
                        <RadioGroupItem value="no" id={`va-no-${b.id}`} />
                        It did not
                      </Label>
                    </RadioGroup>
                    <div>
                      <Label htmlFor={`vn-${b.id}`}>
                        Note {validation.accept ? "(optional)" : "(required)"}
                      </Label>
                      <Textarea
                        id={`vn-${b.id}`}
                        rows={2}
                        value={validation.note}
                        onChange={(e) => setValidation((v) => ({ ...v, note: e.target.value }))}
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={
                        busy !== null || (!validation.accept && !validation.note.trim())
                      }
                      onClick={() =>
                        call(
                          `/api/be/benefits/${b.id}/validate`,
                          { accept: validation.accept, note: validation.note.trim() || null },
                          validation.accept ? "Benefit validated" : "Benefit not accepted"
                        )
                      }
                    >
                      {busy?.includes(`${b.id}/validate`) ? (
                        <Loader2 size={13} className="mr-1 animate-spin" />
                      ) : null}
                      Record the decision
                    </Button>
                  </div>
                ) : null}

                {readingOpen ? (
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label htmlFor={`ra-${b.id}`}>Actual value</Label>
                        <Input
                          id={`ra-${b.id}`}
                          type="number"
                          step="any"
                          value={reading.actualValue}
                          onChange={(e) =>
                            setReading((r) => ({ ...r, actualValue: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor={`rp-${b.id}`}>Period</Label>
                        <Input
                          id={`rp-${b.id}`}
                          value={reading.periodLabel}
                          onChange={(e) =>
                            setReading((r) => ({ ...r, periodLabel: e.target.value }))
                          }
                          placeholder="2026-07 or FY26-Q2"
                        />
                      </div>
                    </div>
                    {/* Append-only: a measurement you can edit afterwards is an
                        opinion. Corrections are a new reading with a note. */}
                    <p className="text-xs text-slate-500">
                      Readings are append-only. A correction is a new reading with a
                      note, not an edit.
                    </p>
                    <Button
                      size="sm"
                      disabled={busy !== null || !reading.actualValue}
                      onClick={() =>
                        call(
                          `/api/be/benefits/${b.id}/readings`,
                          {
                            actualValue: Number(reading.actualValue),
                            periodLabel: reading.periodLabel.trim() || null,
                            note: reading.note.trim() || null
                          },
                          "Reading added"
                        )
                      }
                    >
                      {busy?.includes(`${b.id}/readings`) ? (
                        <Loader2 size={13} className="mr-1 animate-spin" />
                      ) : null}
                      Add the reading
                    </Button>
                  </div>
                ) : null}

                {b.readings.length ? (
                  <Collapsible className="text-xs text-slate-500">
                    <CollapsibleTrigger className="cursor-pointer w-full text-left">
                      {b.readings.length} reading{b.readings.length === 1 ? "" : "s"}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                    <ul className="mt-2 space-y-1">
                      {b.readings.map((r) => (
                        <li key={r.id} className="flex justify-between">
                          <span>{r.periodLabel ?? new Date(r.readingAt).toLocaleDateString()}</span>
                          <span className="tabular-nums text-slate-700">{r.actualValue}</span>
                        </li>
                      ))}
                    </ul>
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
              </div>
            }
          />
        );
      })}

      {benefits.length === 0 ? (
        <p className="text-sm text-slate-500">
          No benefit recorded yet. One is required before this can be closed.
        </p>
      ) : null}

      {canRecord && availableTypes.length ? (
        <div>
          <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}>
            <Plus size={13} className="mr-1" />
            Add a benefit line
          </Button>

          {adding ? (
            <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="bt">Type</Label>
                  <Select
                    id="bt"
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={nb.benefitType}
                    onChange={(e) => setNb((n) => ({ ...n, benefitType: e.target.value }))}
                  >
                    {availableTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {BENEFIT_TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </Select>
                  {/* One line per (record, type) — two of the same type on one
                      record is double-counting on the §8 dashboard. */}
                  <p className="mt-1 text-xs text-slate-500">
                    One line per type. Types already recorded are not listed.
                  </p>
                </div>
                <div>
                  <Label htmlFor="vk">Financial or not</Label>
                  <Select
                    id="vk"
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={nb.valueKind}
                    onChange={(e) => setNb((n) => ({ ...n, valueKind: e.target.value }))}
                  >
                    {Object.entries(VALUE_KIND_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              </div>

              {nb.valueKind === "NON_FINANCIAL" ? (
                <div>
                  <Label htmlFor="unit">Unit</Label>
                  <Input
                    id="unit"
                    value={nb.unit}
                    onChange={(e) => setNb((n) => ({ ...n, unit: e.target.value }))}
                    placeholder="ppm, minutes, kWh"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Required. Non-financial benefits are counted separately and never
                    added to the money total.
                  </p>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="pv">Projected</Label>
                  <Input
                    id="pv"
                    type="number"
                    step="any"
                    value={nb.projectedValue}
                    onChange={(e) => setNb((n) => ({ ...n, projectedValue: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="av">Annualised</Label>
                  <Input
                    id="av"
                    type="number"
                    step="any"
                    value={nb.annualisedValue}
                    onChange={(e) => setNb((n) => ({ ...n, annualisedValue: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="vw">Sign-off window</Label>
                  <Select
                    id="vw"
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={nb.validationWindowMonths}
                    onChange={(e) =>
                      setNb((n) => ({ ...n, validationWindowMonths: e.target.value }))
                    }
                  >
                    {WINDOWS.map((w) => (
                      <SelectItem key={w} value={String(w)}>
                        {VALIDATION_WINDOW_LABEL[w]}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              </div>

              <Button
                size="sm"
                disabled={
                  busy !== null || (nb.valueKind === "NON_FINANCIAL" && !nb.unit.trim())
                }
                onClick={() =>
                  call(
                    "/api/be/benefits",
                    {
                      sourceType,
                      sourceId,
                      benefitType: nb.benefitType,
                      valueKind: nb.valueKind,
                      currency: nb.valueKind === "FINANCIAL" ? defaultCurrency : null,
                      unit: nb.valueKind === "NON_FINANCIAL" ? nb.unit.trim() : null,
                      projectedValue: nb.projectedValue ? Number(nb.projectedValue) : null,
                      annualisedValue: nb.annualisedValue ? Number(nb.annualisedValue) : null,
                      validationWindowMonths: Number(nb.validationWindowMonths),
                      note: nb.note.trim() || null
                    },
                    "Benefit line added"
                  )
                }
              >
                {busy === "/api/be/benefits" ? (
                  <Loader2 size={13} className="mr-1 animate-spin" />
                ) : null}
                Add the line
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
