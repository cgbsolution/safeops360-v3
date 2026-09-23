"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { CheckCircle2, ArchiveX } from "lucide-react";
import { Can } from "@/components/auth/can";

export function ChecklistApprovalActions({ templateId, status }: { templateId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function approve() {
    if (!(await confirmDialog("Approve this template? Once approved, the template becomes immutable. To change anything, create a new version."))) return;
    setBusy(true);
    const res = await fetch(`/api/checklist-templates/${templateId}/approve`, { method: "POST" });
    setBusy(false);
    if (res.ok) router.refresh();
    else toast({ title: "Approval failed.", variant: "error" });
  }

  async function retire() {
    if (
      !(await confirmDialog({
        title: "Retire this template?",
        description: "Retire this template? It will no longer be available for new schedule generation.",
        confirmLabel: "Retire",
        destructive: true
      }))
    )
      return;
    setBusy(true);
    const res = await fetch(`/api/checklist-templates/${templateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalStatus: "RETIRED" })
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else toast({ title: "Retire failed.", variant: "error" });
  }

  return (
    <>
      {status === "UNDER_REVIEW" && (
        <Can permission="CHECKLIST_TEMPLATE.APPROVE">
          <Button onClick={approve} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
            <CheckCircle2 size={14} /> Approve
          </Button>
        </Can>
      )}
      {status === "APPROVED" && (
        <Can permission="CHECKLIST_TEMPLATE.DELETE">
          <Button onClick={retire} disabled={busy} variant="ghost">
            <ArchiveX size={14} /> Retire
          </Button>
        </Can>
      )}
    </>
  );
}
