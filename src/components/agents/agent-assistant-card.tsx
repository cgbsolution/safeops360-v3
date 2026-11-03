"use client";

// Generic agent card — invoke / poll / review for any agent on the platform.
//
// HIRA_ASSISTANT, PERMIT_RISK_REVIEWER and TRIAGE_AGENT were registered and
// served by the backend but had no screen that could run them. This card gives
// every agent the same lifecycle the RCA and CAPA cards use, and renders the
// agent's structured draft generically, so a new agent needs only a mount.
//
// State machine: IDLE → RUNNING (poll) → PENDING_REVIEW → ACCEPTED/REJECTED,
// or ERRORED. Advisory only: nothing here writes to the source record.
//
// Network (auto-proxied to FastAPI by src/app/api/[...path]/route.ts):
//   POST /api/agents/{agentCode}/invoke
//   GET  /api/agent-invocations/{id}
//   POST /api/agent-invocations/{id}/decision
//   GET  /api/agents/latest-invocation?sourceModule=..&sourceRecordId=..

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { usePermission } from "@/components/auth/can";
import { AlertCircle, AlertTriangle, Check, CircleDashed, Loader2, Sparkles, X as XIcon, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_MS = 240_000;

type ToolCall = { id?: string; sequence: number; toolName: string; executionMs?: number | null; hadError?: boolean };
type Invocation = {
  id: string;
  invocationNumber: string;
  status: string; // RUNNING | PENDING_REVIEW | ACCEPTED | MODIFIED | REJECTED | ERRORED
  modelUsed?: string | null;
  totalCostUsd?: number | null;
  latencyMs?: number | null;
  invokedAt?: string | null;
  agentReasoning?: string | null;
  agentSuggestion?: Record<string, any> | null;
  agentConfidence?: number | null;
  errorType?: string | null;
  errorDetails?: string | null;
  hallucinationFlagged?: boolean;
  hallucinationDetails?: { value?: string; recordType?: string }[] | null;
  toolCalls?: ToolCall[];
};
type StartResponse = { invocationId: string; invocationNumber: string; status: string };

export type AgentAssistantCardProps = {
  /** Agent.code, e.g. "PERMIT_RISK_REVIEWER". */
  agentCode: string;
  /** Source module the backend resolves the record in: INCIDENT | PTW | HIRA | CAPA | OBSERVATION. */
  sourceModule: string;
  sourceRecordId: string;
  /** Invoke permission; the card renders nothing without it. */
  permission: string;
  title: string;
  /** One or two sentences shown before the first run. */
  description: string;
  /** What the running state says it is doing. */
  runningLabel?: string;
  /** Rough duration shown to the user, e.g. "30–60 seconds". */
  expectedDuration?: string;
};

export function AgentAssistantCard({
  agentCode,
  sourceModule,
  sourceRecordId,
  permission,
  title,
  description,
  runningLabel = "Loading the record and analysing…",
  expectedDuration = "30–90 seconds"
}: AgentAssistantCardProps) {
  const canInvoke = usePermission(permission);
  const { toast } = useToast();

  const [invocation, setInvocation] = useState<Invocation | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [pollNote, setPollNote] = useState<string | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const pollAbortRef = useRef<{ cancelled: boolean } | null>(null);

  useEffect(
    () => () => {
      if (pollAbortRef.current) pollAbortRef.current.cancelled = true;
    },
    []
  );

  const runningStatus = invocation?.status;
  useEffect(() => {
    if (runningStatus !== "RUNNING") return;
    const t = setInterval(() => {
      if (startTimeRef.current != null) setElapsedMs(Date.now() - startTimeRef.current);
    }, 500);
    return () => clearInterval(t);
  }, [runningStatus]);

  // Rehydrate the latest run so a finished draft survives a reload.
  useEffect(() => {
    if (!canInvoke) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/agents/latest-invocation?sourceModule=${encodeURIComponent(sourceModule)}&sourceRecordId=${encodeURIComponent(sourceRecordId)}`,
          { cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const inv = (await res.json()) as Invocation | null;
        if (!inv || !inv.id || cancelled) return;
        setInvocation((cur) => cur ?? inv);
        if (inv.status === "RUNNING") {
          startTimeRef.current = inv.invokedAt ? new Date(inv.invokedAt).getTime() : Date.now();
          const token = { cancelled: false };
          pollAbortRef.current = token;
          pollUntilDone(inv.id, token);
        }
      } catch {
        /* stay IDLE */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceModule, sourceRecordId, canInvoke]);

  if (!canInvoke) return null;

  async function startInvocation(forceEscalation = false) {
    setStarting(true);
    setError(null);
    setInvocation(null);
    setPollNote(null);
    setElapsedMs(0);
    startTimeRef.current = Date.now();

    if (pollAbortRef.current) pollAbortRef.current.cancelled = true;
    const cancelToken = { cancelled: false };
    pollAbortRef.current = cancelToken;

    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentCode)}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceModule, sourceRecordId, forceEscalationModel: forceEscalation })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? body?.error ?? `Invocation failed (${res.status})`);
      }
      const start = (await res.json()) as StartResponse;
      setInvocation({ id: start.invocationId, invocationNumber: start.invocationNumber, status: "RUNNING", toolCalls: [] });
      await pollUntilDone(start.invocationId, cancelToken);
    } catch (e: any) {
      if (!cancelToken.cancelled) setError(e?.message ?? "Could not start the agent");
    } finally {
      setStarting(false);
    }
  }

  async function pollUntilDone(invocationId: string, cancelToken: { cancelled: boolean }) {
    const deadline = Date.now() + POLL_MAX_MS;
    let consecutiveErrors = 0;
    while (Date.now() < deadline) {
      if (cancelToken.cancelled) return;
      try {
        const res = await fetch(`/api/agent-invocations/${invocationId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const next = (await res.json()) as Invocation;
        if (cancelToken.cancelled) return;
        consecutiveErrors = 0;
        setPollNote(null);
        setInvocation(next);
        if (next.status !== "RUNNING") return;
      } catch {
        if (cancelToken.cancelled) return;
        consecutiveErrors += 1;
        setPollNote("Reconnecting to the agent service…");
        if (consecutiveErrors >= 8) {
          setError("Lost connection to the agent service. The result may still be finishing — click “Check status”.");
          return;
        }
      }
      if (cancelToken.cancelled) return;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    await checkStatusNow(invocationId);
    if (!cancelToken.cancelled) setError("The agent is taking longer than usual — click “Check status” to refresh.");
  }

  async function checkStatusNow(id?: string) {
    const invocationId = id ?? invocation?.id;
    if (!invocationId) return;
    setPollNote("Checking…");
    try {
      const res = await fetch(`/api/agent-invocations/${invocationId}`, { cache: "no-store" });
      if (res.ok) {
        const next = (await res.json()) as Invocation;
        setInvocation(next);
        if (next.status !== "RUNNING") setError(null);
      }
    } catch {
      /* user can click again */
    } finally {
      setPollNote(null);
    }
  }

  async function recordDecision(decision: "ACCEPT_AS_IS" | "REJECT") {
    if (!invocation) return;
    let rejectionReason: string | undefined;
    if (decision === "REJECT") {
      rejectionReason = "Dismissed from the review card";
    }
    try {
      const res = await fetch(`/api/agent-invocations/${invocation.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, rejectionReason })
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.detail ?? b?.error ?? `Decision failed (${res.status})`);
      }
      const updated = (await res.json()) as Invocation;
      setInvocation(updated);
      toast({
        variant: "success",
        title: decision === "REJECT" ? "Draft dismissed" : "Draft marked as used",
        description: `Invocation ${updated.invocationNumber} → ${updated.status.toLowerCase()}`
      });
    } catch (e: any) {
      toast({ variant: "error", title: "Could not record decision", description: e?.message ?? "Try again" });
    }
  }

  const status = invocation?.status ?? null;

  if (!invocation && !error) {
    return (
      <Card className="border-violet-200 bg-violet-50/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-violet-900 text-base">
            <Sparkles size={16} /> {title}
            <span className="ml-2 rounded-full bg-violet-100 px-2 py-px text-[10px] font-medium text-violet-700">AI · advisory</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-violet-900">
          <p>{description}</p>
          <p className="text-xs text-violet-700">
            Estimated time: {expectedDuration} · Advisory — nothing is written to this record automatically.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="success" onClick={() => startInvocation(false)} disabled={starting}>
              <Sparkles size={14} /> {starting ? "Starting…" : "Run analysis"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => startInvocation(true)}
              disabled={starting}
              title="Use the escalation model for a deeper analysis. Slower and more expensive."
            >
              <Zap size={12} /> Deep analysis
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!invocation && error) {
    return (
      <Card className="border-rose-200 bg-rose-50/40">
        <CardContent className="p-4 space-y-2 text-sm text-rose-900">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle size={14} /> {title} could not start
          </div>
          <p className="text-xs">{error}</p>
          <Button size="sm" variant="outline" onClick={() => startInvocation(false)}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const inv = invocation!;
  const reviewed = status === "PENDING_REVIEW" || status === "ACCEPTED" || status === "REJECTED" || status === "MODIFIED";
  return (
    <Card className="border-violet-300 bg-violet-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-violet-900 text-base">
          <Sparkles size={16} /> {title}
          <Badge
            className={cn(
              "ml-auto text-[10px] font-medium",
              status === "RUNNING" && "bg-amber-100 text-amber-900 border-amber-300",
              (status === "PENDING_REVIEW" || status === "ACCEPTED" || status === "MODIFIED") &&
                "bg-emerald-100 text-emerald-900 border-emerald-300",
              status === "REJECTED" && "bg-slate-100 text-slate-700 border-slate-300",
              status === "ERRORED" && "bg-rose-100 text-rose-900 border-rose-300"
            )}
          >
            {status === "RUNNING" ? (
              <>
                <Loader2 size={11} className="animate-spin" /> Running
              </>
            ) : (
              status?.replace(/_/g, " ").toLowerCase() ?? ""
            )}
          </Badge>
        </CardTitle>
        <div className="text-[10px] text-violet-700 tracking-wide">
          Ref {inv.invocationNumber}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {status === "RUNNING" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-violet-800">
              <span className="flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" /> Analysing…
              </span>
              <span className="tabular-nums font-medium">{fmtElapsed(elapsedMs)}</span>
            </div>
            <div className="text-xs text-violet-700 flex items-center gap-2">
              <CircleDashed size={11} className="animate-pulse" />
              {pollNote ?? runningLabel}
            </div>
            {error && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 space-y-2">
                <span>{error}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => checkStatusNow()}>
                    <Loader2 size={12} /> Check status
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => startInvocation(false)}>
                    <Sparkles size={12} /> Start over
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {status === "ERRORED" && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-900 text-sm space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" />
              <div className="font-medium">
                {inv.errorType ?? "Error"}: {inv.errorDetails ?? "Unknown failure"}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => startInvocation(false)} disabled={starting}>
              {starting ? "Retrying…" : "Retry"}
            </Button>
          </div>
        )}

        {reviewed && (
          <>
            {inv.errorType && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                <span>
                  {inv.errorType.replace(/_/g, " ").toLowerCase()}: {inv.errorDetails}
                </span>
              </div>
            )}
            {inv.hallucinationFlagged && (
              <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900">
                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                <span>
                  The draft cites record numbers that do not exist:{" "}
                  {(inv.hallucinationDetails ?? []).map((h) => h.value).filter(Boolean).join(", ") || "see audit trail"}. Treat
                  those references as unreliable.
                </span>
              </div>
            )}
            {inv.agentSuggestion ? (
              <SuggestionTree value={inv.agentSuggestion} />
            ) : (
              <div className="text-xs text-slate-500 italic">The agent returned no structured suggestion.</div>
            )}
            {inv.agentReasoning && (
              <details className="rounded-md border border-violet-100 bg-white/70 p-2.5 text-xs text-slate-700">
                <summary className="cursor-pointer text-violet-800 font-medium">Agent reasoning</summary>
                <p className="mt-1.5 whitespace-pre-wrap">{inv.agentReasoning}</p>
              </details>
            )}
            {typeof inv.agentConfidence === "number" && (
              <div className="text-[11px] text-slate-500">
                Overall confidence: <span className="font-medium">{Math.round(inv.agentConfidence * 100)}%</span>
              </div>
            )}
          </>
        )}

        {status === "PENDING_REVIEW" && (
          <div className="rounded-md border border-violet-200 bg-white/70 p-2.5 text-xs text-violet-800 space-y-2">
            <p>
              This is an advisory draft for your review. Recording a decision trains the assistant; it does not change
              this record.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="success" onClick={() => recordDecision("ACCEPT_AS_IS")}>
                <Check size={13} /> Mark as used
              </Button>
              <Button size="sm" variant="outline" onClick={() => recordDecision("REJECT")}>
                <XIcon size={13} /> Dismiss
              </Button>
            </div>
          </div>
        )}

        {status !== "RUNNING" && (
          <div className="pt-2 border-t border-violet-200/60 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => startInvocation(false)} disabled={starting} className="ml-auto">
              <Sparkles size={12} /> {starting ? "Starting…" : "Run again"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => startInvocation(true)}
              disabled={starting}
              title="Use the escalation model for a deeper, slower, more expensive analysis."
            >
              <Zap size={12} /> Deep analysis
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ── Generic structured-draft renderer ───────────────────────────────────

const TITLE_KEYS = ["title", "name", "summary", "description", "hazardName", "label"];

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function isConfidenceKey(key: string) {
  return /confidence$/i.test(key);
}

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-rose-100 text-rose-900 border-rose-300",
  high: "bg-orange-100 text-orange-900 border-orange-300",
  moderate: "bg-amber-100 text-amber-900 border-amber-300",
  medium: "bg-amber-100 text-amber-900 border-amber-300",
  low: "bg-emerald-100 text-emerald-900 border-emerald-300",
  info: "bg-slate-100 text-slate-700 border-slate-300"
};

function Scalar({ k, v }: { k?: string; v: unknown }) {
  if (v === null || v === undefined || v === "") return <span className="text-slate-400">—</span>;
  if (typeof v === "boolean") return <span>{v ? "Yes" : "No"}</span>;
  if (typeof v === "number" && k && isConfidenceKey(k) && v >= 0 && v <= 1) {
    return <span className="font-medium">{Math.round(v * 100)}%</span>;
  }
  if (typeof v === "string" && k && /^(severity|level|priority|riskLevel)$/i.test(k)) {
    const tone = SEVERITY_TONE[v.toLowerCase()];
    if (tone) return <Badge className={cn("text-[10px] font-medium", tone)}>{v}</Badge>;
  }
  return <span className="whitespace-pre-wrap">{String(v)}</span>;
}

function SuggestionTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || typeof value !== "object") return <Scalar v={value} />;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-xs text-slate-400 italic">None</span>;
    if (value.every((x) => x === null || typeof x !== "object")) {
      return (
        <ul className="space-y-0.5">
          {value.map((x, i) => (
            <li key={i} className="text-xs text-slate-700">
              • <Scalar v={x} />
            </li>
          ))}
        </ul>
      );
    }
    return (
      <div className="space-y-2">
        {value.map((x, i) => (
          <div key={i} className="rounded-lg border border-violet-100 bg-white p-2.5">
            <SuggestionTree value={x} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  const obj = value as Record<string, unknown>;
  if (typeof obj._unparsed === "string") {
    return <pre className="text-[11px] whitespace-pre-wrap rounded bg-slate-50 border p-2 text-slate-700">{obj._unparsed}</pre>;
  }
  const entries = Object.entries(obj).filter(([k]) => !k.startsWith("_"));
  const titleKey = depth > 0 ? TITLE_KEYS.find((k) => typeof obj[k] === "string" && obj[k]) : undefined;
  const rest = entries.filter(([k]) => k !== titleKey);
  const scalars = rest.filter(([, v]) => v === null || typeof v !== "object");
  const nested = rest.filter(([, v]) => v !== null && typeof v === "object");

  return (
    <div className="space-y-2">
      {titleKey && <div className="text-sm font-medium text-slate-800">{String(obj[titleKey])}</div>}
      {scalars.length > 0 && (
        <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1 text-xs">
          {scalars.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{humanizeKey(k)}</dt>
              <dd className="text-slate-800">
                <Scalar k={k} v={v} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {nested.map(([k, v]) => (
        <div key={k} className={cn(depth === 0 ? "space-y-1.5" : "space-y-1 border-l-2 border-violet-200 pl-2")}>
          <div
            className={cn(
              "uppercase tracking-wider",
              depth === 0 ? "text-xs font-semibold text-violet-700" : "text-[10px] text-slate-400"
            )}
          >
            {humanizeKey(k)}
            {Array.isArray(v) && v.length > 0 && ` (${v.length})`}
          </div>
          <SuggestionTree value={v} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}
