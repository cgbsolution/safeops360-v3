"use client";

// Lifecycle + milestone controls for one improvement project.
//
// Transitions come from the server's `availableActions`; where one is permitted
// but would still fail, the reason arrives in `transitionBlockers` and is shown
// next to the disabled button rather than left to a 409 the user cannot read.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserPicker } from "@/components/ui/user-picker";
import { useToast } from "@/components/ui/toast";
import { Loader2, Send, Plus, BookOpen } from "lucide-react";
import {
  MILESTONE_STATUS_LABEL,
  SIP_ACTION_LABEL,
  type SipMilestone
} from "../../_meta-p2";
import { BlockerNote } from "../../ui-p2";
import { Select, SelectItem } from "@/components/ui/select";

export function SipActions({
  id,
  status,
  availableActions,
  transitionBlockers,
  lessonsLearned,
  canUpdate
}: {
  id: string;
  status: string;
  availableActions: string[];
  transitionBlockers: Record<string, string[]>;
  lessonsLearned: string | null;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [lessons, setLessons] = useState(lessonsLearned ?? "");
  const [editingLessons, setEditingLessons] = useState(false);

  async function call(path: string, body: any, label: string, method = "POST") {
    setBusy(path);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "That did not work.");
      toast({ variant: "success", title: label });
      setTarget(null);
      setNote("");
      setEditingLessons(false);
      router.refresh();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not complete that", description: e?.message });
    } finally {
      setBusy(null);
    }
  }

  // These carry a reason the user has to supply, so they open a panel rather
  // than firing straight away.
  const NEEDS_NOTE = new Set(["ON_HOLD", "REJECTED", "CANCELLED"]);
  // §7 requires a lessons-learned note before closure; the field is offered
  // whenever the project is far enough along for one to exist.
  const showLessons =
    canUpdate && ["IN_PROGRESS", "COMPLETED", "BENEFIT_VALIDATION"].includes(status);

  if (!availableActions.length && !showLessons) {
    return (
      <p className="text-sm text-slate-500">
        No further action is available to you on this project at{" "}
        {status.replace(/_/g, " ").toLowerCase()}.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {showLessons ? (
        <div>
          {editingLessons ? (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Label htmlFor="lessons">Lessons learned</Label>
              <Textarea
                id="lessons"
                rows={4}
                value={lessons}
                onChange={(e) => setLessons(e.target.value)}
                placeholder="What would you tell the next team taking on something like this?"
              />
              <p className="text-xs text-slate-500">
                Required before the project can close. It is the only part of a finished
                project that helps the next one.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy !== null || !lessons.trim()}
                  onClick={() =>
                    call(
                      `/api/be/sip/${id}`,
                      { lessonsLearned: lessons.trim() },
                      "Lessons recorded",
                      "PATCH"
                    )
                  }
                >
                  {busy === `/api/be/sip/${id}` ? (
                    <Loader2 size={13} className="mr-1 animate-spin" />
                  ) : null}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingLessons(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditingLessons(true)}>
              <BookOpen size={13} className="mr-1.5" />
              {lessonsLearned ? "Edit lessons learned" : "Capture lessons learned"}
            </Button>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        {availableActions.map((a) => {
          const blockers = transitionBlockers[a] ?? [];
          const blocked = blockers.length > 0;
          return (
            <div key={a}>
              <Button
                variant={["APPROVED", "CLOSED", "SUBMITTED"].includes(a) ? "default" : "outline"}
                disabled={busy !== null || blocked}
                onClick={() =>
                  NEEDS_NOTE.has(a)
                    ? setTarget(target === a ? null : a)
                    : call(
                        `/api/be/sip/${id}/transition/${a}`,
                        {},
                        SIP_ACTION_LABEL[a] ?? "Updated"
                      )
                }
              >
                {busy?.includes(`/transition/${a}`) ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <Send size={14} className="mr-1.5" />
                )}
                {SIP_ACTION_LABEL[a] ?? a}
              </Button>
              <BlockerNote blockers={blockers} />

              {target === a ? (
                <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <Label htmlFor={`note-${a}`}>
                    {a === "ON_HOLD" ? "Why it is being paused" : "Reason"}
                  </Label>
                  <Textarea
                    id={`note-${a}`}
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={busy !== null || !note.trim()}
                    onClick={() =>
                      call(
                        `/api/be/sip/${id}/transition/${a}`,
                        { note: note.trim() },
                        SIP_ACTION_LABEL[a] ?? "Updated"
                      )
                    }
                  >
                    {busy?.includes(`/transition/${a}`) ? (
                      <Loader2 size={13} className="mr-1 animate-spin" />
                    ) : null}
                    Confirm
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Add and update milestones. */
export function MilestoneControls({
  sipId,
  milestone,
  canUpdate,
  canDelete
}: {
  sipId: string;
  milestone: SipMilestone;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(milestone.status);
  const [revisedDate, setRevisedDate] = useState(
    milestone.revisedDate ? milestone.revisedDate.slice(0, 10) : ""
  );
  const [progress, setProgress] = useState(String(milestone.progressPercent ?? ""));
  const [note, setNote] = useState(milestone.note ?? "");

  if (!canUpdate) return null;

  async function call(body: any, method: string, label: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/be/sip/${sipId}/milestones/${milestone.id}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "That did not work.");
      toast({ variant: "success", title: label });
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not update the milestone", description: e?.message });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Update
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <Label htmlFor={`st-${milestone.id}`}>Status</Label>
          <Select
            id={`st-${milestone.id}`}
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {Object.entries(MILESTONE_STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`rd-${milestone.id}`}>Revised date</Label>
          <Input
            id={`rd-${milestone.id}`}
            type="date"
            value={revisedDate}
            onChange={(e) => setRevisedDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`pp-${milestone.id}`}>Progress %</Label>
          <Input
            id={`pp-${milestone.id}`}
            type="number"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label htmlFor={`nt-${milestone.id}`}>Note</Label>
        <Input
          id={`nt-${milestone.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {/* The planned date is not editable — slippage is recorded on the revised
          date so the original commitment stays visible. */}
      <p className="text-xs text-slate-500">
        The planned date cannot be changed. A slip is recorded as a revised date
        alongside it.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            call(
              {
                status,
                revisedDate: revisedDate ? new Date(revisedDate).toISOString() : null,
                progressPercent: progress ? Number(progress) : null,
                note: note.trim() || null
              },
              "PATCH",
              "Milestone updated"
            )
          }
        >
          {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : null}
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {canDelete ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-600 hover:text-rose-700"
            disabled={busy}
            onClick={() => call(null, "DELETE", "Milestone removed")}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Add a milestone to a project already registered. */
export function AddMilestone({ sipId, nextSequence }: { sipId: string; nextSequence: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/be/sip/${sipId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sequence: nextSequence,
          ownerId,
          plannedDate: plannedDate ? new Date(plannedDate).toISOString() : null
        })
      });
      if (!res.ok) throw new Error((await res.json())?.detail ?? "That did not work.");
      toast({ variant: "success", title: "Milestone added" });
      setOpen(false);
      setName("");
      setPlannedDate("");
      setOwnerId(null);
      router.refresh();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not add the milestone", description: e?.message });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus size={13} className="mr-1" />
        Add a milestone
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <Label htmlFor="msn">Milestone</Label>
          <Input id="msn" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="msd">Planned date</Label>
          <Input
            id="msd"
            type="date"
            value={plannedDate}
            onChange={(e) => setPlannedDate(e.target.value)}
          />
        </div>
        <div>
          <Label>Owner</Label>
          <UserPicker value={ownerId} onChange={(id) => setOwnerId(id)} placeholder="Optional" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !name.trim()} onClick={save}>
          {busy ? <Loader2 size={13} className="mr-1 animate-spin" /> : null}
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
