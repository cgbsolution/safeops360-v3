"use client";

// All CAPA lifecycle mutation forms in one place — RCA submit, action
// add/update, verification submit, closure, recurrence check.
// Surfaced as inline expandable forms on the detail page tabs.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const INPUT =
  "flex h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600";
const TEXTAREA =
  "min-h-0 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600";

const RCA_METHODOLOGIES = [
  { code: "5_WHY", label: "5-Why" },
  { code: "FISHBONE", label: "Fishbone (Ishikawa)" },
  { code: "FAULT_TREE", label: "Fault Tree Analysis" },
  { code: "BOWTIE", label: "Bowtie" },
  { code: "TAP_ROOT", label: "TapRoot" },
  { code: "CAUSE_MAP", label: "Cause Map" },
  { code: "EIGHT_D", label: "8D" },
  { code: "IS_IS_NOT", label: "Is / Is-Not" },
  { code: "NONE_REQUIRED", label: "None required (low severity, obvious cause)" }
];

const ROOT_CAUSE_CATEGORIES = [
  "HUMAN",
  "PROCESS",
  "EQUIPMENT",
  "MATERIAL",
  "ENVIRONMENT",
  "MEASUREMENT",
  "METHOD",
  "MANAGEMENT"
];

const VERIFICATION_RESULTS = [
  { code: "EFFECTIVE", label: "Effective — proceeds to closure" },
  { code: "PARTIALLY_EFFECTIVE", label: "Partially effective" },
  { code: "INEFFECTIVE", label: "Ineffective — loop back to actions" },
  { code: "INCONCLUSIVE", label: "Inconclusive — extend measurement" }
];

// ─── RCA Submission Form ──────────────────────────────────────────────

