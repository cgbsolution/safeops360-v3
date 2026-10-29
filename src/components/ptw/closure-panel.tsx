"use client";

// PTW closed-loop close-out flow:
//   Phase 1 — Work Completed declaration (receiver): structured OUTCOME +
//             restoration confirmations + narrative + field evidence
//             (GPS / onsite photo / signature) → POST /api/ptw/{id}/complete
//   Phase 2 — Handback Inspection (issuer / safety officer / plant head):
//             5-point checklist + notes + field evidence
//             → POST /api/ptw/{id}/handback
//   Phase 3 — Closure summary + close-out report download (once CLOSED)
//
// Replaces the legacy Return / Site-Verify pair (which sent photos: null
// into a table that never existed).
//
// ─── Which door? ──────────────────────────────────────────────────────
// A permit that expired BEFORE the receiver acknowledged it authorised no
// work at all, and must not be closed as "work completed" — that writes a
// false record. Those go through the unexecuted-withdrawal path instead.
// Which door is open is NOT decided here: it comes from
// GET /api/ptw/{id}/closure-gate, the same functions the API enforces with,
// so this panel can never offer an action the API is going to refuse (the
// pattern the LOTO panel already uses for its lock gate).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  Hammer,
  Loader2,
  PackageCheck,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { readApiError } from "@/lib/client-errors";
import { formatDateTime } from "@/lib/utils";
import {
  EvidenceCapture,
  evidenceComplete,
  evidencePayload,
  useEvidenceCapture,
} from "@/components/ptw/evidence-capture";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const VERIFICATION_CHECKLIST: { code: string; label: string }[] = [
  { code: "AREA_CLEAN", label: "Work area is clean — no debris, scrap or tools left behind" },
  { code: "ISOLATIONS_CLEARED", label: "All isolations restored & LOTO tags removed" },
  { code: "EQUIPMENT_INTACT", label: "Equipment / scaffolding / barricades restored to normal" },
  { code: "NO_DAMAGE", label: "No damage observed to surrounding plant" },
  { code: "AREA_HANDED_BACK", label: "Area handed back to operations" },
];

const OUTCOMES: { value: string; label: string; hint: string }[] = [
  { value: "COMPLETED", label: "Completed", hint: "All planned work finished" },
  { value: "PARTIALLY_COMPLETED", label: "Partially completed", hint: "Some scope remains — a follow-up permit is needed" },
  { value: "STOPPED_INCIDENT", label: "Stopped — incident", hint: "Work stopped due to an incident / unsafe condition" },
  { value: "CANCELLED", label: "Not started / abandoned", hint: "Work never started under this permit" },
];

const COMPLETE_DECLARATION =
  "I declare the work under this permit is finished as stated, isolations are restored, " +
  "and the area has been left in a safe condition.";

const WITHDRAW_DECLARATION =
  "I confirm no work was carried out under this permit and that it is being closed " +
  "unexecuted.";

const UNEXECUTED_REASONS: { value: string; label: string }[] = [
  { value: "NO_LONGER_REQUIRED", label: "Work no longer required" },
  { value: "RESCHEDULED", label: "Rescheduled — a new permit will be raised" },
  { value: "RESOURCE_UNAVAILABLE", label: "Access / resources unavailable" },
  { value: "OTHER", label: "Other" },
];

/** Server's verdict on the close-out area — GET /api/ptw/{id}/closure-gate. */
type ClosureGate = {
  acknowledged: boolean;
  pastValidity: boolean;
  executionState: string | null;
  closureType: string | null;
  canDeclareWorkCompleted: boolean;
  workCompletedBlocker: string | null;
  canWithdrawUnexecuted: boolean;
  withdrawBlocker: string | null;
  lotoBlocker: string | null;
};

const HANDBACK_DECLARATION =
  "I have physically walked the worksite after the completion declaration and confirm " +
  "the checklist above reflects its true condition.";

