"use client";

// Lifecycle controls for one OPL, plus the reader's own acknowledgement.
//
// Acknowledging is deliberately separated from the governance buttons: it is
// the one action here that anybody might take, and it is a personal claim
// ("I have read this") rather than an act on the record.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { CheckCircle2, Loader2, Send, Upload, Archive } from "lucide-react";

const LABEL: Record<string, { text: string; icon: any; path: string; variant?: any }> = {
  SUBMIT: { text: "Send for review", icon: Send, path: "submit" },
  PUBLISH: { text: "Publish to the floor", icon: Upload, path: "publish" },
  RETIRE: { text: "Retire", icon: Archive, path: "retire", variant: "outline" }
};

export function OplActions({
  id,
  availableActions,
  myAcknowledgement,
  assignedCount,
  status
}: {
  id: string;
  availableActions: string[];
  myAcknowledgement: { status: string; dueAt: string | null } | null;
  assignedCount: number;
  status: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function call(path: string, body?: any, label = "Done") {
    setBusy(path);
    try {
      const res = await fetch(`/api/be/opl/${id}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "That did not work.");
      toast({ variant: "success", title: label });
      router.refresh();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not complete that", description: e?.message });
    } finally {
      setBusy(null);
    }
  }

  const governance = availableActions.filter((a) => LABEL[a]);
  const canAcknowledge =
    status === "PUBLISHED" &&
    myAcknowledgement !== null &&
    myAcknowledgement.status !== "ACKNOWLEDGED" &&
    myAcknowledgement.status !== "WAIVED";

  return (
    <div className="space-y-4">
      {canAcknowledge && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
            <CheckCircle2 size={15} /> You have been asked to read this
          </h3>
          <p className="mt-0.5 text-xs text-blue-800">
            Opening the page marked it as read. Acknowledging is the separate step that
            says you understood it — only you can record it.
          </p>
          <div className="mt-3">
            <Label className="mb-1 block text-xs font-medium text-blue-900">
              Anything to add? (optional)
            </Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A question, or something the lesson missed"
              maxLength={500}
            />
          </div>
          <Button
            className="mt-3"
            disabled={busy !== null}
            onClick={() => call("acknowledge", { note: note || undefined }, "Acknowledged")}
          >
            {busy === "acknowledge" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            I have read and understood this
          </Button>
        </div>
      )}

      {myAcknowledgement?.status === "ACKNOWLEDGED" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          You acknowledged this lesson.
        </div>
      )}

      {governance.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {governance.map((a) => {
            const l = LABEL[a];
            return (
              <Button
                key={a}
                variant={l.variant}
                disabled={busy !== null}
                onClick={() => call(l.path, undefined, l.text)}
              >
                {busy === l.path ? <Loader2 size={16} className="animate-spin" /> : <l.icon size={16} />}
                {l.text}
              </Button>
            );
          })}
        </div>
      )}

      {availableActions.includes("PUBLISH") && assignedCount === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Publishing resolves the audience into named reading obligations. Check the
          audience is right first — republishing later creates a new revision rather
          than re-notifying the same people.
        </p>
      )}

      {availableActions.includes("REVISE") && (
        <p className="text-xs text-slate-500">
          Published content cannot be edited. Changing this lesson means issuing a new
          revision that supersedes it, so the people who acknowledged this version
          stay attached to the version they actually read.
        </p>
      )}
    </div>
  );
}
