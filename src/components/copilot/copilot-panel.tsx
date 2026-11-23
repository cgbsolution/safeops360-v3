"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUp, Bot, CheckCircle2, AlertCircle, ExternalLink, Loader2, Plus, Sparkles, Square, Wrench, X,
  TrendingDown, TrendingUp, Minus, Info, FilePlus2, FilePen, Send, Camera, ImagePlus, ClipboardList
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { COPILOT_MAX_PHOTOS, type CopilotPhoto, prepareCopilotPhoto } from "@/lib/copilot-photos";
import { CameraCaptureDialog } from "./camera-capture-dialog";
import { cn } from "@/lib/utils";
import { type ChatItem, type CopilotAction, type FormKind, useCopilot } from "./copilot-provider";
import type { CalibrationScopeResponse } from "./hira-calibration-types";
import type { PtwDraftCheck } from "@/lib/ptw/wizard-config";

const MODULE_LABEL: Record<string, string> = {
  PTW: "Permit", INCIDENT: "Incident", OBSERVATION: "Observation", NEAR_MISS: "Near miss", CAPA: "CAPA", HIRA: "HIRA"
};

const FIELD_LABEL: Record<string, string> = {
  type: "type", extraHazards: "hazards", validFrom: "valid from", validTo: "valid to", plantId: "plant",
  departmentId: "department", areaId: "area", specificLocation: "location", scopeOfWork: "scope",
  workOrderNumber: "work order", contractorCompanyId: "contractor", issuerId: "issuer", receiverId: "receiver",
  workCrew: "crew", fireWatchPersonId: "fire watch", standbyPersonId: "standby", isolations: "isolations",
  requiredPpe: "PPE", toolsEquipment: "tools", subjectEquipment: "subject equipment", gasTestPlan: "gas test plan",
  rescuePlan: "rescue plan", weatherConditionsAtIssue: "weather", windSpeedKmh: "wind", flraRequired: "site safety check",
  checklistSuggestions: "suggested checklist answers (confirm on step 4)",
  categoryCode: "category", subCategoryCode: "sub-category", severity: "severity", severityReason: "severity reason",
  description: "description", immediateAction: "immediate action",
  addExistingControls: "existing controls", addRecommendedControls: "recommended controls",
  setControlEffectiveness: "control effectiveness", target: "target risk"
};

/** Examples for forms described through useCopilotForm, by form kind. */
const FORM_EXAMPLES: Record<string, string> = {
  NEAR_MISS: "A sling slipped while lifting a motor at the rolling mill bay, the load swung near two fitters, nobody was hurt",
  INCIDENT: "Fitter's hand caught between the conveyor belt and pulley during cleaning at 10:30, first aid given",
  CAPA: "Raise an action to install a fixed guard on the tail pulley of conveyor CV-12, owner maintenance, due in 2 weeks"
};

function suggestionsFor(module: string | null, recordId: string | null, ptwFormOpen: boolean, formKind: FormKind | null,
  studyId: string | null = null): string[] {
  if (formKind && formKind !== "OBSERVATION" && formKind !== "HIRA_ENTRY") {
    return [
      ...(FORM_EXAMPLES[formKind] ? [FORM_EXAMPLES[formKind]] : []),
      "Fill this form from what I've written so far",
      "What's still missing before I can submit?"
    ];
  }
  if (formKind === "OBSERVATION") {
    return [
      "Suggest the category, severity and corrective action for what I've written",
      "Cable joint taped and lying on the wet floor near the pump house panel, people walk past it",
      "Is this fatal potential?",
      "Rewrite my description so the team can find and fix it"
    ];
  }
  if (formKind === "HIRA_ENTRY") {
    return [
      "Suggest hazards and controls for this activity",
      "Add the missing hazards and save them",
      "Which control would bring the residual risk down to acceptable?",
      "What happens to the risk if we add an engineering control and verify the existing ones?"
    ];
  }
  if (ptwFormOpen) {
    return [
      "Hot work: weld a new support bracket on the pipe rack in the utilities area, 4 m up, tomorrow 9am–5pm, our maintenance team of 3",
      "Confined space entry to clean the inside of a water storage tank, Thursday day shift, with a contractor crew",
      "What's still missing before I can submit?",
      "Any lessons from similar permits done here before?"
    ];
  }
  // Outside a form, follow the page the user is on.
  if (module === "OBSERVATION") {
    return [
      ...(recordId ? ["Triage this report"] : []),
      "What category and severity would this be: oil leaking from the gearbox onto the walkway",
      "Is this fatal potential: man working on the roof edge without a full body harness",
      "Start a new observation"
    ];
  }
  if (module === "NEAR_MISS") {
    return [...(recordId ? ["Triage this report"] : []), "Find near-miss reports about forklifts at my plant"];
  }
  if (module === "HIRA") {
    if (recordId) {
      return [
        "Suggest hazards and controls for this activity",
        "Add the missing hazards to this entry",
        "Submit this entry for review"
      ];
    }
    if (studyId) {
      return [
        "Add the main activities of this area as entries, with hazards and controls",
        "Add an entry: replacing a conveyor belt pulley",
        "Which entries still have a residual risk that isn't acceptable?"
      ];
    }
    return [
      "Create a new HIRA for EAF charging and tapping",
      "Create a HIRA for ladle handling with the overhead crane",
      "Which controls does our plant HIRA use for work at height?"
    ];
  }
  if (module === "INCIDENT") {
    return [...(recordId ? ["Run a root-cause analysis on this incident"] : []), "Find incidents involving cranes at my plant"];
  }
  if (module === "CAPA") {
    return [...(recordId ? ["Review this CAPA"] : []), "Find CAPAs about machine guarding"];
  }
  const out = ["Draft a new permit to work", "Create a new HIRA"];
  if (module === "PTW" && recordId) out.push("Review this permit for risks");
  out.push("Find hot work permits at my plant this week");
  if (module !== "PTW") out.push("What category and severity would this observation be: open cable joint near the pump house panel");
  return out;
}

