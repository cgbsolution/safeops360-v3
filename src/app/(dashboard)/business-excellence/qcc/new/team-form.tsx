"use client";

// Form a quality circle (§6).
//
// Unlike the registers, a circle is numbered on CREATE rather than on a later
// submit: the number IS the circle's identity — it goes on a certificate and a
// leaderboard long before the team has a project to show — so there is no
// draft/submit split here.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserPicker } from "@/components/ui/user-picker";
import { useToast } from "@/components/ui/toast";
import { Loader2, Users, Plus, X } from "lucide-react";
import { QCC_MEMBER_ROLE_LABEL } from "../../_meta-p2";
import { Select, SelectItem } from "@/components/ui/select";

type Area = { id: string; name: string };
type Member = { userId: string; name: string; memberRole: string };

export function TeamForm({
  plantId,
  plantName,
  areas
}: {
  plantId: string;
  plantName: string | null;
  areas: Area[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    department: "",
    motto: "",
    areaId: "",
    leaderId: null as string | null,
    leaderName: "",
    facilitatorId: null as string | null,
    facilitatorName: "",
    formedOn: new Date().toISOString().slice(0, 10)
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<{ id: string | null; name: string }>({
    id: null,
    name: ""
  });
  const [pendingRole, setPendingRole] = useState("MEMBER");

  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  // Mirrors the server's Pydantic rules so the user is told before the round
  // trip. The server still re-validates — this is a courtesy, never the gate.
  const problems: string[] = [];
  if (form.name.trim().length < 3) problems.push("Give the circle a name of at least 3 characters.");
  const valid = problems.length === 0;

  function addMember() {
    if (!pending.id) return;
    if (members.some((m) => m.userId === pending.id)) {
      toast({ variant: "error", title: "Already on the roster" });
      return;
    }
    setMembers((ms) => [
      ...ms,
      { userId: pending.id!, name: pending.name, memberRole: pendingRole }
    ]);
    setPending({ id: null, name: "" });
    setPendingRole("MEMBER");
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, any> = {
        plantId,
        name: form.name.trim(),
        members: members.map((m) => ({ userId: m.userId, memberRole: m.memberRole }))
      };
      if (form.areaId) payload.areaId = form.areaId;
      if (form.department.trim()) payload.department = form.department.trim();
      if (form.motto.trim()) payload.motto = form.motto.trim();
      if (form.leaderId) payload.leaderId = form.leaderId;
      if (form.facilitatorId) payload.facilitatorId = form.facilitatorId;
      if (form.formedOn) payload.formedOn = new Date(form.formedOn).toISOString();

      const res = await fetch("/api/be/qcc/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "Could not form the circle.");
      const created = await res.json();

      toast({ variant: "success", title: `Circle formed — ${created.teamNo ?? created.name}` });
      router.push(`/business-excellence/qcc/${created.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold text-slate-900">The circle</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Circle name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Sewing Line 3 — Quality Circle"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={form.department}
                onChange={(e) => set("department", e.target.value)}
                placeholder="Sewing"
              />
            </div>
            <div>
              <Label htmlFor="areaId">Area (optional)</Label>
              <Select
                id="areaId"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={form.areaId}
                onChange={(e) => set("areaId", e.target.value)}
              >
                <SelectItem value="">Not area-specific</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="motto">Motto (optional)</Label>
            <Textarea
              id="motto"
              rows={2}
              value={form.motto}
              onChange={(e) => set("motto", e.target.value)}
              placeholder="Circles that name themselves tend to stay together."
            />
          </div>
          <div>
            <Label htmlFor="formedOn">Formed on</Label>
            <Input
              id="formedOn"
              type="date"
              value={form.formedOn}
              onChange={(e) => set("formedOn", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 font-semibold text-slate-900">Leader and facilitator</h2>
        {/* Both are also added to the roster on save, so "who was in this
            circle" has exactly one answer. */}
        <p className="mb-4 text-xs text-slate-500">
          Both are added to the roster automatically. The leader runs the circle; the
          facilitator is the person outside it who unblocks things.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Circle leader</Label>
            <UserPicker
              value={form.leaderId}
              onChange={(id, u) => {
                set("leaderId", id);
                set("leaderName", u?.name ?? "");
              }}
              placeholder="Search for a person"
            />
          </div>
          <div>
            <Label>Facilitator</Label>
            <UserPicker
              value={form.facilitatorId}
              onChange={(id, u) => {
                set("facilitatorId", id);
                set("facilitatorName", u?.name ?? "");
              }}
              placeholder="Search for a person"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 font-semibold text-slate-900">Members</h2>
        <p className="mb-4 text-xs text-slate-500">
          Anyone here is barred from validating this circle&rsquo;s own benefit later —
          including after they leave. That is deliberate.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Label>Add a member</Label>
            <UserPicker
              value={pending.id}
              onChange={(id, u) => setPending({ id, name: u?.name ?? "" })}
              placeholder="Search for a person"
            />
          </div>
          <div>
            <Label htmlFor="memberRole">Role</Label>
            <Select
              id="memberRole"
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm w-auto"
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
          <Button type="button" variant="outline" onClick={addMember} disabled={!pending.id}>
            <Plus size={14} className="mr-1.5" />
            Add
          </Button>
        </div>

        {members.length ? (
          <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-slate-800">
                  {m.name}
                  <span className="ml-2 text-xs text-slate-400">
                    {QCC_MEMBER_ROLE_LABEL[m.memberRole]}
                  </span>
                </span>
                <Button variant="bare"
                  type="button"
                  onClick={() => setMembers((ms) => ms.filter((x) => x.userId !== m.userId))}
                  className="text-slate-400 hover:text-rose-600"
                  aria-label={`Remove ${m.name}`}
                >
                  <X size={14} />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            No members yet. You can add them after forming the circle too.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-xs uppercase tracking-wider text-slate-400">Site</div>
        <div className="mt-1 text-sm text-slate-700">{plantName ?? "—"}</div>
      </div>

      {problems.length ? (
        <ul className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {problems.map((p) => (
            <li key={p}>• {p}</li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <Button onClick={save} disabled={!valid || busy}>
        {busy ? (
          <Loader2 size={15} className="mr-1.5 animate-spin" />
        ) : (
          <Users size={15} className="mr-1.5" />
        )}
        Form the circle
      </Button>
    </div>
  );
}