export function ClosurePanel({
  permitId,
  status,
  receiverId,
  currentUserId,
  canVerify,
  canDeclareOnBehalf,
  isOriginator,
  workCompletedAt,
  outcome,
  returnedAt,
  returnNotes,
  siteVerifiedAt,
  siteVerificationChecklist,
  closingRemark,
  closedAt,
  cancellationReason,
  cancelledAt,
}: {
  permitId: string;
  status: string;
  receiverId: string | null;
  currentUserId: string;
  canVerify: boolean;
  /** Mirrors the API's _PRIV_ROLES — HSE Manager / Admin only. Issuer and
   *  Safety Officer can run the handback but cannot declare on the
   *  receiver's behalf, so they must not be offered the button. */
  canDeclareOnBehalf: boolean;
  /** The originator may close an unexecuted permit (they raised it and it was
   *  never used) — mirrors the API's rule, which is wider than canVerify. */
  isOriginator: boolean;
  workCompletedAt: string | Date | null;
  outcome: string | null;
  returnedAt: string | Date | null;
  returnNotes: string | null;
  siteVerifiedAt: string | Date | null;
  siteVerificationChecklist: any;
  closingRemark: string | null;
  closedAt: string | Date | null;
  /** Set by the unexecuted-withdrawal path as well as by an ordinary
   *  cancellation — `closureType` on the gate says which. */
  cancellationReason: string | null;
  cancelledAt: string | Date | null;
}) {
  const router = useRouter();
  const isReceiver = receiverId === currentUserId;
  const declared = !!(workCompletedAt ?? returnedAt);
  const [gate, setGate] = useState<ClosureGate | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);

  const loadGate = useCallback(async () => {
    try {
      const res = await fetch(`/api/ptw/${permitId}/closure-gate`);
      if (res.ok) {
        setGate(await res.json());
        setGateError(null);
      } else {
        // Most often a plant-scope refusal on PTW.READ. Say so — "checking…"
        // forever is the kind of silent dead end this whole fix is about.
        setGateError(await readApiError(res, "Close-out state unavailable"));
      }
    } catch {
      setGateError("Could not reach the permit service to check close-out state.");
    }
    // Either way `gate` stays null, so no action is offered — a gate we
    // could not read must never unlock anything.
  }, [permitId]);

  useEffect(() => {
    loadGate();
  }, [loadGate]);

  const refresh = () => {
    loadGate();
    router.refresh();
  };

  // Hidden until the permit is at least issued/accepted. CANCELLED stays
  // hidden EXCEPT where it was cancelled by the unexecuted-withdrawal path —
  // that terminal record is part of the close-out story and has to be visible.
  const withdrawnUnexecuted = gate?.closureType === "UNEXECUTED_CLOSURE";
  if (
    ["DRAFT", "SUBMITTED", "APPROVED", "ISSUED", "ISSUER_APPROVED", "SAFETY_APPROVED", "PLANT_HEAD_APPROVED", "REJECTED"].includes(status) ||
    (status === "CANCELLED" && !withdrawnUnexecuted)
  ) {
    return null;
  }

  // Expired without ever being acknowledged: work was never authorised to
  // start, so the completion path is the wrong door entirely.
  const unexecuted = gate ? !gate.acknowledged && gate.pastValidity : false;

  if (withdrawnUnexecuted) {
    return (
      <WithdrawnSummary
        permitId={permitId}
        reason={cancellationReason}
        withdrawnAt={cancelledAt}
      />
    );
  }

  // Nothing was worked, so there is nothing to hand back — the handback
  // inspection would only sit there saying "pending" forever.
  if (unexecuted) {
    return (
      <UnexecutedSection
        permitId={permitId}
        gate={gate}
        canAct={isReceiver || isOriginator || canDeclareOnBehalf || canVerify}
        gateError={gateError}
        onChanged={refresh}
      />
    );
  }

  return (
    <div className="space-y-4">
      <WorkCompletedSection
        permitId={permitId}
        status={status}
        canDeclare={isReceiver || canDeclareOnBehalf}
        gate={gate}
        gateError={gateError}
        declared={declared}
        declaredAt={workCompletedAt ?? returnedAt}
        outcome={outcome}
        notes={returnNotes}
        onChanged={refresh}
      />

      <HandbackSection
        permitId={permitId}
        canVerify={canVerify}
        declared={declared}
        siteVerifiedAt={siteVerifiedAt}
        checklist={siteVerificationChecklist}
        onChanged={() => router.refresh()}
      />

      {status === "CLOSED" && (
        <ClosureSummary
          permitId={permitId}
          closedAt={closedAt}
          closingRemark={closingRemark}
          outcome={outcome}
        />
      )}
    </div>
  );
}

