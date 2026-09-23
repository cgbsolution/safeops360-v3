"use client";

// Make a suggestion (§3).
//
// Saves as a DRAFT first and submits as a second, explicit step — same reason
// as the Kaizen form: submitting assigns the record number and starts a
// workflow on somebody else's inbox, and doing both on one button would burn a
// number every time somebody changed their mind halfway down.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Loader2, Send, Save, EyeOff, Info } from "lucide-react";
import { KAIZEN_CATEGORY_LABEL } from "../../_meta";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectItem } from "@/components/ui/select";

type Area = { id: string; name: string };

const CATEGORIES = Object.keys(KAIZEN_CATEGORY_LABEL);

export function SuggestionForm({
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
    areaId: "",
    description: "",
    expectedBenefit: "",
    isAnonymous: false
  });

  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  // Mirrors the server's Pydantic rules so the user is told before the round
  // trip. The server still re-validates — this is a courtesy, never the gate.
  const problems: string[] = [];
  if (form.title.trim().length < 4)
    problems.push("Give the suggestion a title of at least 4 characters.");
  if (form.description.trim().length < 10)
    problems.push("Describe the suggestion in at least 10 characters.");
  const valid = problems.length === 0;

  async function save(then: "draft" | "submit") {
    setBusy(then);
    setError(null);
    try {
      const payload: Record<string, any> = {
        plantId,
        title: form.title.trim(),
        category: form.category,
        description: form.description.trim(),
        isAnonymous: form.isAnonymous
      };
      // Only send what was filled in. Posting "" for an optional field would
      // fail validation on something the user deliberately left blank.
      if (form.areaId) payload.areaId = form.areaId;
      if (form.expectedBenefit.trim()) payload.expectedBenefit = form.expectedBenefit.trim();

      const res = await fetch("/api/be/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok)
        throw new Error((await res.json())?.detail ?? "Could not save the suggestion.");
      const created = await res.json();

      if (then === "submit") {
        const sub = await fetch(`/api/be/suggestions/${created.id}/submit`, {
          method: "POST"
        });
        if (!sub.ok) {
          // The draft DID save. Say so and send them to it — losing the typing
          // because the second call failed would be the worst outcome here.
          const detail = (await sub.json())?.detail ?? "Submission failed.";
          toast({
            variant: "error",
            title: "Saved as a draft, but not submitted",
            description: detail
          });
          router.push(`/business-excellence/suggestions/${created.id}`);
          router.refresh();
          return;
        }
        toast({ variant: "success", title: "Suggestion submitted" });
      } else {
        toast({ variant: "success", title: "Saved as a draft" });
      }

      router.push(`/business-excellence/suggestions/${created.id}`);
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
        <h2 className="mb-4 font-semibold text-slate-900">What are you suggesting?</h2>

        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Move the bin trolley to the end of the line"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          <div>
            <Label htmlFor="description">The suggestion</Label>
            <Textarea
              id="description"
              rows={5}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What would you change, and why would it be better? It does not have to be about a machine — anything that would make the place work better belongs here."
            />
          </div>

          <div>
            <Label htmlFor="expectedBenefit">What you think it would achieve (optional)</Label>
            <Textarea
              id="expectedBenefit"
              rows={2}
              value={form.expectedBenefit}
              onChange={(e) => set("expectedBenefit", e.target.value)}
              placeholder="Rough is fine. Nobody is holding you to a number."
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <Label className="flex cursor-pointer items-start gap-3 font-normal leading-normal text-inherit text-[length:inherit]">
          <Checkbox
            className="mt-1 h-4 w-4 rounded border-slate-300"
            checked={form.isAnonymous}
            onChange={(e) => set("isAnonymous", e.target.checked)}
          />
          <span>
            <span className="flex items-center gap-1.5 font-medium text-slate-900">
              <EyeOff size={14} /> Submit this anonymously
            </span>
            <span className="mt-1 block text-sm text-slate-600">
              Your name will not be shown to the screening coordinator, the committee,
              or anyone else reading the register.
            </span>
          </span>
        </Label>

        {/* Say plainly what anonymity does and does not mean. A scheme that
            promises more than it delivers is worse than one that is honest
            about being confidential-but-attributable. */}
        {form.isAnonymous ? (
          <div className="mt-3 flex gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
            <span>
              To be straight with you: the system still records who submitted this,
              because the decision has to come back to you and because every record
              here is auditable. It is hidden from readers, not erased. If that is not
              enough for what you want to raise, use the anonymous reporting channel
              instead.
            </span>
          </div>
        ) : null}
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
          Submit
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
        A draft is yours alone and is not numbered. Submitting gives it a number and
        puts it in front of the screening coordinator.
      </p>
    </div>
  );
}