function introFor(module: string | null): string {
  switch (module) {
    case "OBSERVATION":
      return "Describe what you saw and I'll suggest the category, severity and corrective action from thousands of reviewed plant observations. Open New Observation and I'll fill them on the form for you to check.";
    case "HIRA":
      return "Tell me the area or job and I'll build the HIRA for you: the study, each activity, its hazards and consequences, the risk scores and the controls. I save everything as a draft; you check it and send it for approval.";
    case "NEAR_MISS":
      return "I can find your near-miss reports and run the triage specialist on one.";
    case "INCIDENT":
      return "I can find your incidents and run the root-cause analysis specialist on one.";
    case "CAPA":
      return "I can find your CAPAs and run the CAPA review specialist on one.";
    default:
      return "I can draft permits to work, build HIRA studies, suggest observation categories, find your records, and run the RCA, permit-review, triage, HIRA and CAPA specialists for you.";
  }
}

/** Minimal, safe formatting: **bold**, `-`/`*` bullets, numbered lines, paragraphs. */
function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`l${blocks.length}`} className={cn("my-1 space-y-0.5 pl-5", list.ordered ? "list-decimal" : "list-disc")}>
        {list.items.map((t, i) => <li key={i}>{inline(t)}</li>)}
      </Tag>
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? num)![1]);
      continue;
    }
    flush();
    if (line.trim() === "") continue;
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    blocks.push(
      <p key={`p${blocks.length}`} className={cn("my-1", heading && "font-semibold")}>{inline(heading ? heading[1] : line)}</p>
    );
  }
  flush();
  return <>{blocks}</>;
}

function inline(s: string): React.ReactNode[] {
  return s.split(/(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      // Only in-app paths become links; anything else stays plain text.
      return link[2].startsWith("/") && !link[2].startsWith("//")
        ? <Link key={i} href={link[2]} className="font-medium text-primary-700 underline-offset-2 hover:underline">{link[1]}</Link>
        : <span key={i}>{link[1]}</span>;
    }
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded bg-slate-100 px-1 text-[12px]">{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });
}

function SpecialistCard({ action }: { action: Extract<CopilotAction, { type: "specialist" }> }) {
  const [state, setState] = useState<{ status: string; summary?: string | null }>({ status: "RUNNING" });
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const started = Date.now();
    const poll = async () => {
      try {
        const r = await fetch(`/api/agent-invocations/${action.invocationId}`, { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          const summary = j?.agentSuggestion?.summary ?? j?.agentSuggestion?.overallSummary ?? null;
          if (alive) setState({ status: j.status, summary: typeof summary === "string" ? summary : null });
          if (j.status !== "RUNNING") return;
        }
      } catch { /* keep polling */ }
      if (alive && Date.now() - started < 6 * 60_000) timer = setTimeout(poll, 4000);
    };
    poll();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [action.invocationId]);

  const running = state.status === "RUNNING";
  const failed = state.status === "ERRORED";
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
      <div className="flex items-center gap-2">
        {running ? <Loader2 size={14} className="animate-spin text-primary-600" /> :
          failed ? <AlertCircle size={14} className="text-rose-600" /> : <CheckCircle2 size={14} className="text-emerald-600" />}
        <span className="font-medium text-slate-800">{action.label}</span>
        <span className="text-slate-500">{action.invocationNumber}</span>
      </div>
      <div className="mt-1 text-slate-600">
        {running ? "Analysing in the background…" : failed ? "The analysis failed. Open the record to retry." :
          state.summary ?? "Analysis ready — ask me to summarise it, or open the record."}
      </div>
      {action.href && (
        <Link href={action.href} className="mt-1.5 inline-flex items-center gap-1 font-medium text-primary-700 hover:underline">
          Open {MODULE_LABEL[action.module]?.toLowerCase() ?? "record"} <ExternalLink size={12} />
        </Link>
      )}
    </div>
  );
}

