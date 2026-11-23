"use client";

// Fire inspection checklists, one per equipment type. Admins (FIRE.MANAGE) edit
// a checklist by publishing a new version; past inspections keep the wording
// they were answered against.

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { usePermission } from "@/components/auth/can";
import { ErrorBox, Field } from "@/components/ims/shared";
import { fireFetch, fireLabel, fmtDate, type ChecklistItem, type ChecklistTemplate, type FireMeta } from "@/lib/fire/api";

type ListResp = { items: ChecklistTemplate[]; typesWithoutChecklist: string[] };

export function Checklists({ meta }: { meta: FireMeta | null }) {
  const canEdit = usePermission("FIRE.MANAGE");
  const [data, setData] = useState<ListResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<ChecklistTemplate | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fireFetch<ListResp>("/api/fire/templates"));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load checklists");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">
          {data ? `${data.items.length} checklist(s)` : "Loading…"}
          {data && data.typesWithoutChecklist.length > 0 && (
            <span className="ml-2 text-amber-700">No checklist yet for: {data.typesWithoutChecklist.map(fireLabel).join(", ")}</span>
          )}
        </span>
        {canEdit && data && data.typesWithoutChecklist.length > 0 && (
          <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}><Plus size={14} /> New checklist</Button>
        )}
      </div>
      <ErrorBox error={error} />
      <div className="space-y-2">
        {data?.items.map((t) => (
          <div key={t.id} className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 p-3">
              <Button variant="ghost" size="sm" className="px-1" aria-label="Toggle items" onClick={() => setOpen((p) => ({ ...p, [t.id]: !p[t.id] }))}>
                {open[t.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </Button>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{t.name} <span className="font-normal text-slate-500">v{t.version}</span></div>
                <div className="text-xs text-slate-500">
                  {fireLabel(t.equipmentType)}{t.standardRef ? ` · ${t.standardRef}` : ""}{t.frequencyDays ? ` · every ${t.frequencyDays} days` : ""}
                  {" · "}{t.itemCount} items, {t.criticalCount} critical · updated {fmtDate(t.updatedAt)}
                </div>
              </div>
              {canEdit && (
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEditing(t)}><Pencil size={14} /> Edit</Button>
              )}
            </div>
            {open[t.id] && (
              <ol className="border-t border-slate-100 px-4 py-3">
                {t.description && <p className="mb-2 text-xs text-slate-600">{t.description}</p>}
                {(t.items ?? []).map((it, i) => (
                  <li key={it.key} className="flex gap-2 py-1 text-sm">
                    <span className="w-5 shrink-0 text-xs text-slate-400">{i + 1}.</span>
                    <span className="flex-1">
                      {it.text}
                      {it.critical && <Badge className="ml-2 border border-rose-200 bg-rose-50 text-[10px] text-rose-700">Critical</Badge>}
                      {it.guidance && <span className="block text-xs text-slate-500">{it.guidance}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
      <TemplateEditor
        target={editing}
        types={data?.typesWithoutChecklist ?? []}
        meta={meta}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void load(); }}
      />
    </div>
  );
}

type Draft = { key?: string; text: string; critical: boolean; guidance: string };

function TemplateEditor({
  target, types, meta, onClose, onSaved,
}: {
  target: ChecklistTemplate | "new" | null;
  types: string[];
  meta: FireMeta | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isNew = target === "new";
  const [type, setType] = useState("");
  const [name, setName] = useState("");
  const [standardRef, setStandardRef] = useState("");
  const [frequency, setFrequency] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setError(null);
    if (target === "new") {
      const t = types[0] ?? "";
      setType(t);
      setName(t ? `${fireLabel(t)} check` : "");
      setStandardRef("");
      setFrequency(t ? String(meta?.defaultFrequencyDays[t] ?? 30) : "30");
      setDescription("");
      setItems([{ text: "", critical: true, guidance: "" }]);
    } else {
      setType(target.equipmentType);
      setName(target.name);
      setStandardRef(target.standardRef ?? "");
      setFrequency(target.frequencyDays ? String(target.frequencyDays) : "");
      setDescription(target.description ?? "");
      setItems((target.items ?? []).map((i: ChecklistItem) => ({ key: i.key, text: i.text, critical: i.critical, guidance: i.guidance ?? "" })));
    }
  }, [target, types, meta]);

  if (!target) return null;

  const setItem = (idx: number, patch: Partial<Draft>) => setItems((p) => p.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const move = (idx: number, dir: -1 | 1) => setItems((p) => {
    const j = idx + dir;
    if (j < 0 || j >= p.length) return p;
    const next = [...p];
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });

  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      name: name.trim(), standardRef: standardRef.trim() || null, description: description.trim() || null,
      frequencyDays: frequency ? Number(frequency) : null,
      items: items.filter((i) => i.text.trim()).map((i) => ({ key: i.key, text: i.text.trim(), critical: i.critical, guidance: i.guidance.trim() || null })),
    };
    try {
      const r = isNew
        ? await fireFetch<ChecklistTemplate>("/api/fire/templates", { method: "POST", json: { ...body, equipmentType: type } })
        : await fireFetch<ChecklistTemplate>(`/api/fire/templates/${(target as ChecklistTemplate).id}`, { method: "PUT", json: body });
      toast({ title: `${r.name} v${r.version} published`, variant: "success" });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Could not save the checklist");
    } finally {
      setBusy(false);
    }
  }

  const filled = items.filter((i) => i.text.trim().length >= 3);
  const noCritical = filled.length > 0 && !filled.some((i) => i.critical);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "New checklist" : `Edit ${(target as ChecklistTemplate).name}`}</DialogTitle>
          <DialogDescription>
            {isNew
              ? "One checklist per equipment type. Critical items: a failure marks the asset defective and raises a CAPA."
              : `Saving publishes version ${(target as ChecklistTemplate).version + 1}. Inspections already recorded keep version ${(target as ChecklistTemplate).version}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {isNew && (
            <Field label="Equipment type" required>
              <Select value={type} onValueChange={(v) => { setType(v); setFrequency(String(meta?.defaultFrequencyDays[v] ?? 30)); }} className="w-full">
                {types.map((t) => <SelectItem key={t} value={t}>{fireLabel(t)}</SelectItem>)}
              </Select>
            </Field>
          )}
          <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Standard / reference" hint="e.g. IS 2190:2010"><Input value={standardRef} onChange={(e) => setStandardRef(e.target.value)} /></Field>
          <Field label="Suggested interval (days)" hint="Default for newly registered assets of this type">
            <Input type="number" min={1} max={730} value={frequency} onChange={(e) => setFrequency(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          </div>
        </div>
        <div className="mt-2">
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-sm font-semibold">Items</Label>
            <Button size="sm" variant="outline" onClick={() => setItems((p) => [...p, { text: "", critical: false, guidance: "" }])}><Plus size={14} /> Add item</Button>
          </div>
          <ol className="space-y-2">
            {items.map((it, idx) => (
              <li key={idx} className="rounded-lg border border-slate-200 p-2">
                <div className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-xs text-slate-400">{idx + 1}.</span>
                  <div className="flex-1 space-y-1.5">
                    <Input value={it.text} onChange={(e) => setItem(idx, { text: e.target.value })} placeholder="What the inspector checks" />
                    <Input value={it.guidance} onChange={(e) => setItem(idx, { guidance: e.target.value })} placeholder="Guidance (optional)" className="h-8 text-xs" />
                    <div className="flex items-center gap-2">
                      <Checkbox id={`crit-${idx}`} checked={it.critical} onCheckedChange={(v) => setItem(idx, { critical: v === true })} />
                      <Label htmlFor={`crit-${idx}`} className="text-xs">Critical</Label>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <Button size="sm" variant="ghost" className="h-7 px-1.5" aria-label="Move up" onClick={() => move(idx, -1)} disabled={idx === 0}><ArrowUp size={14} /></Button>
                    <Button size="sm" variant="ghost" className="h-7 px-1.5" aria-label="Move down" onClick={() => move(idx, 1)} disabled={idx === items.length - 1}><ArrowDown size={14} /></Button>
                    <Button size="sm" variant="ghost" className="h-7 px-1.5 text-rose-600" aria-label="Remove" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}><Trash2 size={14} /></Button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {noCritical && <p className="mt-2 text-xs text-amber-700">No item is marked critical: a failure on this checklist will never mark the asset defective or raise a CAPA.</p>}
        </div>
        <ErrorBox error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || name.trim().length < 3 || filled.length === 0 || (isNew && !type)}>
            {busy ? "Publishing…" : isNew ? "Publish v1" : `Publish v${(target as ChecklistTemplate).version + 1}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
