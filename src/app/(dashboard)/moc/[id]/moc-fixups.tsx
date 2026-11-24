"use client";

// Two dead ends on a change request, now fixable from the detail page:
//  • ApprovalChainEditor — a change saved/submitted with no reviewers could
//    never be approved ("No pending approval step"). PUT …/reviewers replaces
//    the undecided part of the chain; decided steps are kept as the record.
//  • TrainingLink — "training required" blocks approval until an ACTIVE
//    certificate is linked, and the only way to link one was typing a raw id
//    in the creation wizard. PATCH …/training links one from a picker.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { errorText } from "@/lib/client-errors";

export const MOC_REVIEWER_ROLES = [
  { code: "HSE_MANAGER", label: "HSE Manager" },
  { code: "PLANT_HEAD", label: "Plant Head" },
  { code: "CORPORATE_HSE", label: "Corporate HSE" },
  { code: "DEPARTMENT_HEAD", label: "Department Head" },
  { code: "SAFETY_OFFICER", label: "Safety Officer" },
  { code: "PLANT_HSE_HEAD", label: "Plant HSE Head" },
  { code: "MAINTENANCE_HEAD", label: "Maintenance Head" },
];

type Row = { role: string; specificUserId: string; isRequired: boolean };
type Step = { role: string; decision: string; isRequired: boolean; specificUserId?: string | null };
type PickUser = { id: string; name: string; designation: string | null };

function useRoleUsers(plantId: string, role: string) {
  const [users, setUsers] = useState<PickUser[]>([]);
  useEffect(() => {
    if (!role) return;
    let live = true;
    const q = new URLSearchParams({ plantId, role, take: "100", excludeSelf: "false" });
    fetch(`/api/users?${q}`)
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((j) => live && setUsers(Array.isArray(j.users) ? j.users : []))
      .catch(() => live && setUsers([]));
    return () => { live = false; };
  }, [plantId, role]);
  return users;
}

function ReviewerRow({ row, plantId, onChange, onRemove }: { row: Row; plantId: string; onChange: (r: Row) => void; onRemove: () => void }) {
  const users = useRoleUsers(plantId, row.role);
  return (
    <div className="grid gap-2 sm:grid-cols-[180px_1fr_150px_auto]">
      <Select aria-label="Reviewer role" value={row.role} onValueChange={(v) => onChange({ ...row, role: v, specificUserId: "" })}>
        {MOC_REVIEWER_ROLES.map((r) => <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>)}
      </Select>
      <Select aria-label="Specific person (optional)" value={row.specificUserId} onValueChange={(v) => onChange({ ...row, specificUserId: v })}>
        <SelectItem value="">Anyone with the role</SelectItem>
        {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}{u.designation ? ` — ${u.designation}` : ""}</SelectItem>)}
      </Select>
      <Select aria-label="Required" value={row.isRequired ? "yes" : "no"} onValueChange={(v) => onChange({ ...row, isRequired: v === "yes" })}>
        <SelectItem value="yes">Required</SelectItem>
        <SelectItem value="no">Informational</SelectItem>
      </Select>
      <Button type="button" variant="ghost" size="sm" aria-label="Remove reviewer" onClick={onRemove}><Trash2 size={14} /></Button>
    </div>
  );
}

export function ApprovalChainEditor({ crId, plantId, steps, closed }: { crId: string; plantId: string; steps: Step[]; closed: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const pending = steps.filter((s) => s.decision === "pending");
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  function start() {
    setRows(
      pending.length
        ? pending.map((s) => ({ role: s.role, specificUserId: s.specificUserId ?? "", isRequired: s.isRequired }))
        : [{ role: "HSE_MANAGER", specificUserId: "", isRequired: true }, { role: "PLANT_HEAD", specificUserId: "", isRequired: true }]
    );
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/moc/change-requests/${crId}/reviewers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewers: rows.map((r) => ({ role: r.role, specificUserId: r.specificUserId || null, isRequired: r.isRequired })) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ variant: "error", title: "Could not save the approval chain", description: errorText(j) });
        return;
      }
      toast({ variant: "success", title: "Approval chain saved" });
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (closed) return null;
  if (!editing) {
    return (
      <div className="mt-3 flex items-center gap-3">
        {steps.length === 0 && <span className="text-sm font-medium text-rose-700">No reviewers — this change cannot be approved until you add them.</span>}
        <Button size="sm" variant="outline" onClick={start}><Pencil size={14} /> {steps.length ? "Edit pending reviewers" : "Add reviewers"}</Button>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-2 rounded-lg border bg-slate-50 p-3">
      <p className="text-xs text-slate-600">Decided steps are kept. These reviewers replace the pending ones, in this order.</p>
      {rows.map((r, i) => (
        <ReviewerRow
          key={i}
          row={r}
          plantId={plantId}
          onChange={(nr) => setRows((rs) => rs.map((x, j) => (j === i ? nr : x)))}
          onRemove={() => setRows((rs) => rs.filter((_, j) => j !== i))}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, { role: "PLANT_HEAD", specificUserId: "", isRequired: true }])}>
          <Plus size={14} /> Add reviewer
        </Button>
        <Button size="sm" onClick={save} disabled={busy || !rows.length}>{busy ? "Saving…" : "Save approval chain"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );
}

type Cert = { id: string; holder: string; program: string; validTo: string | null };

export function TrainingLink({
  crId,
  plantId,
  trainingRequired,
  trainingCertificateId,
  closed,
}: {
  crId: string;
  plantId: string;
  trainingRequired: boolean;
  trainingCertificateId: string | null;
  closed: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [certs, setCerts] = useState<Cert[]>([]);
  const [pick, setPick] = useState(trainingCertificateId ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(() => {
      const p = new URLSearchParams({ plantId });
      if (q.trim()) p.set("q", q.trim());
      fetch(`/api/moc/training-certificates?${p}`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((j) => live && setCerts(j.items ?? []))
        .catch(() => live && setCerts([]));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [open, q, plantId]);

  async function save(body: { trainingCertificateId?: string | null; trainingRequired?: boolean }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/moc/change-requests/${crId}/training`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ variant: "error", title: "Could not update training", description: errorText(j) });
        return;
      }
      toast({ variant: j.gateOk ? "success" : "error", title: j.gateOk ? "Training requirement satisfied" : "Saved", description: j.gateMessage ?? undefined });
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (closed || !trainingRequired) return null;
  if (!open) {
    return (
      <Button size="sm" variant="outline" className="mt-2" onClick={() => setOpen(true)}>
        {trainingCertificateId ? "Change linked certificate" : "Link training certificate"}
      </Button>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-lg border bg-slate-50 p-3">
      <Input aria-label="Search by person or programme" placeholder="Search by person or programme" value={q} onChange={(e) => setQ(e.target.value)} />
      <Select aria-label="Certificate" value={pick} onValueChange={setPick}>
        <SelectItem value="" disabled>{certs.length ? "Choose a certificate" : "No ACTIVE certificates found at this plant"}</SelectItem>
        {certs.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.holder} — {c.program}{c.validTo ? ` (valid to ${new Date(c.validTo).toLocaleDateString("en-GB")})` : ""}
          </SelectItem>
        ))}
      </Select>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !pick} onClick={() => save({ trainingCertificateId: pick })}>Link certificate</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => save({ trainingRequired: false, trainingCertificateId: null })}>
          Training not actually required
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
