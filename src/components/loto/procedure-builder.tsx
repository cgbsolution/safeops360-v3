"use client";

// LOTO procedure builder.
//
// The isolation points and verification steps are REORDERABLE LISTS, not flat
// forms, because their order is the safety content: isolating a downstream valve
// before the upstream breaker is how people get hurt. Move-up / move-down
// buttons rather than drag-and-drop — this gets used on a tablet with gloves on,
// and a drag that half-lands is worse than a button that doesn't.
//
// The server re-sequences densely from 1 on every save, so the numbers the user
// sees here are what they will get back.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Camera,
  Loader2,
  PenLine,
  Plus,
  Trash2,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/client-errors";
import { cn } from "@/lib/utils";
import {
  ENERGY_TYPE_LABEL,
  HARDWARE_ITEM_LABEL,
  ISOLATION_METHOD_LABEL,
  type Procedure
} from "@/app/(dashboard)/loto/_meta";
import { Select, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useLabels } from "@/components/labels/label-provider";

type DraftEnergySource = {
  id?: string;
  key: string;
  energyType: string;
  magnitude: string;
  locationDescription: string;
};

type DraftIsolationPoint = {
  id?: string;
  key: string;
  energySourceId: string | null;
  /** Index into the energy-source list, for a source created in this same save. */
  energySourceRef: number | null;
  location: string;
  isolationMethod: string;
  lockType: string;
  verificationMethod: string;
  notes: string;
};

type DraftHardware = {
  id?: string;
  key: string;
  itemType: string;
  description: string;
  quantityRequired: number;
};

type DraftStep = {
  id?: string;
  key: string;
  stepText: string;
  requiresPhoto: boolean;
  requiresSignoff: boolean;
};

// Local fallbacks. The live lists come from GET /api/loto/meta (see useEffect
// below), which is served from the same tuples the Pydantic layer validates
// against — so a dropdown can never offer a value the API would 422. These
// constants only cover the window before that request lands, and the case where
// it fails: an author should not be blocked from writing a procedure because a
// vocabulary lookup timed out.
const FALLBACK_ENERGY_TYPES = Object.keys(ENERGY_TYPE_LABEL);
const FALLBACK_ISOLATION_METHODS = Object.keys(ISOLATION_METHOD_LABEL);
const FALLBACK_HARDWARE_TYPES = Object.keys(HARDWARE_ITEM_LABEL);

type LotoMeta = {
  energyTypes: string[];
  isolationMethods: string[];
  hardwareItemTypes: string[];
};

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

