"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UserPicker } from "@/components/ui/user-picker";
import {
  categoryOptions, dateToIso, isoToDate, kbFetch, label, uploadVersion,
  type KbDocumentDetail, type KbMeta,
} from "@/lib/knowledge-bank/api";
import { acceptFor, ErrorBox, Field, FilePick } from "./shared";

const COMPANY = "__company__";
const NONE = "";
const INTERVALS = [6, 12, 24, 36, 60];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meta: KbMeta;
  /** Edit mode when given. */
  doc?: KbDocumentDetail;
  onSaved: (d: KbDocumentDetail) => void;
};

/** Create a document (optionally with its first file) or edit its details. */
export function DocFormDialog({ open, onOpenChange, meta, doc, onSaved }: Props) {
  const editing = !!doc;
  const plantChoices = useMemo(() => {
    const ids = meta.caps.staffPlantIds;
    return ids === null ? meta.plants : meta.plants.filter((p) => ids.includes(p.id));
  }, [meta]);
  const canCompanyWide = meta.caps.manageAllPlants;

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [docType, setDocType] = useState("SOP");
  const [standardRef, setStandardRef] = useState("");
  const [department, setDepartment] = useState(NONE);
  const [plant, setPlant] = useState(COMPANY);
  const [owner, setOwner] = useState<string | null>(null);
  const [tags, setTags] = useState("");
  const [ackRequired, setAckRequired] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [interval, setInterval] = useState("24");
  const [reviewDue, setReviewDue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFile(null);
    setChangeNote("");
    setTitle(doc?.title ?? "");
    setSummary(doc?.summary ?? "");
    setCategoryId(doc?.categoryId ?? "");
    setDocType(doc?.docType ?? "SOP");
    setStandardRef(doc?.standardRef ?? "");
    setDepartment(doc?.department ?? NONE);
    setPlant(doc ? doc.plantId ?? COMPANY : canCompanyWide ? COMPANY : plantChoices[0]?.id ?? COMPANY);
    setOwner(doc?.ownerUserId ?? null);
    setTags((doc?.tags ?? []).join(", "));
    setAckRequired(doc?.ackRequired ?? false);
    setRoles(doc?.audienceRoles ?? []);
    setInterval(String(doc?.reviewIntervalMonths ?? 24));
    setReviewDue(isoToDate(doc?.reviewDueDate));
  }, [open, doc, canCompanyWide, plantChoices]);

  const departments = useMemo(
    () => (department && !meta.departments.includes(department) ? [department, ...meta.departments] : meta.departments),
    [meta.departments, department]
  );

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(), summary: summary.trim() || null, categoryId, docType,
        standardRef: standardRef.trim() || null, department: department || null,
        plantId: plant === COMPANY ? null : plant, ownerUserId: owner,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        ackRequired, audienceRoles: ackRequired ? roles : [], reviewIntervalMonths: Number(interval),
      };
      let saved: KbDocumentDetail;
      if (editing) {
        if (reviewDue && reviewDue !== isoToDate(doc!.reviewDueDate)) body.reviewDueDate = dateToIso(reviewDue);
        saved = await kbFetch<KbDocumentDetail>(`/api/kb/documents/${doc!.id}`, { method: "PATCH", json: body });
      } else {
        saved = await kbFetch<KbDocumentDetail>("/api/kb/documents", { method: "POST", json: body });
        if (file) {
          try {
            saved = await uploadVersion(saved.id, file, changeNote.trim() || undefined);
          } catch (e: any) {
            // The draft exists; say so rather than lose it. The file can be added from the document page.
            onSaved(saved);
            setError(`Document ${saved.docNo} was created, but the file upload failed: ${e?.message ?? "unknown error"}. Add the file from the document page.`);
            return;
          }
        }
      }
      onSaved(saved);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Could not save the document");
    } finally {
      setBusy(false);
    }
  }

  const valid = title.trim().length >= 3 && !!categoryId && !!docType && (plant !== COMPANY || canCompanyWide || editing);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${doc!.docNo}` : "New knowledge-bank document"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Hot work permit procedure" />
          </Field>
          <Field label="Summary" hint="Two or three lines on what the document covers. Shown in search results.">
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Category" required>
              <Select value={categoryId} onValueChange={setCategoryId} placeholder="Pick a category">
                {categoryOptions(meta.categories).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </Select>
            </Field>
            <Field label="Document type" required hint={editing ? "The document number keeps its original prefix." : undefined}>
              <Select value={docType} onValueChange={setDocType}>
                {meta.docTypes.map((t) => (
                  <SelectItem key={t} value={t}>{label(t)}</SelectItem>
                ))}
              </Select>
            </Field>
            <Field label="Standard / legal reference" hint={`e.g. IS 3786, OISD-STD-105, ISO 45001 cl. 8.1, Factories Act s.41. Families: ${meta.standardFamilies.slice(0, 5).join(", ")}…`}>
              <Input value={standardRef} onChange={(e) => setStandardRef(e.target.value)} placeholder="Reference number" />
            </Field>
            <Field label="Department">
              <Select value={department} onValueChange={setDepartment}>
                <SelectItem value={NONE}>All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </Select>
            </Field>
            <Field label="Applies to" required hint="Who may read is not affected: everyone in the company can read every published document.">
              <Select value={plant} onValueChange={setPlant}>
                {(canCompanyWide || (editing && doc!.plantId === null)) && <SelectItem value={COMPANY}>Company-wide (all plants)</SelectItem>}
                {plantChoices.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </Select>
            </Field>
            <Field label="Document owner" hint="Defaults to you.">
              <UserPicker value={owner} onChange={(id) => setOwner(id)} />
            </Field>
            <Field label="Tags" hint="Comma separated, e.g. hot work, PTW, welding">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
            <Field label="Periodic review every">
              <Select value={interval} onValueChange={setInterval}>
                {INTERVALS.map((m) => (
                  <SelectItem key={m} value={String(m)}>{m} months</SelectItem>
                ))}
              </Select>
            </Field>
            {editing && doc!.status === "PUBLISHED" && (
              <Field label="Next review due">
                <Input type="date" value={reviewDue} onChange={(e) => setReviewDue(e.target.value)} />
              </Field>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <Label className="flex items-center gap-2 text-sm text-slate-800">
              <Checkbox checked={ackRequired} onCheckedChange={(v) => setAckRequired(v === true)} />
              Ask readers to acknowledge they have read it
            </Label>
            {ackRequired && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-500">
                  Audience (who is asked to acknowledge). Leave all unticked for everyone the document applies to.
                </p>
                <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto md:grid-cols-3">
                  {meta.roles.map((r) => (
                    <Label key={r.code} className="flex items-center gap-2 text-xs text-slate-700">
                      <Checkbox
                        checked={roles.includes(r.code)}
                        onCheckedChange={(v) => setRoles((cur) => (v === true ? [...cur, r.code] : cur.filter((x) => x !== r.code)))}
                      />
                      {r.name}
                    </Label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!editing && (
            <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3">
              <Field label="File (first version)" hint="Optional now; you can upload it from the document page.">
                <FilePick accept={acceptFor(meta.allowedExtensions)} file={file} onFile={setFile} maxBytes={meta.maxFileBytes} disabled={busy} />
              </Field>
              {file && (
                <Field label="Version note">
                  <Input value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="e.g. First issue" />
                </Field>
              )}
            </div>
          )}
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !valid}>{busy ? "Saving…" : editing ? "Save changes" : "Create draft"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
