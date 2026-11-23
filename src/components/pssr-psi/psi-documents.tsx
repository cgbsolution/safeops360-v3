"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, History, Plus, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  dateInputToIso, fmtDate, label, openPsiFile, psFetch, qs, uploadPsiFile,
  type Completeness, type PlantOption, type PsiDocument, type PsiMeta,
} from "@/lib/pssr-psi/api";
import { ALL_PLANTS, EmptyRow, ErrorBox, Field, PlantSelect, plantParam, Tag } from "./shared";

const ANY = "__any__";
const NEW_UNIT = "__new__";
const NO_UNIT = "__none__";

export function PsiDocumentsView({ plants, meta, defaultPlantId, canManage }: { plants: PlantOption[]; meta: PsiMeta | null; defaultPlantId: string | null; canManage: boolean }) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  return (
    <div>
      <div className="mb-3"><PlantSelect plants={plants} value={plant} onChange={setPlant} /></div>
      <Tabs defaultValue="library">
        <TabsList>
          <TabsTrigger value="library">Document library</TabsTrigger>
          <TabsTrigger value="completeness">PSI completeness</TabsTrigger>
        </TabsList>
        <TabsContent value="library"><Library plant={plant} plants={plants} meta={meta} canManage={canManage} /></TabsContent>
        <TabsContent value="completeness"><CompletenessView plant={plant} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Library({ plant, plants, meta, canManage }: { plant: string; plants: PlantOption[]; meta: PsiMeta | null; canManage: boolean }) {
  const [docType, setDocType] = useState(ANY);
  const [unit, setUnit] = useState(ANY);
  const [status, setStatus] = useState("CURRENT");
  const [overdue, setOverdue] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PsiDocument[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PsiDocument | null>(null);
  const [dlg, setDlg] = useState<{ open: boolean; base: PsiDocument | null }>({ open: false, base: null });

  const load = useCallback(async () => {
    try {
      const r = await psFetch<{ items: PsiDocument[]; facets: { unitAreas: string[] } }>(`/api/psi/documents${qs({
        plantId: plantParam(plant), docType: docType === ANY ? undefined : docType, unitArea: unit === ANY ? undefined : unit,
        status, reviewOverdue: overdue, q: q.trim() || undefined,
      })}`);
      setRows(r.items);
      if (unit === ANY) setUnits(r.facets.unitAreas);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load PSI documents");
    }
  }, [plant, docType, unit, status, overdue, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const labels = meta?.docTypeLabels ?? {};
  return (
    <div className="mt-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={docType} onValueChange={setDocType} className="h-9 w-60" aria-label="Document type">
          <SelectItem value={ANY}>All document types</SelectItem>
          {(meta?.docTypes ?? []).map((t) => <SelectItem key={t} value={t}>{labels[t] ?? label(t)}</SelectItem>)}
        </Select>
        <Select value={unit} onValueChange={setUnit} className="h-9 w-52" aria-label="Unit / area">
          <SelectItem value={ANY}>All units / areas</SelectItem>
          {units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
        </Select>
        <Select value={status} onValueChange={setStatus} className="h-9 w-44" aria-label="Status">
          <SelectItem value="CURRENT">Current revisions</SelectItem>
          <SelectItem value="SUPERSEDED">Superseded</SelectItem>
          <SelectItem value="ALL">All revisions</SelectItem>
        </Select>
        <Label className="flex items-center gap-2 text-xs text-slate-700"><Checkbox checked={overdue} onCheckedChange={(v) => setOverdue(v === true)} /> Review overdue</Label>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Doc no. or title" className="h-9 w-52" />
        {canManage && <Button size="sm" className="ml-auto" onClick={() => setDlg({ open: true, base: null })}><Plus size={14} className="mr-1" /> Register document</Button>}
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[1050px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Doc no.</TableHead><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Unit / area</TableHead>
              <TableHead>Rev.</TableHead><TableHead>Issued</TableHead><TableHead>Review due</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.docNo}</TableCell>
                <TableCell>
                  {d.title}
                  <div className="text-[11px] text-slate-500">{[d.plantName, d.chemicalName].filter(Boolean).join(" · ")}</div>
                </TableCell>
                <TableCell className="text-xs">{d.docTypeLabel}</TableCell>
                <TableCell className="text-xs">{d.unitArea ?? "—"}</TableCell>
                <TableCell className="text-xs">{d.revision}</TableCell>
                <TableCell className="text-xs">{fmtDate(d.issuedDate)}</TableCell>
                <TableCell className="text-xs">{fmtDate(d.reviewDue)} {d.reviewOverdue && <Tag code="OVERDUE" text="Overdue" />}</TableCell>
                <TableCell><Tag code={d.status} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {d.hasFile
                      ? <Button size="sm" variant="ghost" aria-label="Open file" onClick={() => openPsiFile(d.id)}><FileText size={14} /></Button>
                      : <span className="self-center text-[11px] text-amber-700">No file</span>}
                    <Button size="sm" variant="ghost" aria-label="Revision history" onClick={async () => setHistory(await psFetch<PsiDocument>(`/api/psi/documents/${d.id}`))}><History size={14} /></Button>
                    {canManage && d.status === "CURRENT" && d.docType !== "SDS" && (
                      <Button size="sm" variant="outline" onClick={() => setDlg({ open: true, base: d })}>New revision</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !error && <EmptyRow text="No PSI documents match this filter." />}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">SDS revisions are uploaded from the chemical register, against the chemical they describe.</p>

      <HistoryDialog doc={history} onOpenChange={(v) => !v && setHistory(null)} />
      <RegisterDialog state={dlg} onOpenChange={(v) => setDlg({ open: v, base: v ? dlg.base : null })} plants={plants}
        defaultPlantId={plantParam(plant) ?? plants[0]?.id ?? ""} meta={meta} units={units} onDone={() => { setDlg({ open: false, base: null }); load(); }} />
    </div>
  );
}

function HistoryDialog({ doc, onOpenChange }: { doc: PsiDocument | null; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={!!doc} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{doc?.docNo}: revision history</DialogTitle></DialogHeader>
        <Table className="text-sm">
          <TableHeader><TableRow><TableHead>Rev.</TableHead><TableHead>Title</TableHead><TableHead>Status</TableHead><TableHead>Registered</TableHead><TableHead>File</TableHead></TableRow></TableHeader>
          <TableBody>
            {(doc?.history ?? []).map((h) => (
              <TableRow key={h.id}>
                <TableCell className="font-medium">{h.revision}</TableCell>
                <TableCell className="text-xs">{h.title}</TableCell>
                <TableCell><Tag code={h.status} /></TableCell>
                <TableCell className="text-xs">{fmtDate(h.createdAt)}{h.createdByName ? ` · ${h.createdByName}` : ""}</TableCell>
                <TableCell>
                  {h.hasFile
                    ? <Button size="sm" variant="ghost" onClick={() => openPsiFile(h.id)}><FileText size={14} className="mr-1" /> {h.fileName}</Button>
                    : <span className="text-[11px] text-slate-400">No file</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

function RegisterDialog({ state, onOpenChange, plants, defaultPlantId, meta, units, onDone }: {
  state: { open: boolean; base: PsiDocument | null }; onOpenChange: (v: boolean) => void; plants: PlantOption[];
  defaultPlantId: string; meta: PsiMeta | null; units: string[]; onDone: () => void;
}) {
  const { toast } = useToast();
  const base = state.base;
  const [plantId, setPlantId] = useState(defaultPlantId);
  const [docType, setDocType] = useState("PID");
  const [docNo, setDocNo] = useState("");
  const [revision, setRevision] = useState("");
  const [title, setTitle] = useState("");
  const [unitSel, setUnitSel] = useState(NO_UNIT);
  const [newUnit, setNewUnit] = useState("");
  const [description, setDescription] = useState("");
  const [issued, setIssued] = useState("");
  const [reviewDue, setReviewDue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.open) return;
    setPlantId(base?.plantId ?? defaultPlantId);
    setDocType(base?.docType ?? "PID");
    setDocNo(base?.docNo ?? "");
    setRevision("");
    setTitle(base?.title ?? "");
    setUnitSel(base?.unitArea ?? NO_UNIT);
    setNewUnit("");
    setDescription(base?.description ?? "");
    setIssued("");
    setReviewDue("");
    setFile(null);
    setError(null);
  }, [state.open, base, defaultPlantId]);

  const unitValue = unitSel === NEW_UNIT ? newUnit.trim() : unitSel === NO_UNIT ? null : unitSel;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const doc = await psFetch<PsiDocument>("/api/psi/documents", {
        method: "POST",
        json: {
          plantId, docType, docNo: docNo.trim(), revision: revision.trim(), title: title.trim(), unitArea: unitValue,
          description: description || null, issuedDate: dateInputToIso(issued), reviewDue: dateInputToIso(reviewDue),
        },
      });
      if (file) await uploadPsiFile(doc.id, file);
      toast({ title: base ? "New revision registered" : "Document registered", variant: "success" });
      onDone();
    } catch (e: any) {
      setError(e?.message ?? "Could not register the document");
    } finally {
      setBusy(false);
    }
  }

  const types = (meta?.docTypes ?? []).filter((t) => t !== "SDS");
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{base ? `New revision of ${base.docNo} (now rev ${base.revision})` : "Register PSI document"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Plant" required><PlantSelect plants={plants} value={plantId} onChange={setPlantId} allowAll={false} className="w-full" /></Field>
          <Field label="Document type" required>
            <Select value={docType} onValueChange={setDocType} disabled={!!base} className="w-full">
              {types.map((t) => <SelectItem key={t} value={t}>{meta?.docTypeLabels[t] ?? label(t)}</SelectItem>)}
            </Select>
          </Field>
          <Field label="Document no." required><Input value={docNo} disabled={!!base} onChange={(e) => setDocNo(e.target.value)} placeholder="e.g. CAPL2-PID-001" /></Field>
          <Field label="Revision" required><Input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="e.g. B" /></Field>
          <div className="md:col-span-2"><Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field></div>
          <Field label="Unit / area">
            <Select value={unitSel} onValueChange={setUnitSel} className="w-full">
              <SelectItem value={NO_UNIT}>Not unit-specific</SelectItem>
              {units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              <SelectItem value={NEW_UNIT}>New unit / area…</SelectItem>
            </Select>
          </Field>
          {unitSel === NEW_UNIT
            ? <Field label="New unit / area" required><Input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="e.g. CAPL-2 Pickling" /></Field>
            : <div />}
          <Field label="Issue date"><Input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} /></Field>
          <Field label="Next review due"><Input type="date" value={reviewDue} onChange={(e) => setReviewDue(e.target.value)} /></Field>
          <div className="md:col-span-2"><Field label="Description / change note"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field></div>
          <div className="md:col-span-2">
            <Field label="File" hint="PDF, image, Office or DWG/DXF, up to 50 MB. A revision's file cannot be replaced; register a new revision instead.">
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload size={13} className="mr-1" /> Choose file</Button>
                <span className="truncate text-xs text-slate-600">{file?.name ?? "No file chosen"}</span>
                <Input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.docx,.xlsx,.doc,.xls,.dwg,.dxf,.csv,.txt" className="hidden"
                  onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              </div>
            </Field>
          </div>
          {base && <p className="md:col-span-2 text-xs text-slate-500">Rev {base.revision} becomes Superseded and stays in the history.</p>}
          <div className="md:col-span-2"><ErrorBox error={error} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !plantId || !docNo.trim() || !revision.trim() || title.trim().length < 2 || (unitSel === NEW_UNIT && !newUnit.trim())} onClick={save}>
            {busy ? "Saving…" : "Register"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompletenessView({ plant }: { plant: string }) {
  const [data, setData] = useState<Completeness | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    psFetch<Completeness>(`/api/psi/completeness${qs({ plantId: plantParam(plant) })}`)
      .then((r) => { setData(r); setError(null); })
      .catch((e) => setError(e?.message ?? "Could not load completeness"));
  }, [plant]);
  return (
    <div className="mt-3 space-y-4">
      <ErrorBox error={error} />
      <p className="text-xs text-slate-500">
        Which required process safety information each unit / area holds as a current revision. Units appear here once one of their documents is registered.
      </p>
      {(data?.plants ?? []).map((p) => (
        <Card key={p.plantId}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{p.plantName ?? p.plantId} · overall {p.overallPercent}%</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className="min-w-[1000px] text-xs">
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Unit / area</TableHead>
                  {(data?.requiredDocTypes ?? []).map((t) => <TableHead key={t.docType} className="text-center">{t.label}</TableHead>)}
                  <TableHead className="text-right">Complete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.units.map((u) => (
                  <TableRow key={u.unitArea}>
                    <TableCell className="font-medium">{u.unitArea}</TableCell>
                    {u.cells.map((c) => (
                      <TableCell key={c.docType} className={cn("text-center", c.present ? (c.reviewOverdue ? "bg-amber-50" : "bg-emerald-50") : "bg-rose-50")}
                        title={c.docs.map((x) => `${x.docNo} rev ${x.revision}`).join(", ")}>
                        {c.present
                          ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} />{c.count > 1 ? c.count : ""}{c.reviewOverdue && <span className="text-amber-700">review</span>}</span>
                          : <XCircle size={13} className="mx-auto text-rose-500" />}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold tabular-nums">{u.present}/{u.required} ({u.percent}%)</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
      {data && data.plants.length === 0 && <EmptyRow text="No PSI documents registered yet." />}
    </div>
  );
}