/** Generic move-within-array. Returns a NEW array; out-of-range moves no-op. */
function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function ProcedureBuilder({
  plantId,
  procedure,
  plantName
}: {
  plantId: string | null;
  /** Absent = create mode. */
  procedure?: Procedure;
  plantName?: string | null;
}) {
  const L = useLabels();
  const router = useRouter();
  const isEdit = !!procedure;

  const [title, setTitle] = useState(procedure?.title ?? "");
  const [description, setDescription] = useState(procedure?.description ?? "");
  const [equipmentName, setEquipmentName] = useState(procedure?.equipmentName ?? "");
  const [equipmentTag, setEquipmentTag] = useState(procedure?.equipmentTag ?? "");
  const [area, setArea] = useState(procedure?.area ?? "");
  const [reviewMonths, setReviewMonths] = useState(procedure?.reviewFrequencyMonths ?? 12);
  const [changeSummary, setChangeSummary] = useState("");

  const [sources, setSources] = useState<DraftEnergySource[]>(
    () =>
      procedure?.energySources.map((e) => ({
        id: e.id,
        key: nextKey(),
        energyType: e.energyType,
        magnitude: e.magnitude ?? "",
        locationDescription: e.locationDescription ?? ""
      })) ?? []
  );
  const [points, setPoints] = useState<DraftIsolationPoint[]>(
    () =>
      procedure?.isolationPoints.map((p) => ({
        id: p.id,
        key: nextKey(),
        energySourceId: p.energySourceId,
        energySourceRef: null,
        location: p.location,
        isolationMethod: p.isolationMethod,
        lockType: p.lockType ?? "",
        verificationMethod: p.verificationMethod ?? "",
        notes: p.notes ?? ""
      })) ?? []
  );
  const [hardware, setHardware] = useState<DraftHardware[]>(
    () =>
      procedure?.hardware.map((h) => ({
        id: h.id,
        key: nextKey(),
        itemType: h.itemType,
        description: h.description ?? "",
        quantityRequired: h.quantityRequired
      })) ?? []
  );
  const [steps, setSteps] = useState<DraftStep[]>(
    () =>
      procedure?.verificationSteps.map((s) => ({
        id: s.id,
        key: nextKey(),
        stepText: s.stepText,
        requiresPhoto: s.requiresPhoto,
        requiresSignoff: s.requiresSignoff
      })) ?? []
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vocabularies from the server, so the options here are exactly the ones the
  // API accepts. Falls back to the local constants on failure rather than
  // rendering empty dropdowns.
  const [meta, setMeta] = useState<LotoMeta | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/loto/meta");
        if (!res.ok) return;
        const j = (await res.json()) as LotoMeta;
        if (!cancelled) setMeta(j);
      } catch {
        // Keep the fallbacks. Authoring must not depend on this request.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const energyTypes = meta?.energyTypes?.length ? meta.energyTypes : FALLBACK_ENERGY_TYPES;
  const isolationMethods = meta?.isolationMethods?.length
    ? meta.isolationMethods
    : FALLBACK_ISOLATION_METHODS;
  const hardwareTypes = meta?.hardwareItemTypes?.length
    ? meta.hardwareItemTypes
    : FALLBACK_HARDWARE_TYPES;

  // The same precondition the API enforces (spec §2.1), mirrored so the button
  // can explain itself. The server re-checks regardless — this is a courtesy,
  // not the control.
  const publishBlockers = useMemo(() => {
    const b: string[] = [];
    if (points.length === 0)
      b.push("At least one isolation point — a procedure with none isolates nothing.");
    if (steps.length === 0)
      b.push("At least one verification step — without one there is no proof of zero energy.");
    if (!title.trim()) b.push("A title.");
    return b;
  }, [points.length, steps.length, title]);

  // A material change to a LIVE procedure withdraws its approval. Warn before
  // the save, not after — the author should know the field will keep seeing the
  // old version until someone re-publishes.
  const willWithdrawApproval = isEdit && procedure?.status === "active";

  const buildBody = useCallback(() => {
    const sourceIndexByKey = new Map(sources.map((s, i) => [s.key, i]));
    return {
      title: title.trim(),
      description: description.trim() || null,
      equipmentName: equipmentName.trim() || null,
      equipmentTag: equipmentTag.trim() || null,
      area: area.trim() || null,
      reviewFrequencyMonths: reviewMonths,
      energySources: sources.map((s) => ({
        id: s.id,
        energyType: s.energyType,
        magnitude: s.magnitude.trim() || null,
        locationDescription: s.locationDescription.trim() || null
      })),
      isolationPoints: points.map((p) => ({
        id: p.id,
        // An existing source id wins; otherwise hand the server the index of a
        // source being created in this very request and let it resolve.
        energySourceId: p.energySourceId,
        energySourceRef: p.energySourceId == null ? p.energySourceRef : null,
        location: p.location.trim(),
        isolationMethod: p.isolationMethod,
        lockType: p.lockType.trim() || null,
        verificationMethod: p.verificationMethod.trim() || null,
        notes: p.notes.trim() || null
      })),
      hardware: hardware.map((h) => ({
        id: h.id,
        itemType: h.itemType,
        description: h.description.trim() || null,
        quantityRequired: h.quantityRequired
      })),
      verificationSteps: steps.map((s) => ({
        id: s.id,
        stepText: s.stepText.trim(),
        requiresPhoto: s.requiresPhoto,
        requiresSignoff: s.requiresSignoff
      }))
    };
  }, [
    title, description, equipmentName, equipmentTag, area,
    reviewMonths, sources, points, hardware, steps
  ]);

  async function save() {
    setError(null);

    // Cheap client-side guards for the two things the API 422s on, so a fitter
    // does not lose a long form to a server round-trip.
    if (!title.trim()) return setError("Give the procedure a title.");
    if (!equipmentName.trim() && !procedure?.equipmentId)
      return setError("Name the equipment this procedure isolates.");
    const blankPoint = points.findIndex((p) => !p.location.trim());
    if (blankPoint >= 0)
      return setError(`Isolation point ${blankPoint + 1} needs a location.`);
    const blankStep = steps.findIndex((s) => !s.stepText.trim());
    if (blankStep >= 0)
      return setError(`Verification step ${blankStep + 1} needs text.`);

    setSaving(true);
    try {
      const body = buildBody();
      const res = await fetch(
        isEdit ? `/api/loto/procedures/${procedure!.id}` : "/api/loto/procedures",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isEdit
              ? { ...body, changeSummary: changeSummary.trim() || null }
              : { ...body, siteId: plantId }
          )
        }
      );
      if (!res.ok) throw new Error(await readApiError(res, "Could not save the procedure"));
      const saved = await res.json();
      router.push(`/loto/${saved.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Could not save the procedure.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {willWithdrawApproval && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-amber-900">
            <div className="font-semibold">This procedure is live.</div>
            Changing the isolation points, hardware or verification steps creates a new
            version and withdraws the approval — it will go back to{" "}
            <em>under review</em> until someone re-publishes it. Until then, anyone
            scanning the QR label keeps seeing the current approved version
            {procedure?.publishedVersion ? ` (v${procedure.publishedVersion})` : ""}.
          </div>
        </div>
      )}

      {/* ─── Header ─── */}
      <Section title="Procedure" subtitle="What this procedure covers.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required className="sm:col-span-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Raw Mill 1 — full electrical & mechanical isolation"
            />
          </Field>
          <Field label="Equipment name" required>
            <Input
              value={equipmentName}
              onChange={(e) => setEquipmentName(e.target.value)}
              placeholder="e.g. Raw Mill 1 Main Drive"
            />
          </Field>
          <Field label="Equipment tag">
            <Input
              value={equipmentTag}
              onChange={(e) => setEquipmentTag(e.target.value)}
              placeholder="e.g. RM1-MD-001"
            />
          </Field>
          <Field label="Area">
            <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Raw Mill" />
          </Field>
          <Field
            label="Review every (months)"
            hint="OSHA 1910.147 expects an annual periodic inspection; 12 is the default."
          >
            <Input
              type="number"
              min={1}
              max={60}
              value={reviewMonths}
              onChange={(e) => setReviewMonths(Number(e.target.value) || 12)}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope, limits, anything a fitter should know before starting."
            />
          </Field>
        </div>
        {plantName && (
          <p className="mt-3 text-xs text-slate-500">{`${L("term.site", "Site")}: `}{plantName}</p>
        )}
      </Section>

      {/* ─── Energy sources ─── */}
      <Section
        title="Energy sources"
        subtitle="Every form of energy that has to be isolated or dissipated."
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setSources((s) => [
                ...s,
                { key: nextKey(), energyType: "electrical", magnitude: "", locationDescription: "" }
              ])
            }
          >
            <Plus size={14} /> Add source
          </Button>
        }
      >
        {sources.length === 0 ? (
          <Empty text="No energy sources listed yet." />
        ) : (
          <div className="space-y-2">
            {sources.map((s, i) => (
              <div key={s.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-3 sm:grid-cols-[160px_1fr_1fr_auto]">
                  <Select
                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                    value={s.energyType}
                    onChange={(e) =>
                      setSources((list) =>
                        list.map((x, j) => (j === i ? { ...x, energyType: e.target.value } : x))
                      )
                    }
                  >
                    {energyTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ENERGY_TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </Select>
                  <Input
                    value={s.magnitude}
                    placeholder="Magnitude — e.g. 415 V AC 3-ph, 7 bar, 180 °C"
                    onChange={(e) =>
                      setSources((list) =>
                        list.map((x, j) => (j === i ? { ...x, magnitude: e.target.value } : x))
                      )
                    }
                  />
                  <Input
                    value={s.locationDescription}
                    placeholder="Where it comes from"
                    onChange={(e) =>
                      setSources((list) =>
                        list.map((x, j) =>
                          j === i ? { ...x, locationDescription: e.target.value } : x
                        )
                      )
                    }
                  />
                  <IconButton
                    label="Remove energy source"
                    onClick={() => {
                      // Any isolation point pointing at this source loses its
                      // link rather than silently pointing at the wrong one.
                      const removed = sources[i];
                      setPoints((list) =>
                        list.map((p) =>
                          (removed.id && p.energySourceId === removed.id) ||
                          p.energySourceRef === i
                            ? { ...p, energySourceId: null, energySourceRef: null }
                            : p
                        )
                      );
                      setSources((list) => list.filter((_, j) => j !== i));
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ─── Isolation points (ORDERED) ─── */}
      <Section
        title="Isolation points"
        subtitle="In the order they must be actioned. Order is safety content, not presentation."
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setPoints((p) => [
                ...p,
                {
                  key: nextKey(),
                  energySourceId: null,
                  energySourceRef: null,
                  location: "",
                  isolationMethod: "breaker",
                  lockType: "",
                  verificationMethod: "",
                  notes: ""
                }
              ])
            }
          >
            <Plus size={14} /> Add point
          </Button>
        }
      >
        {points.length === 0 ? (
          <Empty text="No isolation points yet — a procedure cannot be published without at least one." />
        ) : (
          <div className="space-y-2">
            {points.map((p, i) => (
              <div key={p.key} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                      {i + 1}
                    </span>
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Isolation point
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      label="Move up"
                      disabled={i === 0}
                      onClick={() => setPoints((l) => move(l, i, i - 1))}
                    >
                      <ArrowUp size={14} />
                    </IconButton>
                    <IconButton
                      label="Move down"
                      disabled={i === points.length - 1}
                      onClick={() => setPoints((l) => move(l, i, i + 1))}
                    >
                      <ArrowDown size={14} />
                    </IconButton>
                    <IconButton
                      label="Remove isolation point"
                      onClick={() => setPoints((l) => l.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Location" required>
                    <Input
                      value={p.location}
                      placeholder="e.g. MCC-4 Panel, Breaker 12"
                      onChange={(e) =>
                        setPoints((l) =>
                          l.map((x, j) => (j === i ? { ...x, location: e.target.value } : x))
                        )
                      }
                    />
                  </Field>
                  <Field label="Isolation method">
                    <Select
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                      value={p.isolationMethod}
                      onChange={(e) =>
                        setPoints((l) =>
                          l.map((x, j) =>
                            j === i ? { ...x, isolationMethod: e.target.value } : x
                          )
                        )
                      }
                    >
                      {isolationMethods.map((m) => (
                        <SelectItem key={m} value={m}>
                          {ISOLATION_METHOD_LABEL[m]}
                        </SelectItem>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Energy source">
                    <Select
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                      value={
                        p.energySourceId ??
                        (p.energySourceRef != null ? `ref:${p.energySourceRef}` : "")
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setPoints((l) =>
                          l.map((x, j) =>
                            j === i
                              ? v.startsWith("ref:")
                                ? { ...x, energySourceId: null, energySourceRef: Number(v.slice(4)) }
                                : { ...x, energySourceId: v || null, energySourceRef: null }
                              : x
                          )
                        );
                      }}
                    >
                      <SelectItem value="">— not linked —</SelectItem>
                      {sources.map((s, si) => (
                        <SelectItem key={s.key} value={s.id ?? `ref:${si}`}>
                          {ENERGY_TYPE_LABEL[s.energyType]}
                          {s.magnitude ? ` — ${s.magnitude}` : ""}
                        </SelectItem>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Lock type">
                    <Input
                      value={p.lockType}
                      placeholder="e.g. Red padlock + hasp"
                      onChange={(e) =>
                        setPoints((l) =>
                          l.map((x, j) => (j === i ? { ...x, lockType: e.target.value } : x))
                        )
                      }
                    />
                  </Field>
                  <Field
                    label="Zero-energy check at this point"
                    className="sm:col-span-2"
                    hint="How energy is proven absent HERE — e.g. try-start from the local panel, gauge reads 0 bar for 60 s."
                  >
                    <Textarea
                      rows={2}
                      value={p.verificationMethod}
                      onChange={(e) =>
                        setPoints((l) =>
                          l.map((x, j) =>
                            j === i ? { ...x, verificationMethod: e.target.value } : x
                          )
                        )
                      }
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ─── Hardware ─── */}
      <Section
        title="Required hardware"
        subtitle="What the crew needs to draw from stores before starting."
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setHardware((h) => [
                ...h,
                { key: nextKey(), itemType: "lock", description: "", quantityRequired: 1 }
              ])
            }
          >
            <Plus size={14} /> Add item
          </Button>
        }
      >
        {hardware.length === 0 ? (
          <Empty text="No hardware listed." />
        ) : (
          <div className="space-y-2">
            {hardware.map((h, i) => (
              <div
                key={h.key}
                className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[160px_1fr_100px_auto]"
              >
                <Select
                  className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                  value={h.itemType}
                  onChange={(e) =>
                    setHardware((l) =>
                      l.map((x, j) => (j === i ? { ...x, itemType: e.target.value } : x))
                    )
                  }
                >
                  {hardwareTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {HARDWARE_ITEM_LABEL[t]}
                    </SelectItem>
                  ))}
                </Select>
                <Input
                  value={h.description}
                  placeholder="Detail — e.g. 38 mm shackle, red"
                  onChange={(e) =>
                    setHardware((l) =>
                      l.map((x, j) => (j === i ? { ...x, description: e.target.value } : x))
                    )
                  }
                />
                <Input
                  type="number"
                  min={1}
                  value={h.quantityRequired}
                  onChange={(e) =>
                    setHardware((l) =>
                      l.map((x, j) =>
                        j === i ? { ...x, quantityRequired: Number(e.target.value) || 1 } : x
                      )
                    )
                  }
                />
                <IconButton
                  label="Remove hardware item"
                  onClick={() => setHardware((l) => l.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ─── Verification steps (ORDERED) ─── */}
      <Section
        title="Zero-energy verification"
        subtitle="The ordered checklist the crew signs off at the equipment."
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setSteps((s) => [
                ...s,
                { key: nextKey(), stepText: "", requiresPhoto: false, requiresSignoff: true }
              ])
            }
          >
            <Plus size={14} /> Add step
          </Button>
        }
      >
        {steps.length === 0 ? (
          <Empty text="No verification steps yet — a procedure cannot be published without at least one." />
        ) : (
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={s.key} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                      {i + 1}
                    </span>
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Verification step
                    </span>
                  </span>
                  <div className="flex items-center gap-1">
                    <IconButton
                      label="Move up"
                      disabled={i === 0}
                      onClick={() => setSteps((l) => move(l, i, i - 1))}
                    >
                      <ArrowUp size={14} />
                    </IconButton>
                    <IconButton
                      label="Move down"
                      disabled={i === steps.length - 1}
                      onClick={() => setSteps((l) => move(l, i, i + 1))}
                    >
                      <ArrowDown size={14} />
                    </IconButton>
                    <IconButton
                      label="Remove step"
                      onClick={() => setSteps((l) => l.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
                <Textarea
                  rows={2}
                  value={s.stepText}
                  placeholder="e.g. Attempt start from local panel and confirm no rotation."
                  onChange={(e) =>
                    setSteps((l) =>
                      l.map((x, j) => (j === i ? { ...x, stepText: e.target.value } : x))
                    )
                  }
                />
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                  <Label className="inline-flex items-center gap-2 font-normal leading-normal text-inherit">
                    <Checkbox
                      className="h-4 w-4 rounded border-slate-300"
                      checked={s.requiresSignoff}
                      onChange={(e) =>
                        setSteps((l) =>
                          l.map((x, j) =>
                            j === i ? { ...x, requiresSignoff: e.target.checked } : x
                          )
                        )
                      }
                    />
                    <PenLine size={13} className="text-slate-500" /> Requires sign-off
                  </Label>
                  <Label className="inline-flex items-center gap-2 font-normal leading-normal text-inherit">
                    <Checkbox
                      className="h-4 w-4 rounded border-slate-300"
                      checked={s.requiresPhoto}
                      onChange={(e) =>
                        setSteps((l) =>
                          l.map((x, j) =>
                            j === i ? { ...x, requiresPhoto: e.target.checked } : x
                          )
                        )
                      }
                    />
                    <Camera size={13} className="text-slate-500" /> Requires photo
                  </Label>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {isEdit && (
        <Section title="Change note" subtitle="Recorded on the version this save creates.">
          <Textarea
            rows={2}
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="Why the procedure changed — e.g. new hydraulic accumulator fitted, added bleed-down point."
          />
        </Section>
      )}

      {/* Publish readiness, stated plainly. The builder does not publish — that
          is a separate, differently-permissioned act on the detail page — but an
          author should not have to save to find out what is missing. */}
      {publishBlockers.length > 0 && (
        <div className="rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-slate-700">
            <Zap size={14} className="text-amber-500" /> Not yet publishable
          </div>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-slate-600">
            {publishBlockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            You can still save it as a draft.
          </p>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-xl">
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 size={14} className="animate-spin" />}
          {isEdit ? "Save changes" : "Create draft"}
        </Button>
      </div>
    </div>
  );
}

// ─── Small presentational helpers ───────────────────────────────────────────

function Section({
  title,
  subtitle,
  action,
  children
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  className,
  children
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </Label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button variant="bare"
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition",
        disabled
          ? "cursor-not-allowed opacity-40"
          : "hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
      )}
    >
      {children}
    </Button>
  );
}
