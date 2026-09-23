"use client";

// Charter a circle project (§6).
//
// Saves as a DRAFT, then charters as a second, explicit step. Chartering is what
// assigns the number AND materialises the gate sequence for the chosen
// methodology — and the methodology cannot be changed afterwards, because doing
// so would orphan the gates already created from it. That is why the choice sits
// on this form and not on the edit screen.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Loader2, Save, Flag } from "lucide-react";
import { KAIZEN_CATEGORY_LABEL } from "../../../_meta";
import { METHODOLOGY_LABEL, STAGE_LABEL } from "../../../_meta-p2";
import { Select, SelectItem } from "@/components/ui/select";

type Area = { id: string; name: string };
type Team = { id: string; name: string; teamNo: string | null };

const CATEGORIES = Object.keys(KAIZEN_CATEGORY_LABEL);

const STAGES: Record<string, string[]> = {
  DMAIC: ["DEFINE", "MEASURE", "ANALYZE", "IMPROVE", "CONTROL"],
  PDCA: ["PLAN", "DO", "CHECK", "ACT"]
};

export function ProjectForm({
  plantId,
  plantName,
  areas,
  teams,
  initialTeamId
}: {
  plantId: string;
  plantName: string | null;
  areas: Area[];
  teams: Team[];
  initialTeamId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<null | "draft" | "charter">(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    teamId: initialTeamId ?? teams[0]?.id ?? "",
    title: "",
    category: "QUALITY",
    areaId: "",
    problemStatement: "",
    selectionRationale: "",
    priorityScore: "",
    methodology: "DMAIC",
    scope: "",
    baselineMetric: "",
    baselineValue: "",
    targetValue: "",
    metricUnit: "",
    targetDate: ""
  });

  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  // Mirrors the server's Pydantic rules so the user is told before the round
  // trip. The server still re-validates — this is a courtesy, never the gate.
  const problems: string[] = [];
  if (!form.teamId) problems.push("Choose the circle taking this on.");
  if (form.title.trim().length < 4) problems.push("Give the project a title of at least 4 characters.");
  if (form.problemStatement.trim().length < 10)
    problems.push("Describe the problem in at least 10 characters.");
  if (form.targetValue && !form.baselineValue)
    problems.push("A target value needs a baseline to be measured against.");
  const valid = problems.length === 0;

  // Chartering has a stricter bar than saving a draft: §6 requires both numbers
  // on the charter, because without them the benefit at the end is unfalsifiable.
  const charterProblems = [...problems];
  if (!form.baselineValue || !form.targetValue)
    charterProblems.push("Chartering needs both a baseline and a target value.");
  const canCharter = charterProblems.length === 0;

  async function save(then: "draft" | "charter") {
    setBusy(then);
    setError(null);
    try {
      const payload: Record<string, any> = {
        teamId: form.teamId,
        plantId,
        title: form.title.trim(),
        category: form.category,
        problemStatement: form.problemStatement.trim(),
        methodology: form.methodology
      };
      if (form.areaId) payload.areaId = form.areaId;
      if (form.selectionRationale.trim())
        payload.selectionRationale = form.selectionRationale.trim();
      if (form.priorityScore) payload.priorityScore = Number(form.priorityScore);
      if (form.scope.trim()) payload.scope = form.scope.trim();
      if (form.baselineMetric.trim()) payload.baselineMetric = form.baselineMetric.trim();
      if (form.baselineValue) payload.baselineValue = Number(form.baselineValue);
      if (form.targetValue) payload.targetValue = Number(form.targetValue);
      if (form.metricUnit.trim()) payload.metricUnit = form.metricUnit.trim();
      if (form.targetDate) payload.targetDate = new Date(form.targetDate).toISOString();

      const res = await fetch("/api/be/qcc/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "Could not save the project.");
      const created = await res.json();

      if (then === "charter") {
        const ch = await fetch(`/api/be/qcc/projects/${created.id}/charter`, {
          method: "POST"
        });
        if (!ch.ok) {
          // The draft DID save. Say so, and send them to it.
          const detail = (await ch.json())?.detail ?? "Chartering failed.";
          toast({
            variant: "error",
            title: "Saved as a draft, but not chartered",
            description: detail
          });
          router.push(`/business-excellence/qcc/projects/${created.id}`);
          router.refresh();
          return;
        }
        toast({ variant: "success", title: "Project chartered" });
      } else {
        toast({ variant: "success", title: "Saved as a draft" });
      }

      router.push(`/business-excellence/qcc/projects/${created.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold text-slate-900">The problem</h2>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="teamId">Circle</Label>
              <Select
                id="teamId"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={form.teamId}
                onChange={(e) => set("teamId", e.target.value)}
              >
                {teams.length === 0 ? <SelectItem value="">No circles at this site</SelectItem> : null}
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.teamNo ? ` (${t.teamNo})` : ""}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                id="category"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {KAIZEN_CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="title">Project title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Cut sleeve-attach rework on Line 3"
            />
          </div>

          <div>
            <Label htmlFor="problemStatement">Problem statement</Label>
            <Textarea
              id="problemStatement"
              rows={4}
              value={form.problemStatement}
              onChange={(e) => set("problemStatement", e.target.value)}
              placeholder="What is going wrong, where, and how often?"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="areaId">Area (optional)</Label>
              <Select
                id="areaId"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={form.areaId}
                onChange={(e) => set("areaId", e.target.value)}
              >
                <SelectItem value="">Not area-specific</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="priorityScore">Priority score (optional)</Label>
              <Input
                id="priorityScore"
                type="number"
                min={0}
                step="0.1"
                value={form.priorityScore}
                onChange={(e) => set("priorityScore", e.target.value)}
                placeholder="How this ranked against the other candidates"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="selectionRationale">Why this problem (optional)</Label>
            <Textarea
              id="selectionRationale"
              rows={2}
              value={form.selectionRationale}
              onChange={(e) => set("selectionRationale", e.target.value)}
              placeholder="What made the circle pick this one over the others?"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 font-semibold text-slate-900">Charter</h2>
        <p className="mb-4 text-xs text-slate-500">
          A baseline and a target are what make the benefit measurable at the end.
          Chartering will not go through without both.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="scope">Scope (optional)</Label>
            <Textarea
              id="scope"
              rows={2}
              value={form.scope}
              onChange={(e) => set("scope", e.target.value)}
              placeholder="What is in, and what is explicitly out."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="baselineMetric">What is being measured</Label>
              <Input
                id="baselineMetric"
                value={form.baselineMetric}
                onChange={(e) => set("baselineMetric", e.target.value)}
                placeholder="Sleeve-attach rework rate"
              />
            </div>
            <div>
              <Label htmlFor="metricUnit">Unit</Label>
              <Input
                id="metricUnit"
                value={form.metricUnit}
                onChange={(e) => set("metricUnit", e.target.value)}
                placeholder="%"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="baselineValue">Baseline</Label>
              <Input
                id="baselineValue"
                type="number"
                step="any"
                value={form.baselineValue}
                onChange={(e) => set("baselineValue", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="targetValue">Target</Label>
              <Input
                id="targetValue"
                type="number"
                step="any"
                value={form.targetValue}
                onChange={(e) => set("targetValue", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="targetDate">Target date</Label>
              <Input
                id="targetDate"
                type="date"
                value={form.targetDate}
                onChange={(e) => set("targetDate", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 font-semibold text-slate-900">Method</h2>
        {/* Locked after chartering, so say so before they pick. */}
        <p className="mb-4 text-xs text-slate-500">
          This cannot be changed once the project is chartered — the gates are created
          from it.
        </p>
        <RadioGroup
          name="methodology"
          value={form.methodology}
          onValueChange={(v) => set("methodology", v)}
          className="flex flex-wrap gap-3"
        >
          {Object.keys(METHODOLOGY_LABEL).map((m) => (
            <Label
              key={m}
              htmlFor={`methodology-${m}`}
              className={`flex-1 cursor-pointer rounded-lg border p-3 font-normal leading-normal text-inherit text-[length:inherit] ${
                form.methodology === m
                  ? "border-primary-300 bg-primary-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <RadioGroupItem value={m} id={`methodology-${m}`} className="sr-only" />
              <div className="font-medium text-slate-900">{METHODOLOGY_LABEL[m]}</div>
              <div className="mt-1 text-xs text-slate-500">
                {STAGES[m].map((s) => STAGE_LABEL[s] ?? s).join(" → ")}
              </div>
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-xs uppercase tracking-wider text-slate-400">Site</div>
        <div className="mt-1 text-sm text-slate-700">{plantName ?? "—"}</div>
      </div>

      {charterProblems.length ? (
        <ul className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {charterProblems.map((p) => (
            <li key={p}>• {p}</li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save("charter")} disabled={!canCharter || busy !== null}>
          {busy === "charter" ? (
            <Loader2 size={15} className="mr-1.5 animate-spin" />
          ) : (
            <Flag size={15} className="mr-1.5" />
          )}
          Charter the project
        </Button>
        <Button variant="outline" onClick={() => save("draft")} disabled={!valid || busy !== null}>
          {busy === "draft" ? (
            <Loader2 size={15} className="mr-1.5 animate-spin" />
          ) : (
            <Save size={15} className="mr-1.5" />
          )}
          Save as draft
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Chartering numbers the project, opens the first gate and sends the charter for
        approval.
      </p>
    </div>
  );
}
