"use client";

// Lifecycle + gate controls for one circle project.
//
// Every button is rendered from the server's `availableActions`, and every gate
// from the server's `signOffBlockers`. The client never re-derives either — a
// client that guesses produces a button that 403s or a hidden action the user
// was entitled to.
//
// Where a transition is permitted but would still fail, the server sends the
// reason in `transitionBlockers` and it is shown next to the disabled button.
// A disabled control with no explanation is the single most reported defect on
// this platform's permit screens.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Loader2, Send, CheckCheck, GitBranch, Award } from "lucide-react";
import { QCC_ACTION_LABEL, STAGE_LABEL, type QccStage } from "../../../_meta-p2";
import { BlockerNote } from "../../../ui-p2";

export function ProjectActions({
  id,
  status,
  availableActions,
  transitionBlockers,
  rcaId,
  rcaStage,
  canUpdate,
  canEvaluate
}: {
  id: string;
  status: string;
  availableActions: string[];
  transitionBlockers: Record<string, string[]>;
  rcaId: string | null;
  rcaStage: string | null;
  canUpdate: boolean;
  canEvaluate: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "evaluate">(null);
  const [score, setScore] = useState("");
  const [presentationRef, setPresentationRef] = useState("");

  async function call(path: string, body?: any, label = "Done") {
    setBusy(path);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "That did not work.");
      toast({ variant: "success", title: label });
      setPanel(null);
      router.refresh();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not complete that", description: e?.message });
    } finally {
      setBusy(null);
    }
  }

  const showRca = canUpdate && !rcaId && !["CLOSED", "ABANDONED", "REJECTED"].includes(status);
  const showEvaluate =
    canEvaluate && ["COMPLETED", "BENEFIT_VALIDATION", "CLOSED"].includes(status);

  if (!availableActions.length && !showRca && !showEvaluate) {
    return (
      <p className="text-sm text-slate-500">
        No further action is available to you on this project at{" "}
        {status.replace(/_/g, " ").toLowerCase()}.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {showRca ? (
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              call(`/api/be/qcc/projects/${id}/rca`, { methodology: "FIVE_WHY" }, "Analysis opened")
            }
          >
            {busy?.endsWith("rca") ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <GitBranch size={14} className="mr-1.5" />
            )}
            Open the root cause analysis
          </Button>
        ) : null}

        {showEvaluate ? (
          <Button
            variant="outline"
            onClick={() => setPanel(panel === "evaluate" ? null : "evaluate")}
          >
            <Award size={14} className="mr-1.5" />
            Score the project
          </Button>
        ) : null}
      </div>

      {showRca ? (
        <p className="text-xs text-slate-500">
          The analysis is recorded in the platform&rsquo;s shared RCA register, not
          here — the {rcaStage ? (STAGE_LABEL[rcaStage] ?? rcaStage) : "analysis"} gate
          cannot be signed off without it.
        </p>
      ) : null}

      {panel === "evaluate" ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="score">Score</Label>
              <Input
                id="score"
                type="number"
                min={0}
                step="0.1"
                value={score}
                onChange={(e) => setScore(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="presentationRef">Presentation reference</Label>
              <Input
                id="presentationRef"
                value={presentationRef}
                onChange={(e) => setPresentationRef(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          {/* The API additionally refuses a score from anyone who was ever in
              the circle, so say so rather than letting them find out by 403. */}
          <p className="text-xs text-slate-500">
            A circle cannot score its own project — this will be refused if you are on
            the roster, past or present.
          </p>
          <Button
            disabled={busy !== null || !score}
            onClick={() =>
              call(
                `/api/be/qcc/projects/${id}/evaluate`,
                {
                  score: Number(score),
                  presentationRef: presentationRef.trim() || null
                },
                "Score recorded"
              )
            }
          >
            {busy?.endsWith("evaluate") ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : null}
            Record the score
          </Button>
        </div>
      ) : null}

      <div className="space-y-2">
        {availableActions.map((a) => {
          const blockers = transitionBlockers[a] ?? [];
          const blocked = blockers.length > 0;
          return (
            <div key={a}>
              <Button
                variant={a === "CHARTERED" || a === "CLOSED" ? "default" : "outline"}
                disabled={busy !== null || blocked}
                onClick={() =>
                  call(
                    a === "CHARTERED"
                      ? `/api/be/qcc/projects/${id}/charter`
                      : `/api/be/qcc/projects/${id}/transition/${a}`,
                    a === "CHARTERED" ? undefined : {},
                    QCC_ACTION_LABEL[a] ?? "Updated"
                  )
                }
              >
                {busy?.includes(a) ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <Send size={14} className="mr-1.5" />
                )}
                {QCC_ACTION_LABEL[a] ?? a}
              </Button>
              <BlockerNote blockers={blockers} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Sign off one gate. Rendered inside the gate it belongs to. */
export function StageSignOff({
  projectId,
  stage,
  canSignOff,
  canUpdate
}: {
  projectId: string;
  stage: QccStage;
  canSignOff: boolean;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(stage.summary ?? "");
  const [note, setNote] = useState("");

  if (stage.status === "SIGNED_OFF" || stage.status === "SKIPPED") return null;

  async function call(path: string, body: any, method: string, label: string) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "That did not work.");
      toast({ variant: "success", title: label });
      setEditing(false);
      router.refresh();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not update the gate", description: e?.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {editing ? (
        <div className="space-y-2">
          <Label htmlFor={`summary-${stage.id}`}>What this stage concluded</Label>
          <Textarea
            id={`summary-${stage.id}`}
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                call(
                  `/api/be/qcc/projects/${projectId}/stages/${stage.stage}`,
                  { summary: summary.trim() || null, status: "IN_PROGRESS" },
                  "PATCH",
                  "Gate updated"
                )
              }
            >
              {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : null}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {canUpdate ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {stage.summary ? "Edit conclusion" : "Record what this stage found"}
            </Button>
          ) : null}
          {canSignOff ? (
            <Button
              size="sm"
              disabled={busy || stage.signOffBlockers.length > 0}
              onClick={() =>
                call(
                  `/api/be/qcc/projects/${projectId}/stages/${stage.stage}/signoff`,
                  { note: note.trim() || null },
                  "POST",
                  `${STAGE_LABEL[stage.stage] ?? stage.stage} signed off`
                )
              }
            >
              {busy ? (
                <Loader2 size={13} className="mr-1 animate-spin" />
              ) : (
                <CheckCheck size={13} className="mr-1" />
              )}
              Sign off
            </Button>
          ) : null}
        </div>
      )}

      {/* Why the sign-off button is disabled, straight from the server. */}
      {canSignOff ? <BlockerNote blockers={stage.signOffBlockers} /> : null}
    </div>
  );
}
