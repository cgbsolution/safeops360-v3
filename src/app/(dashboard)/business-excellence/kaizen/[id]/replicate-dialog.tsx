"use client";

// "Run this idea at another plant too."
//
// Horizontal deployment — yokoten — is the step that turns one plant's fix into
// the company's. It creates a DRAFT at the target plant and records the spread
// against the source, so "this idea ran at four plants" is a fact with rows
// behind it rather than a claim in a slide.
//
// The plant list comes from the same accessible-plants endpoint the rest of the
// app uses, so it can only ever offer plants this user actually works with. The
// server re-checks KAIZEN.CREATE at the chosen plant regardless — this list is a
// convenience, not the gate.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Loader2, Share2 } from "lucide-react";
import { readApiError } from "@/lib/client-errors";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectItem } from "@/components/ui/select";

type PlantOption = { id: string; name: string };

export function ReplicateDialog({
  kaizenId,
  sourcePlantId,
  onClose,
}: {
  kaizenId: string;
  sourcePlantId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [loadingPlants, setLoadingPlants] = useState(true);
  const [plantId, setPlantId] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [copyOwner, setCopyOwner] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/hira/wizard/study-options");
        if (!res.ok) return;
        const json = await res.json();
        // The source plant is filtered out here as well as refused by the
        // server. Offering it and then rejecting the submit would be a worse
        // way to say the same thing.
        setPlants((json.plants ?? []).filter((p: PlantOption) => p.id !== sourcePlantId));
      } catch {
        /* the select stays empty and the submit stays disabled */
      } finally {
        setLoadingPlants(false);
      }
    })();
  }, [sourcePlantId]);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/be/kaizen/${kaizenId}/replicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantId,
          notes: notes.trim() || undefined,
          title: title.trim() || undefined,
          copyOwner,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not replicate the idea"));
      const created = await res.json();
      toast({
        variant: "success",
        title: "Raised at the other plant",
        description: "It starts as a draft there and has to be submitted and screened locally.",
      });
      router.push(`/business-excellence/kaizen/${created.id}`);
      router.refresh();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not replicate it", description: e?.message });
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-violet-900">
        <Share2 size={14} /> Replicate at another plant
      </h3>
      <p className="mt-0.5 text-xs text-violet-800">
        Creates a draft there with the problem and countermeasure copied across.
        The investment and saving figures are deliberately not copied — those
        belong to this line, and carrying them over is how one saving gets
        reported several times.
      </p>

      <div className="mt-3 space-y-3">
        <div>
          <Label className="mb-1 block text-xs font-medium text-violet-900">Plant</Label>
          <Select
            value={plantId}
            onChange={(e) => setPlantId(e.target.value)}
            disabled={loadingPlants || busy}
            className="h-9 w-full rounded-md border border-violet-300 bg-white px-3 text-sm text-slate-900 focus:border-primary-400 focus:outline-none"
          >
            <SelectItem value="">
              {loadingPlants ? "Loading plants…" : "Choose the plant"}
            </SelectItem>
            {plants.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </Select>
          {!loadingPlants && plants.length === 0 && (
            <p className="mt-1 text-[11px] text-violet-800">
              There is no other plant you can raise records at.
            </p>
          )}
        </div>

        <div>
          <Label className="mb-1 block text-xs font-medium text-violet-900">
            Title at the new plant
          </Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Leave blank to keep the same title"
            disabled={busy}
          />
        </div>

        <div>
          <Label className="mb-1 block text-xs font-medium text-violet-900">
            Note — why it suits that plant
          </Label>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Same folding bench layout on their line 2."
            disabled={busy}
          />
        </div>

        <Label className="flex items-start gap-2 text-xs text-violet-900 font-normal leading-normal">
          <Checkbox
            checked={copyOwner}
            onChange={(e) => setCopyOwner(e.target.checked)}
            disabled={busy}
            className="mt-0.5"
          />
          <span>
            Assign the same owner.{" "}
            <span className="text-violet-800/80">
              Usually leave this off — the person who ran it here rarely works at
              the other plant, and the approval gate will ask for an owner there.
            </span>
          </span>
        </Label>
      </div>

      <div className="mt-3 flex gap-2">
        <Button disabled={!plantId || busy} onClick={submit}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
          Raise it there
        </Button>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
