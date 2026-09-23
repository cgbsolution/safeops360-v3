"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Can } from "@/components/auth/can";
import { CheckCircle2, Clock, Copy, AlertCircle, ShieldCheck } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const ROOT_CAUSE_CATEGORIES = ["MAN", "MACHINE", "METHOD", "MATERIAL", "MEASUREMENT", "ENVIRONMENT"] as const;

export function FindingActions({
  findingId, status, severity, ownerId
}: {
  findingId: string;
  status: string;
  severity: string;
  ownerId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Local state for inline edits
  const [closureNote, setClosureNote] = useState("");
  const [rootCauseCategory, setRootCauseCategory] = useState("");
  const [rootCauseNote, setRootCauseNote] = useState("");
  const [deferredUntil, setDeferredUntil] = useState("");
  const [deferredReason, setDeferredReason] = useState("");
  const [duplicateOfNumber, setDuplicateOfNumber] = useState("");
  const [effectivenessRating, setEffectivenessRating] = useState("");
  const [effectivenessNote, setEffectivenessNote] = useState("");

  async function patch(payload: any) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/inspections/findings/${findingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? `Action failed (${res.status}).`);
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <>
      <CardHeader>
        <CardTitle>Lifecycle actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div>
        )}

        {/* Take ownership */}
        {!ownerId && (
          <Can permission="INSPECTION_FINDING.UPDATE">
            <Button onClick={() => patch({ takeOwnership: true })} disabled={busy}>
              <CheckCircle2 size={14} /> Take ownership
            </Button>
          </Can>
        )}

        {/* Root cause */}
        {(status === "OPEN" || status === "UNDER_REVIEW" || status === "IN_PROGRESS") && (
          <Can permission="INSPECTION_FINDING.UPDATE">
            <Collapsible className="border border-slate-200 rounded-md p-3 text-sm">
              <CollapsibleTrigger className="cursor-pointer font-medium text-slate-700 w-full text-left">Root cause analysis</CollapsibleTrigger>
              <CollapsibleContent>
              <div className="mt-2 space-y-2">
                <div>
                  <Label>Category (5M)</Label>
                  <Select value={rootCauseCategory} onChange={(e) => setRootCauseCategory(e.target.value)}>
                    <SelectItem value="">— Select —</SelectItem>
                    {ROOT_CAUSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </Select>
                </div>
                <div>
                  <Label>Note</Label>
                  <Textarea rows={2} value={rootCauseNote} onChange={(e) => setRootCauseNote(e.target.value)} placeholder="What was the root cause?" />
                </div>
                <Button onClick={() => patch({ rootCauseCategory, rootCauseNote, status: "IN_PROGRESS" })} disabled={busy || !rootCauseCategory}>
                  Save root cause
                </Button>
              </div>
            </CollapsibleContent>
            </Collapsible>
          </Can>
        )}

        {/* Close */}
        {(status === "OPEN" || status === "IN_PROGRESS" || status === "UNDER_REVIEW") && (
          <Can permission="INSPECTION_FINDING.CLOSE">
            <Collapsible className="border border-slate-200 rounded-md p-3 text-sm">
              <CollapsibleTrigger className="cursor-pointer font-medium text-emerald-700 w-full text-left">Close finding</CollapsibleTrigger>
              <CollapsibleContent>
              <div className="mt-2 space-y-2">
                <div>
                  <Label>Closure note</Label>
                  <Textarea rows={2} value={closureNote} onChange={(e) => setClosureNote(e.target.value)} placeholder="What was done to close this?" />
                </div>
                <Button onClick={() => patch({ status: "CLOSED", closureNote })} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle2 size={14} /> Mark closed
                </Button>
              </div>
            </CollapsibleContent>
            </Collapsible>
          </Can>
        )}

        {/* Verify */}
        {status === "CLOSED" && (
          <Can permission="INSPECTION_FINDING.VERIFY">
            <Button onClick={() => patch({ status: "VERIFIED" })} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              <ShieldCheck size={14} /> Verify closure
            </Button>
          </Can>
        )}

        {/* Defer */}
        {(status === "OPEN" || status === "IN_PROGRESS") && (
          <Can permission="INSPECTION_FINDING.DEFER">
            <Collapsible className="border border-slate-200 rounded-md p-3 text-sm">
              <CollapsibleTrigger className="cursor-pointer font-medium text-amber-700 w-full text-left">Defer</CollapsibleTrigger>
              <CollapsibleContent>
              <div className="mt-2 space-y-2">
                <div>
                  <Label>Defer until</Label>
                  <Input type="date" value={deferredUntil} onChange={(e) => setDeferredUntil(e.target.value)} />
                </div>
                <div>
                  <Label>Reason</Label>
                  <Textarea rows={2} value={deferredReason} onChange={(e) => setDeferredReason(e.target.value)} required />
                </div>
                <Button onClick={() => patch({ status: "DEFERRED", deferredUntil, deferredReason })} disabled={busy || !deferredUntil || !deferredReason}>
                  <Clock size={14} /> Defer
                </Button>
              </div>
            </CollapsibleContent>
            </Collapsible>
          </Can>
        )}

        {/* Duplicate */}
        {(status === "OPEN" || status === "IN_PROGRESS") && (
          <Can permission="INSPECTION_FINDING.UPDATE">
            <Collapsible className="border border-slate-200 rounded-md p-3 text-sm">
              <CollapsibleTrigger className="cursor-pointer font-medium w-full text-left">Mark duplicate</CollapsibleTrigger>
              <CollapsibleContent>
              <div className="mt-2 space-y-2">
                <div>
                  <Label>Original finding number</Label>
                  <Input value={duplicateOfNumber} onChange={(e) => setDuplicateOfNumber(e.target.value)} placeholder="FND-2026-0001" />
                </div>
                <Button onClick={() => patch({ status: "DUPLICATE", duplicateOfFindingNumber: duplicateOfNumber })} disabled={busy || !duplicateOfNumber}>
                  <Copy size={14} /> Mark as duplicate
                </Button>
              </div>
            </CollapsibleContent>
            </Collapsible>
          </Can>
        )}

        {/* Effectiveness review */}
        {status === "VERIFIED" && (
          <Can permission="INSPECTION_FINDING.UPDATE">
            <Collapsible className="border border-slate-200 rounded-md p-3 text-sm">
              <CollapsibleTrigger className="cursor-pointer font-medium text-blue-700 w-full text-left">Effectiveness review (90-day)</CollapsibleTrigger>
              <CollapsibleContent>
              <div className="mt-2 space-y-2">
                <div>
                  <Label>Rating</Label>
                  <Select value={effectivenessRating} onChange={(e) => setEffectivenessRating(e.target.value)}>
                    <SelectItem value="">— Select —</SelectItem>
                    <SelectItem value="EFFECTIVE">Effective — issue did not recur</SelectItem>
                    <SelectItem value="PARTIAL">Partial — issue partially addressed</SelectItem>
                    <SelectItem value="NOT_EFFECTIVE">Not effective — additional action needed</SelectItem>
                    <SelectItem value="RECURRENCE">Recurrence — issue happened again</SelectItem>
                  </Select>
                </div>
                <div>
                  <Label>Note</Label>
                  <Textarea rows={2} value={effectivenessNote} onChange={(e) => setEffectivenessNote(e.target.value)} />
                </div>
                <Button onClick={() => patch({ effectivenessRating, effectivenessNote })} disabled={busy || !effectivenessRating}>
                  Save review
                </Button>
              </div>
            </CollapsibleContent>
            </Collapsible>
          </Can>
        )}
      </CardContent>
    </>
  );
}
