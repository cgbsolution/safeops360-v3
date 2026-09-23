"use client";

// The circle's roster.
//
// Standing a member down is a `leftAt` stamp, never a delete: the
// separation-of-duties check on benefit validation has to know who was EVER in
// the circle, not just who is in it today. The button therefore says "stand
// down" rather than "remove", so the UI does not promise an erasure the data
// model deliberately does not perform.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UserPicker } from "@/components/ui/user-picker";
import { useToast } from "@/components/ui/toast";
import { Loader2, Plus, UserMinus } from "lucide-react";
import { QCC_MEMBER_ROLE_LABEL, type QccMember } from "../../_meta-p2";
import { PersonRef } from "../../ui";
import { Select, SelectItem } from "@/components/ui/select";

export function TeamRoster({
  teamId,
  members,
  canUpdate
}: {
  teamId: string;
  members: QccMember[];
  canUpdate: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState("MEMBER");

  const active = members.filter((m) => !m.leftAt);

  async function call(path: string, method: string, body: any, label: string) {
    setBusy(path);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "That did not work.");
      toast({ variant: "success", title: label });
      setAdding(false);
      setPendingId(null);
      router.refresh();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not update the roster", description: e?.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Roster</h2>
        {canUpdate ? (
          <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}>
            <Plus size={13} className="mr-1" />
            Add
          </Button>
        ) : null}
      </div>

      {adding ? (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div>
            <Label>Person</Label>
            <UserPicker
              value={pendingId}
              onChange={(id) => setPendingId(id)}
              placeholder="Search for a person"
            />
          </div>
          <div>
            <Label htmlFor="role">Role</Label>
            <Select
              id="role"
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
              value={pendingRole}
              onChange={(e) => setPendingRole(e.target.value)}
            >
              {Object.entries(QCC_MEMBER_ROLE_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            disabled={!pendingId || busy !== null}
            onClick={() =>
              call(
                `/api/be/qcc/teams/${teamId}/members`,
                "POST",
                { userId: pendingId, memberRole: pendingRole },
                "Roster updated"
              )
            }
          >
            {busy?.endsWith("members") ? (
              <Loader2 size={13} className="mr-1 animate-spin" />
            ) : null}
            Add to circle
          </Button>
        </div>
      ) : null}

      {active.length ? (
        <ul className="mt-3 space-y-2.5">
          {active.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <PersonRef person={m.user} />
                <div className="text-xs text-slate-400">
                  {QCC_MEMBER_ROLE_LABEL[m.memberRole] ?? m.memberRole}
                </div>
              </div>
              {canUpdate ? (
                <Button variant="bare"
                  type="button"
                  title="Stand down — the membership is kept, with an end date"
                  disabled={busy !== null}
                  onClick={() =>
                    call(
                      `/api/be/qcc/teams/${teamId}/members/${m.userId}`,
                      "DELETE",
                      null,
                      "Stood down"
                    )
                  }
                  className="shrink-0 text-slate-300 hover:text-amber-600 disabled:opacity-40"
                  aria-label="Stand this member down"
                >
                  <UserMinus size={14} />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Nobody on the roster yet.</p>
      )}
    </section>
  );
}
