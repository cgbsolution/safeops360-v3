// Public LOTO field view — what a QR label on a machine resolves to.
//
// NO LOGIN WALL, by design (spec §2.3). Someone standing at a piece of equipment
// must be able to read its isolation procedure with a phone camera and nothing
// else. A login screen between a person and an energy-isolation procedure is a
// hazard, not a control.
//
// This lives in the (external) route group: no AppShell, no sidebar, no session,
// no permission provider — the same treatment as the supplier portal. The
// endpoint it reads is unauthenticated and returns a deliberately narrow payload
// (see QrProcedureView in app/schemas/loto.py); that payload IS the access
// boundary, not this page.
//
// ⚠ The URL is `/lockout/[token]`, NOT `/loto/[token]`, and moving it under
// `/loto` will take the ENTIRE APP DOWN. Route groups do not create separate URL
// namespaces, so `(external)/loto/[token]` and `(dashboard)/loto/[id]` collide on
// `/loto/<dynamic>`:
//
//     Error: You cannot use different slug names for the same dynamic path
//            ('id' !== 'token')
//
// Next throws that while initialising the router, so every page 500s (API routes
// keep working, which makes it look like a rendering bug). It passes `tsc` and
// `next build` and only appears at runtime. It shipped to production once.
//
// Starting a lockout is NOT possible from here. That button routes into the
// authenticated app, where LOTO.EXECUTE is enforced.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, Clock, Lock, ShieldCheck, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

// A machine label should not turn up in search results.
export const metadata: Metadata = {
  title: "LOTO Procedure — SafeOps360",
  robots: { index: false, follow: false }
};

type QrView = {
  procedureId: string;
  procedureCode: string;
  title: string;
  description: string | null;
  equipmentName: string | null;
  equipmentTag: string | null;
  siteName: string | null;
  area: string | null;
  version: number;
  publishedAt: string | null;
  procedureStatus: string;
  isRetired: boolean;
  hasUnpublishedChanges: boolean;
  energySources: {
    id: string;
    sequence: number;
    energyType: string;
    magnitude: string | null;
    locationDescription: string | null;
  }[];
  isolationPoints: {
    id: string;
    sequence: number;
    location: string;
    isolationMethod: string;
    lockType: string | null;
    verificationMethod: string | null;
  }[];
  hardware: { id: string; itemType: string; description: string | null; quantityRequired: number }[];
  verificationSteps: {
    id: string;
    sequence: number;
    stepText: string;
    requiresPhoto: boolean;
    requiresSignoff: boolean;
  }[];
};

const ENERGY_LABEL: Record<string, string> = {
  electrical: "Electrical",
  mechanical: "Mechanical",
  hydraulic: "Hydraulic",
  pneumatic: "Pneumatic",
  thermal: "Thermal",
  chemical: "Chemical",
  gravity: "Gravity / stored",
  other: "Other"
};

const ENERGY_COLOR: Record<string, string> = {
  electrical: "bg-yellow-100 text-yellow-900 border-yellow-300",
  mechanical: "bg-slate-100 text-slate-800 border-slate-300",
  hydraulic: "bg-blue-100 text-blue-800 border-blue-300",
  pneumatic: "bg-sky-100 text-sky-800 border-sky-300",
  thermal: "bg-orange-100 text-orange-800 border-orange-300",
  chemical: "bg-violet-100 text-violet-800 border-violet-300",
  gravity: "bg-stone-100 text-stone-800 border-stone-300",
  other: "bg-slate-100 text-slate-700 border-slate-200"
};

const METHOD_LABEL: Record<string, string> = {
  breaker: "Breaker / isolator",
  valve: "Valve",
  blocking: "Blocking / chocking",
  blanking: "Blanking / spading",
  disconnect: "Disconnect",
  plug: "Plug removal",
  chain: "Chain / physical restraint",
  other: "Other"
};

const HARDWARE_LABEL: Record<string, string> = {
  lock: "Padlock",
  tag: "Danger tag",
  hasp: "Hasp",
  chain: "Chain",
  blind: "Blind / spade",
  lockbox: "Group lock box",
  other: "Other"
};