export function RcaSubmitForm({ capaId, currentState }: { capaId: string; currentState: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [methodology, setMethodology] = useState("5_WHY");
  const [methodologyRationale, setMethodologyRationale] = useState("");
  const [rcaSummary, setRcaSummary] = useState("");
  const [rootCauses, setRootCauses] = useState<
    { description: string; category: string; confidence: string }[]
  >([{ description: "", category: "PROCESS", confidence: "MEDIUM" }]);

  const canSubmit = ["SUBMITTED", "UNDER_RCA", "DRAFT"].includes(currentState);
  if (!canSubmit) return null;

  function addRootCause() {
    setRootCauses((arr) => [...arr, { description: "", category: "PROCESS", confidence: "MEDIUM" }]);
  }
  function updateRootCause(i: number, patch: Partial<{ description: string; category: string; confidence: string }>) {
    setRootCauses((arr) => arr.map((rc, j) => (i === j ? { ...rc, ...patch } : rc)));
  }
  function removeRootCause(i: number) {
    setRootCauses((arr) => arr.filter((_, j) => i !== j));
  }

  function submit() {
    setError(null);
    if (methodology !== "NONE_REQUIRED" && !rcaSummary.trim()) {
      setError("RCA summary is required.");
      return;
    }
    const validRcs = rootCauses.filter((rc) => rc.description.trim());
    if (methodology !== "NONE_REQUIRED" && validRcs.length === 0) {
      setError("At least one root cause is required (or pick NONE_REQUIRED).");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/capa/${capaId}/submit-rca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rcaMethodology: methodology,
          rcaMethodologyRationale: methodologyRationale || undefined,
          rcaSummary: rcaSummary || "Not required",
          rootCauses: validRcs,
          contributingFactors: []
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Submit failed (${res.status})`);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="mt-4">
        <Button onClick={() => setOpen(true)}>Submit Root Cause Analysis</Button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border bg-slate-50 p-4 space-y-3">
      <h3 className="text-sm font-semibold">Submit RCA</h3>
      {error && (
        <div className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm text-rose-900">{error}</div>
      )}
      <Field label="Methodology" required>
        <Select className={INPUT} value={methodology} onChange={(e) => setMethodology(e.target.value)}>
          {RCA_METHODOLOGIES.map((m) => (
            <SelectItem key={m.code} value={m.code}>
              {m.label}
            </SelectItem>
          ))}
        </Select>
      </Field>
      <Field label="Why this methodology?">
        <Input
          className={INPUT}
          value={methodologyRationale}
          onChange={(e) => setMethodologyRationale(e.target.value)}
        />
      </Field>
      <Field label="RCA summary" required={methodology !== "NONE_REQUIRED"}>
        <Textarea
          className={TEXTAREA}
          rows={3}
          value={rcaSummary}
          onChange={(e) => setRcaSummary(e.target.value)}
          placeholder="Conclusion of the analysis — what does the team believe caused the problem?"
        />
      </Field>
      {methodology !== "NONE_REQUIRED" && (
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">
            Identified root causes <span className="text-rose-600">*</span>
          </div>
          <div className="space-y-2">
            {rootCauses.map((rc, i) => (
              <div key={i} className="rounded border bg-white p-2 grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6">
                  <Label className="block text-[10px] font-normal leading-normal uppercase text-slate-500 mb-0.5">Description</Label>
                  <Input
                    className={INPUT}
                    value={rc.description}
                    onChange={(e) => updateRootCause(i, { description: e.target.value })}
                  />
                </div>
                <div className="col-span-3">
                  <Label className="block text-[10px] font-normal leading-normal uppercase text-slate-500 mb-0.5">Category</Label>
                  <Select
                    className={INPUT}
                    value={rc.category}
                    onChange={(e) => updateRootCause(i, { category: e.target.value })}
                  >
                    {ROOT_CAUSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="block text-[10px] font-normal leading-normal uppercase text-slate-500 mb-0.5">Confidence</Label>
                  <Select
                    className={INPUT}
                    value={rc.confidence}
                    onChange={(e) => updateRootCause(i, { confidence: e.target.value })}
                  >
                    <SelectItem value="LOW">LOW</SelectItem>
                    <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                    <SelectItem value="HIGH">HIGH</SelectItem>
                  </Select>
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button variant="bare"
                    type="button"
                    onClick={() => removeRootCause(i)}
                    className="text-rose-600 text-xs hover:underline"
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="bare"
              type="button"
              onClick={addRootCause}
              className="text-xs text-primary-700 hover:underline"
            >
              + Add another root cause
            </Button>
          </div>
        </div>
      )}
      <div className="flex gap-2 pt-2 border-t">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Submitting…" : "Submit RCA"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Add Action Form ──────────────────────────────────────────────────

export function AddActionForm({
  capaId,
  defaultActionType = "CORRECTIVE",
  users
}: {
  capaId: string;
  defaultActionType?: string;
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [actionType, setActionType] = useState(defaultActionType);
  const [description, setDescription] = useState("");
  const [rationale, setRationale] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
  );
  const [costEstimate, setCostEstimate] = useState("");

  function submit() {
    setError(null);
    if (!description.trim()) return setError("Description required");
    if (!ownerUserId) return setError("Owner required");

    startTransition(async () => {
      const res = await fetch(`/api/capa/${capaId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType,
          description: description.trim(),
          rationale: rationale || undefined,
          ownerUserId,
          dueDate: new Date(dueDate).toISOString(),
          costEstimate: costEstimate ? Number(costEstimate) : undefined
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Add failed (${res.status})`);
        return;
      }
      setOpen(false);
      setDescription("");
      setRationale("");
      setCostEstimate("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="bare"
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-primary-700 hover:underline"
      >
        + Add action
      </Button>
    );
  }

  return (
    <div className="rounded border bg-slate-50 p-3 space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Add Action</h3>
      {error && (
        <div className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-900">{error}</div>
      )}
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-4">
          <Label className="block text-[10px] font-normal leading-normal uppercase text-slate-500 mb-0.5">Action type</Label>
          <Select className={INPUT} value={actionType} onChange={(e) => setActionType(e.target.value)}>
            <SelectItem value="IMMEDIATE_CONTAINMENT">Immediate Containment</SelectItem>
            <SelectItem value="CORRECTIVE">Corrective</SelectItem>
            <SelectItem value="PREVENTIVE">Preventive</SelectItem>
          </Select>
        </div>
        <div className="col-span-5">
          <Label className="block text-[10px] font-normal leading-normal uppercase text-slate-500 mb-0.5">Owner</Label>
          <Select className={INPUT} value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}>
            <SelectItem value="">— Select —</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </Select>
        </div>
        <div className="col-span-3">
          <Label className="block text-[10px] font-normal leading-normal uppercase text-slate-500 mb-0.5">Due date</Label>
          <Input type="date" className={INPUT} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <Textarea
        className={TEXTAREA}
        rows={2}
        placeholder="Action description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Textarea
        className={TEXTAREA}
        rows={2}
        placeholder="Rationale (optional)"
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
      />
      <Input
        type="number"
        className={INPUT}
        placeholder="Cost estimate (optional)"
        value={costEstimate}
        onChange={(e) => setCostEstimate(e.target.value)}
      />
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Adding…" : "Add Action"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Update Action Form (inline on action card) ───────────────────────

export function ActionStatusControls({
  capaId,
  actionId,
  currentStatus
}: {
  capaId: string;
  actionId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showEvidence, setShowEvidence] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState<string | null>(null);

  function patch(payload: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/capa/${capaId}/actions/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Update failed (${res.status})`);
        return;
      }
      setShowEvidence(false);
      setEvidence("");
      router.refresh();
    });
  }

  if (currentStatus === "COMPLETED") {
    return <span className="text-[10px] text-emerald-700">Completed</span>;
  }

  return (
    <div>
      {error && <div className="text-[10px] text-rose-700 mt-1">{error}</div>}
      <div className="flex gap-1 mt-1">
        {currentStatus === "PROPOSED" && (
          <Button variant="bare"
            type="button"
            disabled={pending}
            onClick={() => patch({ status: "APPROVED" })}
            className="text-[10px] px-1.5 py-0.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            Approve
          </Button>
        )}
        {(currentStatus === "APPROVED" || currentStatus === "PROPOSED") && (
          <Button variant="bare"
            type="button"
            disabled={pending}
            onClick={() => patch({ status: "IN_PROGRESS" })}
            className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            Start
          </Button>
        )}
        {currentStatus !== "COMPLETED" && currentStatus !== "CANCELLED" && (
          <Button variant="bare"
            type="button"
            disabled={pending}
            onClick={() => setShowEvidence(true)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          >
            Mark complete
          </Button>
        )}
      </div>
      {showEvidence && (
        <div className="mt-2 rounded border bg-white p-2 space-y-1">
          <Label className="block text-[10px] font-normal leading-normal uppercase text-slate-500">Evidence of completion</Label>
          <Textarea
            className={TEXTAREA}
            rows={2}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
          <div className="flex gap-1">
            <Button variant="bare"
              type="button"
              disabled={pending || !evidence.trim()}
              onClick={() => patch({ status: "COMPLETED", evidenceOfCompletion: evidence.trim() })}
              className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Confirm
            </Button>
            <Button variant="bare"
              type="button"
              onClick={() => setShowEvidence(false)}
              className="text-[10px] px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Verification Submit Form ─────────────────────────────────────────

export function VerifySubmitForm({
  capaId,
  currentState,
  verificationMethods
}: {
  capaId: string;
  currentState: string;
  verificationMethods: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [methodCode, setMethodCode] = useState(verificationMethods[0]?.code ?? "");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [result, setResult] = useState("EFFECTIVE");
  const [evidence, setEvidence] = useState("");
  const [measurementDays, setMeasurementDays] = useState("30");

  const canSubmit = currentState === "PENDING_VERIFICATION" || currentState === "ACTIONS_IN_PROGRESS";
  if (!canSubmit && currentState !== "VERIFIED") return null;

  function submit() {
    setError(null);
    if (!evidence.trim()) return setError("Evidence is required.");
    startTransition(async () => {
      const res = await fetch(`/api/capa/${capaId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificationMethodCode: methodCode || undefined,
          verificationSuccessCriteria: successCriteria || undefined,
          verificationResult: result,
          verificationEvidence: evidence.trim(),
          measurementPeriodDays: Number(measurementDays) || 30
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Verify failed (${res.status})`);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="mt-4">
        Submit Verification
      </Button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border bg-slate-50 p-4 space-y-3">
      <h3 className="text-sm font-semibold">Submit Effectiveness Verification</h3>
      {error && (
        <div className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm text-rose-900">{error}</div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Verification method">
          <Select className={INPUT} value={methodCode} onChange={(e) => setMethodCode(e.target.value)}>
            {verificationMethods.map((m) => (
              <SelectItem key={m.code} value={m.code}>
                {m.name}
              </SelectItem>
            ))}
          </Select>
        </Field>
        <Field label="Measurement period (days)">
          <Input
            type="number"
            className={INPUT}
            value={measurementDays}
            onChange={(e) => setMeasurementDays(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Success criteria">
        <Textarea
          className={TEXTAREA}
          rows={2}
          value={successCriteria}
          onChange={(e) => setSuccessCriteria(e.target.value)}
          placeholder="What does success look like? What metric / observation / test confirms it?"
        />
      </Field>
      <Field label="Result" required>
        <Select className={INPUT} value={result} onChange={(e) => setResult(e.target.value)}>
          {VERIFICATION_RESULTS.map((r) => (
            <SelectItem key={r.code} value={r.code}>
              {r.label}
            </SelectItem>
          ))}
        </Select>
      </Field>
      <Field label="Evidence" required>
        <Textarea
          className={TEXTAREA}
          rows={3}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder="Document what you observed / measured / reviewed and what it showed."
        />
      </Field>
      <div className="flex gap-2 pt-2 border-t">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Submitting…" : "Submit Verification"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Close + Recurrence Check Forms ───────────────────────────────────

export function CloseCapaForm({ capaId, currentState }: { capaId: string; currentState: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [closureNotes, setClosureNotes] = useState("");
  const [finalCost, setFinalCost] = useState("");

  if (currentState !== "VERIFIED") return null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/capa/${capaId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closureNotes: closureNotes || undefined,
          finalCost: finalCost ? Number(finalCost) : undefined,
          finalCostCurrency: finalCost ? "INR" : undefined
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Close failed (${res.status})`);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Close CAPA</Button>;
  }
  return (
    <div className="rounded-xl border bg-emerald-50 border-emerald-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-emerald-900">Close CAPA</h3>
      {error && (
        <div className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm text-rose-900">{error}</div>
      )}
      <Field label="Closure notes">
        <Textarea
          className={TEXTAREA}
          rows={3}
          value={closureNotes}
          onChange={(e) => setClosureNotes(e.target.value)}
          placeholder="Final summary for the audit trail."
        />
      </Field>
      <Field label="Actual cost (INR)">
        <Input
          type="number"
          className={INPUT}
          value={finalCost}
          onChange={(e) => setFinalCost(e.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Closing…" : "Confirm Close"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function RecurrenceCheckForm({
  capaId,
  currentState,
  dueDate
}: {
  capaId: string;
  currentState: string;
  dueDate: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recurred, setRecurred] = useState<"yes" | "no" | "">("");
  const [notes, setNotes] = useState("");

  if (currentState !== "CLOSED" && currentState !== "CLOSED_RECURRED") return null;

  function submit() {
    setError(null);
    if (!recurred) return setError("Pick yes or no.");
    startTransition(async () => {
      const res = await fetch(`/api/capa/${capaId}/recurrence-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recurrenceDetected: recurred === "yes",
          notes: notes || undefined
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Check failed (${res.status})`);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline">
        Complete Recurrence Check
      </Button>
    );
  }
  return (
    <div className="rounded-xl border bg-slate-50 p-4 space-y-3">
      <h3 className="text-sm font-semibold">Recurrence Check</h3>
      <div className="text-xs text-slate-600">
        {dueDate
          ? `Scheduled for ${new Date(dueDate).toLocaleDateString()}. Has the same issue recurred since closure?`
          : "Has the same issue recurred since closure?"}
      </div>
      {error && (
        <div className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm text-rose-900">{error}</div>
      )}
      <RadioGroup
        name="recurred"
        value={recurred}
        onValueChange={(v) => setRecurred(v as "yes" | "no")}
        className="flex gap-2"
      >
        {(["no", "yes"] as const).map((v) => (
          <Label
            key={v}
            htmlFor={`recurred-${v}`}
            className={`flex-1 rounded-md border px-3 py-2 cursor-pointer text-sm font-normal leading-normal text-inherit ${
              recurred === v ? "bg-primary-50 border-primary-500" : "border-slate-300"
            }`}
          >
            <RadioGroupItem id={`recurred-${v}`} value={v} className="mr-2 align-middle" />
            {v === "no" ? "No recurrence — CAPA stays closed" : "Recurred — flag for re-investigation"}
          </Label>
        ))}
      </RadioGroup>
      <Field label="Notes">
        <Textarea className={TEXTAREA} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Submitting…" : "Submit Check"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
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
