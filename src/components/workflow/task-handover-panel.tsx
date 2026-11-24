"use client";

// Shown on a record page when the record has open workflow tasks that are NOT
// the viewer's. Before this, the action panel rendered only for the assignee,
// so anyone else (including the HSE Manager who is meant to unblock work) saw
// no actions at all — the record just looked stuck. Everyone now sees who the
// record is waiting on; HSE Manager / Admin can take the task over or hand it
// to someone else (POST /api/workflow/reassign, which re-checks authority and
// that the new holder has the role the step needs).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Clock, UserCheck, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReassignDialog } from "@/components/workflow/approval-panel";
import { errorText } from "@/lib/client-errors";
import { formatDateTime } from "@/lib/utils";

export type HandoverTask = {
  id: string;
  stepName: string;
  status: string;
  assignedAt: Date | string;
  dueAt?: Date | string | null;
  assigneeName: string | null;
};

const PRIVILEGED = new Set(["HSE_MANAGER", "ADMIN", "SYSTEM_ADMIN"]);

export function TaskHandoverPanel({
  tasks,
  plantId,
  eligibleRoles,
}: {
  tasks: HandoverTask[];
  plantId?: string | null;
  eligibleRoles?: string[];
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const me = session?.user as { id?: string; role?: string; name?: string } | undefined;
  const privileged = !!me?.role && PRIVILEGED.has(me.role);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!tasks.length) return null;

  async function takeOver(t: HandoverTask) {
    if (!me?.id) return;
    setBusy(t.id);
    setError(null);
    try {
      const res = await fetch("/api/workflow/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: t.id,
          toUserId: me.id,
          reason: `Taken over by ${me.name ?? "HSE Manager"} — ${t.assigneeName ?? "assignee"} unavailable`,
        }),
      });
      if (!res.ok) {
        setError(errorText(await res.json().catch(() => ({})), "Could not take over the task"));
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock size={16} className="text-amber-600" aria-hidden /> Waiting on
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        <ul className="space-y-2">
          {tasks.map((t) => {
            const late = t.status === "OVERDUE" || t.status === "ESCALATED";
            return (
              <li key={t.id} className="rounded-md border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{t.stepName}</div>
                    <div className="text-xs text-slate-600">
                      With <span className="font-medium">{t.assigneeName ?? "an assignee"}</span> since {formatDateTime(t.assignedAt)}
                      {t.dueAt ? ` · due ${formatDateTime(t.dueAt)}` : ""}
                      {late && <span className="ml-1 font-semibold text-rose-700">· {t.status.toLowerCase()}</span>}
                    </div>
                  </div>
                  {privileged && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={busy === t.id} onClick={() => takeOver(t)}>
                        <UserCheck size={14} /> Take over
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}>
                        <UserMinus size={14} /> Reassign
                      </Button>
                    </div>
                  )}
                </div>
                {open === t.id && (
                  <div className="mt-2">
                    <ReassignDialog
                      taskId={t.id}
                      plantId={plantId ?? undefined}
                      eligibleRoles={eligibleRoles}
                      allowSelf
                      onClose={() => setOpen(null)}
                      onDone={() => { setOpen(null); router.refresh(); }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {!privileged && (
          <p className="text-xs text-slate-500">Only the person named above can act on this step. An HSE Manager can reassign it.</p>
        )}
      </CardContent>
    </Card>
  );
}