export default async function LotoQrPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;

  // Called server-side, direct to the backend. The catch-all proxy would also
  // work (it forwards without a token when there is no session), but going
  // direct keeps this page independent of session plumbing it deliberately has
  // none of.
  const baseUrl =
    process.env.BACKEND_BASE_URL ?? process.env.BACKEND_URL ?? "http://localhost:8000";

  let data: QrView;
  try {
    const res = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/loto/qr/${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );
    if (!res.ok) notFound();
    data = (await res.json()) as QrView;
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      {/* Header — big, because this is read at arm's length in bad light. */}
      <header className="mb-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Lock size={13} /> Lockout / Tagout procedure
        </div>
        <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-900">
          {data.equipmentName ?? data.title}
        </h1>
        {data.equipmentTag && (
          <div className="mt-0.5 font-mono text-sm text-slate-600">{data.equipmentTag}</div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="font-mono font-medium text-slate-700">{data.procedureCode}</span>
          <span>Version {data.version}</span>
          {data.siteName && <span>{data.siteName}</span>}
          {data.area && <span>{data.area}</span>}
        </div>
        {data.title !== data.equipmentName && (
          <p className="mt-2 text-sm text-slate-700">{data.title}</p>
        )}
      </header>

      {/* Honest status. A procedure that is retired, or whose approved version
          trails an edit in flight, must SAY so — a field reader has no other way
          to know, and quietly serving an outdated sequence is the failure mode
          this whole versioning scheme exists to prevent. */}
      {data.isRetired && (
        <Callout tone="danger" icon={AlertTriangle} title="This procedure has been retired">
          Do not use it. Contact your supervisor or the safety office for the current
          isolation procedure for this equipment.
        </Callout>
      )}

      {!data.isRetired && data.hasUnpublishedChanges && (
        <Callout tone="info" icon={Clock} title="This is the current approved version">
          A revision is in progress and awaiting approval. Until it is approved, this
          version — v{data.version} — is the one to follow.
        </Callout>
      )}

      {data.description && (
        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
          <p className="whitespace-pre-line text-sm text-slate-700">{data.description}</p>
        </section>
      )}

      {/* ─── Energy sources ─── */}
      {data.energySources.length > 0 && (
        <section className="mb-5">
          <SectionTitle icon={Zap}>Energy sources</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {data.energySources.map((s) => (
              <div
                key={s.id}
                className={`rounded-lg border px-3 py-2 ${
                  ENERGY_COLOR[s.energyType] ?? ENERGY_COLOR.other
                }`}
              >
                <div className="text-sm font-bold">
                  {ENERGY_LABEL[s.energyType] ?? s.energyType}
                </div>
                {s.magnitude && <div className="text-xs opacity-90">{s.magnitude}</div>}
                {s.locationDescription && (
                  <div className="text-xs opacity-75">{s.locationDescription}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Isolation points ─── */}
      <section className="mb-5">
        <SectionTitle icon={Lock}>
          Isolation points
          <span className="ml-2 text-xs font-normal text-slate-500">
            in this order
          </span>
        </SectionTitle>
        <ol className="space-y-2">
          {data.isolationPoints.map((p) => (
            <li
              key={p.id}
              className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                {p.sequence}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900">{p.location}</div>
                <div className="mt-0.5 text-xs text-slate-600">
                  {METHOD_LABEL[p.isolationMethod] ?? p.isolationMethod}
                  {p.lockType && ` · ${p.lockType}`}
                </div>
                {p.verificationMethod && (
                  <p className="mt-1.5 rounded-md bg-slate-50 p-2 text-sm text-slate-700">
                    <span className="font-semibold">Prove zero energy:</span>{" "}
                    {p.verificationMethod}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ─── Hardware ─── */}
      {data.hardware.length > 0 && (
        <section className="mb-5">
          <SectionTitle icon={Lock}>Hardware needed</SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {data.hardware.map((h) => (
              <li
                key={h.id}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                <span className="font-bold">{h.quantityRequired}×</span>{" "}
                {HARDWARE_LABEL[h.itemType] ?? h.itemType}
                {h.description && (
                  <span className="text-slate-500"> — {h.description}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── Verification checklist ─── */}
      <section className="mb-6">
        <SectionTitle icon={ShieldCheck}>Zero-energy verification</SectionTitle>
        <ol className="space-y-2">
          {data.verificationSteps.map((s) => (
            <li
              key={s.id}
              className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                {s.sequence}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800">{s.stepText}</p>
                {(s.requiresPhoto || s.requiresSignoff) && (
                  <div className="mt-1 text-[11px] text-slate-500">
                    {[
                      s.requiresSignoff ? "sign-off required" : null,
                      s.requiresPhoto ? "photo required" : null
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Starting a lockout requires a login. The link goes to the authenticated
          app, which is where LOTO.EXECUTE is checked — this page never gains a
          write path. */}
      {!data.isRetired && (
        <a
          href={`/loto/${data.procedureId}`}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-base font-semibold text-white"
        >
          <Lock size={18} /> Sign in to start a lockout
        </a>
      )}

      <footer className="mt-6 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
        <div>
          {data.procedureCode} · v{data.version}
          {data.publishedAt &&
            ` · approved ${new Date(data.publishedAt).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric"
            })}`}
        </div>
        <div className="mt-1">
          Read-only field view. If anything here does not match the equipment in front
          of you, stop and report it before isolating.
        </div>
      </footer>
    </main>
  );
}

function SectionTitle({
  icon: Icon,
  children
}: {
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
      <Icon size={15} /> {children}
    </h2>
  );
}

function Callout({
  tone,
  icon: Icon,
  title,
  children
}: {
  tone: "danger" | "info";
  icon: any;
  title: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === "danger"
      ? "border-rose-400 bg-rose-50 text-rose-900"
      : "border-blue-300 bg-blue-50 text-blue-900";
  return (
    <div className={`mb-5 flex items-start gap-3 rounded-xl border-2 p-4 ${styles}`}>
      <Icon size={20} className="mt-0.5 shrink-0" />
      <div className="text-sm">
        <div className="font-bold">{title}</div>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}
