"use client";

// The contractor's own prequalification form. Built for a contractor's office
// manager on a phone or a site laptop, with no account and no training:
//   1. company details, 2. the questionnaire, 3. documents, 4. declaration.
// Answers save as a draft as often as they like; submitting locks them.
// Everything is scoped by the token server-side; nothing here assumes a session
// or a permission provider (no dashboard component is used).

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/client-errors";
import { fmtDate, label, type Answer, type CsmDocument, type Section } from "@/lib/csm/api";
import { DocumentUploadDialog } from "@/components/csm/document-upload";
import { QuestionnaireForm } from "@/components/csm/questionnaire-form";

type Company = {
  name: string | null; tradeName: string | null; registrationNumber: string | null; panNumber: string | null; gstNumber: string | null;
  contactPerson: string | null; contactEmail: string | null; contactPhone: string | null; safetyOfficerName: string | null; safetyOfficerPhone: string | null;
};
type PortalDoc = Pick<CsmDocument, "id" | "docType" | "title" | "documentNo" | "fileName" | "questionCode" | "expiresOn" | "state" | "uploadedVia" | "createdAt">;
type Payload = {
  application: { applicationNo: string; status: string; editable: boolean; plantName: string | null; submittedAt: string | null; returnedNote: string | null; templateName: string | null };
  company: Company;
  sections: Section[];
  answers: Record<string, Answer>;
  unanswered: string[];
  documents: PortalDoc[];
  docTypes: string[];
  contactName: string | null;
  expiresAt: string | null;
};

const PROFILE: { key: keyof Company; text: string; max?: number }[] = [
  { key: "tradeName", text: "Trade name" },
  { key: "registrationNumber", text: "Registration no." },
  { key: "panNumber", text: "PAN", max: 10 },
  { key: "gstNumber", text: "GSTIN", max: 15 },
  { key: "contactPerson", text: "Contact person" },
  { key: "contactEmail", text: "Contact email" },
  { key: "contactPhone", text: "Contact phone" },
  { key: "safetyOfficerName", text: "Safety officer name" },
  { key: "safetyOfficerPhone", text: "Safety officer phone" },
];

