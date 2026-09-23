"use client";

// Lifecycle controls for one Kaizen.
//
// Every button here is rendered from the server's `availableActions`, which is
// computed from the same transition table the API gates on. The client never
// re-derives the rules — a client that guesses produces either a button that
// 403s or a hidden action the user was entitled to, and both shipped on PTW
// before the gate moved server-side.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Loader2, Send, XCircle, GitBranch, Share2, BookOpen } from "lucide-react";
import Link from "next/link";
import { KAIZEN_ACTION_LABEL } from "../../_meta";
import { ReplicateDialog } from "./replicate-dialog";

// The statuses from which an idea is worth spreading. Mirrors
// REPLICABLE_STATUSES in the router — the server is the gate, this only decides
// whether to render the button.
const REPLICABLE = ["IN_IMPLEMENTATION", "IMPLEMENTED", "VERIFIED", "CLOSED"];

export function KaizenActions({
  id,
  status,
  availableActions,
  verifiedAnnualSaving,
  currency,
  canRaiseRca,
  hasRca,
  approvalBlockers,
  canCreateOpl,
  generatedOplId,
  generatedOplNo,
  generatedOplTitle,
  plantId
}: {
  id: string;
  status: string;
  availableActions: string[];
  verifiedAnnualSaving: number | null;
  currency: string;
  canRaiseRca: boolean;
  hasRca: boolean;
  /** Empty means Approve is possible. The server enforces the same list — this
   *  is what lets the button be DISABLED WITH A REASON rather than hidden. */
  approvalBlockers: string[];
  canCreateOpl: boolean;
  generatedOplId: string | null;
  generatedOplNo: string | null;
  generatedOplTitle: string | null;
  plantId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [replicating, setReplicating] = useState(false);
  const [saving, setSaving] = useState(String(verifiedAnnualSaving ?? ""));
  const [note, setNote] = useState("");

  async function call(path: string, body?: any, label = "Done") {
    setBusy(path);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) {
        throw new Error((await res.json())?.detail ?? "That did not work.");
      }
      toast({ variant: "success", title: label });
      setRejecting(false);
      setVerifying(false);
      router.refresh();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not complete that", description: e?.message });
    } finally {
      setBusy(null);
    }
  }

  // VERIFIED needs a figure recorded first, so it opens a panel rather than
  // firing immediately. The API enforces the same precondition — this just
  // means the user is asked for the number instead of being refused.
  const transitions = availableActions.filter((a) => a !== "REJECTED");
  const canReject = availableActions.includes("REJECTED");
  const canReplicate = REPLICABLE.includes(status);
  const showOplAction = status === "CLOSED" && (canCreateOpl || !!generatedOplId);

  if (!transitions.length && !canReject && !canRaiseRca && !canReplicate && !showOplAction) {
    return (
      <p className="text-sm text-slate-500">
        No further action is available to you on this record at {status.toLowerCase()}.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {transitions.map((a) => {
          // Approve stays VISIBLE and goes disabled with a reason rather than
          // disappearing. A hidden button teaches nobody anything; a disabled
          // one that says "Assign an owner before approving" tells the approver
          // exactly what to do next. Same pattern as OPL's "no audience
          // selected" warning.
          const blocked = a === "APPROVED" && approvalBlockers.length > 0;
          return (
            <span key={a} title={blocked ? approvalBlockers.join(" ") : undefined}>
              <Button
                variant={a === "PARKED" ? "outline" : "default"}
                disabled={busy !== null || blocked}
                aria-disabled={blocked}
                onClick={() => {
                  if (a === "VERIFIED") {
                    setVerifying(true);
                    return;
                  }
                  call(
                    `/api/be/kaizen/${id}/transition/${a}`,
                    {},
                    KAIZEN_ACTION_LABEL[a] ?? "Updated"
                  );
                }}
              >
                {busy?.includes(`/transition/${a}`) ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                {KAIZEN_ACTION_LABEL[a] ?? a}
              </Button>
            </span>
          );
        })}

        {canReject && (
          <Button variant="outline" disabled={busy !== null} onClick={() => setRejecting((v) => !v)}>
            <XCircle size={16} /> Reject
          </Button>
        )}

        {canReplicate && (
          <Button variant="outline" disabled={busy !== null} onClick={() => setReplicating(true)}>
            <Share2 size={16} /> Replicate at another plant
          </Button>
        )}

        {showOplAction &&
          (generatedOplId ? (
            <Button variant="outline" asChild>
              <Link href={`/business-excellence/opl/${generatedOplId}`}>
                <BookOpen size={16} />
                {generatedOplNo
                  ? `One Point Lesson ${generatedOplNo}`
                  : generatedOplTitle ?? "Open the One Point Lesson"}
              </Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                call(
                  `/api/be/kaizen/${id}/create-opl`,
                  undefined,
                  "One Point Lesson drafted"
                )
              }
            >
              {busy?.includes("create-opl") ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <BookOpen size={16} />
              )}
              Create One Point Lesson from this
            </Button>
          ))}

        {canRaiseRca && (
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              call(
                `/api/erm/rca/problem-rcas`,
                { sourceProblemId: id },
                hasRca ? "Opened the existing analysis" : "Root cause analysis opened"
              )
            }
          >
            {busy?.includes("problem-rcas") ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <GitBranch size={16} />
            )}
            {hasRca ? "Open root cause analysis" : "Raise root cause analysis"}
          </Button>
        )}
      </div>

      {approvalBlockers.length > 0 && transitions.includes("APPROVED") && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <span className="font-semibold">Approval is blocked.</span>{" "}
          {approvalBlockers.join(" ")} An approval with no owner is a decision
          that produces no action.
        </div>
      )}

      {showOplAction && !generatedOplId && canCreateOpl && (
        <p className="text-xs text-slate-500">
          The lesson is created as a draft with no audience — you choose who has
          to read it and publish it yourself, exactly as for a hand-written one.
        </p>
      )}

      {replicating && (
        <ReplicateDialog
          kaizenId={id}
          sourcePlantId={plantId}
          onClose={() => setReplicating(false)}
        />
      )}

      {verifying && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="text-sm font-semibold text-emerald-900">Verify the realised saving</h3>
          <p className="mt-0.5 text-xs text-emerald-800">
            This is the figure the plant actually banked, not the estimate. It cannot be
            recorded by the person who raised the idea.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs font-medium text-emerald-900">
                Verified annual saving ({currency})
              </Label>
              <Input
                type="number"
                min={0}
                value={saving}
                onChange={(e) => setSaving(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs font-medium text-emerald-900">
                How it was measured
              </Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Cycle-time study, 3 shifts, line 4"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              disabled={saving === "" || busy !== null}
              onClick={async () => {
                // Two calls on purpose: the figure is a record edit, the
                // transition is a governance act. Doing them as one endpoint
                // would let a status change smuggle a savings number past the
                // separate-verifier rule.
                setBusy("verify");
                try {
                  const patch = await fetch(`/api/be/kaizen/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ verifiedAnnualSaving: Number(saving) })
                  });
                  if (!patch.ok) {
                    throw new Error(
                      (await patch.json())?.detail ?? "Could not record the saving."
                    );
                  }
                } catch (e: any) {
                  toast({ variant: "error", title: "Could not record the saving", description: e?.message });
                  setBusy(null);
                  return;
                }
                setBusy(null);
                await call(
                  `/api/be/kaizen/${id}/transition/VERIFIED`,
                  { note: note || undefined },
                  "Savings verified"
                );
              }}
            >
              {busy === "verify" ? <Loader2 size={16} className="animate-spin" /> : null}
              Confirm
            </Button>
            <Button variant="outline" onClick={() => setVerifying(false)} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {rejecting && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <Label className="mb-1 block text-xs font-medium text-rose-900">
            Why is this being rejected? The person who raised it will see this.
          </Label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="mt-3 flex gap-2">
            <Button
              variant="destructive"
              disabled={reason.trim().length < 4 || busy !== null}
              onClick={() => call(`/api/be/kaizen/${id}/reject`, { reason: reason.trim() }, "Rejected")}
            >
              {busy?.includes("/reject") ? <Loader2 size={16} className="animate-spin" /> : null}
              Confirm rejection
            </Button>
            <Button variant="outline" onClick={() => setRejecting(false)} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
