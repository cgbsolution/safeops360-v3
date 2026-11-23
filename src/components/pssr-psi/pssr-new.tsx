"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UserPicker } from "@/components/ui/user-picker";
import {
  dateInputToIso, fmtDate, label, psFetch, qs, toDateInput,
  type MocCandidate, type PlantOption, type PssrDetail, type PssrMeta, type PssrTemplate,
} from "@/lib/pssr-psi/api";
import { ErrorBox, Field, PlantSelect } from "./shared";

const NONE = "__none__";
const DEFAULT_TPL = "__default__";

export function PssrNewForm({
  plants, meta, defaultPlantId, defaultMocId,
}: { plants: PlantOption[]; meta: PssrMeta | null; defaultPlantId: string | null; defaultMocId: string | null }) {
  const router = useRouter();
  const [plantId, setPlantId] = useState(defaultPlantId ?? plants[0]?.id ?? "");
  const [mocs, setMocs] = useState<MocCandidate[]>([]);
  const [mocId, setMocId] = useState(defaultMocId ?? NONE);
  const [templates, setTemplates] = useState<PssrTemplate[]>([]);
  const [templateId, setTemplateId] = useState(DEFAULT_TPL);
  const [title, setTitle] = useState("");
  const [trigger, setTrigger] = useState("MODIFICATION");
  const [area, setArea] = useState("");
  const [unit, setUnit] = useState("");
  const [scope, setScope] = useState("");
  const [phaStudyId, setPhaStudyId] = useState("");
  const [planned, setPlanned] = useState("");
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [team, setTeam] = useState<string[]>([]);
  const mandatory = useMemo(() => new Set(meta?.mandatoryDisciplines ?? ["SAFETY", "OPERATIONS", "PLANT_HEAD"]), [meta]);
  const [disciplines, setDisciplines] = useState<string[]>(meta?.disciplines ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    psFetch<{ items: MocCandidate[] }>(`/api/pssr/moc-candidates${qs({ plantId: plantId || undefined })}`)
      .then((r) => setMocs(r.items))
      .catch(() => setMocs([]));
    psFetch<{ items: PssrTemplate[] }>(`/api/pssr/templates${qs({ plantId: plantId || undefined })}`)
      .then((r) => setTemplates(r.items))
      .catch(() => setTemplates([]));
  }, [plantId]);

  const moc = mocs.find((m) => m.id === mocId) ?? null;

  // A MOC was passed in (?mocId=) for a different plant than the default: follow it.
  useEffect(() => {
    if (moc && moc.plantId !== plantId) setPlantId(moc.plantId);
  }, [moc, plantId]);

  function pickMoc(id: string) {
    setMocId(id);
    const m = mocs.find((x) => x.id === id);
    if (!m) return;
    setTrigger("MODIFICATION");
    if (!title.trim()) setTitle(`PSSR for ${m.number}: ${m.title}`.slice(0, 200));
    if (!planned) setPlanned(toDateInput(m.proposedImplementationDate ?? m.targetCompletionDate));
  }

  useEffect(() => {
    if (defaultMocId && moc && !title) pickMoc(defaultMocId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moc]);

  function toggleDiscipline(d: string, on: boolean) {
    setDisciplines((cur) => (on ? Array.from(new Set([...cur, d])) : cur.filter((x) => x !== d)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await psFetch<PssrDetail>("/api/pssr/reviews", {
        method: "POST",
        json: {
          plantId, mocId: mocId === NONE ? null : mocId, templateId: templateId === DEFAULT_TPL ? null : templateId,
          title: title.trim() || null, trigger, area: area || null, unit: unit || null, scope: scope || null,
          phaStudyId: phaStudyId.trim() || null, plannedStartupDate: dateInputToIso(planned),
          leaderId, teamUserIds: team, requiredDisciplines: disciplines,
        },
      });
      router.push(`/process-safety/pssr/${r.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Could not create the PSSR");
      setBusy(false);
    }
  }

  const linked = moc?.linkedPssr;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Review details</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Plant" required>
              <PlantSelect plants={plants} value={plantId} onChange={(v) => { setPlantId(v); setMocId(NONE); }} allowAll={false} className="w-full" />
            </Field>
            <Field label="Linked MOC" hint="Start-ups that follow a change. Leave as none for commissioning or a turnaround restart.">
              <Select value={mocId} onValueChange={pickMoc} className="w-full" aria-label="Linked MOC">
                <SelectItem value={NONE}>None (standalone PSSR)</SelectItem>
                {mocs.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.number}: {m.title}{m.pssrRequired ? " (PSSR required)" : ""}
                  </SelectItem>
                ))}
              </Select>
            </Field>
          </div>
          {linked && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {moc?.number} already has {linked.pssrNo} ({label(linked.status)}).{" "}
              <Button variant="link" className="h-auto p-0 text-amber-900 underline" onClick={() => router.push(`/process-safety/pssr/${linked.id}`)}>
                Open it
              </Button>
            </div>
          )}
          <Field label="Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CAPL-2 pickling line restart after acid pump replacement" maxLength={200} />
          </Field>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Trigger" required>
              <Select value={trigger} onValueChange={setTrigger} className="w-full">
                {(meta?.triggers ?? ["NEW_FACILITY", "MODIFICATION", "TURNAROUND", "RESTART_AFTER_SHUTDOWN", "OTHER"]).map((t) => (
                  <SelectItem key={t} value={t}>{label(t)}</SelectItem>
                ))}
              </Select>
            </Field>
            <Field label="Area"><Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Cold rolling mill" /></Field>
            <Field label="Unit / equipment"><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. CAPL-2" /></Field>
          </div>
          <Field label="Scope" hint={moc ? "Left blank, the MOC description is used." : undefined}>
            <Textarea rows={3} value={scope} onChange={(e) => setScope(e.target.value)} placeholder="What is being started up, and the boundaries of this review" />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Planned start-up"><Input type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} /></Field>
            <Field label="PHA / HAZOP study reference" hint="Study id from the PHA register, if one covers this start-up.">
              <Input value={phaStudyId} onChange={(e) => setPhaStudyId(e.target.value)} placeholder="Optional" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Team</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Field label="PSSR leader" hint="Defaults to you.">
              <UserPicker value={leaderId} onChange={(id) => setLeaderId(id)} filter={{ plantId: plantId || undefined }} />
            </Field>
            <Field label="Team members" hint="Team members can answer checklist items and work punch items.">
              <UserPicker multiple value={team} onChange={(ids) => setTeam(ids)} filter={{ plantId: plantId || undefined }} />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Checklist and sign-off</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Field label="Checklist template">
              <Select value={templateId} onValueChange={setTemplateId} className="w-full">
                <SelectItem value={DEFAULT_TPL}>Plant default</SelectItem>
                {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.itemCount} items)</SelectItem>)}
              </Select>
            </Field>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700">Sign-off matrix</Label>
              {(meta?.disciplines ?? []).map((d) => {
                const fixed = mandatory.has(d);
                return (
                  <Label key={d} className="flex items-center gap-2 text-sm font-normal text-slate-700">
                    <Checkbox checked={fixed || disciplines.includes(d)} disabled={fixed} onCheckedChange={(v) => toggleDiscipline(d, v === true)} />
                    {meta?.disciplineLabels[d] ?? label(d)}
                    {fixed && <span className="text-[11px] text-slate-400">always required</span>}
                  </Label>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <ErrorBox error={error} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/process-safety/pssr")}>Cancel</Button>
          <Button onClick={save} disabled={busy || !plantId || (!title.trim() && mocId === NONE) || !!linked}>
            {busy ? "Creating…" : "Create PSSR"}
          </Button>
        </div>
        {moc && (
          <p className="text-[11px] text-slate-500">
            {moc.number} · {label(moc.status)} · planned {fmtDate(moc.proposedImplementationDate ?? moc.targetCompletionDate)}
          </p>
        )}
      </div>
    </div>
  );
}
