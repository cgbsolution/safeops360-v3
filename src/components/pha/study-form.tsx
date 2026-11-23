"use client";

// Study header form: create (POST /api/pha/studies) or edit (PATCH /api/pha/studies/{id}).

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { UserPicker } from "@/components/ui/user-picker";
import { phaFetch, type MatrixOption, type PhaMeta, type PlantOption, type StudyDetail } from "@/lib/pha/api";
import { ErrorBox, Field } from "./shared";

const DEFAULT_MATRIX = "__default__";

type FormState = {
  plantId: string; title: string; method: string; unit: string; area: string; scope: string;
  designIntentSummary: string; drawingRefs: string[]; riskMatrixId: string; facilitatorId: string | null;
  scribeId: string | null; approverId: string | null; mocId: string;
};

function fromStudy(s: StudyDetail | null, plants: PlantOption[]): FormState {
  return {
    plantId: s?.plantId ?? plants[0]?.id ?? "", title: s?.title ?? "", method: s?.method ?? "HAZOP", unit: s?.unit ?? "",
    area: s?.area ?? "", scope: s?.scope ?? "", designIntentSummary: s?.designIntentSummary ?? "", drawingRefs: s?.drawingRefs ?? [],
    riskMatrixId: s?.riskMatrixId ?? DEFAULT_MATRIX, facilitatorId: s?.facilitatorId ?? null, scribeId: s?.scribeId ?? null,
    approverId: s?.approverId ?? null, mocId: s?.mocId ?? "",
  };
}

export function StudyForm({
  plants, meta, study, onSaved, onCancel,
}: { plants: PlantOption[]; meta: PhaMeta | null; study?: StudyDetail | null; onSaved?: (s: StudyDetail) => void; onCancel?: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [f, setF] = useState<FormState>(() => fromStudy(study ?? null, plants));
  const [drawing, setDrawing] = useState("");
  const [matrices, setMatrices] = useState<MatrixOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(study);

  useEffect(() => {
    phaFetch<{ items: MatrixOption[] }>("/api/pha/risk-matrices").then((r) => setMatrices(r.items)).catch(() => setMatrices([]));
  }, []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  function addDrawing() {
    const parts = drawing.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length) set("drawingRefs", Array.from(new Set([...f.drawingRefs, ...parts])));
    setDrawing("");
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const pending = drawing.trim() ? Array.from(new Set([...f.drawingRefs, ...drawing.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)])) : f.drawingRefs;
    const body = {
      title: f.title, method: f.method, unit: f.unit, area: f.area, scope: f.scope, designIntentSummary: f.designIntentSummary,
      drawingRefs: pending, riskMatrixId: f.riskMatrixId === DEFAULT_MATRIX ? null : f.riskMatrixId,
      facilitatorId: f.facilitatorId, scribeId: f.scribeId, approverId: f.approverId, mocId: f.mocId,
    };
    try {
      if (editing && study) {
        const r = await phaFetch<StudyDetail>(`/api/pha/studies/${study.id}`, { method: "PATCH", json: body });
        toast({ title: "Study updated", variant: "success" });
        onSaved?.(r);
      } else {
        const r = await phaFetch<StudyDetail>("/api/pha/studies", { method: "POST", json: { ...body, plantId: f.plantId } });
        toast({ title: `${r.studyNo} created`, variant: "success" });
        router.push(`/process-safety/hazop/${r.id}`);
      }
    } catch (e: any) {
      setError(e?.message ?? "Could not save the study");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <ErrorBox error={error} />
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Plant" required>
            <Select value={f.plantId} onValueChange={(v) => set("plantId", v)} disabled={editing} aria-label="Plant">
              {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </Select>
          </Field>
          <Field label="Method" required>
            <Select value={f.method} onValueChange={(v) => set("method", v)} aria-label="Method">
              {(meta?.methods ?? [{ code: "HAZOP", label: "HAZOP" }]).map((m) => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}
            </Select>
          </Field>
          <Field label="Risk matrix" hint="Rows are ranked and coloured on this matrix.">
            <Select value={f.riskMatrixId} onValueChange={(v) => set("riskMatrixId", v)} aria-label="Risk matrix">
              <SelectItem value={DEFAULT_MATRIX}>Plant default</SelectItem>
              {matrices.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.likelihoodLevels} x {m.severityLevels})</SelectItem>)}
            </Select>
          </Field>
        </div>
        <Field label="Title" required>
          <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Reheating furnace 2: fuel gas and combustion air system" />
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Unit"><Input value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="e.g. Hot Strip Mill" /></Field>
          <Field label="Area"><Input value={f.area} onChange={(e) => set("area", e.target.value)} placeholder="e.g. Furnace bay" /></Field>
          <Field label="MOC reference" hint="If this study supports a change."><Input value={f.mocId} onChange={(e) => set("mocId", e.target.value)} placeholder="MOC number" /></Field>
        </div>
        <Field label="Scope">
          <Textarea rows={3} value={f.scope} onChange={(e) => set("scope", e.target.value)} placeholder="Systems included and excluded, operating modes covered" />
        </Field>
        <Field label="Design intent (summary)">
          <Textarea rows={3} value={f.designIntentSummary} onChange={(e) => set("designIntentSummary", e.target.value)} placeholder="What the system is designed to do, at what conditions" />
        </Field>
        <Field label="Drawings (P&ID / PFD numbers)" hint="Press Enter or Add. Separate several with commas.">
          <div className="flex gap-2">
            <Input value={drawing} onChange={(e) => setDrawing(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDrawing(); } }} placeholder="P&ID-HSM-RF2-001" />
            <Button type="button" variant="outline" onClick={addDrawing}>Add</Button>
          </div>
          {f.drawingRefs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {f.drawingRefs.map((d) => (
                <Badge key={d} className="gap-1 border border-slate-200 bg-slate-100 text-slate-700">
                  {d}
                  <Button type="button" variant="bare" size="bare" aria-label={`Remove ${d}`} onClick={() => set("drawingRefs", f.drawingRefs.filter((x) => x !== d))}>
                    <X size={12} />
                  </Button>
                </Badge>
              ))}
            </div>
          )}
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Facilitator / leader" hint="Cannot approve their own study.">
            <UserPicker value={f.facilitatorId} onChange={(id) => set("facilitatorId", id)} filter={{ plantId: f.plantId || undefined }} placeholder="Pick facilitator" />
          </Field>
          <Field label="Scribe">
            <UserPicker value={f.scribeId} onChange={(id) => set("scribeId", id)} filter={{ plantId: f.plantId || undefined }} placeholder="Pick scribe" />
          </Field>
          <Field label="Approver" hint="Needs PHA approval rights.">
            <UserPicker value={f.approverId} onChange={(id) => set("approverId", id)} filter={{ permission: "PHA.APPROVE" }} placeholder="Pick approver" />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          {onCancel && <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>}
          <Button onClick={submit} disabled={busy || f.title.trim().length < 3 || !f.plantId}>{editing ? "Save changes" : "Create study"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
