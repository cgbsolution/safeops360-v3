"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, FlaskConical, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  dateInputToIso, fmtDate, label, openPsiFile, psFetch, qs, uploadPsiFile,
  type Chemical, type ChemicalList, type CompatMatrix, type PlantOption, type PsiDocument, type PsiMeta,
} from "@/lib/pssr-psi/api";
import { CompatMatrixView } from "./compat-matrix";
import { ALL_PLANTS, EmptyRow, ErrorBox, Field, PlantSelect, plantParam, Stat, Tag } from "./shared";

const ANY = "__any__";

export function ChemicalRegister({ plants, meta, defaultPlantId, canManage }: { plants: PlantOption[]; meta: PsiMeta | null; defaultPlantId: string | null; canManage: boolean }) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  const [ghsClass, setGhsClass] = useState(ANY);
  const [signal, setSignal] = useState(ANY);
  const [sds, setSds] = useState(ANY);
  const [storage, setStorage] = useState(ANY);
  const [group, setGroup] = useState(ANY);
  const [overMax, setOverMax] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<ChemicalList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<CompatMatrix | null>(null);
  const [checking, setChecking] = useState(false);
  const [sdsFor, setSdsFor] = useState<Chemical | null>(null);
  const matrixRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await psFetch<ChemicalList>(`/api/psi/chemicals${qs({
        plantId: plantParam(plant), ghsClass: ghsClass === ANY ? undefined : ghsClass, signalWord: signal === ANY ? undefined : signal,
        sds: sds === ANY ? undefined : sds, storageLocation: storage === ANY ? undefined : storage,
        hazardGroup: group === ANY ? undefined : group, overMax, q: q.trim() || undefined,
      })}`);
      setData(r);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load the chemical register");
    }
  }, [plant, ghsClass, signal, sds, storage, group, overMax, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function check() {
    setChecking(true);
    try {
      const m = await psFetch<CompatMatrix>("/api/psi/compatibility", { method: "POST", json: { chemicalIds: picked } });
      setMatrix(m);
      setTimeout(() => matrixRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e: any) {
      setError(e?.message ?? "Compatibility check failed");
    } finally {
      setChecking(false);
    }
  }

  const rows = data?.items ?? [];
  const s = data?.summary;
  const groups = meta?.hazardGroups ?? {};

  return (
    <div className="space-y-4">
      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Stat label="Chemicals" value={data?.registerTotal ?? 0} />
          <Stat label="Signal word Danger" value={s.danger} />
          <Stat label="SDS missing" value={s.sdsMissing} tone={s.sdsMissing ? "bad" : "ok"} />
          <Stat label="SDS expired" value={s.sdsExpired} tone={s.sdsExpired ? "bad" : "ok"} />
          <Stat label="Over max quantity" value={s.overMax} tone={s.overMax ? "bad" : "ok"} />
          <Stat label="No secondary containment" value={s.noContainment} tone={s.noContainment ? "warn" : "ok"} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={ghsClass} onValueChange={setGhsClass} className="h-9 w-52" aria-label="GHS class">
          <SelectItem value={ANY}>All GHS classes</SelectItem>
          {(data?.facets.ghsClasses ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </Select>
        <Select value={group} onValueChange={setGroup} className="h-9 w-52" aria-label="Hazard group">
          <SelectItem value={ANY}>All hazard groups</SelectItem>
          {(data?.facets.hazardGroups ?? []).map((g) => <SelectItem key={g} value={g}>{groups[g] ?? label(g)}</SelectItem>)}
        </Select>
        <Select value={signal} onValueChange={setSignal} className="h-9 w-40" aria-label="Signal word">
          <SelectItem value={ANY}>Any signal word</SelectItem>
          {(meta?.signalWords ?? ["DANGER", "WARNING", "NONE"]).map((w) => <SelectItem key={w} value={w}>{label(w)}</SelectItem>)}
        </Select>
        <Select value={sds} onValueChange={setSds} className="h-9 w-44" aria-label="SDS">
          <SelectItem value={ANY}>Any SDS status</SelectItem>
          <SelectItem value="ATTENTION">SDS needs attention</SelectItem>
          <SelectItem value="MISSING">SDS missing</SelectItem>
          <SelectItem value="EXPIRED">SDS expired</SelectItem>
          <SelectItem value="DUE_SOON">SDS due soon</SelectItem>
          <SelectItem value="CURRENT">SDS current</SelectItem>
        </Select>
        <Select value={storage} onValueChange={setStorage} className="h-9 w-52" aria-label="Storage location">
          <SelectItem value={ANY}>All storage locations</SelectItem>
          {(data?.facets.storageLocations ?? []).map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
        </Select>
        <Label className="flex items-center gap-2 text-xs text-slate-700"><Checkbox checked={overMax} onCheckedChange={(v) => setOverMax(v === true)} /> Over max quantity</Label>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or CAS" className="h-9 w-48" />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <FlaskConical size={15} className="text-slate-500" />
        <span className="text-slate-700">Compatibility checker: tick two or more chemicals.</span>
        <span className="text-xs text-slate-500">{picked.length} selected</span>
        {picked.length > 0 && <Button size="sm" variant="ghost" onClick={() => { setPicked([]); setMatrix(null); }}>Clear</Button>}
        <Button size="sm" className="ml-auto" disabled={picked.length < 2 || checking} onClick={check}>{checking ? "Checking…" : "Check compatibility"}</Button>
      </div>

      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[1100px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-8" /><TableHead>Chemical</TableHead><TableHead>Where</TableHead><TableHead>Signal</TableHead>
              <TableHead>Hazard groups</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead>SDS</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Checkbox checked={picked.includes(c.id)} aria-label={`Select ${c.chemicalName}`}
                    onCheckedChange={(v) => setPicked((p) => (v === true ? [...p, c.id] : p.filter((x) => x !== c.id)))} />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{c.chemicalName}</div>
                  <div className="text-[11px] text-slate-500">{c.casNumber ? `CAS ${c.casNumber}` : "No CAS"}{c.ghsHazardClasses.length ? ` · ${c.ghsHazardClasses.join(", ")}` : ""}</div>
                </TableCell>
                <TableCell className="text-xs">
                  {c.storage ?? "—"}
                  <div className="text-[11px] text-slate-500">
                    {c.facilityName ?? ""}{c.plantName ? ` · ${c.plantName}` : ""}
                    {!c.secondaryContainmentPresent && <span className="text-amber-700"> · no containment</span>}
                  </div>
                </TableCell>
                <TableCell><Tag code={c.ghsSignalWord ?? "NONE"} /></TableCell>
                <TableCell className="max-w-[220px] text-[11px] text-slate-600">{c.hazardGroupLabels.join(", ") || <span className="text-amber-700">Not classified</span>}</TableCell>
                <TableCell className={cn("text-right text-xs tabular-nums", c.overMax && "font-semibold text-rose-700")}>
                  {c.quantityStored ?? 0} {c.unit ?? ""}
                  {c.maxAllowableQty ? <div className="text-[11px] font-normal text-slate-500">max {c.maxAllowableQty} ({c.utilisationPct ?? 0}%)</div> : null}
                </TableCell>
                <TableCell className="text-xs">
                  <Tag code={c.sdsStatus} />
                  {c.sdsDocument && <div className="text-[11px] text-slate-500">{c.sdsDocument.docNo} rev {c.sdsDocument.revision}{c.sdsDocument.reviewDue ? `, review ${fmtDate(c.sdsDocument.reviewDue)}` : ""}</div>}
                  {!c.sdsDocument && c.sdsDocId && <div className="text-[11px] text-slate-500">Ref: {c.sdsDocId}</div>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {c.sdsDocument?.hasFile && (
                      <Button size="sm" variant="ghost" aria-label="Open SDS" onClick={() => openPsiFile(c.sdsDocument!.id)}><FileText size={14} /></Button>
                    )}
                    {canManage && <Button size="sm" variant="outline" onClick={() => setSdsFor(c)}><Upload size={13} className="mr-1" /> SDS</Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !error && (
          <EmptyRow text={data?.registerTotal ? "No chemicals match this filter." : "No chemicals recorded yet. Chemicals are added on the Hazmat tab of each facility profile."} />
        )}
      </div>
      <p className="text-[11px] text-slate-500">
        Chemicals are maintained on the Hazmat tab of each <Link href="/facilities" className="text-primary-700 hover:underline">facility profile</Link>; this register reads them across plants.
      </p>

      {matrix && (
        <div ref={matrixRef}>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Compatibility: worst result <Tag code={matrix.worst ?? "COMPATIBLE"} /></h3>
          <CompatMatrixView m={matrix} />
        </div>
      )}

      <SdsUploadDialog chem={sdsFor} onOpenChange={(v) => !v && setSdsFor(null)} onDone={() => { setSdsFor(null); load(); }} />
    </div>
  );
}

function SdsUploadDialog({ chem, onOpenChange, onDone }: { chem: Chemical | null; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const { toast } = useToast();
  const [docNo, setDocNo] = useState("");
  const [revision, setRevision] = useState("");
  const [issued, setIssued] = useState("");
  const [reviewDue, setReviewDue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!chem) return;
    const slug = (chem.casNumber || chem.chemicalName).replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
    setDocNo(chem.sdsDocument?.docNo ?? `SDS-${slug}`.slice(0, 60));
    setRevision("");
    setIssued("");
    setReviewDue("");
    setFile(null);
    setError(null);
  }, [chem]);

  async function save() {
    if (!chem || !file) return;
    setBusy(true);
    setError(null);
    try {
      const doc = await psFetch<PsiDocument>("/api/psi/documents", {
        method: "POST",
        json: {
          plantId: chem.plantId, docType: "SDS", docNo: docNo.trim(), revision: revision.trim(),
          title: `SDS: ${chem.chemicalName}`, hazardousMaterialId: chem.id,
          issuedDate: dateInputToIso(issued), reviewDue: dateInputToIso(reviewDue),
        },
      });
      await uploadPsiFile(doc.id, file);
      toast({ title: "SDS uploaded", variant: "success" });
      onDone();
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!chem} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Upload SDS: {chem?.chemicalName}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          {chem?.sdsDocument && (
            <p className="text-xs text-slate-600">Current: {chem.sdsDocument.docNo} rev {chem.sdsDocument.revision}. The new revision supersedes it; the old one stays in the history.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="SDS document no." required><Input value={docNo} onChange={(e) => setDocNo(e.target.value)} /></Field>
            <Field label="Revision / version" required><Input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="e.g. 5.1" /></Field>
            <Field label="SDS issue date" hint="Review defaults to 3 years after issue."><Input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} /></Field>
            <Field label="Review due"><Input type="date" value={reviewDue} onChange={(e) => setReviewDue(e.target.value)} /></Field>
          </div>
          <Field label="SDS file" required>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload size={13} className="mr-1" /> Choose file</Button>
              <span className="truncate text-xs text-slate-600">{file?.name ?? "No file chosen"}</span>
              <Input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" className="hidden"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </div>
          </Field>
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !file || !docNo.trim() || !revision.trim()} onClick={save}>{busy ? "Uploading…" : "Upload SDS"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