const RECORD_VERB = { created: "Created", updated: "Saved changes to", submitted: "Submitted for review:" } as const;

function RecordCard({ action }: { action: Extract<CopilotAction, { type: "record" }> }) {
  const Icon = action.verb === "created" ? FilePlus2 : action.verb === "submitted" ? Send : FilePen;
  const what = action.kind === "study" ? "HIRA study" : "HIRA entry";
  return (
    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs">
      <div className="flex items-center gap-2">
        <Icon size={14} className="shrink-0 text-emerald-700" />
        <span className="font-medium text-emerald-900">{RECORD_VERB[action.verb]} {what}</span>
        {action.number && <span className="truncate text-emerald-800/80">{action.number}</span>}
      </div>
      {action.title && <div className="mt-1 line-clamp-2 text-slate-700">{action.title}</div>}
      <Link href={action.href} className="mt-1.5 inline-flex items-center gap-1 font-medium text-primary-700 hover:underline">
        Open {action.kind} <ExternalLink size={12} />
      </Link>
    </div>
  );
}

function NoticeCard({ item }: { item: ChatItem }) {
  const n = item.notice;
  if (!n) return null;
  const Icon = n.tone === "down" ? TrendingDown : n.tone === "up" ? TrendingUp : n.tone === "same" ? Minus : Info;
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-xs",
      n.tone === "down" ? "border-emerald-200 bg-emerald-50 text-emerald-900" :
        n.tone === "up" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-slate-200 bg-slate-50 text-slate-800")}>
      <div className="flex items-center gap-1.5 font-semibold"><Icon size={13} /> {n.title}</div>
      {n.lines.map((l, i) => <div key={i} className="mt-0.5">{l}</div>)}
      <div className="mt-1 text-[10px] opacity-70">Calculated by the HIRA editor, not the AI. Ask me why, or what would lower it further.</div>
    </div>
  );
}

function Message({ item }: { item: ChatItem }) {
  if (item.role === "notice") return <NoticeCard item={item} />;
  if (item.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end gap-1">
          {item.photos && item.photos.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1">
              {item.photos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`Photo ${i + 1}`} className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
              ))}
            </div>
          )}
          {item.text && (
            <div className="whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary-600 px-3 py-2 text-sm text-white">
              {item.text}
            </div>
          )}
        </div>
      </div>
    );
  }
  const reconnecting = !!(item.streaming && item.reconnecting);
  const busy = item.streaming && !reconnecting && !item.text && item.tools.every((t) => t.status === "done");
  return (
    <div className="flex gap-2">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
        <Bot size={14} />
      </div>
      <div className="min-w-0 flex-1 text-sm text-slate-800">
        {item.tools.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1">
            {item.tools.map((t) => (
              <span key={t.id} title={t.error ?? undefined} className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                t.status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" :
                  t.status === "done" ? "border-slate-200 bg-white text-slate-500" : "border-primary-200 bg-primary-50 text-primary-700"
              )}>
                {t.status === "done" ? <CheckCircle2 size={11} /> : t.status === "error" ? <AlertCircle size={11} /> :
                  <Loader2 size={11} className="animate-spin" />}
                {t.label}
              </span>
            ))}
          </div>
        )}
        {item.text && <div className="leading-relaxed"><RichText text={item.text} /></div>}
        {busy && <div className="flex items-center gap-1.5 text-slate-500"><Loader2 size={14} className="animate-spin" /> Thinking…</div>}
        {reconnecting && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 size={12} className="animate-spin" /> Connection dropped. Reconnecting; the answer is still being written…
          </div>
        )}
        {item.patchedFields && item.patchedFields.length > 0 && (
          <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
            <Wrench size={12} className="mt-0.5 shrink-0" />
            <span>Filled on the form: {item.patchedFields.map((f) => FIELD_LABEL[f] ?? f).join(", ")}</span>
          </div>
        )}
        {item.actions.map((a, i) =>
          a.type === "navigate" ? (
            <Link key={i} href={a.path}
              className="mt-2 mr-2 inline-flex items-center gap-1 rounded-md border border-primary-200 bg-white px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50">
              {a.label} <ExternalLink size={12} />
            </Link>
          ) : a.type === "record" ? (
            <RecordCard key={i} action={a} />
          ) : (
            <SpecialistCard key={i} action={a} />
          )
        )}
        {item.error && (
          <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-800">
            <AlertCircle size={12} className="mt-0.5 shrink-0" /> {item.error}
          </div>
        )}
      </div>
    </div>
  );
}

