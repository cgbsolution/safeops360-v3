"use client";

// Contractor document upload (licences, insurance, certificates) with the
// document number and the dates the expiry list runs on. The file picker
// follows EvidenceAttachment: a hidden shadcn Input driven by a Button.
// Endpoints are injected so the same dialog serves HSE (/api/csm/documents)
// and the contractor link (/api/csm-portal/{token}/documents).

import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { dateToIso, DOC_ACCEPT, DOC_MAX_BYTES, label, putToStorage, type SignedUpload } from "@/lib/csm/api";
import { ErrorBox, Field } from "./shared";

export type DocumentMeta = {
  docType: string; title: string | null; documentNo: string | null; issuedOn: string | null; expiresOn: string | null;
  questionCode: string | null; fileName: string; storagePath: string; mimeType: string; fileSize: number;
};

export function DocumentUploadDialog({
  open, onOpenChange, docTypes, docType: initialType, questionCode = null, heading = "Upload document",
  getUploadUrl, record, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  docTypes: string[];
  docType?: string | null;
  questionCode?: string | null;
  heading?: string;
  getUploadUrl: (file: File) => Promise<SignedUpload>;
  record: (meta: DocumentMeta) => Promise<void>;
  onDone?: () => void;
}) {
  const [docType, setDocType] = useState(initialType ?? docTypes[0] ?? "OTHER");
  const [title, setTitle] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDocType(initialType ?? docTypes[0] ?? "OTHER");
      setTitle(""); setDocumentNo(""); setIssuedOn(""); setExpiresOn(""); setFile(null); setError(null);
    }
  }, [open, initialType, docTypes]);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!DOC_ACCEPT.split(",").includes(f.type)) {
      setError("Choose a PDF or a photo (JPG, PNG, WEBP, HEIC).");
      return;
    }
    if (f.size > DOC_MAX_BYTES) {
      setError("That file is larger than 10 MB.");
      return;
    }
    setError(null);
    setFile(f);
  }

  async function save() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const sig = await getUploadUrl(file);
      await putToStorage(sig, file);
      await record({
        docType, title: title.trim() || null, documentNo: documentNo.trim() || null, issuedOn: dateToIso(issuedOn),
        expiresOn: dateToIso(expiresOn), questionCode, fileName: file.name, storagePath: sig.storagePath,
        mimeType: file.type, fileSize: file.size,
      });
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>PDF or photo, up to 10 MB. Give the expiry date if the document has one: it drives the renewal reminders.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Document type" required>
            <Select value={docType} onValueChange={setDocType} className="w-full" disabled={!!initialType}>
              {docTypes.map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Labour licence 2026" /></Field>
            <Field label="Document / policy no."><Input value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} /></Field>
            <Field label="Issued on"><Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} /></Field>
            <Field label="Valid until"><Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} /></Field>
          </div>
          <Field label="File" required>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload size={13} /> Choose file
              </Button>
              <span className="flex min-w-0 items-center gap-1 truncate text-xs text-slate-600">
                {file ? <><Paperclip size={12} /> {file.name}</> : "No file chosen"}
              </span>
              <Input
                ref={fileRef} type="file" accept={DOC_ACCEPT} className="hidden"
                onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }}
              />
            </div>
          </Field>
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !file}>
            {busy ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
