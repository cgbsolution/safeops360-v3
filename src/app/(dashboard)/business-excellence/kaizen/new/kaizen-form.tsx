"use client";

// Raise a Kaizen.
//
// Saves as a DRAFT first and submits as a second, explicit step. That is not
// ceremony: submitting is what assigns the record number and starts a workflow
// that lands on someone else's inbox, and a form that did both on one button
// would burn a number every time somebody changed their mind halfway down.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserPicker } from "@/components/ui/user-picker";
import { useToast } from "@/components/ui/toast";
import { Loader2, Send, Save } from "lucide-react";
import { KAIZEN_CATEGORY_LABEL, KAIZEN_LANE_LABEL, SAVING_TYPE_LABEL } from "../../_meta";
import { SimilarIdeas } from "./similar-ideas";
import { Select as UiSelect, SelectItem } from "@/components/ui/select";

type Area = { id: string; name: string };

const CATEGORIES = Object.keys(KAIZEN_CATEGORY_LABEL);
const LANES = Object.keys(KAIZEN_LANE_LABEL);
const SAVING_TYPES = Object.keys(SAVING_TYPE_LABEL);

export function KaizenForm({
  plantId,
  plantName,
  areas
}: {
  plantId: string;
  plantName: string | null;
  areas: Area[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<null | "draft" | "submit">(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    category: "PRODUCTIVITY",
    lane: "STANDARD",
    areaId: "",
    lineOrMachine: "",
    processStep: "",
    problemStatement: "",
    currentState: "",
    proposedImprovement: "",
    expectedBenefit: "",
    ownerId: null as string | null,
    targetDate: "",
    investmentCost: "",
    estimatedAnnualSaving: "",
    savingType: ""
  });

  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  // Mirrors the server's Pydantic rules so the user is told before the round
  // trip. The server still re-validates — this is a courtesy, never the gate.
  const problems: string[] = [];
  if (form.title.trim().length < 4) problems.push("Give the idea a title of at least 4 characters.");
  if (form.problemStatement.trim().length < 10)
    problems.push("Describe the problem in at least 10 characters.");
  if (form.proposedImprovement.trim().length < 10)
    problems.push("Describe the countermeasure in at least 10 characters.");
  if (form.savingType && !form.estimatedAnnualSaving)
    problems.push("A saving type needs an estimated annual saving figure to go with it.");
  const valid = problems.length === 0;

  async function save(then: "draft" | "submit") {
    setBusy(then);
    setError(null);
    try {
      const payload: Record<string, any> = {
        plantId,
        title: form.title.trim(),
        category: form.category,
        lane: form.lane,
        problemStatement: form.problemStatement.trim(),
        proposedImprovement: form.proposedImprovement.trim()
      };
      // Only send what was filled in. Posting "" for an optional numeric or a
      // date would fail validation on fields the user deliberately left blank.
      if (form.areaId) payload.areaId = form.areaId;
      if (form.lineOrMachine.trim()) payload.lineOrMachine = form.lineOrMachine.trim();
      if (form.processStep.trim()) payload.processStep = form.processStep.trim();
      if (form.currentState.trim()) payload.currentState = form.currentState.trim();
      if (form.expectedBenefit.trim()) payload.expectedBenefit = form.expectedBenefit.trim();
      if (form.ownerId) payload.ownerId = form.ownerId;
      if (form.targetDate) payload.targetDate = new Date(form.targetDate).toISOString();
      if (form.investmentCost) payload.investmentCost = Number(form.investmentCost);
      if (form.estimatedAnnualSaving)
        payload.estimatedAnnualSaving = Number(form.estimatedAnnualSaving);
      if (form.savingType) payload.savingType = form.savingType;

      const res = await fetch("/api/be/kaizen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "Could not save the idea.");
      const created = await res.json();

      if (then === "submit") {
        const sub = await fetch(`/api/be/kaizen/${created.id}/submit`, { method: "POST" });
        if (!sub.ok) {
          // The draft DID save. Say so, and send them to it — losing the typing
          // because the second call failed would be the worst outcome here.
          const detail = (await sub.json())?.detail ?? "Submission failed.";
          toast({
            variant: "error",
            title: "Saved as a draft, but not submitted",
            description: detail
          });
          router.push(`/business-excellence/kaizen/${created.id}`);
          router.refresh();
          return;
        }
        toast({ variant: "success", title: "Idea submitted for screening" });
      } else {
        toast({ variant: "success", title: "Draft saved" });
      }
      router.push(`/business-excellence/kaizen/${created.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      <Section title="The problem" hint="What is wrong today, at which machine.">
        <Field label="Title" required>
          <Input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Operator walks 12 m to fetch the torque wrench each cycle"
          />
          {/* Debounced against the trigram search across every plant this user
              can read. Advisory only — it never blocks the save. */}
          <SimilarIdeas query={form.title} />
        </Field>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Category" required>
            <Select value={form.category} onChange={(v) => set("category", v)} options={CATEGORIES} labels={KAIZEN_CATEGORY_LABEL} />
          </Field>
          {/* This picks the APPROVAL ROUTE — which of the two live Kaizen
              workflows the record runs through. It is NOT the "Fast track"
              badge: that is computed by the server from the investment and
              target date below, and cannot be claimed here. Choosing the fast
              lane on a £40,000 six-month project gets you a supervisor sign-off
              and no badge, which is the correct outcome for both. */}
          <Field
            label="Approval route"
            hint={
              form.lane === "FAST_TRACK"
                ? "A supervisor can accept this without convening the committee."
                : "Screened by the committee, then approved for funding."
            }
          >
            <Select value={form.lane} onChange={(v) => set("lane", v)} options={LANES} labels={KAIZEN_LANE_LABEL} />
          </Field>
          <Field label="Area">
            <Select
              value={form.areaId}
              onChange={(v) => set("areaId", v)}
              options={["", ...areas.map((a) => a.id)]}
              labels={{
                "": "Not area-specific",
                ...Object.fromEntries(areas.map((a) => [a.id, a.name]))
              }}
            />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Line or machine">
            <Input
              value={form.lineOrMachine}
              onChange={(e) => set("lineOrMachine", e.target.value)}
              placeholder="Sewing line 4, station 12"
            />
          </Field>
          <Field label="Process step">
            <Input
              value={form.processStep}
              onChange={(e) => set("processStep", e.target.value)}
              placeholder="Collar attach"
            />
          </Field>
        </div>

        <Field label="Problem statement" required>
          <Textarea
            rows={3}
            value={form.problemStatement}
            onChange={(e) => set("problemStatement", e.target.value)}
            placeholder="What happens, how often, and what it costs in time, scrap or risk."
          />
        </Field>
        <Field label="Current state">
          <Textarea
            rows={2}
            value={form.currentState}
            onChange={(e) => set("currentState", e.target.value)}
            placeholder="How the job is done today."
          />
        </Field>
      </Section>

      <Section title="The countermeasure" hint="What you propose to change, and who will do it.">
        <Field label="Proposed improvement" required>
          <Textarea
            rows={3}
            value={form.proposedImprovement}
            onChange={(e) => set("proposedImprovement", e.target.value)}
            placeholder="Mount a wrench holder at the station; shadow-board it so a missing tool is visible."
          />
        </Field>
        <Field label="Expected benefit">
          <Textarea
            rows={2}
            value={form.expectedBenefit}
            onChange={(e) => set("expectedBenefit", e.target.value)}
            placeholder="8 seconds per cycle, ~40 minutes per shift across the line."
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Implementation owner" hint="Can be assigned later at screening.">
            <UserPicker
              value={form.ownerId}
              onChange={(id) => set("ownerId", id)}
              placeholder="Search for a person"
            />
          </Field>
          <Field label="Target date">
            <Input
              type="date"
              value={form.targetDate}
              onChange={(e) => set("targetDate", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="The numbers"
        hint="Estimates. Someone other than you confirms the realised saving later — that is a separate, deliberate step."
      >
        {/* Says out loud what the two fields below unlock, so a submitter who
            wants the badge knows exactly what to fill in. The badge used to be
            a dropdown here and could be claimed with both fields empty. */}
        <FastTrackHint
          investmentCost={form.investmentCost}
          targetDate={form.targetDate}
        />
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Investment cost">
            <Input
              type="number"
              min={0}
              value={form.investmentCost}
              onChange={(e) => set("investmentCost", e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Estimated annual saving">
            <Input
              type="number"
              min={0}
              value={form.estimatedAnnualSaving}
              onChange={(e) => set("estimatedAnnualSaving", e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Saving type">
            <Select
              value={form.savingType}
              onChange={(v) => set("savingType", v)}
              options={["", ...SAVING_TYPES]}
              labels={{ "": "Not stated", ...SAVING_TYPE_LABEL }}
            />
          </Field>
        </div>
      </Section>

      {!valid && (
        <ul className="list-disc space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4 pl-8 text-sm text-amber-900">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
        <Button onClick={() => save("submit")} disabled={!valid || busy !== null}>
          {busy === "submit" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Submit for screening
        </Button>
        <Button variant="outline" onClick={() => save("draft")} disabled={!valid || busy !== null}>
          {busy === "draft" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save as draft
        </Button>
        <span className="text-xs text-slate-500">
          Filing at {plantName ?? "the selected plant"}. The record is numbered on
          submission, not now.
        </span>
      </div>
    </div>
  );
}

// Mirrors the server's thresholds (FAST_TRACK_MAX_INVESTMENT and
// FAST_TRACK_MAX_IMPLEMENTATION_DAYS in app/models/business_excellence.py).
// This is a preview so the submitter is not surprised — the SERVER recomputes
// eligibility on every read and its answer is the only one that reaches a
// register. If these numbers are changed, change them there first.
const FAST_TRACK_MAX_INVESTMENT = 5000;
const FAST_TRACK_MAX_DAYS = 1;

function FastTrackHint({
  investmentCost,
  targetDate
}: {
  investmentCost: string;
  targetDate: string;
}) {
  const hasInvestment = investmentCost !== "";
  const investment = Number(investmentCost);
  // Days from today, because the record has not been created yet and the server
  // measures the window from createdAt.
  const days = targetDate
    ? Math.max(
        0,
        Math.round(
          (new Date(targetDate).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000
        )
      )
    : null;

  const earns =
    hasInvestment &&
    Number.isFinite(investment) &&
    investment <= FAST_TRACK_MAX_INVESTMENT &&
    days !== null &&
    days <= FAST_TRACK_MAX_DAYS;

  return (
    <div
      className={
        earns
          ? "rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900"
          : "rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
      }
    >
      {earns ? (
        <>
          <span className="font-semibold">This will carry the “Fast track” badge.</span>{" "}
          Under {FAST_TRACK_MAX_INVESTMENT.toLocaleString()} to do and finished
          within {FAST_TRACK_MAX_DAYS} day.
        </>
      ) : (
        <>
          <span className="font-semibold">“Fast track” is earned, not chosen.</span>{" "}
          The badge appears when the investment is at or under{" "}
          {FAST_TRACK_MAX_INVESTMENT.toLocaleString()} <em>and</em> the target date
          is within {FAST_TRACK_MAX_DAYS} day — both recorded, not left blank.
          {!hasInvestment && " No investment figure entered yet."}
          {hasInvestment && days === null && " No target date set yet."}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  children
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  children
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

/**
 * A fixed-vocabulary picker over the shared shadcn Select, with a
 * value/onChange(string) contract for the form above.
 */
function Select({
  value,
  onChange,
  options,
  labels
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels: Record<string, string>;
}) {
  return (
    <UiSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300"
    >
      {options.map((o) => (
        <SelectItem key={o || "_blank"} value={o}>
          {labels[o] ?? o}
        </SelectItem>
      ))}
    </UiSelect>
  );
}
