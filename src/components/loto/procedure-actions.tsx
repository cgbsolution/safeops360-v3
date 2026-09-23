"use client";

// Lifecycle actions on a LOTO procedure: publish, retire, complete a scheduled
// review, start a lockout, and copy the QR field URL.
//
// Every one of these is a POST the server re-validates. The buttons disable
// themselves for the same reasons the API would refuse, and when the API refuses
// anyway its message is shown verbatim — the server's wording is the one that
// names what to do about it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Copy,
  Loader2,
  Lock,
  QrCode,
  ShieldCheck,
  Trash2,
  XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Can } from "@/components/auth/can";
import { readApiError } from "@/lib/client-errors";
import { qrFieldUrl, type Procedure } from "@/app/(dashboard)/loto/_meta";

export function ProcedureActions({ procedure }: { procedure: Procedure }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");

  async function call(
    label: string,
    path: string,
    body: unknown,
    okMessage: string,
    method: "POST" | "PATCH" = "POST"
  ) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await readApiError(res, `${label} failed`));
      setNotice(okMessage);
      setReviewOpen(false);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? `${label} failed.`);
    } finally {
      setBusy(null);
    }
  }

  async function startLockout() {
    setBusy("start");
    setError(null);
    try {
      const res = await fetch("/api/loto/executions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ procedureId: procedure.id, isGroupLockout: false })
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not start the lockout"));
      const ex = await res.json();
      router.push(`/loto/executions/${ex.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Could not start the lockout.");
    } finally {
      setBusy(null);
    }
  }

  // `/lockout/…` deliberately — see the note on qrFieldUrl. Built through the
  // shared helper so the label URL has exactly one definition.
  const qrUrl = procedure.qrCodeToken
    ? qrFieldUrl(
        procedure.qrCodeToken,
        typeof window !== "undefined" ? window.location.origin : ""
      )
    : null;

  return (
    <div className="space-y-3">
      {error && (
        // whitespace-pre-line: the server returns multi-line, bulleted refusals
        // (e.g. every publish blocker at once) and flattening them loses the list.
        <div className="whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Can permission="LOTO.APPROVE">
          {(procedure.status === "draft" ||
            procedure.status === "under_review" ||
            procedure.status === "retired") && (
            <Button
              onClick={() =>
                call(
                  "Publish",
                  `/api/loto/procedures/${procedure.id}/publish`,
                  { notes: null },
                  `Published v${procedure.version}. The QR label now resolves to this version.`
                )
              }
              disabled={!procedure.canPublish || busy !== null}
              title={
                procedure.canPublish
                  ? undefined
                  : procedure.publishBlockers.join(" ")
              }
            >
              {busy === "Publish" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ShieldCheck size={14} />
              )}
              {procedure.status === "under_review" ? "Re-publish" : "Publish"} v
              {procedure.version}
            </Button>
          )}

          {procedure.status === "active" && (
            <Button
              variant="outline"
              onClick={() =>
                call(
                  "Retire",
                  `/api/loto/procedures/${procedure.id}/retire`,
                  { notes: null },
                  "Procedure retired. It is no longer available for new lockouts."
                )
              }
              disabled={busy !== null}
            >
              {busy === "Retire" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <XCircle size={14} />
              )}
              Retire
            </Button>
          )}
        </Can>

        <Can permission="LOTO.EXECUTE">
          {procedure.status === "active" && (
            <Button variant="outline" onClick={startLockout} disabled={busy !== null}>
              {busy === "start" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Lock size={14} />
              )}
              Start lockout
            </Button>
          )}
        </Can>

        <Can permission="LOTO.REVIEW">
          {procedure.status !== "retired" && (
            <Button
              variant="outline"
              onClick={() => setReviewOpen((v) => !v)}
              disabled={busy !== null}
            >
              <CheckCircle2 size={14} />
              {procedure.review.isOverdue ? "Complete overdue review" : "Record review"}
            </Button>
          )}
        </Can>

        {qrUrl && (
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(qrUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              } catch {
                // Clipboard is permission-gated in some browsers; show the URL
                // instead of failing silently so the label can still be made.
                setNotice(qrUrl);
              }
            }}
          >
            <QrCode size={14} />
            {copied ? "Copied" : "Copy QR link"}
          </Button>
        )}
      </div>

      {reviewOpen && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm text-slate-700">
            Confirm the isolation sequence still matches the plant. Recording a review
            rolls the next due date forward by{" "}
            {procedure.reviewFrequencyMonths} month
            {procedure.reviewFrequencyMonths === 1 ? "" : "s"} from today.
          </p>
          <Textarea
            rows={2}
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="What was checked, and anything found."
            className="bg-white"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() =>
                call(
                  "Review",
                  `/api/loto/procedures/${procedure.id}/review`,
                  { outcome: "pass", notes: reviewNotes.trim() || null },
                  "Review recorded. Next evaluation scheduled."
                )
              }
              disabled={busy !== null}
            >
              {busy === "Review" && <Loader2 size={14} className="animate-spin" />}
              Passed — still accurate
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                call(
                  "Review",
                  `/api/loto/procedures/${procedure.id}/review`,
                  { outcome: "fail", notes: reviewNotes.trim() || null },
                  "Review recorded as failed. The procedure has been withdrawn from field use until it is corrected and re-published."
                )
              }
              disabled={busy !== null || !reviewNotes.trim()}
              title={
                reviewNotes.trim()
                  ? undefined
                  : "A failed review must say what was wrong."
              }
            >
              Failed — no longer accurate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReviewOpen(false)}>
              Cancel
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            A failed review moves the procedure to <em>under review</em> — it stops
            being served to the field until someone corrects and re-publishes it.
          </p>
        </div>
      )}

      {/* Withdraw. Soft-delete only — the record and every version it produced
          are retained, because a closed lockout that referenced this procedure
          must stay explicable years later. Retire is the everyday action; this
          is for a procedure raised in error or superseded outright. */}
      <Can permission="LOTO.DELETE">
        <div className="border-t border-slate-100 pt-3">
          {!deleteOpen ? (
            <Button variant="bare"
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="text-xs font-medium text-slate-400 hover:text-rose-700"
            >
              Withdraw this procedure…
            </Button>
          ) : (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="text-sm font-semibold text-rose-900">
                Withdraw {procedure.procedureCode}
              </div>
              <p className="mt-0.5 text-xs text-rose-800">
                It disappears from the library and its QR label stops resolving. The
                record is retained, not erased, so past lockouts stay explicable. This
                is refused while any lockout is still running against it.
              </p>
              <Textarea
                rows={2}
                className="mt-2 bg-white"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Reason (required) — e.g. duplicate of LOTO-EQ-0087, equipment decommissioned."
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-rose-300 text-rose-700 hover:bg-rose-100"
                  onClick={async () => {
                    setBusy("Withdraw");
                    setError(null);
                    try {
                      const res = await fetch(`/api/loto/procedures/${procedure.id}`, {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ reason: deleteReason.trim() })
                      });
                      if (!res.ok)
                        throw new Error(await readApiError(res, "Could not withdraw"));
                      router.push("/loto");
                      router.refresh();
                    } catch (e: any) {
                      setError(e?.message ?? "Could not withdraw the procedure.");
                      setBusy(null);
                    }
                  }}
                  disabled={busy !== null || deleteReason.trim().length < 3}
                >
                  {busy === "Withdraw" && <Loader2 size={14} className="animate-spin" />}
                  <Trash2 size={14} /> Withdraw
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </Can>
    </div>
  );
}
