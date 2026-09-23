"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2, KeyRound } from "lucide-react";
import { Can } from "@/components/auth/can";
import { confirmDialog, promptDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export function UserActions({ userId, userName, userEmail }: { userId: string; userName: string; userEmail: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function deleteUser() {
    if (!(await confirmDialog({
      title: "Delete user?",
      description: `Delete ${userName} (${userEmail})?\n\nThis cannot be undone. Records the user originated will be retained but their account will be removed and they will not be able to log in.`,
      confirmLabel: "Delete",
      destructive: true
    }))) return;
    const second = await promptDialog({ description: `Type DELETE to confirm.` });
    if (second !== "DELETE") return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      router.push("/configuration/users");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      toast({ title: "Delete failed", description: j.error ?? "Delete failed.", variant: "error" });
    }
  }

  async function resetPassword() {
    const newPwd = await promptDialog({ description: "Enter a new password (minimum 8 characters):" });
    if (!newPwd) return;
    if (newPwd.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters.", variant: "error" });
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPwd })
    });
    setBusy(false);
    if (res.ok) {
      toast({ title: "Password reset.", variant: "success" });
    } else {
      const j = await res.json().catch(() => ({}));
      toast({ title: "Reset failed", description: j.error ?? "Reset failed.", variant: "error" });
    }
  }

  return (
    <div className="flex gap-2">
      <Can permission="CONFIGURATION.USERS">
        <Button variant="ghost" onClick={resetPassword} disabled={busy}>
          <KeyRound size={14} /> Reset password
        </Button>
      </Can>
      <Can permission="CONFIGURATION.USERS">
        <Button
          variant="ghost"
          onClick={deleteUser}
          disabled={busy}
          className="text-rose-700 hover:text-rose-900 hover:bg-rose-50"
        >
          <Trash2 size={14} /> Delete user
        </Button>
      </Can>
    </div>
  );
}
