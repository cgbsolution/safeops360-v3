"use client";

// Lifecycle controls for one suggestion.
//
// Every button here is rendered from the server's `availableActions`, computed
// from the same transition table the API gates on. The client never re-derives
// the rules — a client that guesses produces either a button that 403s or a
// hidden action the user was entitled to, and both shipped on PTW before the
// gate moved server-side.
//
// §3's two stages are two separate panels on purpose. Triage and the committee
// decision are different acts by (usually) different people, and a single
// "decide" control would invite the coordinator to do both.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Loader2, Send, Gavel, Filter, Gift } from "lucide-react";
import {
  INCENTIVE_STATUS_LABEL,
  SCREENING_OUTCOME_LABEL,
  SUGGESTION_ACTION_LABEL,
  SUGGESTION_DECISION_LABEL
} from "../../_meta-p2";
import { Select, SelectItem } from "@/components/ui/select";

export function SuggestionActions({
  id,
  status,
  availableActions,
  screeningOutcome,
  incentiveStatus,
  canScreen,
  canDecide
}: {
  id: string;
  status: string;
  availableActions: string[];
  screeningOutcome: string | null;
  incentiveStatus: string;
  canScreen: boolean;
  canDecide: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "screen" | "decide" | "incentive">(null);

  const [outcome, setOutcome] = useState("RELEVANT");
  const [screenNote, setScreenNote] = useState("");
  const [duplicateOf, setDuplicateOf] = useState("");

  const [decision, setDecision] = useState("ACCEPT");
  const [rationale, setRationale] = useState("");
  const [deferUntil, setDeferUntil] = useState("");

  const [incStatus, setIncStatus] = useState(incentiveStatus);
  const [incPoints, setIncPoints] = useState("");
  const [incAmount, setIncAmount] = useState("");
  const [incNote, setIncNote] = useState("");

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
      toast({
        variant: "error",
        title: "Could not complete that",
        description: e?.message
      });
    } finally {
      setBusy(null);
    }
  }

  // Triage and the committee decision have their own endpoints and their own
  // required fields, so they are removed from the generic transition list.
  const DECISION_TARGETS = new Set(["ACCEPTED", "REJECTED", "DEFERRED", "DUPLICATE"]);
  const transitions = availableActions.filter((a) => !DECISION_TARGETS.has(a));
  const showTriage = canScreen && (status === "SUBMITTED" || status === "SCREENING");
  const showDecision =
    canDecide && (status === "SCREENING" || status === "DEFERRED") && !!screeningOutcome;
  const showIncentive =
    canDecide &&
    ["ACCEPTED", "IN_IMPLEMENTATION", "IMPLEMENTED", "CLOSED"].includes(status);

  const nothing =
    !transitions.length && !showTriage && !showDecision && !showIncentive;

  if (nothing) {
    return (
      <p className="text-sm text-slate-500">
        No further action is available to you on this suggestion at{" "}
        {status.replace(/_/g, " ").toLowerCase()}.
        {canDecide && status === "SCREENING" && !screeningOutcome
          ? " It needs to be triaged before the committee can decide on it."
          : null}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {transitions.map((a) => {
          // DRAFT → SUBMITTED is its own endpoint, not a generic transition:
          // it assigns the record number and starts the workflow. Resolved to a
          // named variable rather than a ternary inside the URL template — a
          // nested template literal in a path is unreadable at a glance and is
          // exactly where an off-by-one slash hides.
          const isFirstSubmit = a === "SUBMITTED" && status === "DRAFT";
          const path = isFirstSubmit
            ? `/api/be/suggestions/${id}/submit`
            : `/api/be/suggestions/${id}/transition/${a}`;
          return (
          <Button
            key={a}
            variant={a === "SUBMITTED" ? "default" : "outline"}
            disabled={busy !== null}
            onClick={() =>
              call(path, isFirstSubmit ? undefined : {}, SUGGESTION_ACTION_LABEL[a] ?? "Updated")
            }
          >
            {busy?.includes(a) || busy?.endsWith("submit") ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Send size={14} className="mr-1.5" />
            )}
            {SUGGESTION_ACTION_LABEL[a] ?? a}
          </Button>
          );
        })}

        {showTriage ? (
          <Button variant="outline" onClick={() => setPanel(panel === "screen" ? null : "screen")}>
            <Filter size={14} className="mr-1.5" />
            Triage
          </Button>
        ) : null}

        {showDecision ? (
          <Button onClick={() => setPanel(panel === "decide" ? null : "decide")}>
            <Gavel size={14} className="mr-1.5" />
            Committee decision
          </Button>
        ) : null}

        {showIncentive ? (
          <Button
            variant="outline"
            onClick={() => setPanel(panel === "incentive" ? null : "incentive")}
          >
            <Gift size={14} className="mr-1.5" />
            Incentive
          </Button>
        ) : null}
      </div>

      {panel === "screen" ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <Label htmlFor="outcome">Triage outcome</Label>
            <Select
              id="outcome"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            >
              {Object.entries(SCREENING_OUTCOME_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-500">
              “Not relevant” still goes to the committee — only a duplicate closes
              here, and it must name what it duplicates.
            </p>
          </div>
          {outcome === "DUPLICATE" ? (
            <div>
              <Label htmlFor="dup">Duplicate of (suggestion id)</Label>
              <Input
                id="dup"
                value={duplicateOf}
                onChange={(e) => setDuplicateOf(e.target.value)}
                placeholder="Paste the id of the suggestion this repeats"
              />
              <p className="mt-1 text-xs text-slate-500">
                An unlinked duplicate is indistinguishable from a rejection, so this
                is required.
              </p>
            </div>
          ) : null}
          <div>
            <Label htmlFor="screenNote">Note (optional)</Label>
            <Textarea
              id="screenNote"
              rows={2}
              value={screenNote}
              onChange={(e) => setScreenNote(e.target.value)}
            />
          </div>
          <Button
            disabled={busy !== null || (outcome === "DUPLICATE" && !duplicateOf.trim())}
            onClick={() =>
              call(
                `/api/be/suggestions/${id}/screen`,
                {
                  outcome,
                  note: screenNote.trim() || null,
                  duplicateOfSuggestionId:
                    outcome === "DUPLICATE" ? duplicateOf.trim() : null
                },
                "Triaged"
              )
            }
          >
            {busy?.endsWith("screen") ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : null}
            Record triage
          </Button>
        </div>
      ) : null}

      {panel === "decide" ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <Label htmlFor="decision">Decision</Label>
            <Select
              id="decision"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
            >
              {Object.entries(SUGGESTION_DECISION_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </Select>
          </div>
          {decision === "DEFER" ? (
            <div>
              <Label htmlFor="deferUntil">Look at it again on</Label>
              <Input
                id="deferUntil"
                type="date"
                value={deferUntil}
                onChange={(e) => setDeferUntil(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                Required. A deferral with no return date is a rejection nobody
                admitted to.
              </p>
            </div>
          ) : null}
          <div>
            <Label htmlFor="rationale">Reason</Label>
            <Textarea
              id="rationale"
              rows={3}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="The submitter will see this."
            />
            {/* Required on acceptances too — a scheme that explains its
                rejections but not its acceptances teaches people nothing about
                what a good suggestion looks like. */}
            <p className="mt-1 text-xs text-slate-500">
              Required on every outcome, including acceptances. At least 10
              characters.
            </p>
          </div>
          <Button
            disabled={
              busy !== null ||
              rationale.trim().length < 10 ||
              (decision === "DEFER" && !deferUntil)
            }
            onClick={() =>
              call(
                `/api/be/suggestions/${id}/decide`,
                {
                  decision,
                  rationale: rationale.trim(),
                  deferredUntil:
                    decision === "DEFER" ? new Date(deferUntil).toISOString() : null
                },
                "Decision recorded"
              )
            }
          >
            {busy?.endsWith("decide") ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : null}
            Record decision
          </Button>
        </div>
      ) : null}

      {panel === "incentive" ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="incStatus">Status</Label>
              <Select
                id="incStatus"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={incStatus}
                onChange={(e) => setIncStatus(e.target.value)}
              >
                {Object.entries(INCENTIVE_STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="incPoints">Points</Label>
              <Input
                id="incPoints"
                type="number"
                min={0}
                value={incPoints}
                onChange={(e) => setIncPoints(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="incAmount">Amount</Label>
              <Input
                id="incAmount"
                type="number"
                min={0}
                value={incAmount}
                onChange={(e) => setIncAmount(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="incNote">Note</Label>
            <Input
              id="incNote"
              value={incNote}
              onChange={(e) => setIncNote(e.target.value)}
            />
          </div>
          {/* Recorded, not paid. Payroll/rewards integration is out of scope and
              the screen should not imply otherwise. */}
          <p className="text-xs text-slate-500">
            This records the entitlement only. SafeOps does not pay it — that is
            handled by whatever your rewards process already uses.
          </p>
          <Button
            disabled={busy !== null}
            onClick={() =>
              call(
                `/api/be/suggestions/${id}/incentive`,
                {
                  status: incStatus,
                  points: incPoints ? Number(incPoints) : null,
                  amount: incAmount ? Number(incAmount) : null,
                  note: incNote.trim() || null
                },
                "Incentive recorded"
              )
            }
          >
            {busy?.endsWith("incentive") ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : null}
            Save incentive
          </Button>
        </div>
      ) : null}
    </div>
  );
}
