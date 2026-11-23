"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, MessageSquareText, Pencil, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { confirmDialog, promptDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  dateToIso, fmtBytes, fmtDate, kbFetch, label, openVersion, qs, uploadVersion,
  type AckReport, type KbDocument, type KbDocumentDetail, type KbMeta, type KbSearchResult, type KbVersion,
} from "@/lib/knowledge-bank/api";
import { DocFormDialog } from "./doc-form";
import { acceptFor, Applicability, EmptyState, ErrorBox, Field, FilePick, StatusBadge } from "./shared";

export function DocDetail({ initial, meta }: { initial: KbDocumentDetail; meta: KbMeta }) {
  const { toast } = useToast();
  const router = useRouter();
  const [d, setD] = useState<KbDocumentDetail>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [obsoleteOpen, setObsoleteOpen] = useState(false);

  async function act(path: string, json: unknown, msg: string, method = "POST") {
    setBusy(true);
    setError(null);
    try {
      const r = await kbFetch<KbDocumentDetail>(`/api/kb/documents/${d.id}${path}`, { method, json });
      setD(r);
      toast({ title: msg, variant: "success" });
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const pending = d.pendingVersion;
  const p = d.permissions;
  const canAck = d.status === "PUBLISHED" && d.ackRequired && !!d.currentVersionId;

  return (
    <div className="space-y-4">
      {d.status === "OBSOLETE" && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">OBSOLETE: do not use this document for work.</div>
            <div>Withdrawn {fmtDate(d.obsoletedAt)}{d.obsoleteReason ? `: ${d.obsoleteReason}` : ""}.</div>
            {d.supersededBy && (
              <div className="mt-1">
                Replaced by{" "}
                <Button asChild variant="link" className="h-auto p-0 text-rose-900 underline">
                  <Link href={`/knowledge-bank/${d.supersededBy.id}`}>{d.supersededBy.docNo} · {d.supersededBy.title}</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      {d.status !== "PUBLISHED" && d.status !== "OBSOLETE" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Not yet published. Only knowledge-bank managers can see this document.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={d.status} />
        {d.reviewState && <StatusBadge status={d.reviewState} />}
        <Applicability doc={d} />
        <span className="text-xs text-slate-500">· {d.viewCount} views</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/knowledge-bank/ask?doc=${d.id}`}><MessageSquareText size={14} /> Ask about this document</Link>
          </Button>
          {p.manage && d.status !== "OBSOLETE" && (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil size={14} /> Edit details</Button>
          )}
          {p.manage && d.status !== "OBSOLETE" && pending?.status !== "UNDER_REVIEW" && (
            <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload size={14} /> {d.currentVersionId || pending ? "Upload new version" : "Upload file"}
            </Button>
          )}
          {p.manage && pending?.status === "DRAFT" && (
            <Button size="sm" disabled={busy} onClick={() => act("/submit", undefined, "Submitted for review")}>Submit for review</Button>
          )}
          {p.approve && pending?.status === "UNDER_REVIEW" && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
                const note = await promptDialog({ title: "Send back for changes", description: "Tell the author what to change.", placeholder: "Reason", confirmLabel: "Send back" });
                if (note && note.trim().length >= 3) await act("/reject", { note: note.trim() }, "Sent back to draft");
              }}>Send back</Button>
              <Button size="sm" variant="success" disabled={busy} onClick={() => setPublishOpen(true)}>Publish v{pending.versionNo}</Button>
            </>
          )}
          {p.manage && d.status === "PUBLISHED" && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
                if (await confirmDialog({ title: "Mark as reviewed?", description: "Confirms the document is still valid without a new version. The review clock restarts.", confirmLabel: "Mark reviewed" }))
                  await act("/mark-reviewed", {}, "Marked as reviewed");
              }}>Mark reviewed</Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => setObsoleteOpen(true)}>Make obsolete</Button>
            </>
          )}
          {p.manage && !d.currentVersionId && d.status !== "OBSOLETE" && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
              if (!(await confirmDialog({ title: "Delete this draft?", description: `${d.docNo} has never been published. It will be removed.`, confirmLabel: "Delete", destructive: true }))) return;
              try {
                await kbFetch(`/api/kb/documents/${d.id}`, { method: "DELETE" });
                router.push("/knowledge-bank/manage");
              } catch (e: any) {
                setError(e?.message ?? "Could not delete");
              }
            }}>Delete draft</Button>
          )}
        </div>
      </div>
      <ErrorBox error={error} />

      {canAck && d.appliesToMe && (
        <AckBanner doc={d} busy={busy} onAck={() => act("/acknowledge", undefined, "Thank you. Acknowledgement recorded.")} />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Viewer doc={d} />
          {pending && (p.manage || p.approve) && <PendingCard doc={d} version={pending} />}
        </div>
        <div className="space-y-4">
          <MetaCard doc={d} />
          <VersionsCard doc={d} />
        </div>
      </div>

      {p.viewAckReport && d.currentVersionId && <AckReportCard doc={d} meta={meta} />}

      <DocFormDialog open={editOpen} onOpenChange={setEditOpen} meta={meta} doc={d} onSaved={(r) => { setD(r); toast({ title: "Details saved", variant: "success" }); }} />
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} doc={d} meta={meta} onSaved={(r) => { setD(r); toast({ title: "New version uploaded as a draft", variant: "success" }); }} />
      <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} doc={d} busy={busy}
        onSubmit={async (body) => { if (await act("/publish", body, "Published")) setPublishOpen(false); }} />
      <ObsoleteDialog open={obsoleteOpen} onOpenChange={setObsoleteOpen} doc={d} busy={busy}
        onSubmit={async (body) => { if (await act("/obsolete", body, "Marked obsolete")) setObsoleteOpen(false); }} />
    </div>
  );
}

function AckBanner({ doc, busy, onAck }: { doc: KbDocumentDetail; busy: boolean; onAck: () => void }) {
  if (doc.myAcknowledgement) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <CheckCircle2 size={18} /> You acknowledged v{doc.currentVersion?.versionNo} on {fmtDate(doc.myAcknowledgement.acknowledgedAt, true)}.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
      <div className="flex-1">
        <div className="font-semibold">Read acknowledgement requested</div>
        <div className="text-xs">Read version {doc.currentVersion?.versionNo} of this document, then confirm below.</div>
      </div>
      <Button disabled={busy} onClick={onAck}><CheckCircle2 size={16} /> I have read and understood this document</Button>
    </div>
  );
}

function Viewer({ doc }: { doc: KbDocumentDetail }) {
  const v = doc.currentVersion;
  const vid = v?.id;
  const viewable = !!v?.viewable;
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keyed on the version id, not the object: every action returns a fresh
  // detail payload, and re-minting the signed URL each time reloads the viewer.
  useEffect(() => {
    setUrl(null);
    setError(null);
    if (!vid || !viewable) return;
    kbFetch<{ url: string }>(`/api/kb/documents/${doc.id}/versions/${vid}/url`)
      .then((r) => setUrl(r.url))
      .catch((e) => setError(e?.message ?? "Could not load the file"));
  }, [doc.id, vid, viewable]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm">{v ? `${v.fileName} · v${v.versionNo}` : "Document"}</CardTitle>
        {v && (
          <div className="flex gap-2">
            {url && (
              <Button size="sm" variant="ghost" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
                <ExternalLink size={14} /> Open in new tab
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => openVersion(doc.id, v.id, true).catch((e) => setError(e?.message))}>
              <Download size={14} /> Download
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!v ? (
          <EmptyState text={doc.pendingVersion ? "Not published yet. The pending file is listed below." : "No file uploaded yet."} />
        ) : error ? (
          <ErrorBox error={error} />
        ) : !v.viewable ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
            {label(v.mimeType.split(".").pop() ?? "file")} files cannot be previewed in the browser. Use Download to open it.
          </div>
        ) : !url ? (
          <div className="h-[60vh] animate-pulse rounded-lg bg-slate-100" />
        ) : v.mimeType.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={doc.title} className="mx-auto max-h-[75vh] rounded-lg border border-slate-200" />
        ) : (
          <iframe title={doc.title} src={url} className="h-[75vh] w-full rounded-lg border border-slate-200 bg-white" />
        )}
      </CardContent>
    </Card>
  );
}

function MetaCard({ doc }: { doc: KbDocumentDetail }) {
  const rows: [string, React.ReactNode][] = [
    ["Document no.", <span key="n" className="font-mono">{doc.docNo}</span>],
    ["Category", doc.categoryName ?? "—"],
    ["Type", label(doc.docType)],
    ["Standard / reference", doc.standardRef ?? "—"],
    ["Department", doc.department ?? "All departments"],
    ["Applies to", doc.companyWide ? "Company-wide" : doc.plantName ?? "—"],
    ["Owner", doc.ownerName ?? "—"],
    ["Effective from", fmtDate(doc.effectiveDate)],
    ["Next review", fmtDate(doc.reviewDueDate)],
    ["Last reviewed", doc.lastReviewedAt ? `${fmtDate(doc.lastReviewedAt)} · ${doc.lastReviewedByName ?? ""}` : "—"],
    ["Read acknowledgement", doc.ackRequired ? (doc.audienceRoles.length ? `Yes · ${doc.audienceRoles.map(label).join(", ")}` : "Yes · everyone it applies to") : "No"],
  ];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Details</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {doc.summary && <p className="whitespace-pre-line text-slate-700">{doc.summary}</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
        {doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {doc.tags.map((t) => (
              <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{t}</span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VersionsCard({ doc }: { doc: KbDocumentDetail }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Version history</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {doc.versions.length === 0 && <EmptyState text="No versions yet." />}
        {doc.versions.map((v) => (
          <div key={v.id} className="rounded-lg border border-slate-200 p-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">v{v.versionNo}</span>
              <StatusBadge status={v.status} />
              {v.id === doc.currentVersionId && <span className="text-[11px] text-emerald-700">current</span>}
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openVersion(doc.id, v.id, false).catch((e) => setError(e?.message))}>Open</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openVersion(doc.id, v.id, true).catch((e) => setError(e?.message))}><Download size={12} /></Button>
              </div>
            </div>
            <div className="mt-1 text-slate-600">{v.fileName} · {fmtBytes(v.sizeBytes)}</div>
            {v.changeNote && <div className="text-slate-700">“{v.changeNote}”</div>}
            <div className="text-slate-500">
              Uploaded {fmtDate(v.uploadedAt)}{v.uploadedByName ? ` by ${v.uploadedByName}` : ""}
              {v.publishedAt ? ` · published ${fmtDate(v.publishedAt)}${v.publishedByName ? ` by ${v.publishedByName}` : ""}` : ""}
            </div>
            {v.status === "SUPERSEDED" && <div className="text-[11px] text-amber-700">Superseded: for reference only.</div>}
            {v.extractionStatus !== "OK" && v.extractionStatus !== "SKIPPED" && (
              <div className="text-[11px] text-slate-500">Text could not be read from this file ({label(v.extractionStatus)}); it will not appear in search or Q&amp;A.</div>
            )}
          </div>
        ))}
        <ErrorBox error={error} />
      </CardContent>
    </Card>
  );
}

function PendingCard({ doc, version }: { doc: KbDocumentDetail; version: KbVersion }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pending version v{version.versionNo} · {label(version.status)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="text-slate-700">{version.fileName} · {fmtBytes(version.sizeBytes)} · uploaded {fmtDate(version.uploadedAt)}{version.uploadedByName ? ` by ${version.uploadedByName}` : ""}</div>
        {version.changeNote && <div className="text-slate-700">Change: {version.changeNote}</div>}
        {version.reviewNote && version.status === "DRAFT" && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">Sent back: {version.reviewNote}</div>
        )}
        {version.submittedAt && version.status === "UNDER_REVIEW" && (
          <div className="text-xs text-slate-500">Submitted {fmtDate(version.submittedAt, true)}{version.submittedByName ? ` by ${version.submittedByName}` : ""}</div>
        )}
        {doc.currentVersionId && <div className="text-xs text-slate-500">Readers keep seeing v{doc.currentVersion?.versionNo} until this version is published.</div>}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => openVersion(doc.id, version.id, false).catch((e) => setError(e?.message))}>Open pending file</Button>
        </div>
        <ErrorBox error={error} />
      </CardContent>
    </Card>
  );
}

function UploadDialog({
  open, onOpenChange, doc, meta, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; doc: KbDocumentDetail; meta: KbMeta; onSaved: (d: KbDocumentDetail) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setFile(null);
      setNote("");
      setError(null);
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Upload a new version of {doc.docNo}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          {doc.pendingVersion?.status === "DRAFT" && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              This replaces the unsubmitted draft v{doc.pendingVersion.versionNo} ({doc.pendingVersion.fileName}).
            </p>
          )}
          <FilePick accept={acceptFor(meta.allowedExtensions)} file={file} onFile={setFile} maxBytes={meta.maxFileBytes} disabled={busy} />
          <Field label="What changed" hint={doc.ackRequired && doc.currentVersionId ? "Publishing a new version asks everyone to acknowledge it again." : undefined}>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added gas test step before hot work in confined spaces" />
          </Field>
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button disabled={!file || busy} onClick={async () => {
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              onSaved(await uploadVersion(doc.id, file, note.trim() || undefined));
              onOpenChange(false);
            } catch (e: any) {
              setError(e?.message ?? "Upload failed");
            } finally {
              setBusy(false);
            }
          }}>{busy ? "Uploading…" : "Upload as draft"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PublishDialog({
  open, onOpenChange, doc, busy, onSubmit,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; doc: KbDocumentDetail; busy: boolean;
  onSubmit: (body: { effectiveDate?: string; reviewDueDate?: string; note?: string }) => void;
}) {
  const [effective, setEffective] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setEffective("");
      setDue("");
      setNote("");
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Publish v{doc.pendingVersion?.versionNo} of {doc.docNo}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <p className="text-sm text-slate-600">
            Publishing makes this version the controlled copy everyone reads{doc.currentVersionId ? ` and supersedes v${doc.currentVersion?.versionNo}` : ""}.
            {doc.ackRequired ? " Readers will be asked to acknowledge it." : ""}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Effective from" hint="Defaults to today">
              <Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
            </Field>
            <Field label="Next review due" hint={`Defaults to ${doc.reviewIntervalMonths} months after effective`}>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
          </div>
          <Field label="Approval note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="success" disabled={busy} onClick={() => onSubmit({
            ...(effective ? { effectiveDate: dateToIso(effective) } : {}),
            ...(due ? { reviewDueDate: dateToIso(due) } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          })}>{busy ? "Publishing…" : "Publish"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NO_SUCCESSOR = "";

function ObsoleteDialog({
  open, onOpenChange, doc, busy, onSubmit,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; doc: KbDocumentDetail; busy: boolean;
  onSubmit: (body: { reason: string; supersededByDocId: string | null }) => void;
}) {
  const [reason, setReason] = useState("");
  const [successor, setSuccessor] = useState(NO_SUCCESSOR);
  const [options, setOptions] = useState<KbDocument[]>([]);
  useEffect(() => {
    if (!open) return;
    setReason("");
    setSuccessor(NO_SUCCESSOR);
    kbFetch<KbSearchResult>(`/api/kb/documents${qs({ sort: "docNo", limit: 200 })}`)
      .then((r) => setOptions(r.items.filter((x) => x.id !== doc.id)))
      .catch(() => setOptions([]));
  }, [open, doc.id]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Make {doc.docNo} obsolete</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <p className="text-sm text-slate-600">It stays readable with an OBSOLETE banner, and drops out of default search and Q&amp;A.</p>
          <Field label="Reason" required>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Replaced by the revised corporate standard" />
          </Field>
          <Field label="Replaced by">
            <Select value={successor} onValueChange={setSuccessor}>
              <SelectItem value={NO_SUCCESSOR}>No replacement</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.docNo} · {o.title}</SelectItem>
              ))}
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" disabled={busy || reason.trim().length < 3}
            onClick={() => onSubmit({ reason: reason.trim(), supersededByDocId: successor || null })}>
            {busy ? "Saving…" : "Make obsolete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ALL = "";

function AckReportCard({ doc, meta }: { doc: KbDocumentDetail; meta: KbMeta }) {
  const [rep, setRep] = useState<AckReport | null>(null);
  const [state, setState] = useState("pending");
  const [plant, setPlant] = useState(ALL);
  const [dept, setDept] = useState(ALL);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRep(await kbFetch<AckReport>(`/api/kb/documents/${doc.id}/acknowledgements${qs({ state, plantId: plant, department: dept })}`));
    } catch (e: any) {
      setError(e?.message ?? "Could not load the report");
    }
  }, [doc.id, state, plant, dept]);

  useEffect(() => {
    void load();
  }, [load, doc.currentVersionId]);

  const plantChoices = meta.caps.staffPlantIds === null ? meta.plants : meta.plants.filter((p) => meta.caps.staffPlantIds?.includes(p.id));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Read acknowledgements · v{rep?.versionNo ?? doc.currentVersion?.versionNo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!doc.ackRequired && (
          <p className="text-xs text-slate-500">This document does not ask for acknowledgement; the figures show anyone who acknowledged anyway.</p>
        )}
        <ErrorBox error={error} />
        {rep && (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="In audience" value={rep.summary.audience} />
              <Stat label="Acknowledged" value={rep.summary.acknowledged} tone="text-emerald-700" />
              <Stat label="Pending" value={rep.summary.pending} tone="text-amber-700" />
              <Stat label="Coverage" value={rep.summary.percent === null ? "—" : `${rep.summary.percent}%`} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Breakdown title="By plant" rows={rep.byPlant.map((r) => ({ k: r.plantName, total: r.total, done: r.acknowledged }))} />
              <Breakdown title="By department" rows={rep.byDepartment.map((r) => ({ k: r.department, total: r.total, done: r.acknowledged }))} />
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Select value={state} onValueChange={setState} className="h-9 w-44" aria-label="Status">
            <SelectItem value="pending">Not yet acknowledged</SelectItem>
            <SelectItem value="done">Acknowledged</SelectItem>
            <SelectItem value="all">Everyone</SelectItem>
          </Select>
          <Select value={plant} onValueChange={setPlant} className="h-9 w-48" aria-label="Plant">
            <SelectItem value={ALL}>All plants in my scope</SelectItem>
            {plantChoices.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </Select>
          <Select value={dept} onValueChange={setDept} className="h-9 w-48" aria-label="Department">
            <SelectItem value={ALL}>All departments</SelectItem>
            {meta.departments.map((x) => (
              <SelectItem key={x} value={x}>{x}</SelectItem>
            ))}
          </Select>
        </div>
        {rep && (
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
            <Table className="text-sm">
              <TableHeader className="bg-slate-50">
                <TableRow><TableHead>Name</TableHead><TableHead>Plant</TableHead><TableHead>Department</TableHead><TableHead>Role</TableHead><TableHead>Acknowledged</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {rep.rows.map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-xs">{r.plantName ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.department ?? "—"}</TableCell>
                    <TableCell className="text-xs">{label(r.role)}</TableCell>
                    <TableCell className="text-xs">{r.acknowledged ? fmtDate(r.acknowledgedAt, true) : <span className="text-amber-700">Pending</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rep.rows.length === 0 && <EmptyState text="Nobody in this view." />}
          </div>
        )}
        {rep?.truncated && <p className="text-[11px] text-slate-500">Showing the first 2,000 people. Narrow by plant or department.</p>}
      </CardContent>
    </Card>
  );
}

function Stat({ label: l, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="text-[11px] text-slate-500">{l}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { k: string; total: number; done: number }[] }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="mb-1 text-xs font-medium text-slate-700">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => {
          const pct = r.total ? Math.round((100 * r.done) / r.total) : 0;
          return (
            <div key={r.k} className="text-xs">
              <div className="flex justify-between"><span>{r.k}</span><span className="tabular-nums text-slate-600">{r.done}/{r.total}</span></div>
              <div className="h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
        {rows.length === 0 && <div className="text-xs text-slate-400">—</div>}
      </div>
    </div>
  );
}
