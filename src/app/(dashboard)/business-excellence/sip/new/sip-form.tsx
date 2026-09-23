"use client";

// Register a Structured Improvement Project (§7).
//
// Saves as a DRAFT, then submits for the multi-level sign-off as a second step.
// Milestones can be added here or later — but only until the project is
// approved, after which they can be cancelled but not deleted, because from
// that point the plan is a record of what was committed to.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserPicker } from "@/components/ui/user-picker";
import { useToast } from "@/components/ui/toast";
import { Loader2, Save, Send, Plus, X } from "lucide-react";
import { KAIZEN_CATEGORY_LABEL } from "../../_meta";
import { Select, SelectItem } from "@/components/ui/select";

type Area = { id: string; name: string };
type Milestone = { name: string; plannedDate: string; ownerId: string | null; ownerName: string };

const CATEGORIES = Object.keys(KAIZEN_CATEGORY_LABEL);

export function SipForm({
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
    department: "",
    areaId: "",
    scope: "",
    problemStatement: "",
    sponsorId: null as string | null,
    ownerId: null as string | null,
    metricName: "",
    metricUnit: "",
    baselineValue: "",
    targetValue: "",
    startDate: "",
    targetDate: "",
    feasibilityScore: "",
    impactScore: "",
    investmentCost: ""
  });
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [pm, setPm] = useState<Milestone>({
    name: "",
    plannedDate: "",
    ownerId: null,
    ownerName: ""
  });

  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  // Mirrors the server's Pydantic rules so the user is told before the round
  // trip. The server still re-validates — this is a courtesy, never the gate.
  const problems: string[] = [];
  if (form.title.trim().length < 4) problems.push("Give the project a title of at least 4 characters.");
  if (form.scope.trim().length < 10) problems.push("Describe the scope in at least 10 characters.");
  if (form.targetValue && !form.baselineValue)
    problems.push("A target value needs a baseline to be measured against.");
  if (form.sponsorId && form.ownerId && form.sponsorId === form.ownerId)
    problems.push("The sponsor and the project owner must be different people.");
  const valid = problems.length === 0;

  const priority =
    form.feasibilityScore && form.impactScore
      ? Math.round(Number(form.feasibilityScore) * Number(form.impactScore) * 100) / 100
      : null;

  function addMilestone() {
    if (!pm.name.trim()) return;
    setMilestones((ms) => [...ms, { ...pm, name: pm.name.trim() }]);
    setPm({ name: "", plannedDate: "", ownerId: null, ownerName: "" });
  }

  async function save(then: "draft" | "submit") {
    setBusy(then);
    setError(null);
    try {
      const payload: Record<string, any> = {
        plantId,
        title: form.title.trim(),
        category: form.category,
        scope: form.scope.trim(),
        milestones: milestones.map((m, i) => ({
          name: m.name,
          sequence: i,
          ownerId: m.ownerId ?? undefined,
          plannedDate: m.plannedDate ? new Date(m.plannedDate).toISOString() : undefined
        }))
      };
      if (form.areaId) payload.areaId = form.areaId;
      if (form.department.trim()) payload.department = form.department.trim();
      if (form.problemStatement.trim()) payload.problemStatement = form.problemStatement.trim();
      if (form.sponsorId) payload.sponsorId = form.sponsorId;
      if (form.ownerId) payload.ownerId = form.ownerId;
      if (form.metricName.trim()) payload.metricName = form.metricName.trim();
      if (form.metricUnit.trim()) payload.metricUnit = form.metricUnit.trim();
      if (form.baselineValue) payload.baselineValue = Number(form.baselineValue);
      if (form.targetValue) payload.targetValue = Number(form.targetValue);
      if (form.startDate) payload.startDate = new Date(form.startDate).toISOString();
      if (form.targetDate) payload.targetDate = new Date(form.targetDate).toISOString();
      if (form.feasibilityScore) payload.feasibilityScore = Number(form.feasibilityScore);
      if (form.impactScore) payload.impactScore = Number(form.impactScore);
      if (form.investmentCost) payload.investmentCost = Number(form.investmentCost);

      const res = await fetch("/api/be/sip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "Could not save the project.");
      const created = await res.json();

      if (then === "submit") {
        const sub = await fetch(`/api/be/sip/${created.id}/transition/SUBMITTED`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        if (!sub.ok) {
          // The draft DID save. Say so, and send them to it.
          const detail = (await sub.json())?.detail ?? "Submission failed.";
          toast({
            variant: "error",
            title: "Saved as a draft, but not submitted",
            description: detail
          });
          router.push(`/business-excellence/sip/${created.id}`);
          router.refresh();
          return;
        }
        toast({ variant: "success", title: "Submitted for review" });
      } else {
        toast({ variant: "success", title: "Saved as a draft" });
      }

      router.push(`/business-excellence/sip/${created.id}`);
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
        <h2 className="mb-4 font-semibold text-slate-900">Charter</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Project title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Cut finishing-line changeover time by half"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
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
            <div>
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={form.department}
                onChange={(e) => set("department", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="areaId">Area</Label>
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
          </div>

          <div>
            <Label htmlFor="scope">Scope</Label>
            <Textarea
              id="scope"
              rows={3}
              value={form.scope}
              onChange={(e) => set("scope", e.target.value)}
              placeholder="What this project covers, and what it explicitly does not."
            />
          </div>

          <div>
            <Label htmlFor="problemStatement">Problem statement (optional)</Label>
            <Textarea
              id="problemStatement"
              rows={2}
              value={form.problemStatement}
              onChange={(e) => set("problemStatement", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 font-semibold text-slate-900">Sponsor and owner</h2>
        {/* Two different people by design — the benefit sign-off at the end
            depends on there being an independent voice. */}
        <p className="mb-4 text-xs text-slate-500">
          They must be different people. The sponsor authorises and unblocks; the owner
          runs it. Neither can validate the project&rsquo;s own benefit at the end.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Sponsor</Label>
            <UserPicker
              value={form.sponsorId}
              onChange={(id) => set("sponsorId", id)}
              placeholder="Search for a person"
            />
          </div>
          <div>
            <Label>Project owner</Label>
            <UserPicker
              value={form.ownerId}
              onChange={(id) => set("ownerId", id)}
              placeholder="Search for a person"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold text-slate-900">The metric</h2>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="metricName">What is being improved</Label>
              <Input
                id="metricName"
                value={form.metricName}
                onChange={(e) => set("metricName", e.target.value)}
                placeholder="Changeover time"
              />
            </div>
            <div>
              <Label htmlFor="metricUnit">Unit</Label>
              <Input
                id="metricUnit"
                value={form.metricUnit}
                onChange={(e) => set("metricUnit", e.target.value)}
                placeholder="minutes"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
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
              <Label htmlFor="startDate">Start</Label>
              <Input
                id="startDate"
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
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
        <h2 className="mb-1 font-semibold text-slate-900">Prioritisation</h2>
        {/* §7: feasibility and impact scoring is what ranks competing SIPs, so
            show the derived number rather than leaving it a surprise. */}
        <p className="mb-4 text-xs text-slate-500">
          Both scores out of 10. Their product is what the portfolio sorts on, so a
          generous score here quietly outranks somebody else&rsquo;s project.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="feasibilityScore">Feasibility</Label>
            <Input
              id="feasibilityScore"
              type="number"
              min={0}
              max={10}
              step="0.5"
              value={form.feasibilityScore}
              onChange={(e) => set("feasibilityScore", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="impactScore">Impact</Label>
            <Input
              id="impactScore"
              type="number"
              min={0}
              max={10}
              step="0.5"
              value={form.impactScore}
              onChange={(e) => set("impactScore", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="investmentCost">Investment</Label>
            <Input
              id="investmentCost"
              type="number"
              min={0}
              value={form.investmentCost}
              onChange={(e) => set("investmentCost", e.target.value)}
            />
          </div>
        </div>
        {priority !== null ? (
          <p className="mt-3 text-sm text-slate-600">
            Priority score:{" "}
            <span className="font-semibold tabular-nums text-slate-900">{priority}</span>
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 font-semibold text-slate-900">Milestones</h2>
        <p className="mb-4 text-xs text-slate-500">
          The planned dates are never overwritten later — slippage is recorded as a
          revised date alongside them, so the original commitment stays visible.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="msName">Milestone</Label>
            <Input
              id="msName"
              value={pm.name}
              onChange={(e) => setPm((m) => ({ ...m, name: e.target.value }))}
              placeholder="Pilot on one line"
            />
          </div>
          <div>
            <Label htmlFor="msDate">Planned</Label>
            <Input
              id="msDate"
              type="date"
              value={pm.plannedDate}
              onChange={(e) => setPm((m) => ({ ...m, plannedDate: e.target.value }))}
            />
          </div>
          <div className="min-w-[180px]">
            <Label>Owner</Label>
            <UserPicker
              value={pm.ownerId}
              onChange={(id, u) => setPm((m) => ({ ...m, ownerId: id, ownerName: u?.name ?? "" }))}
              placeholder="Optional"
            />
          </div>
          <Button type="button" variant="outline" onClick={addMilestone} disabled={!pm.name.trim()}>
            <Plus size={14} className="mr-1.5" />
            Add
          </Button>
        </div>

        {milestones.length ? (
          <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {milestones.map((m, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-slate-800">
                  {m.name}
                  <span className="ml-2 text-xs text-slate-400">
                    {m.plannedDate || "no date"}
                    {m.ownerName ? ` · ${m.ownerName}` : ""}
                  </span>
                </span>
                <Button variant="bare"
                  type="button"
                  onClick={() => setMilestones((ms) => ms.filter((_, j) => j !== i))}
                  className="text-slate-400 hover:text-rose-600"
                  aria-label={`Remove ${m.name}`}
                >
                  <X size={14} />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            None yet. You can add them after registering too — but only until the
            project is approved.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-xs uppercase tracking-wider text-slate-400">Site</div>
        <div className="mt-1 text-sm text-slate-700">{plantName ?? "—"}</div>
      </div>

      {problems.length ? (
        <ul className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {problems.map((p) => (
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
        <Button onClick={() => save("submit")} disabled={!valid || busy !== null}>
          {busy === "submit" ? (
            <Loader2 size={15} className="mr-1.5 animate-spin" />
          ) : (
            <Send size={15} className="mr-1.5" />
          )}
          Submit for review
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
        Submitting numbers the project and starts the department-head → leadership
        sign-off chain.
      </p>
    </div>
  );
}