async function call<T>(url: string, method = "GET", json?: unknown): Promise<T> {
  const res = await fetch(url, {
    method, cache: "no-store",
    headers: json !== undefined ? { "content-type": "application/json" } : undefined,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  if (!res.ok) throw new Error(await readApiError(res, "Something went wrong. Please try again."));
  return (await res.json()) as T;
}

export function ContractorPrequalPortal({ token }: { token: string }) {
  const base = `/api/csm-portal/${token}`;
  const [data, setData] = useState<Payload | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [profile, setProfile] = useState<Partial<Company>>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<{ docType: string | null; questionCode: string | null } | null>(null);
  const [declarant, setDeclarant] = useState("");
  const [declared, setDeclared] = useState(false);

  const apply = (p: Payload) => {
    setData(p);
    setAnswers(p.answers);
    setProfile(p.company);
    setDirty(false);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      apply(await call<Payload>(base));
      setFatal(null);
    } catch (e) {
      setFatal((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { void load(); }, [load]);

  async function saveAll(): Promise<boolean> {
    setBusy(true);
    setMsg(null);
    try {
      await call<Payload>(`${base}/profile`, "PUT", Object.fromEntries(PROFILE.map((f) => [f.key, profile[f.key] ?? null])));
      apply(await call<Payload>(`${base}/answers`, "PUT", { answers }));
      setMsg({ tone: "ok", text: "Saved. You can come back to this link and continue later." });
      return true;
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (dirty && !(await saveAll())) return;
    setBusy(true);
    setMsg(null);
    try {
      apply(await call<Payload>(`${base}/submit`, "POST", { declarantName: declarant, declaration: declared }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <Centre><Loader2 className="animate-spin text-slate-400" size={28} /><p className="mt-3 text-sm text-slate-500">Loading…</p></Centre>;
  }
  if (fatal || !data) {
    return (
      <Centre>
        <AlertTriangle className="text-amber-500" size={30} />
        <h1 className="mt-3 text-lg font-semibold text-slate-800">This link is not available</h1>
        <p className="mt-1 max-w-sm text-sm text-slate-600">{fatal}</p>
        <p className="mt-4 max-w-sm text-[13px] text-slate-500">
          Links expire for security, and close once a questionnaire has been reviewed. Please contact the safety department of the plant that sent it and ask for a new one.
        </p>
      </Centre>
    );
  }

  const { application: app, company } = data;
  const editable = app.editable;
  const docTypesAsked = data.sections.flatMap((s) => s.questions.filter((q) => q.answerType === "DOCUMENT_REQUIRED").map((q) => q.docType as string));
  const missingDocs = docTypesAsked.filter((t) => !data.documents.some((d) => d.docType === t && d.state !== "EXPIRED"));
  const unanswered = data.unanswered.length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-6 sm:px-6">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary-700">
          <ShieldCheck size={13} /> Contractor safety prequalification
        </div>
        <h1 className="mt-1 text-xl font-bold leading-tight text-slate-900 sm:text-2xl">{company.name ?? "Your company"}</h1>
        <p className="mt-1 text-sm text-slate-600">{app.applicationNo}{app.plantName ? ` · for ${app.plantName}` : ""}</p>
        {editable ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            Please complete your company details, answer every question marked <span className="text-rose-600">*</span>, and upload the documents
            asked for (licences, registrations, insurance, certificates) with their validity dates. Save as often as you like; when everything is
            done, sign the declaration at the bottom and submit.
            {data.expiresAt && <p className="mt-2 text-[12px] text-slate-400">This link works until {fmtDate(data.expiresAt)}.</p>}
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <div>
              Submitted{app.submittedAt ? ` on ${fmtDate(app.submittedAt)}` : ""}. The plant&apos;s safety department is reviewing it and will contact you.
              Your answers are shown below for reference and can no longer be changed.
            </div>
          </div>
        )}
        {app.returnedNote && editable && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Returned to you by the safety department:</strong> {app.returnedNote.replace(/^Returned for more information:\s*/, "")}
          </div>
        )}
      </header>

      <Step n={1} title="Company details">
        <div className="grid gap-3 sm:grid-cols-2">
          {PROFILE.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs text-slate-700" htmlFor={`p-${f.key}`}>{f.text}</Label>
              <Input id={`p-${f.key}`} disabled={!editable} maxLength={f.max} value={profile[f.key] ?? ""}
                     onChange={(e) => { setProfile({ ...profile, [f.key]: e.target.value }); setDirty(true); }} />
            </div>
          ))}
        </div>
      </Step>

      <Step n={2} title="Safety questionnaire" sub={editable && unanswered ? `${unanswered} required question(s) still to answer` : undefined}>
        <QuestionnaireForm
          sections={data.sections}
          answers={answers}
          readOnly={!editable}
          highlight={editable ? data.unanswered : []}
          onChange={(code, a) => { setAnswers({ ...answers, [code]: a }); setDirty(true); }}
          documents={data.documents.map((d) => ({ ...d, status: "ACTIVE" })) as CsmDocument[]}
          onUpload={(q) => setUpload({ docType: q.docType ?? null, questionCode: q.code })}
        />
      </Step>

      <Step n={3} title="Documents" sub={editable && missingDocs.length ? `${missingDocs.length} document type(s) still missing` : undefined}>
        <div className="space-y-2">
          {data.documents.length === 0 && <p className="text-sm text-slate-500">Nothing uploaded yet.</p>}
          {data.documents.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <FileText size={14} className="text-slate-400" />
              <span className="font-medium text-slate-800">{label(d.docType)}</span>
              <span className="text-slate-600">{d.title || d.fileName}</span>
              <span className={`ml-auto text-xs ${d.state === "EXPIRED" ? "font-semibold text-rose-700" : "text-slate-500"}`}>
                {d.expiresOn ? `valid until ${fmtDate(d.expiresOn)}` : "no expiry"}
              </span>
            </div>
          ))}
          {editable && missingDocs.length > 0 && (
            <p className="text-xs text-amber-700">Still needed: {Array.from(new Set(missingDocs)).map(label).join(", ")}.</p>
          )}
          {editable && (
            <Button type="button" variant="outline" onClick={() => setUpload({ docType: null, questionCode: null })}>
              <Upload size={14} /> Upload a document
            </Button>
          )}
        </div>
      </Step>

      {editable && (
        <Step n={4} title="Declaration and submit">
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Checkbox id="declare" className="mt-0.5" checked={declared} onCheckedChange={(v) => setDeclared(v === true)} />
              <Label htmlFor="declare" className="text-sm font-normal leading-snug text-slate-700">
                I declare that the information and documents given here are true and complete, and I understand that false information can lead to
                disqualification or blacklisting.
              </Label>
            </div>
            <div className="max-w-sm space-y-1">
              <Label htmlFor="declarant" className="text-xs text-slate-700">Your name and designation</Label>
              <Input id="declarant" value={declarant} onChange={(e) => setDeclarant(e.target.value)} placeholder="e.g. Mahesh Gupta, Proprietor" />
            </div>
          </div>
        </Step>
      )}

      {msg && <p className={`mb-3 text-sm ${msg.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</p>}

      {editable && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <Button type="button" variant="outline" disabled={busy || !dirty} onClick={saveAll} className="flex-1 sm:flex-none">
            {busy ? <Loader2 size={15} className="animate-spin" /> : null} Save draft
          </Button>
          <Button type="button" disabled={busy || !declared || declarant.trim().length < 2} onClick={submit} className="flex-1 sm:flex-none">
            Submit to the plant
          </Button>
        </div>
      )}

      <DocumentUploadDialog
        open={!!upload}
        onOpenChange={(v) => !v && setUpload(null)}
        docTypes={data.docTypes}
        docType={upload?.docType}
        questionCode={upload?.questionCode ?? null}
        getUploadUrl={(file) => call(`${base}/upload-url`, "POST", { fileName: file.name, mimeType: file.type, fileSize: file.size })}
        record={async (m) => { await call(`${base}/documents`, "POST", m); }}
        onDone={async () => {
          setMsg({ tone: "ok", text: "Document uploaded." });
          // keep unsaved answers: refresh only the document list and the gaps
          try {
            const p = await call<Payload>(base);
            setData({ ...p, answers });
          } catch { /* the next save will refresh */ }
        }}
      />

      <footer className="mt-8 text-center text-[11px] text-slate-400">This page is private to your company. Please do not share the link.</footer>
    </div>
  );
}

function Step({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-700 text-xs font-bold text-white">{n}</span>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {sub && <span className="text-xs text-amber-700">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

function Centre({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">{children}</div>;
}
