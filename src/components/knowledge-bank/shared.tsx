"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Building2, Eye, FileText, Globe2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fmtBytes, fmtDate, label, STATUS_TONE, type KbDocument } from "@/lib/knowledge-bank/api";

const NAV = [
  { href: "/knowledge-bank", label: "Browse & search", exact: true },
  { href: "/knowledge-bank/ask", label: "Ask the knowledge bank" },
  { href: "/knowledge-bank/my-acknowledgements", label: "My acknowledgements" },
];

export function KbNav({ showManage }: { showManage?: boolean }) {
  const path = usePathname() ?? "";
  const items = showManage ? [...NAV, { href: "/knowledge-bank/manage", label: "Manage" }] : NAV;
  return (
    <div className="mb-5 flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
      {items.map((n) => {
        const active = "exact" in n && n.exact ? path === n.href : path.startsWith(n.href);
        return (
          <Button key={n.href} asChild size="sm" variant={active ? "default" : "ghost"}>
            <Link href={n.href}>{n.label}</Link>
          </Button>
        );
      })}
    </div>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return (
    <Badge className={cn("border text-[11px] font-medium", STATUS_TONE[status] ?? "bg-slate-100 text-slate-700 border-slate-200")}>
      {label(status)}
    </Badge>
  );
}

export function Field({ label: text, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-700">
        {text}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>;
}

export function EmptyState({ text }: { text: string }) {
  return <div className="px-3 py-10 text-center text-sm text-slate-400">{text}</div>;
}

export function Applicability({ doc }: { doc: Pick<KbDocument, "companyWide" | "plantName"> }) {
  return doc.companyWide ? (
    <span className="inline-flex items-center gap-1 text-xs text-slate-600"><Globe2 size={12} /> Company-wide</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-slate-600"><Building2 size={12} /> {doc.plantName ?? "Plant"}</span>
  );
}

/** One document in a list: number, title, metadata line, optional snippet. */
export function DocRow({ doc, showStatus, right }: { doc: KbDocument; showStatus?: boolean; right?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0">
      <FileText size={18} className="mt-0.5 shrink-0 text-primary-700" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-slate-500">{doc.docNo}</span>
          <Button asChild variant="link" className="h-auto p-0 text-left text-sm font-semibold text-slate-900">
            <Link href={`/knowledge-bank/${doc.id}`}>{doc.title}</Link>
          </Button>
          {(showStatus || doc.status !== "PUBLISHED") && <StatusBadge status={doc.status} />}
          {doc.reviewState && <StatusBadge status={doc.reviewState} />}
          {doc.ackRequired && <Badge className="border border-sky-200 bg-sky-50 text-[11px] font-medium text-sky-800">Read acknowledgement</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>{doc.categoryName ?? "—"}</span>
          <span>{label(doc.docType)}</span>
          {doc.standardRef && <span>{doc.standardRef}</span>}
          {doc.department && <span>{doc.department}</span>}
          <Applicability doc={doc} />
          {doc.currentVersion && <span>v{doc.currentVersion.versionNo} · effective {fmtDate(doc.effectiveDate)}</span>}
          {doc.viewCount > 0 && <span className="inline-flex items-center gap-1"><Eye size={12} /> {doc.viewCount}</span>}
        </div>
        {doc.snippet ? (
          <p className="line-clamp-2 text-xs text-slate-600">{doc.snippet}</p>
        ) : doc.summary ? (
          <p className="line-clamp-2 text-xs text-slate-600">{doc.summary}</p>
        ) : null}
        {doc.pendingVersion && (
          <p className="text-[11px] text-amber-700">
            Pending v{doc.pendingVersion.versionNo} ({label(doc.pendingVersion.status)}) · {doc.pendingVersion.fileName} · {fmtBytes(doc.pendingVersion.sizeBytes)}
          </p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/**
 * File chooser: a shadcn Button in front of a hidden file Input (same pattern
 * as components/evidence/EvidenceAttachment.tsx; there is no shadcn file control).
 */
export function FilePick({
  accept, file, onFile, maxBytes, disabled,
}: {
  accept: string; file: File | null; onFile: (f: File | null) => void; maxBytes: number; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => ref.current?.click()}>
          <Upload size={13} /> {file ? "Choose another file" : "Choose file"}
        </Button>
        {file && (
          <span className="text-xs text-slate-700">
            {file.name} · {fmtBytes(file.size)}
          </span>
        )}
        <Input
          ref={ref}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (f && f.size > maxBytes) {
              setError(`File exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`);
              onFile(null);
              return;
            }
            setError(null);
            onFile(f);
          }}
        />
      </div>
      <p className="text-[11px] text-slate-500">PDF, Word, Excel, PowerPoint, image or text · up to {Math.round(maxBytes / 1024 / 1024)} MB</p>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

export function acceptFor(exts: string[]): string {
  return exts.map((e) => `.${e}`).join(",");
}