function CheckStrip({ check }: { check: PtwDraftCheck }) {
  const steps: [string, number][] = [
    ["Job", check.sections.job.length],
    ["People", check.sections.people.length],
    ["Controls", check.sections.controls.length],
    ["Checklist", check.sections.checklist.length]
  ];
  const alerts = (check.alerts ?? []).filter((a) => a.level === "warning");
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b bg-slate-50 px-3 py-1.5 text-[11px]">
      <span className="text-slate-500">Draft:</span>
      {alerts.length > 0 && (
        <span title={alerts.map((a) => a.title).join(" · ")}
          className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-rose-800">
          <AlertCircle size={10} /> {alerts.length} alert{alerts.length === 1 ? "" : "s"}
        </span>
      )}
      {steps.map(([label, n]) => (
        <span key={label} className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5",
          n === 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>
          {n === 0 ? <CheckCircle2 size={10} /> : null}{label}{n > 0 ? ` · ${n}` : ""}
        </span>
      ))}
    </div>
  );
}

/**
 * What the calibrated HIRA review covers (GET /api/hira/calibration/scope),
 * for the plant the open entry belongs to. Informational: errors stay silent.
 */
function HiraScopeLine({ plantId }: { plantId: string | null }) {
  const key = plantId ?? "";
  const [state, setState] = useState<{ key: string; scope: CalibrationScopeResponse } | null>(null);
  useEffect(() => {
    let alive = true;
    const qs = plantId ? `?plantId=${encodeURIComponent(plantId)}` : "";
    fetch(`/api/hira/calibration/scope${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: CalibrationScopeResponse | null) => {
        if (alive && j && typeof j.validatedFor === "string") setState({ key: plantId ?? "", scope: j });
      })
      .catch(() => { /* not shown when unavailable */ });
    return () => { alive = false; };
  }, [plantId]);

  // Only the answer for the plant now on screen.
  if (!state || state.key !== key) return null;
  const { scope } = state;
  return (
    <div className="border-b bg-slate-50 px-3 py-1 text-[11px] leading-snug text-slate-500">
      <div className="truncate" title={`Validated for: ${scope.validatedFor}`}>Validated for: {scope.validatedFor}</div>
      {scope.validated === false && scope.banner && (
        <div className="mt-0.5 flex items-start gap-1 text-slate-700">
          <Info size={11} className="mt-0.5 shrink-0" /> <span>{scope.banner}</span>
        </div>
      )}
    </div>
  );
}

export function CopilotPanel() {
  const { open, setOpen, items, send, sending, stop, newChat, page, ptwFormOpen, formKind, formTitle, formTakesPhotos, lastCheck, conversationTooLong, unavailableReason, pagePlantId } = useCopilot();
  // A form described field by field (near miss, incident, CAPA…), not one with its own tools.
  const otherForm = formKind && formKind !== "OBSERVATION" && formKind !== "HIRA_ENTRY" ? (formTitle ?? "this form") : null;
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [photos, setPhotos] = useState<CopilotPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const addPhotos = async (files: File[]) => {
    setPhotoError(null);
    const room = COPILOT_MAX_PHOTOS - photos.length;
    if (room <= 0) { setPhotoError(`Up to ${COPILOT_MAX_PHOTOS} photos per message.`); return; }
    if (files.length > room) setPhotoError(`Up to ${COPILOT_MAX_PHOTOS} photos per message; the extra ones were left out.`);
    setPreparing(true);
    const ready: CopilotPhoto[] = [];
    for (const f of files.slice(0, room)) {
      try { ready.push(await prepareCopilotPhoto(f)); } catch (e) { setPhotoError(e instanceof Error ? e.message : "That photo could not be used."); }
    }
    setPreparing(false);
    if (ready.length) setPhotos((prev) => [...prev, ...ready].slice(0, COPILOT_MAX_PHOTOS));
    input.current?.focus();
  };

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [items]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 50); }, [open]);

  if (!open) return null;

  const contextLabel = ptwFormOpen
    ? "Drafting a permit"
    : formKind === "OBSERVATION" ? "Recording an observation"
    : formKind === "HIRA_ENTRY" ? "On this HIRA entry"
    : otherForm ? `Filling the ${otherForm}`
    : page.module === "HIRA" && page.studyId && !page.recordId ? "On this HIRA study"
    : page.recordId && page.module ? `On this ${MODULE_LABEL[page.module]?.toLowerCase() ?? "record"}` : null;

  const canSend = (!!draft.trim() || photos.length > 0) && !preparing;
  const submit = () => {
    if (!canSend || sending || unavailableReason) return;
    const t = draft;
    const p = photos;
    setDraft("");
    setPhotos([]);
    setPhotoError(null);
    void send(t, p);
  };
  const reportObservation = () => {
    // A form that takes photos (the observation form, a near miss…) keeps them; otherwise
    // the photo is for a new observation.
    if (formKind !== "OBSERVATION" && !formTakesPhotos) router.push("/observations/new");
    input.current?.focus();
  };

  return (
    <aside
      aria-label="SafeOps Copilot"
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-slate-200 bg-white shadow-xl sm:w-[420px]"
    >
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
            <Sparkles size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">SafeOps Copilot</div>
            <div className="truncate text-[11px] text-slate-500">{contextLabel ?? "Ask, draft or analyse"}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={newChat} disabled={sending} title="Start a new chat">
            <Plus size={14} /> New
          </Button>
          <Button type="button" variant="bare" onClick={() => setOpen(false)} aria-label="Close copilot"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <X size={16} />
          </Button>
        </div>
      </div>

      {ptwFormOpen && lastCheck && <CheckStrip check={lastCheck} />}
      {page.module === "HIRA" && !!page.recordId && <HiraScopeLine plantId={pagePlantId} />}

      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {unavailableReason && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span><strong>Copilot isn&apos;t available yet.</strong> {unavailableReason}</span>
          </div>
        )}
        {items.length === 0 && !unavailableReason && (
          <div className="space-y-3">
            <div className="rounded-lg bg-primary-50 p-3 text-sm text-primary-900">
              {formKind === "OBSERVATION" ? (
                <>Write what you saw in the description, or tell me here. I&apos;ll suggest the category, severity and
                  corrective action from thousands of reviewed observations, and fill them on the form for you to check.</>
              ) : formKind === "HIRA_ENTRY" ? (
                <>I can add hazards and controls to this entry and save them, and show how each control change moves
                  the residual risk. If you have unsaved edits here, press Save first so I don&apos;t overwrite them.</>
              ) : otherForm ? (
                <>Tell me what happened in your own words, or send a photo. I&apos;ll fill the {otherForm} for you to
                  check, tell you what&apos;s still missing, and you submit it.</>
              ) : ptwFormOpen ? (
                <>Describe the job in your own words — what, where, when and who. I&apos;ll fill the permit form as we go,
                  check it against the permit rules and tell you what&apos;s left.</>
              ) : (
                <>{introFor(page.module)}</>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start gap-2">
                <ClipboardList size={16} className="mt-0.5 shrink-0 text-primary-600" />
                {otherForm && formTakesPhotos ? (
                  <div className="min-w-0 text-xs text-slate-700">
                    <div className="font-semibold text-slate-900">Add a photo to this report</div>
                    Upload or take a photo and add a line on what happened. I&apos;ll use it to fill the {otherForm} and
                    put the photo in its photos section, to be saved when you submit.
                  </div>
                ) : (
                  <div className="min-w-0 text-xs text-slate-700">
                    <div className="font-semibold text-slate-900">Report a safety observation</div>
                    Upload or take a photo of what you saw and add a line on where it is. I&apos;ll describe the hazard,
                    suggest the category and severity, and put the photo on the observation form for you to submit.
                  </div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="outline" onClick={() => { reportObservation(); setCameraOpen(true); }}>
                  <Camera size={13} /> Take photo
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => { reportObservation(); fileInput.current?.click(); }}>
                  <ImagePlus size={13} /> Upload photo
                </Button>
                {formKind !== "OBSERVATION" && !formTakesPhotos && (
                  <Button type="button" size="sm" variant="ghost" onClick={reportObservation}>Open the form</Button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {suggestionsFor(page.module, page.recordId, ptwFormOpen, formKind, page.studyId ?? null).map((s) => (
                <Button key={s} type="button" variant="bare" onClick={() => void send(s)}
                  className="h-auto justify-start whitespace-normal rounded-lg border border-slate-200 px-3 py-2 text-left text-xs font-normal text-slate-700 hover:border-primary-300 hover:bg-primary-50/50">
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        {items.map((item) => <Message key={item.id} item={item} />)}
        {conversationTooLong && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            This chat is too long to continue.{" "}
            <Button type="button" variant="bare" className="h-auto p-0 text-xs font-semibold underline" onClick={newChat}>Start a new chat</Button>
            {ptwFormOpen ? " — the permit form keeps everything filled so far." : "."}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t p-3">
        {(photos.length > 0 || preparing) && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {photos.map((p) => (
              <div key={p.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt={p.file.name || "Photo"} className="h-14 w-14 rounded-md border border-slate-200 object-cover" />
                <Button type="button" variant="bare" aria-label="Remove photo"
                  onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))}
                  className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-slate-800 p-0 text-white hover:bg-slate-700">
                  <X size={11} />
                </Button>
              </div>
            ))}
            {preparing && <span className="flex items-center gap-1 text-[11px] text-slate-500"><Loader2 size={12} className="animate-spin" /> Preparing photo…</span>}
          </div>
        )}
        {photoError && (
          <div className="mb-2 flex items-start gap-1.5 rounded-md bg-rose-50 px-2 py-1 text-[11px] text-rose-800">
            <AlertCircle size={12} className="mt-0.5 shrink-0" /> {photoError}
          </div>
        )}
        <Input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (files.length) void addPhotos(files);
          }}
        />
        <CameraCaptureDialog open={cameraOpen} onOpenChange={setCameraOpen} onCapture={(files) => void addPhotos(files)} />
        <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-1.5 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
          <Textarea
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            rows={Math.min(5, Math.max(1, draft.split("\n").length))}
            maxLength={4000}
            disabled={!!unavailableReason}
            placeholder={ptwFormOpen ? "Describe the job, or ask what's missing…"
              : photos.length ? "Add where it is and what you saw (optional)…" : "Ask SafeOps Copilot…"}
            className="max-h-32 min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent px-1.5 py-1 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button type="button" variant="ghost" size="sm" aria-label="Upload photo" title="Upload photo"
            disabled={!!unavailableReason || sending || preparing || photos.length >= COPILOT_MAX_PHOTOS}
            onClick={() => fileInput.current?.click()} className="h-8 w-8 p-0 text-slate-500">
            <ImagePlus size={16} />
          </Button>
          <Button type="button" variant="ghost" size="sm" aria-label="Take photo" title="Take photo"
            disabled={!!unavailableReason || sending || preparing || photos.length >= COPILOT_MAX_PHOTOS}
            onClick={() => setCameraOpen(true)} className="h-8 w-8 p-0 text-slate-500">
            <Camera size={16} />
          </Button>
          {sending ? (
            <Button type="button" variant="outline" size="sm" onClick={stop} aria-label="Stop">
              <Square size={12} />
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={submit} disabled={!canSend} aria-label="Send">
              <ArrowUp size={14} />
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[10px] leading-tight text-slate-400">
          The copilot drafts and advises — you review every field and submit. HIRA work it saves stays a draft until
          a reviewer approves it. Checklist answers are always yours. Photos you attach are added to the
          observation form and saved only when you submit it.
          Ctrl/⌘ + J to toggle.
        </p>
      </div>
    </aside>
  );
}

export function CopilotLauncher() {
  const { available, open, toggle } = useCopilot();
  if (!available) return null;
  return (
    <Button type="button" variant={open ? "default" : "outline"} size="sm" onClick={toggle}
      aria-pressed={open} title="SafeOps Copilot (Ctrl/⌘ + J)" className="gap-1.5">
      <Sparkles size={14} />
      <span className="hidden md:inline">Copilot</span>
    </Button>
  );
}
