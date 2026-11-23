"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCopilotForm } from "@/components/copilot/use-copilot-form";

const INPUT =
  "flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600";
const TEXTAREA =
  "min-h-0 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600";

const PRIMARY_CATEGORIES = [
  "EQUIPMENT",
  "PROCESS",
  "MATERIAL",
  "HUMAN_FACTORS",
  "ENVIRONMENTAL",
  "DOCUMENTATION",
  "TRAINING",
  "SUPPLIER",
  "CUSTOMER",
  "REGULATORY"
];

const ACTION_TYPES = [
  { code: "CORRECTIVE_ONLY", label: "Corrective only" },
  { code: "PREVENTIVE_ONLY", label: "Preventive only" },
  { code: "CORRECTIVE_AND_PREVENTIVE", label: "Both" }
];

const SEVERITIES = ["LOW", "MODERATE", "HIGH", "CRITICAL"];
const PRIORITIES = ["LOW", "MODERATE", "HIGH", "URGENT"];

export function ManualCapaForm({
  sourceTypes,
  subCategories,
  plants,
  users
}: {
  sourceTypes: { id: string; code: string; name: string; categoryId: string }[];
  subCategories: { id: string; code: string; name: string; description: string | null }[];
  plants: { id: string; code: string; name: string }[];
  users: { id: string; name: string; email: string; plantId: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [plantId, setPlantId] = useState(plants[0]?.id ?? "");
  const [sourceTypeCode, setSourceTypeCode] = useState("MANUAL");
  const [title, setTitle] = useState("");
  const [problemDescription, setProblemDescription] = useState("");
  const [problemImpact, setProblemImpact] = useState("");
  const [detectionMethod, setDetectionMethod] = useState("");
  const [detectedAt, setDetectedAt] = useState(new Date().toISOString().slice(0, 10));
  const [primaryCategory, setPrimaryCategory] = useState("PROCESS");
  const [subCategoryCode, setSubCategoryCode] = useState("");
  const [actionType, setActionType] = useState("CORRECTIVE_AND_PREVENTIVE");
  const [severity, setSeverity] = useState("MODERATE");
  const [priority, setPriority] = useState("MODERATE");
  const [primaryOwnerUserId, setPrimaryOwnerUserId] = useState("");
  const [sourceMetadataRationale, setSourceMetadataRationale] = useState("");

  const plantUsers = users.filter((u) => !u.plantId || u.plantId === plantId);

  // Copilot: drafts the problem and classification from what the user tells
  // it. The primary owner is a person, so the user picks them.
  useCopilotForm({
    kind: "CAPA",
    title: "New CAPA form",
    fields: () => [
      { name: "plantId", label: "Plant", type: "select", required: true, value: plantId,
        options: plants.map((p) => ({ value: p.id, label: p.name })) },
      { name: "sourceTypeCode", label: "Source type", type: "select", required: true, value: sourceTypeCode,
        options: sourceTypes.map((s) => ({ value: s.code, label: s.name })) },
      { name: "rationale", label: "Rationale for raising without a source record", type: "textarea", maxLength: 1000,
        value: sourceMetadataRationale, help: "Needed only when the source type is MANUAL." },
      { name: "title", label: "Title", type: "text", required: true, maxLength: 200, value: title,
        help: "Short summary for the CAPA list." },
      { name: "problemDescription", label: "Problem description", type: "textarea", required: true, minLength: 50,
        maxLength: 4000, value: problemDescription, help: "At least 50 characters: the problem, where, and the evidence." },
      { name: "problemImpact", label: "Impact if not addressed", type: "textarea", maxLength: 2000, value: problemImpact },
      { name: "detectionMethod", label: "Detection method", type: "text", maxLength: 200, value: detectionMethod },
      { name: "detectedAt", label: "Detected at", type: "date", required: true, value: detectedAt },
      { name: "primaryCategory", label: "Primary category", type: "select", required: true, value: primaryCategory,
        options: PRIMARY_CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, " ") })) },
      { name: "subCategoryCode", label: "Sub-category", type: "select", value: subCategoryCode,
        options: subCategories.map((s) => ({ value: s.code, label: s.name })) },
      { name: "actionType", label: "Action type", type: "select", required: true, value: actionType,
        options: ACTION_TYPES.map((a) => ({ value: a.code, label: a.label })) },
      { name: "severity", label: "Severity", type: "select", required: true, value: severity,
        options: SEVERITIES.map((s) => ({ value: s, label: s })) },
      { name: "priority", label: "Priority", type: "select", required: true, value: priority,
        options: PRIORITIES.map((p) => ({ value: p, label: p })) },
      { name: "primaryOwnerChosen", label: "Primary owner chosen", type: "boolean", value: Boolean(primaryOwnerUserId),
        readOnly: true, help: "Required. The user picks the owner on the form." }
    ],
    apply: (p) => {
      const str = (k: string) => (p[k] == null ? "" : String(p[k]));
      if ("plantId" in p && p.plantId) setPlantId(str("plantId"));
      if ("sourceTypeCode" in p && p.sourceTypeCode) setSourceTypeCode(str("sourceTypeCode"));
      if ("rationale" in p) setSourceMetadataRationale(str("rationale"));
      if ("title" in p) setTitle(str("title"));
      if ("problemDescription" in p) setProblemDescription(str("problemDescription"));
      if ("problemImpact" in p) setProblemImpact(str("problemImpact"));
      if ("detectionMethod" in p) setDetectionMethod(str("detectionMethod"));
      if ("detectedAt" in p && p.detectedAt) setDetectedAt(str("detectedAt"));
      if ("primaryCategory" in p && p.primaryCategory) setPrimaryCategory(str("primaryCategory"));
      if ("subCategoryCode" in p) setSubCategoryCode(str("subCategoryCode"));
      if ("actionType" in p && p.actionType) setActionType(str("actionType"));
      if ("severity" in p && p.severity) setSeverity(str("severity"));
      if ("priority" in p && p.priority) setPriority(str("priority"));
    }
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("Title required");
    if (problemDescription.length < 50)
      return setError("Problem description must be at least 50 characters");
    if (!primaryOwnerUserId) return setError("Primary owner required");

    startTransition(async () => {
      const res = await fetch("/api/capa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantId,
          sourceTypeCode,
          sourceReferenceSummary:
            sourceTypeCode === "MANUAL"
              ? sourceMetadataRationale || "Manual CAPA — no source record"
              : null,
          sourceMetadata: {
            rationaleForCapa: sourceMetadataRationale || null,
            detectedThrough: detectionMethod || null
          },
          title: title.trim(),
          problemDescription: problemDescription.trim(),
          problemImpact: problemImpact || undefined,
          detectionMethod: detectionMethod || undefined,
          detectedAt: new Date(detectedAt).toISOString(),
          primaryCategory,
          subCategoryCode: subCategoryCode || undefined,
          actionType,
          severity,
          priority,
          primaryOwnerUserId
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Create failed (${res.status})`);
        return;
      }
      const created = await res.json();
      router.push(`/capa/${created.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-4xl">
      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm text-rose-900">
          {error}
        </div>
      )}

      <Section title="1 — Scope">
        <Grid>
          <Field label="Plant" required>
            <Select className={INPUT} value={plantId} onChange={(e) => setPlantId(e.target.value)}>
              {plants.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </Select>
          </Field>
          <Field label="Source Type" required>
            <Select
              className={INPUT}
              value={sourceTypeCode}
              onChange={(e) => setSourceTypeCode(e.target.value)}
            >
              {sourceTypes.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.name}
                </SelectItem>
              ))}
            </Select>
          </Field>
        </Grid>
        {sourceTypeCode === "MANUAL" && (
          <Field label="Rationale for raising without a source record" required>
            <Textarea
              className={TEXTAREA}
              rows={2}
              value={sourceMetadataRationale}
              onChange={(e) => setSourceMetadataRationale(e.target.value)}
              placeholder="Why are you raising a CAPA without linking it to an incident / audit / complaint / etc.?"
            />
          </Field>
        )}
      </Section>

      <Section title="2 — Problem">
        <Field label="Title" required>
          <Input
            className={INPUT}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short summary that will appear in the CAPA list"
          />
        </Field>
        <Field label="Problem description (min 50 chars)" required>
          <Textarea
            className={TEXTAREA}
            rows={5}
            value={problemDescription}
            onChange={(e) => setProblemDescription(e.target.value)}
          />
          <div className="text-[10px] text-slate-500 mt-0.5">{problemDescription.length} / 50 chars</div>
        </Field>
        <Field label="Impact if not addressed">
          <Textarea
            className={TEXTAREA}
            rows={2}
            value={problemImpact}
            onChange={(e) => setProblemImpact(e.target.value)}
          />
        </Field>
        <Grid>
          <Field label="Detection method">
            <Input
              className={INPUT}
              value={detectionMethod}
              onChange={(e) => setDetectionMethod(e.target.value)}
              placeholder="How was this discovered?"
            />
          </Field>
          <Field label="Detected at" required>
            <Input
              type="date"
              className={INPUT}
              value={detectedAt}
              onChange={(e) => setDetectedAt(e.target.value)}
            />
          </Field>
        </Grid>
      </Section>

      <Section title="3 — Classification">
        <Grid>
          <Field label="Primary category" required>
            <Select
              className={INPUT}
              value={primaryCategory}
              onChange={(e) => setPrimaryCategory(e.target.value)}
            >
              {PRIMARY_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </Select>
          </Field>
          <Field label="Sub-category">
            <Select
              className={INPUT}
              value={subCategoryCode}
              onChange={(e) => setSubCategoryCode(e.target.value)}
            >
              <SelectItem value="">— Select —</SelectItem>
              {subCategories.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.name}
                </SelectItem>
              ))}
            </Select>
          </Field>
          <Field label="Action type" required>
            <Select className={INPUT} value={actionType} onChange={(e) => setActionType(e.target.value)}>
              {ACTION_TYPES.map((a) => (
                <SelectItem key={a.code} value={a.code}>
                  {a.label}
                </SelectItem>
              ))}
            </Select>
          </Field>
          <Field label="Severity" required>
            <Select className={INPUT} value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {SEVERITIES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </Select>
          </Field>
          <Field label="Priority" required>
            <Select className={INPUT} value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </Select>
          </Field>
        </Grid>
      </Section>

      <Section title="4 — Ownership">
        <Field label="Primary owner" required>
          <Select
            className={INPUT}
            value={primaryOwnerUserId}
            onChange={(e) => setPrimaryOwnerUserId(e.target.value)}
          >
            <SelectItem value="">— Select —</SelectItem>
            {plantUsers.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name} ({u.email})
              </SelectItem>
            ))}
          </Select>
        </Field>
      </Section>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create CAPA"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}

function Field({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="block text-xs font-medium text-slate-600 mb-1">
        {label} {required && <span className="text-rose-600">*</span>}
      </Label>
      {children}
    </div>
  );
}
