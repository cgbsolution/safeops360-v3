"use client";

// Lifecycle + verification controls for one Poka Yoke device.
//
// Recording a check is the action this screen exists for, so it is a panel
// rather than a button hidden behind a menu. A FAIL demands a note and raises a
// CAPA server-side — a red row nobody can act on is worse than no row.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { CheckCircle2, Loader2, Send, ShieldOff, ShieldCheck, Archive, Wrench, XCircle } from "lucide-react";

export function DeviceActions({
  id,
  status,
  availableActions,
  isBypassed
}: {
  id: string;
  status: string;
  availableActions: string[];
  isBypassed: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "verify" | "bypass">(null);
  const [result, setResult] = useState<"PASS" | "FAIL">("PASS");
  const [note, setNote] = useState("");
  const [bypassReason, setBypassReason] = useState("");

  async function call(path: string, body?: any, label = "Done") {
    setBusy(path);
    try {
      const res = await fetch(`/api/be/poka-yoke/${id}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "That did not work.");
      toast({ variant: "success", title: label });
      setPanel(null);
      setNote("");
      setBypassReason("");
      router.refresh();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not complete that", description: e?.message });
    } finally {
      setBusy(null);
    }
  }

  const has = (a: string) => availableActions.includes(a);
  const failNeedsNote = result === "FAIL" && note.trim().length === 0;

  if (!availableActions.length) {
    return (
      <p className="text-sm text-slate-500">
        No further action is available to you on a device at {status.toLowerCase()}.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {has("SUBMIT") && (
          <Button disabled={busy !== null} onClick={() => call("submit", undefined, "Submitted for review")}>
            {busy === "submit" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Submit for review
          </Button>
        )}
        {has("INSTALL") && (
          <Button disabled={busy !== null} onClick={() => call("install", undefined, "Marked installed")}>
            {busy === "install" ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
            Mark installed
          </Button>
        )}
        {has("VERIFY") && (
          <Button variant={panel === "verify" ? "outline" : "default"} disabled={busy !== null} onClick={() => setPanel(panel === "verify" ? null : "verify")}>
            <CheckCircle2 size={16} /> Record a check
          </Button>
        )}
        {has("BYPASS") && (
          <Button variant="outline" disabled={busy !== null} onClick={() => setPanel(panel === "bypass" ? null : "bypass")}>
            <ShieldOff size={16} /> Log a bypass
          </Button>
        )}
        {/* RESTORE and BYPASS are mutually exclusive server-side
            (allowed_poka_yoke_actions gates both on the same flag), so this is
            the button that REPLACES "Log a bypass" rather than sitting beside
            it. It is the primary variant deliberately: while a bypass is open,
            ending it is the thing that most needs doing on this screen. */}
        {has("RESTORE") && (
          <Button disabled={busy !== null} onClick={() => call("restore", undefined, "Bypass ended")}>
            {busy === "restore" ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            Restore the device
          </Button>
        )}
        {has("RETIRE") && (
          <Button variant="outline" disabled={busy !== null} onClick={() => call("retire", undefined, "Device retired")}>
            {busy === "retire" ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
            Retire
          </Button>
        )}
      </div>

      {isBypassed && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          This device is bypassed. Restoring it puts it back into service as
          unverified — it owes a check immediately, because nobody has confirmed it
          still works since the override was fitted. The bypass stays in this
          device&rsquo;s history either way; ending one has never erased it.
        </p>
      )}

      {panel === "verify" && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Record a verification</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Checks are append-only. A device that failed and was fixed gets a second
            PASS, never an edited FAIL.
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button variant="bare"
              type="button"
              onClick={() => setResult("PASS")}
              className={`flex items-center gap-2 rounded-lg border p-3 text-left transition ${
                result === "PASS"
                  ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <CheckCircle2 size={18} className="text-emerald-600" />
              <span>
                <span className="block text-sm font-medium text-slate-900">Pass</span>
                <span className="block text-xs text-slate-500">The device works as designed</span>
              </span>
            </Button>
            <Button variant="bare"
              type="button"
              onClick={() => setResult("FAIL")}
              className={`flex items-center gap-2 rounded-lg border p-3 text-left transition ${
                result === "FAIL"
                  ? "border-rose-400 bg-rose-50 ring-1 ring-rose-200"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <XCircle size={18} className="text-rose-600" />
              <span>
                <span className="block text-sm font-medium text-slate-900">Fail</span>
                <span className="block text-xs text-slate-500">Raises a CAPA automatically</span>
              </span>
            </Button>
          </div>

          <div className="mt-3">
            <Label className="mb-1 block text-xs font-medium text-slate-600">
              Notes{result === "FAIL" ? <span className="ml-0.5 text-rose-500">*</span> : " (optional)"}
            </Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                result === "FAIL"
                  ? "What was wrong — sensor taped over, jig worn, out of alignment."
                  : "Anything worth noting."
              }
            />
            {failNeedsNote && (
              <p className="mt-1 text-[11px] text-rose-600">
                A failed check must record what was wrong, or the CAPA it raises has
                nothing to act on.
              </p>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              disabled={failNeedsNote || busy !== null}
              onClick={() =>
                call(
                  "verify",
                  { result, note: note.trim() || undefined },
                  result === "PASS" ? "Check recorded — device active" : "Failure recorded, CAPA raised"
                )
              }
            >
              {busy === "verify" ? <Loader2 size={16} className="animate-spin" /> : null}
              Record {result === "PASS" ? "pass" : "failure"}
            </Button>
            <Button variant="outline" onClick={() => setPanel(null)} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {panel === "bypass" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-900">Log a bypass</h3>
          <p className="mt-0.5 text-xs text-amber-800">
            This is the record an auditor asks for. The device stays listed as fitted —
            the register must not understate what the line has lost.
          </p>
          <div className="mt-3">
            <Label className="mb-1 block text-xs font-medium text-amber-900">
              Why is it being bypassed, and for how long?
            </Label>
            <Textarea
              rows={2}
              value={bypassReason}
              onChange={(e) => setBypassReason(e.target.value)}
              placeholder="Sensor awaiting replacement part, expected Friday; 100% inspection in place meanwhile."
            />
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              disabled={bypassReason.trim().length < 10 || busy !== null}
              onClick={() => call("bypass", { reason: bypassReason.trim() }, "Bypass logged")}
            >
              {busy === "bypass" ? <Loader2 size={16} className="animate-spin" /> : null}
              Log the bypass
            </Button>
            <Button variant="outline" onClick={() => setPanel(null)} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