// ─── Phase 1: Work Completed declaration ──────────────────────────────

function WorkCompletedSection({
  permitId,
  status,
  canDeclare,
  gate,
  gateError,
  declared,
  declaredAt,
  outcome,
  notes,
  onChanged,
}: {
  permitId: string;
  status: string;
  canDeclare: boolean;
  /** null while the verdict is still loading — the button stays shut. */
  gate: ClosureGate | null;
  gateError: string | null;
  declared: boolean;
  declaredAt: string | Date | null;
  outcome: string | null;
  notes: string | null;
  onChanged: () => void;
}) {
  const [show, setShow] = useState(false);
  const [iso, setIso] = useState(false);
  const [clean, setClean] = useState(false);
  const [chosenOutcome, setChosenOutcome] = useState("");
  const [narrative, setNarrative] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const evidenceState = useEvidenceCapture();

  const evidenceReady = evidenceComplete(evidenceState, {
    requirePhoto: true,
    requireDeclaration: true,
  });

  const blockers = [
    !chosenOutcome && "choose an outcome",
    !iso && "tick “All isolations restored”",
    !clean && "tick “Work area is clean”",
    !evidenceReady && "capture the onsite photo, signature and declaration",
  ].filter(Boolean) as string[];

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/ptw/${permitId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: chosenOutcome,
          isolationsRestored: iso,
          workAreaClean: clean,
          notes: narrative || null,
          evidence: evidencePayload(evidenceState, COMPLETE_DECLARATION),
        }),
      });
      if (r.ok) {
        setShow(false);
        onChanged();
        return;
      }
      setError(await readApiError(r, "Failed to declare work completed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={declared ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PackageCheck size={16} className={declared ? "text-emerald-600" : "text-slate-500"} />
          Work Completed
          {declared && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
              Declared
            </Badge>
          )}
          {outcome && (
            <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px]">
              {OUTCOMES.find((o) => o.value === outcome)?.label ?? outcome}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Receiver declares the outcome at end of work — with GPS, onsite
          photo and signature captured for the close-out report.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {declared ? (
          <div className="text-sm space-y-1">
            <div className="text-slate-700">
              Declared at <span className="font-medium">{formatDateTime(new Date(declaredAt!))}</span>
            </div>
            {notes && <div className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{notes}</div>}
          </div>
        ) : !show ? (
          canDeclare && gate?.canDeclareWorkCompleted ? (
            <div className="space-y-2">
              {status === "EXPIRED" && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                  This permit expired while the work was under way. Close it
                  out honestly — record what was actually done and pick the
                  matching outcome. The expiry stays on the permit record.
                </div>
              )}
              <Button size="sm" onClick={() => setShow(true)}>
                <Hammer size={14} /> Declare Work Completed
              </Button>
            </div>
          ) : (
            // The server's own reason, not a locally re-derived guess — the
            // button and the API can never disagree about why it's shut.
            <div className="text-xs text-slate-500">
              {!canDeclare
                ? "Pending — only the named receiver (or HSE/Admin) can declare completion."
                : (gate?.workCompletedBlocker ?? gateError ?? "Checking close-out state…")}
            </div>
          )
        ) : (
          <div className="space-y-3">
            {/* Outcome */}
            <div className="space-y-1.5">
              <Label className="text-[11px]">
                Outcome <span className="text-rose-600">*</span>
              </Label>
              <RadioGroup
                name="ptw-outcome"
                value={chosenOutcome}
                onValueChange={setChosenOutcome}
                className="grid sm:grid-cols-2 gap-1.5"
              >
                {OUTCOMES.map((o) => (
                  <Label
                    key={o.value}
                    htmlFor={`ptw-outcome-${o.value}`}
                    className={`flex items-start gap-2 p-2 rounded-md border text-xs font-normal text-inherit cursor-pointer ${
                      chosenOutcome === o.value
                        ? "border-primary-400 bg-primary-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <RadioGroupItem id={`ptw-outcome-${o.value}`} value={o.value} className="mt-0.5" />
                    <div>
                      <div className="font-medium">{o.label}</div>
                      <div className="text-slate-500">{o.hint}</div>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {/* Restoration confirmations (carried over from the old Return step) */}
            <Label className="flex items-start gap-2 p-2 rounded-md border border-slate-200 bg-white text-xs font-normal text-inherit">
              <Checkbox checked={iso} onChange={(e) => setIso(e.target.checked)} className="mt-0.5" />
              <div>
                <div className="font-medium">All isolations restored</div>
                <div className="text-slate-600">LOTO removed, valves reopened, energy sources re-engaged.</div>
              </div>
            </Label>
            <Label className="flex items-start gap-2 p-2 rounded-md border border-slate-200 bg-white text-xs font-normal text-inherit">
              <Checkbox checked={clean} onChange={(e) => setClean(e.target.checked)} className="mt-0.5" />
              <div>
                <div className="font-medium">Work area is clean</div>
                <div className="text-slate-600">No tools, scrap, debris or barricades left behind.</div>
              </div>
            </Label>

            <div>
              <Label className="text-[11px]">
                Close-out narrative — what was done, anything outstanding
              </Label>
              <Textarea
                rows={3}
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                placeholder="Summary of the work performed and site condition at handback"
              />
            </div>

            <EvidenceCapture
              permitId={permitId}
              requirePhoto
              declaration={COMPLETE_DECLARATION}
              state={evidenceState}
            />

            {error && <div className="text-xs text-rose-700 whitespace-pre-wrap">{error}</div>}
            {/* A disabled submit with no explanation reads as a broken button.
                Spell out exactly what is still missing. */}
            {blockers.length > 0 && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                <span className="font-medium">Still needed:</span>{" "}
                {blockers.join(" · ")}
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={busy || blockers.length > 0}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Confirm Work Completed
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShow(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Alternate door: Withdraw / Close Unexecuted Permit ───────────────
//
// Shown INSTEAD of the Work Completed section when the permit expired before
// the receiver acknowledged it. Same visual grammar as the LOTO-lock gate: an
// amber banner that names the reason, then the action that IS available.

function UnexecutedSection({
  permitId,
  gate,
  gateError,
  canAct,
  onChanged,
}: {
  permitId: string;
  gate: ClosureGate | null;
  gateError: string | null;
  canAct: boolean;
  onChanged: () => void;
}) {
  const [show, setShow] = useState(false);
  const [reasonCode, setReasonCode] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const evidenceState = useEvidenceCapture();

  // No work happened, so no onsite photo is asked for — signer identity and
  // GPS are the accountability record (mirrors EVIDENCE_POLICY on the API).
  const evidenceReady = evidenceComplete(evidenceState, {
    requirePhoto: false,
    requireDeclaration: true,
  });

  const blockers = [
    !reasonCode && "pick a reason",
    reasonCode === "OTHER" && notes.trim().length < 5 && "describe the reason",
    !evidenceReady && "capture the signature and declaration",
  ].filter(Boolean) as string[];

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/ptw/${permitId}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reasonCode,
          notes: notes || null,
          evidence: evidencePayload(evidenceState, WITHDRAW_DECLARATION),
        }),
      });
      if (r.ok) {
        setShow(false);
        onChanged();
        return;
      }
      setError(await readApiError(r, "Failed to close the permit"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-amber-300">
      <CardHeader className="pb-3 bg-amber-50 rounded-t-xl">
        <CardTitle className="text-base flex items-center gap-2 text-amber-900">
          <AlertTriangle size={16} /> Permit expired unexecuted
        </CardTitle>
        <CardDescription className="text-xs text-amber-800">
          This permit expired before the receiver acknowledged it — work was
          never authorised to start. Close it as unexecuted rather than
          declaring work completed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-3">
        {/* The LOTO gate applies to this door too: locks may have been applied
            even though the permit was never acknowledged, and equipment can't
            be handed back while they're on it. */}
        {gate?.lotoBlocker && (
          <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md p-2">
            {gate.lotoBlocker}
          </div>
        )}

        {!show ? (
          canAct && gate?.canWithdrawUnexecuted ? (
            <Button
              size="sm"
              variant="outline"
              className="text-amber-800 border-amber-300 hover:bg-amber-50"
              onClick={() => setShow(true)}
            >
              <Ban size={14} /> Withdraw / Close Unexecuted Permit
            </Button>
          ) : (
            <div className="text-xs text-slate-500">
              {!canAct
                ? "Pending — the originator, issuer, receiver or Safety/HSE can close this permit."
                : (gate?.withdrawBlocker ?? gateError ?? "Checking close-out state…")}
            </div>
          )
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[11px]">
                Reason <span className="text-rose-600">*</span>
              </Label>
              <RadioGroup
                name="ptw-unexecuted-reason"
                value={reasonCode}
                onValueChange={setReasonCode}
                className="grid sm:grid-cols-2 gap-1.5"
              >
                {UNEXECUTED_REASONS.map((o) => (
                  <Label
                    key={o.value}
                    htmlFor={`ptw-unexecuted-reason-${o.value}`}
                    className={`flex items-start gap-2 p-2 rounded-md border text-xs font-normal text-inherit cursor-pointer ${
                      reasonCode === o.value
                        ? "border-primary-400 bg-primary-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <RadioGroupItem id={`ptw-unexecuted-reason-${o.value}`} value={o.value} className="mt-0.5" />
                    <span className="font-medium">{o.label}</span>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <div>
              <Label className="text-[11px]">
                Notes {reasonCode === "OTHER" && <span className="text-rose-600">*</span>}
              </Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the register should record about why this permit went unused"
              />
            </div>

            {/* No onsite photo — there is no worksite condition to photograph. */}
            <EvidenceCapture
              permitId={permitId}
              requirePhoto={false}
              declaration={WITHDRAW_DECLARATION}
              state={evidenceState}
            />

            {error && <div className="text-xs text-rose-700 whitespace-pre-wrap">{error}</div>}
            {blockers.length > 0 && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                <span className="font-medium">Still needed:</span> {blockers.join(" · ")}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={submit}
                disabled={busy || blockers.length > 0}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Confirm — permit unexecuted
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShow(false)} disabled={busy}>
                Back
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Terminal record for a permit closed through the unexecuted path. Reads
// deliberately unlike the "Work Completed" summary — nobody skimming the
// screen should mistake one for the other.
function WithdrawnSummary({
  permitId,
  reason,
  withdrawnAt,
}: {
  permitId: string;
  reason: string | null;
  withdrawnAt: string | Date | null;
}) {
  return (
    <Card className="border-slate-300 bg-slate-50/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Ban size={16} className="text-slate-600" />
          Withdrawn — Unexecuted
          <Badge className="bg-slate-200 text-slate-700 border-slate-300 text-[10px]">
            No work performed
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          This permit expired before it was acknowledged and was closed without
          any work being carried out under it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {withdrawnAt && (
          <div className="text-slate-700">
            Closed at{" "}
            <span className="font-medium">{formatDateTime(new Date(withdrawnAt))}</span>
          </div>
        )}
        {reason && <div className="text-xs text-slate-600 whitespace-pre-wrap">{reason}</div>}
        <Button asChild size="sm" variant="outline">
          <a href={`/api/ptw/${permitId}/report`} target="_blank" rel="noreferrer">
            <FileDown size={14} /> Close-out Report
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Phase 2: Handback inspection ─────────────────────────────────────

function HandbackSection({
  permitId,
  canVerify,
  declared,
  siteVerifiedAt,
  checklist,
  onChanged,
}: {
  permitId: string;
  canVerify: boolean;
  declared: boolean;
  siteVerifiedAt: string | Date | null;
  checklist: any;
  onChanged: () => void;
}) {
  const [show, setShow] = useState(false);
  const [vals, setVals] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const evidenceState = useEvidenceCapture();

  const verified = !!siteVerifiedAt;
  const allChecked = VERIFICATION_CHECKLIST.every((c) => vals[c.code]);
  const evidenceReady = evidenceComplete(evidenceState, {
    requirePhoto: true,
    requireDeclaration: true,
  });

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/ptw/${permitId}/handback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklist: vals,
          notes: notes || null,
          evidence: evidencePayload(evidenceState, HANDBACK_DECLARATION),
        }),
      });
      if (r.ok) {
        setShow(false);
        onChanged();
        return;
      }
      setError(await readApiError(r, "Failed to record handback inspection"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      className={
        verified
          ? "border-emerald-200 bg-emerald-50/40"
          : declared
          ? "border-amber-200 bg-amber-50/40"
          : "border-slate-200"
      }
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck size={16} className={verified ? "text-emerald-600" : "text-slate-500"} />
          Handback Inspection
          {verified && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
              Inspected
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Issuer / Safety Officer / Plant Head walks the area after the
          completion declaration. Closure approval needs this on record.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!declared && (
          <div className="text-xs text-slate-500">
            Receiver must declare Work Completed before the handback inspection can begin.
          </div>
        )}
        {declared && verified && (
          <div className="text-sm">
            Inspected at <span className="font-medium">{formatDateTime(new Date(siteVerifiedAt!))}</span>
            {checklist && typeof checklist === "object" && (
              <ul className="mt-2 space-y-0.5">
                {Object.entries(checklist as Record<string, boolean>).map(([k, v]) => (
                  <li key={k} className="text-xs flex items-center gap-1.5">
                    {v ? (
                      <CheckCircle2 size={12} className="text-emerald-600" />
                    ) : (
                      <XCircle size={12} className="text-rose-600" />
                    )}
                    <span className={v ? "text-slate-700" : "text-rose-600"}>
                      {VERIFICATION_CHECKLIST.find((c) => c.code === k)?.label ?? k}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {declared && !verified && !show && canVerify && (
          <Button size="sm" onClick={() => setShow(true)}>
            <ClipboardCheck size={14} /> Start Handback Inspection
          </Button>
        )}
        {declared && !verified && !show && !canVerify && (
          <div className="text-xs text-slate-500">
            Awaiting Issuer / Safety / Plant Head walk-through.
          </div>
        )}
        {show && (
          <div className="space-y-2">
            {VERIFICATION_CHECKLIST.map((c) => (
              <Label
                key={c.code}
                className="flex items-start gap-2 p-2 rounded-md border border-slate-200 bg-white text-xs font-normal text-inherit"
              >
                <Checkbox
                  checked={!!vals[c.code]}
                  onChange={(e) => setVals((v) => ({ ...v, [c.code]: e.target.checked }))}
                  className="mt-0.5"
                />
                <span>{c.label}</span>
              </Label>
            ))}
            <div>
              <Label className="text-[11px]">Notes</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything noteworthy from the walk"
              />
            </div>

            <EvidenceCapture
              permitId={permitId}
              requirePhoto
              declaration={HANDBACK_DECLARATION}
              state={evidenceState}
            />

            {error && <div className="text-xs text-rose-700 whitespace-pre-wrap">{error}</div>}
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={busy || !allChecked || !evidenceReady}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Record Inspection
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShow(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
            {!allChecked && (
              <div className="text-[11px] text-amber-700">
                All boxes must be ticked. If anything fails, escalate to HSE — do not bypass.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Phase 3: Closure summary + report ────────────────────────────────

function ClosureSummary({
  permitId,
  closedAt,
  closingRemark,
  outcome,
}: {
  permitId: string;
  closedAt: string | Date | null;
  closingRemark: string | null;
  outcome: string | null;
}) {
  return (
    <Card className="border-slate-300 bg-slate-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600" /> Permit Closed
          {outcome && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
              {OUTCOMES.find((o) => o.value === outcome)?.label ?? outcome}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {closedAt && (
          <div className="text-sm">
            Closed at <span className="font-medium">{formatDateTime(new Date(closedAt))}</span>
          </div>
        )}
        {closingRemark && (
          <div className="rounded-md border border-slate-200 bg-white p-2 text-sm whitespace-pre-wrap">
            {closingRemark}
          </div>
        )}
        <Button asChild size="sm" variant="outline">
          <a href={`/api/ptw/${permitId}/report`} target="_blank" rel="noreferrer">
            <FileDown size={14} /> Download Close-out Report (PDF)
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
