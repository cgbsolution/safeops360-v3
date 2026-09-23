"use client";

// Propose a Poka Yoke device.
//
// The approach question is asked plainly, with what each answer MEANS spelled
// out, because it is the one field on this form people get wrong. A detection
// device recorded as prevention makes a line look mistake-proofed when it is
// only inspected, and that is exactly the claim the register exists to test.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserPicker } from "@/components/ui/user-picker";
import { useToast } from "@/components/ui/toast";
import { Loader2, Save, Send } from "lucide-react";
import {
  APPROACH_HINT,
  APPROACH_LABEL,
  DEVICE_TYPE_LABEL,
  FREQUENCY_LABEL,
  REACTION_LABEL
} from "../../_meta";
import { Select, SelectItem } from "@/components/ui/select";

type Area = { id: string; name: string };

export function DeviceForm({
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
    defectModePrevented: "",
    description: "",
    deviceType: "CONTACT",
    approach: "PREVENTION",
    reactionMode: "CONTROL",
    areaId: "",
    lineOrMachine: "",
    processStep: "",
    beforeCondition: "",
    afterCondition: "",
    ownerId: null as string | null,
    cost: "",
    installedAt: "",
    verificationFrequency: "MONTHLY"
  });
  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const problems: string[] = [];
  if (form.title.trim().length < 4) problems.push("Give the device a title of at least 4 characters.");
  if (form.defectModePrevented.trim().length < 5)
    problems.push("Name the defect this device prevents, in at least 5 characters.");
  const valid = problems.length === 0;

  async function save(then: "draft" | "submit") {
    setBusy(then);
    setError(null);
    try {
      const payload: Record<string, any> = {
        plantId,
        title: form.title.trim(),
        defectModePrevented: form.defectModePrevented.trim(),
        deviceType: form.deviceType,
        approach: form.approach,
        reactionMode: form.reactionMode,
        verificationFrequency: form.verificationFrequency
      };
      if (form.areaId) payload.areaId = form.areaId;
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.lineOrMachine.trim()) payload.lineOrMachine = form.lineOrMachine.trim();
      if (form.processStep.trim()) payload.processStep = form.processStep.trim();
      if (form.beforeCondition.trim()) payload.beforeCondition = form.beforeCondition.trim();
      if (form.afterCondition.trim()) payload.afterCondition = form.afterCondition.trim();
      if (form.ownerId) payload.ownerId = form.ownerId;
      if (form.cost) payload.cost = Number(form.cost);
      if (form.installedAt) payload.installedAt = new Date(form.installedAt).toISOString();

      const res = await fetch("/api/be/poka-yoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "Could not save the device.");
      const created = await res.json();

      if (then === "submit") {
        const sub = await fetch(`/api/be/poka-yoke/${created.id}/submit`, { method: "POST" });
        if (!sub.ok) {
          toast({
            variant: "error",
            title: "Saved, but not submitted",
            description: (await sub.json())?.detail ?? "Submission failed."
          });
          router.push(`/business-excellence/poka-yoke/${created.id}`);
          router.refresh();
          return;
        }
        toast({ variant: "success", title: "Device submitted for engineering review" });
      } else {
        toast({ variant: "success", title: "Saved" });
      }
      router.push(`/business-excellence/poka-yoke/${created.id}`);
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

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">The device</h2>
        <div className="mt-4 space-y-4">
          <div>
            <Label className="mb-1 block text-xs font-medium text-slate-600">
              Title<span className="ml-0.5 text-rose-500">*</span>
            </Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Proximity sensor on the collar-attach jig"
            />
          </div>

          <div>
            <Label className="mb-1 block text-xs font-medium text-slate-600">
              Defect it prevents<span className="ml-0.5 text-rose-500">*</span>
            </Label>
            <Textarea
              rows={2}
              value={form.defectModePrevented}
              onChange={(e) => set("defectModePrevented", e.target.value)}
              placeholder="Collar sewn without the interlining, which is only found at final inspection."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label className="mb-1 block text-xs font-medium text-slate-600">Area</Label>
              <Select
                value={form.areaId}
                onChange={(e) => set("areaId", e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
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
              <Label className="mb-1 block text-xs font-medium text-slate-600">
                Line or machine
              </Label>
              <Input
                value={form.lineOrMachine}
                onChange={(e) => set("lineOrMachine", e.target.value)}
                placeholder="Sewing line 4"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs font-medium text-slate-600">
                Process step
              </Label>
              <Input
                value={form.processStep}
                onChange={(e) => set("processStep", e.target.value)}
                placeholder="Collar attach"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">How it works</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          These three answers are what make the register worth keeping. Be honest about
          the first one.
        </p>

        <div className="mt-4 space-y-5">
          <div>
            <Label className="mb-2 block text-xs font-medium text-slate-600">Approach</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {["PREVENTION", "DETECTION"].map((a) => (
                <Button variant="bare"
                  key={a}
                  type="button"
                  onClick={() => set("approach", a)}
                  className={`rounded-lg border p-3 text-left transition ${
                    form.approach === a
                      ? "border-primary-400 bg-primary-50 ring-1 ring-primary-200"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="text-sm font-medium text-slate-900">{APPROACH_LABEL[a]}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{APPROACH_HINT[a]}</div>
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs font-medium text-slate-600">
                Device type
              </Label>
              <Select
                value={form.deviceType}
                onChange={(e) => set("deviceType", e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {Object.entries(DEVICE_TYPE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs font-medium text-slate-600">
                What happens when it trips
              </Label>
              <Select
                value={form.reactionMode}
                onChange={(e) => set("reactionMode", e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {Object.entries(REACTION_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs font-medium text-slate-600">Before</Label>
              <Textarea
                rows={2}
                value={form.beforeCondition}
                onChange={(e) => set("beforeCondition", e.target.value)}
                placeholder="How the defect could occur before the device."
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs font-medium text-slate-600">After</Label>
              <Textarea
                rows={2}
                value={form.afterCondition}
                onChange={(e) => set("afterCondition", e.target.value)}
                placeholder="What the device now makes impossible, or catches."
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Ownership and upkeep</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Accepting this device commits the plant to checking it on the cadence you pick.
          Choose one the line can actually sustain.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-1 block text-xs font-medium text-slate-600">Owner</Label>
            <UserPicker
              value={form.ownerId}
              onChange={(id) => set("ownerId", id)}
              placeholder="Search for a person"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs font-medium text-slate-600">
              Verification frequency
            </Label>
            <Select
              value={form.verificationFrequency}
              onChange={(e) => set("verificationFrequency", e.target.value)}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              {Object.entries(FREQUENCY_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs font-medium text-slate-600">
              Cost (if known)
            </Label>
            <Input
              type="number"
              min={0}
              value={form.cost}
              onChange={(e) => set("cost", e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs font-medium text-slate-600">
              Already installed on
            </Label>
            <Input
              type="date"
              value={form.installedAt}
              onChange={(e) => set("installedAt", e.target.value)}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              For a device already fitted and being recorded retrospectively.
            </p>
          </div>
        </div>
      </section>

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
          Submit for review
        </Button>
        <Button variant="outline" onClick={() => save("draft")} disabled={!valid || busy !== null}>
          {busy === "draft" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save without submitting
        </Button>
        <span className="text-xs text-slate-500">
          Filing at {plantName ?? "the selected site"}.
        </span>
      </div>
    </div>
  );
}
