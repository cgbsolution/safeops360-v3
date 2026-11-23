"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { label, psFetch, qs, type PlantOption, type PssrMeta, type PssrTemplate } from "@/lib/pssr-psi/api";
import { ErrorBox, Field, Tag } from "./shared";

type TplItem = NonNullable<PssrTemplate["items"]>[number];
const ALL = "__all__";
const NEW_SECTION = "__new__";

export function PssrTemplatesAdmin({ plants, meta }: { plants: PlantOption[]; meta: PssrMeta | null }) {
  const { toast } = useToast();
  const [list, setList] = useState<PssrTemplate[]>([]);
  const [builtIn, setBuiltIn] = useState<{ inUse: boolean; count: number }>({ inUse: false, count: 0 });
  const [sel, setSel] = useState<PssrTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [itemDlg, setItemDlg] = useState<{ open: boolean; item: TplItem | null }>({ open: false, item: null });

  const load = useCallback(async (selectId?: string) => {
    try {
      const r = await psFetch<{ items: PssrTemplate[]; builtInDefaultInUse: boolean; builtInDefaultItemCount: number }>(
        `/api/pssr/templates${qs({ includeInactive: true })}`
      );
      setList(r.items);
      setBuiltIn({ inUse: r.builtInDefaultInUse, count: r.builtInDefaultItemCount });
      const id = selectId ?? sel?.id ?? r.items[0]?.id;
      if (id) setSel(await psFetch<PssrTemplate>(`/api/pssr/templates/${id}`));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load templates");
    }
  }, [sel?.id]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function run<T>(fn: () => Promise<T>, ok: string) {
    try {
      const r = await fn();
      toast({ title: ok, variant: "success" });
      return r;
    } catch (e: any) {
      toast({ title: "Not saved", description: e?.message, variant: "error" });
      return null;
    }
  }

  const sections = useMemo(() => {
    const m = new Map<string, TplItem[]>();
    for (const it of sel?.items ?? []) m.set(it.section, [...(m.get(it.section) ?? []), it]);
    return Array.from(m.entries());
  }, [sel]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Templates</CardTitle>
          <Button size="sm" onClick={() => setNewOpen(true)}><Plus size={14} className="mr-1" /> New</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {builtIn.inUse && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              No default template is active, so new reviews use the built-in steel-plant checklist ({builtIn.count} items).
              Create a template from it to edit the questions.
            </div>
          )}
          {list.map((t) => (
            <Button key={t.id} variant="bare" type="button" onClick={async () => setSel(await psFetch<PssrTemplate>(`/api/pssr/templates/${t.id}`))}
              className={cn("w-full rounded-lg border p-2 text-left", sel?.id === t.id ? "border-primary-400 bg-primary-50" : "border-slate-200 hover:bg-slate-50")}>
              <div className="text-sm font-medium text-slate-900">{t.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                {t.itemCount} items · {t.plantName ?? "All plants"}
                {t.isDefault && <Tag code="CURRENT" text="Default" />}
                {!t.isActive && <Tag code="SUPERSEDED" text="Inactive" />}
              </div>
            </Button>
          ))}
          {list.length === 0 && !error && <p className="text-xs text-slate-500">No templates yet.</p>}
          <ErrorBox error={error} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        {sel ? (
          <>
            <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
              <CardTitle className="mr-auto text-base">{sel.name}</CardTitle>
              <Label className="flex items-center gap-1.5 text-xs font-normal">
                <Checkbox checked={sel.isActive} onCheckedChange={async (v) => {
                  const r = await run(() => psFetch<PssrTemplate>(`/api/pssr/templates/${sel.id}`, { method: "PATCH", json: { isActive: v === true } }), "Saved");
                  if (r) { setSel(r); load(r.id); }
                }} /> Active
              </Label>
              <Label className="flex items-center gap-1.5 text-xs font-normal">
                <Checkbox checked={sel.isDefault} onCheckedChange={async (v) => {
                  const r = await run(() => psFetch<PssrTemplate>(`/api/pssr/templates/${sel.id}`, { method: "PATCH", json: { isDefault: v === true } }), "Saved");
                  if (r) { setSel(r); load(r.id); }
                }} /> Default for {sel.plantName ?? "all plants"}
              </Label>
              <Button size="sm" variant="outline" onClick={() => setItemDlg({ open: true, item: null })}><Plus size={14} className="mr-1" /> Add item</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {sel.description && <p className="text-sm text-slate-600">{sel.description}</p>}
              <p className="text-xs text-slate-500">Changes apply to reviews created from now on; reviews already started keep their copied checklist.</p>
              {sections.map(([section, items]) => (
                <div key={section}>
                  <div className="mb-1 text-sm font-semibold text-slate-800">{section}</div>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {items.map((it) => (
                      <li key={it.id} className="flex items-start gap-2 p-2 text-sm">
                        <div className="flex-1">
                          {it.question}
                          {it.guidance && <div className="text-[11px] text-slate-500">{it.guidance}</div>}
                        </div>
                        <span className="text-[11px] text-slate-500">{meta?.disciplineLabels[it.discipline] ?? label(it.discipline)}</span>
                        <Tag code={it.defaultPunchCategory} text={`If NO: ${it.defaultPunchCategory}`} />
                        <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setItemDlg({ open: true, item: it })}><Pencil size={13} /></Button>
                        <Button size="sm" variant="ghost" aria-label="Remove" onClick={async () => {
                          if (!(await confirmDialog({ title: "Remove item?", description: it.question, confirmLabel: "Remove", destructive: true }))) return;
                          const r = await run(() => psFetch<PssrTemplate>(`/api/pssr/template-items/${it.id}`, { method: "DELETE" }), "Removed");
                          if (r) setSel(r);
                        }}><Trash2 size={13} /></Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {sections.length === 0 && <p className="text-sm text-slate-500">This template has no items yet.</p>}
            </CardContent>
          </>
        ) : (
          <CardContent className="py-10 text-center text-sm text-slate-500">Create a template to customise the PSSR checklist.</CardContent>
        )}
      </Card>

      <NewTemplateDialog open={newOpen} onOpenChange={setNewOpen} plants={plants} templates={list}
        onCreate={async (body) => {
          const r = await run(() => psFetch<PssrTemplate>("/api/pssr/templates", { method: "POST", json: body }), "Template created");
          if (r) { setNewOpen(false); load(r.id); }
        }} />
      <ItemDialog state={itemDlg} onOpenChange={(v) => setItemDlg({ open: v, item: v ? itemDlg.item : null })} meta={meta}
        sections={sections.map(([s]) => s)}
        onSave={async (body) => {
          if (!sel) return;
          const r = itemDlg.item
            ? await run(() => psFetch<PssrTemplate>(`/api/pssr/template-items/${itemDlg.item!.id}`, { method: "PATCH", json: body }), "Item saved")
            : await run(() => psFetch<PssrTemplate>(`/api/pssr/templates/${sel.id}/items`, { method: "POST", json: body }), "Item added");
          if (r) { setSel(r); setItemDlg({ open: false, item: null }); load(r.id); }
        }} />
    </div>
  );
}

function NewTemplateDialog({ open, onOpenChange, plants, templates, onCreate }: {
  open: boolean; onOpenChange: (v: boolean) => void; plants: PlantOption[]; templates: PssrTemplate[];
  onCreate: (b: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [plantId, setPlantId] = useState(ALL);
  const [clone, setClone] = useState("builtin");
  const [isDefault, setIsDefault] = useState(false);
  const [description, setDescription] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New PSSR template</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hisar cold rolling PSSR" /></Field>
          <Field label="Plant">
            <Select value={plantId} onValueChange={setPlantId} className="w-full">
              <SelectItem value={ALL}>All plants</SelectItem>
              {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </Select>
          </Field>
          <Field label="Start from">
            <Select value={clone} onValueChange={setClone} className="w-full">
              <SelectItem value="builtin">Built-in steel-plant checklist</SelectItem>
              <SelectItem value="blank">Blank</SelectItem>
              {templates.map((t) => <SelectItem key={t.id} value={t.id}>Copy of {t.name}</SelectItem>)}
            </Select>
          </Field>
          <Field label="Description"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Label className="flex items-center gap-2 text-sm font-normal"><Checkbox checked={isDefault} onCheckedChange={(v) => setIsDefault(v === true)} /> Make it the default</Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={name.trim().length < 3} onClick={() => onCreate({
            name: name.trim(), plantId: plantId === ALL ? null : plantId, cloneFromId: clone === "blank" ? null : clone,
            isDefault, description: description || null,
          })}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemDialog({ state, onOpenChange, meta, sections, onSave }: {
  state: { open: boolean; item: TplItem | null }; onOpenChange: (v: boolean) => void; meta: PssrMeta | null;
  sections: string[]; onSave: (b: Record<string, unknown>) => void;
}) {
  const it = state.item;
  const [section, setSection] = useState(NEW_SECTION);
  const [newSection, setNewSection] = useState("");
  const [question, setQuestion] = useState("");
  const [guidance, setGuidance] = useState("");
  const [discipline, setDiscipline] = useState("PROCESS");
  const [cat, setCat] = useState("A");

  useEffect(() => {
    if (!state.open) return;
    setSection(it?.section ?? sections[0] ?? NEW_SECTION);
    setNewSection("");
    setQuestion(it?.question ?? "");
    setGuidance(it?.guidance ?? "");
    setDiscipline(it?.discipline ?? "PROCESS");
    setCat(it?.defaultPunchCategory ?? "A");
  }, [state.open, it, sections]);

  const sectionValue = section === NEW_SECTION ? newSection.trim() : section;
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{it ? "Edit checklist item" : "Add checklist item"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label="Section" required>
            <Select value={section} onValueChange={setSection} className="w-full">
              {sections.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              <SelectItem value={NEW_SECTION}>New section…</SelectItem>
            </Select>
          </Field>
          {section === NEW_SECTION && <Field label="New section name" required><Input value={newSection} onChange={(e) => setNewSection(e.target.value)} /></Field>}
          <Field label="Check" required><Textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} /></Field>
          <Field label="Guidance"><Textarea rows={2} value={guidance} onChange={(e) => setGuidance(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discipline" required>
              <Select value={discipline} onValueChange={setDiscipline} className="w-full">
                {(meta?.disciplines ?? []).map((d) => <SelectItem key={d} value={d}>{meta?.disciplineLabels[d] ?? label(d)}</SelectItem>)}
              </Select>
            </Field>
            <Field label="If answered NO" required>
              <Select value={cat} onValueChange={setCat} className="w-full">
                <SelectItem value="A">Category A: close before start-up</SelectItem>
                <SelectItem value="B">Category B: may close after</SelectItem>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={question.trim().length < 5 || sectionValue.length < 2}
            onClick={() => onSave({ section: sectionValue, question: question.trim(), guidance: guidance.trim() || null, discipline, defaultPunchCategory: cat })}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
