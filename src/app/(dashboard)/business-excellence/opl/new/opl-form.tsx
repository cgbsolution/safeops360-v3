"use client";

// Author a One Point Lesson.
//
// The audience picker is on this form rather than on publish, because who a
// lesson is FOR is part of writing it — an OPL aimed at everyone is usually a
// lesson aimed at nobody. The audience is only RESOLVED into obligations when
// the lesson is published, so editing it here costs nothing.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Loader2, Plus, Save, Send, X } from "lucide-react";
import { OPL_CATEGORY_LABEL } from "../../_meta";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectItem } from "@/components/ui/select";

type Area = { id: string; name: string };
type Role = { code: string; name: string };

const CATEGORIES = Object.keys(OPL_CATEGORY_LABEL);

export function OplForm({
  plantId,
  plantName,
  areas,
  roles
}: {
  plantId: string;
  plantName: string | null;
  areas: Area[];
  roles: Role[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<null | "draft" | "submit">(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    category: "TROUBLE_CASE",
    areaId: "",
    lineOrMachine: "",
    contentHtml: "",
    reviewDueAt: "",
    acknowledgementDueDays: 14
  });
  const [keyPoints, setKeyPoints] = useState<string[]>([""]);
  const [roleCodes, setRoleCodes] = useState<string[]>([]);
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [allPlant, setAllPlant] = useState(false);

  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const points = keyPoints.map((p) => p.trim()).filter(Boolean);

  const problems: string[] = [];
  if (form.title.trim().length < 4) problems.push("Give the lesson a title of at least 4 characters.");
  if (points.length > 5)
    problems.push("An OPL carries at most 5 key points — it is a one point lesson.");
  if (!form.contentHtml.trim() && points.length === 0)
    problems.push("Add the lesson content or at least one key point before submitting.");
  const noAudience = !allPlant && !roleCodes.length && !areaIds.length;
  const valid = problems.length === 0;

  async function save(then: "draft" | "submit") {
    setBusy(then);
    setError(null);
    try {
      const payload: Record<string, any> = {
        plantId,
        title: form.title.trim(),
        category: form.category,
        keyPoints: points,
        acknowledgementDueDays: Number(form.acknowledgementDueDays) || 14,
        audience: { roleCodes, areaIds, userIds: [], allPlant }
      };
      if (form.areaId) payload.areaId = form.areaId;
      if (form.lineOrMachine.trim()) payload.lineOrMachine = form.lineOrMachine.trim();
      if (form.contentHtml.trim()) payload.contentHtml = form.contentHtml.trim();
      if (form.reviewDueAt) payload.reviewDueAt = new Date(form.reviewDueAt).toISOString();

      const res = await fetch("/api/be/opl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "Could not save the lesson.");
      const created = await res.json();

      if (then === "submit") {
        const sub = await fetch(`/api/be/opl/${created.id}/submit`, { method: "POST" });
        if (!sub.ok) {
          // The draft saved. Never lose the typing because the second call failed.
          toast({
            variant: "error",
            title: "Saved as a draft, but not submitted",
            description: (await sub.json())?.detail ?? "Submission failed."
          });
          router.push(`/business-excellence/opl/${created.id}`);
          router.refresh();
          return;
        }
        toast({ variant: "success", title: "Lesson sent for technical review" });
      } else {
        toast({ variant: "success", title: "Draft saved" });
      }
      router.push(`/business-excellence/opl/${created.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">The lesson</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          One page. If it needs two, it is two lessons.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <Label className="mb-1 block text-xs font-medium text-slate-600">
              Title<span className="ml-0.5 text-rose-500">*</span>
            </Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Checking needle guard alignment before start-up"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label className="mb-1 block text-xs font-medium text-slate-600">Type</Label>
              <Select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {OPL_CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </Select>
            </div>
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
          </div>

          <div>
            <Label className="mb-1 block text-xs font-medium text-slate-600">
              Key points <span className="text-slate-400">(max 5)</span>
            </Label>
            <div className="space-y-2">
              {keyPoints.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={p}
                    onChange={(e) => {
                      const next = [...keyPoints];
                      next[i] = e.target.value;
                      setKeyPoints(next);
                    }}
                    placeholder={
                      i === 0 ? "Guard must sit flush against the throat plate" : "Next point"
                    }
                  />
                  {keyPoints.length > 1 && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setKeyPoints(keyPoints.filter((_, j) => j !== i))}
                      aria-label={`Remove key point ${i + 1}`}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {keyPoints.length < 5 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setKeyPoints([...keyPoints, ""])}
              >
                <Plus size={14} /> Add a point
              </Button>
            )}
          </div>

          <div>
            <Label className="mb-1 block text-xs font-medium text-slate-600">Content</Label>
            <Textarea
              rows={6}
              value={form.contentHtml}
              onChange={(e) => set("contentHtml", e.target.value)}
              placeholder="What to do, in the order it is done. Write it the way you would explain it standing at the machine."
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Photographs and diagrams are attached to the lesson after it is created —
              they are stored as files, not pasted into the text.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Who has to read it</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Resolved into named obligations when the lesson is published, not now — so
          this can still be changed during review.
        </p>

        <div className="mt-4 space-y-4">
          <Label className="flex items-start gap-2 text-sm font-normal leading-normal text-inherit">
            <Checkbox
              checked={allPlant}
              onChange={(e) => setAllPlant(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-slate-800">Everyone at this site</span>
              <span className="block text-xs text-slate-500">
                Use sparingly. A lesson everyone must read is a site-wide notification,
                and people stop reading those.
              </span>
            </span>
          </Label>

          {!allPlant && (
            <>
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-slate-600">By role</Label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((r) => (
                    <Button variant="bare"
                      key={r.code}
                      type="button"
                      onClick={() => toggle(roleCodes, setRoleCodes, r.code)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        roleCodes.includes(r.code)
                          ? "border-primary-400 bg-primary-50 text-primary-800"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {r.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-1.5 block text-xs font-medium text-slate-600">By area</Label>
                <div className="flex flex-wrap gap-2">
                  {areas.map((a) => (
                    <Button variant="bare"
                      key={a.id}
                      type="button"
                      onClick={() => toggle(areaIds, setAreaIds, a.id)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        areaIds.includes(a.id)
                          ? "border-primary-400 bg-primary-50 text-primary-800"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {a.name}
                    </Button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  An area resolves to that area&apos;s owner. This schema has no
                  worker-to-area roster, so an area audience is a narrow list, not
                  everyone who works there — the acknowledgement matrix shows exactly
                  who was assigned.
                </p>
              </div>
            </>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs font-medium text-slate-600">
                Days to acknowledge
              </Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={form.acknowledgementDueDays}
                onChange={(e) => set("acknowledgementDueDays", e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs font-medium text-slate-600">
                Review this lesson by
              </Label>
              <Input
                type="date"
                value={form.reviewDueAt}
                onChange={(e) => set("reviewDueAt", e.target.value)}
              />
            </div>
          </div>

          {noAudience && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              No audience is selected. The lesson can still be written and approved —
              publishing it would simply assign it to nobody, so pick an audience before
              it goes live.
            </p>
          )}
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
          Send for review
        </Button>
        <Button variant="outline" onClick={() => save("draft")} disabled={!valid || busy !== null}>
          {busy === "draft" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save as draft
        </Button>
        <span className="text-xs text-slate-500">
          Filing at {plantName ?? "the selected site"}.
        </span>
      </div>
    </div>
  );
}
