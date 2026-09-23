"use client";

// The lockout execution console.
//
// MOBILE-FIRST, and not in the decorative sense: this is the screen someone is
// holding at a machine, one-handed, possibly gloved, in poor light. So —
//   • single column at every width; the desktop layout is the mobile one, wider
//   • large tap targets (min 44 px) on every action that changes lock state
//   • the roster is always visible, because "who has not confirmed" is the
//     question the person holding the phone actually has
//   • the steps rendered are the FROZEN SNAPSHOT taken when the lockout started,
//     never a fresh read of the procedure — so an authoring edit happening right
//     now cannot change what this crew is following mid-job
//
// Every confirm button posts only for the SIGNED-IN user. There is no control
// anywhere on this screen that confirms on someone else's behalf, and the API
// refuses it even if one were added.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Info,
  Loader2,
  Lock,
  Unlock,
  PlayCircle,
  ShieldCheck,
  UserCheck,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Can } from "@/components/auth/can";
import { readApiError } from "@/lib/client-errors";
import { cn } from "@/lib/utils";
import {
  ENERGY_TYPE_CHIP,
  ENERGY_TYPE_LABEL,
  EXECUTION_STATUS_CHIP,
  EXECUTION_STATUS_LABEL,
  ISOLATION_METHOD_LABEL,
  PARTICIPANT_ROLE_LABEL,
  type Execution,
  type Participant,
  type VerificationStep
} from "@/app/(dashboard)/loto/_meta";

export function ExecutionConsole({
  execution,
  currentUserId
}: {
  execution: Execution;
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockTag, setLockTag] = useState("");
  const [closureNotes, setClosureNotes] = useState("");
  const [abortOpen, setAbortOpen] = useState(false);
  const [abortReason, setAbortReason] = useState("");

  const snap = execution.procedureVersionSnapshot ?? {};
  const isolationPoints = snap.isolationPoints ?? [];
  const steps: VerificationStep[] = snap.verificationSteps ?? [];
  const energySources = snap.energySources ?? [];
  const hardware = snap.hardware ?? [];

  const me = execution.participants.find((p) => p.userId === currentUserId) ?? null;
  const holders = execution.participants.filter((p) => p.isLockHolder);
  const gate = execution.gate;
  const terminal = execution.status === "closed" || execution.status === "aborted";

  const recordByStep = new Map(execution.verificationRecords.map((r) => [r.stepId, r]));

  async function call(
    key: string,
    path: string,
    method: "POST" | "PATCH",
    body: unknown
  ) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await readApiError(res, "Action failed"));
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  const base = `/api/loto/executions/${execution.id}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-24">
      {error && (
        <div className="whitespace-pre-line rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      {/* ─── Status header ─── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-mono text-lg font-bold text-slate-900">
              {execution.number}
            </div>
            <div className="text-sm text-slate-600">
              {execution.equipmentName ?? execution.procedureTitle}
            </div>
            {execution.equipmentTag && (
              <div className="font-mono text-xs text-slate-400">
                {execution.equipmentTag}
              </div>
            )}
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-semibold",
              EXECUTION_STATUS_CHIP[execution.status]
            )}
          >
            {EXECUTION_STATUS_LABEL[execution.status] ?? execution.status}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>
            {execution.procedureCode} · v{execution.snapshotVersion}
          </span>
          {execution.isGroupLockout && (
            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
              <Users size={12} /> Group lockout
            </span>
          )}
          {execution.ptwNumber && <span>Permit {execution.ptwNumber}</span>}
          <span>Started by {execution.initiatedByName ?? "—"}</span>
        </div>

        {/* The library moved under a running job. Informational — it explicitly
            does NOT change the steps below, and saying so is the point. */}
        {execution.procedureHasChangedSinceStart && !terminal && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
            <Info size={14} className="mt-0.5 shrink-0" />
            <div>
              The procedure has been edited since this lockout started. You are
              following the frozen v{execution.snapshotVersion} snapshot, and it will
              not change while this job is open.
            </div>
          </div>
        )}
      </div>

      {/* ─── What is still outstanding ─── */}
      {!terminal && gate.blockers.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2 font-semibold text-amber-900">
            <AlertTriangle size={16} /> Outstanding
          </div>
          <ul className="mt-2 space-y-1.5 text-sm text-amber-900">
            {gate.blockers.map((b, i) => (
              <li key={i} className="whitespace-pre-line">
                • {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── Group lockout roster ─── */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Users size={16} /> Lock roster
          </h2>
          <span className="text-xs text-slate-500">
            {holders.filter((p) => p.lockAppliedConfirmed).length}/{holders.length} locked
            {execution.status === "locks_removed" ||
            execution.status === "closed" ||
            holders.some((p) => p.lockRemovedConfirmed)
              ? ` · ${holders.filter((p) => p.lockRemovedConfirmed).length}/${holders.length} removed`
              : ""}
          </span>
        </header>

        <ul className="divide-y divide-slate-100">
          {execution.participants.map((p) => (
            <ParticipantRow
              key={p.id}
              p={p}
              isMe={p.userId === currentUserId}
              executionStatus={execution.status}
            />
          ))}
        </ul>

        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          Each person confirms their own lock. Nobody — supervisor included — can
          confirm or remove a lock on someone else&apos;s behalf.
        </p>
      </section>

      {/* ─── My actions ─── */}
      {!terminal && me && me.isLockHolder && (
        <section className="rounded-xl border-2 border-primary-200 bg-primary-50/40 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <UserCheck size={16} /> Your lock
          </h2>

          {!me.lockAppliedConfirmed && execution.status === "locks_applied" && (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-slate-700">
                Apply your lock and tag at the isolation points below, then confirm.
              </p>
              <Input
                value={lockTag}
                onChange={(e) => setLockTag(e.target.value)}
                placeholder="Your lock / tag number (optional)"
                className="h-11 bg-white"
              />
              <Button
                className="h-12 w-full text-base"
                onClick={() =>
                  call("lock", `${base}/lock`, "PATCH", {
                    lockTagNumber: lockTag.trim() || null
                  })
                }
                disabled={busy !== null}
              >
                {busy === "lock" ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Lock size={18} />
                )}
                My lock is on the equipment
              </Button>
            </div>
          )}

          {me.lockAppliedConfirmed && !me.lockRemovedConfirmed && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 size={16} /> Your lock is confirmed on
                {me.lockAppliedAt &&
                  ` (${new Date(me.lockAppliedAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit"
                  })})`}
                {me.lockTagNumber && ` · tag ${me.lockTagNumber}`}
              </div>
              {gate.canRemoveLocks ? (
                <Button
                  variant="outline"
                  className="h-12 w-full border-slate-300 bg-white text-base"
                  onClick={() => call("unlock", `${base}/unlock`, "PATCH", {})}
                  disabled={busy !== null}
                >
                  {busy === "unlock" ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Unlock size={18} />
                  )}
                  I have removed my lock
                </Button>
              ) : (
                <p className="text-xs text-slate-500">
                  Locks come off once zero-energy verification is complete.
                </p>
              )}
            </div>
          )}

          {me.lockRemovedConfirmed && (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 size={16} className="text-emerald-600" /> You have confirmed
              your lock is off.
            </div>
          )}
        </section>
      )}

      {!terminal && me && !me.isLockHolder && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          You are recorded on this lockout as an{" "}
          <strong>affected employee</strong> — notified that the equipment is isolated,
          but not issued a lock. There is nothing for you to confirm.
        </div>
      )}

      {!terminal && !me && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          You are not enrolled on this lockout, so you have no lock to confirm. You can
          follow its progress here.
        </div>
      )}

      {/* ─── Isolation points (frozen snapshot) ─── */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">Isolation points</h2>
          <p className="text-xs text-slate-500">
            In order. From the frozen v{execution.snapshotVersion} snapshot.
          </p>
        </header>
        <ol className="divide-y divide-slate-100">
          {isolationPoints.map((p: any) => (
            <li key={p.id} className="flex gap-3 px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                {p.sequence}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900">{p.location}</div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-600">
                    {ISOLATION_METHOD_LABEL[p.isolationMethod] ?? p.isolationMethod}
                  </span>
                  {p.lockType && (
                    <span className="text-slate-500">Lock: {p.lockType}</span>
                  )}
                </div>
                {p.verificationMethod && (
                  <p className="mt-1 text-sm text-slate-600">{p.verificationMethod}</p>
                )}
              </div>
            </li>
          ))}
        </ol>

        {(energySources.length > 0 || hardware.length > 0) && (
          <div className="space-y-2 border-t border-slate-100 px-4 py-3">
            {energySources.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {energySources.map((s: any) => (
                  <span
                    key={s.id}
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-xs",
                      ENERGY_TYPE_CHIP[s.energyType] ?? ENERGY_TYPE_CHIP.other
                    )}
                  >
                    {ENERGY_TYPE_LABEL[s.energyType]}
                    {s.magnitude ? ` · ${s.magnitude}` : ""}
                  </span>
                ))}
              </div>
            )}
            {hardware.length > 0 && (
              <div className="text-xs text-slate-500">
                Hardware:{" "}
                {hardware.map((h: any) => `${h.quantityRequired}× ${h.itemType}`).join(", ")}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ─── Verification checklist ─── */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <ShieldCheck size={16} /> Zero-energy verification
          </h2>
          <p className="text-xs text-slate-500">
            {execution.verificationRecords.length}/{steps.length} complete
          </p>
        </header>
        <ol className="divide-y divide-slate-100">
          {steps.map((s) => (
            <VerificationStepRow
              key={s.id}
              step={s}
              record={recordByStep.get(s.id) ?? null}
              canComplete={gate.canVerify && !terminal}
              busy={busy === `verify:${s.id}`}
              onComplete={(payload) =>
                call(`verify:${s.id}`, `${base}/verify`, "PATCH", {
                  records: [{ stepId: s.id, ...payload }]
                })
              }
            />
          ))}
        </ol>
        {!gate.canVerify && !terminal && steps.length > 0 && (
          <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            {gate.awaitingLockConfirmation.length > 0
              ? "Every lock must be on the equipment before verification can start."
              : "Verification is not available at this stage."}
          </p>
        )}
      </section>

      {/* ─── Stage transitions ─── */}
      {!terminal && (
        <section className="space-y-3">
          {gate.canStartWork && (
            <Button
              className="h-12 w-full text-base"
              onClick={() => call("startwork", `${base}/start-work`, "PATCH", {})}
              disabled={busy !== null}
            >
              {busy === "startwork" ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <PlayCircle size={18} />
              )}
              Zero energy confirmed — start work
            </Button>
          )}

          {execution.status === "locks_removed" && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold text-slate-900">Close the lockout</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                All locks are accounted for. Sign off to close the record.
              </p>
              <Textarea
                rows={2}
                className="mt-3"
                value={closureNotes}
                onChange={(e) => setClosureNotes(e.target.value)}
                placeholder="Closing notes (optional) — equipment condition, anything handed over."
              />
              <Button
                className="mt-3 h-12 w-full text-base"
                onClick={() =>
                  call("close", `${base}/close`, "POST", {
                    closureNotes: closureNotes.trim() || null
                  })
                }
                disabled={busy !== null || !gate.canClose}
              >
                {busy === "close" ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                Close lockout
              </Button>
            </div>
          )}

          {/* The recorded exception path.
              This exists so that "we had to cut a lock off" is a visible,
              attributed event with a reason attached — instead of pressure to
              build a silent supervisor override into the normal close path.
              LOTO.APPROVE, not EXECUTE: it is the one route that ends a lockout
              without every lock being individually accounted for. */}
          <Can permission="LOTO.APPROVE">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {!abortOpen ? (
                <Button variant="bare"
                  type="button"
                  onClick={() => setAbortOpen(true)}
                  className="min-h-[44px] text-sm font-medium text-slate-500 hover:text-rose-700"
                >
                  Abandon this lockout…
                </Button>
              ) : (
                <div>
                  <h2 className="flex items-center gap-2 font-semibold text-rose-900">
                    <AlertTriangle size={16} /> Abandon lockout
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Use this only when the lockout cannot be completed normally — for
                    example a lock had to be cut off because its holder is unreachable.
                    It ends the record without every lock being individually confirmed,
                    so the reason is mandatory and permanently attached.
                  </p>
                  <Textarea
                    rows={2}
                    className="mt-3"
                    value={abortReason}
                    onChange={(e) => setAbortReason(e.target.value)}
                    placeholder="What happened, who authorised it, and what was done to make the equipment safe."
                  />
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      className="h-11 flex-1 border-rose-300 text-rose-700 hover:bg-rose-50"
                      onClick={() =>
                        call("abort", `${base}/abort`, "POST", {
                          reason: abortReason.trim()
                        })
                      }
                      disabled={busy !== null || abortReason.trim().length < 3}
                    >
                      {busy === "abort" ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <AlertTriangle size={16} />
                      )}
                      Abandon lockout
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-11"
                      onClick={() => setAbortOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Can>
        </section>
      )}

      {/* ─── Terminal summary ─── */}
      {terminal && (
        <section
          className={cn(
            "rounded-xl border p-4 text-sm",
            execution.status === "closed"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-slate-300 bg-slate-100 text-slate-700"
          )}
        >
          <div className="flex items-center gap-2 font-semibold">
            {execution.status === "closed" ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertTriangle size={16} />
            )}
            {execution.status === "closed" ? "Lockout closed" : "Lockout aborted"}
          </div>
          <div className="mt-1">
            {execution.status === "closed" ? (
              <>
                Closed by {execution.closedByName ?? "—"}
                {execution.closedAt &&
                  ` on ${new Date(execution.closedAt).toLocaleString("en-IN")}`}
                .
                {execution.closureNotes && (
                  <p className="mt-1 whitespace-pre-line">{execution.closureNotes}</p>
                )}
              </>
            ) : (
              <>
                {execution.abortedAt &&
                  `Aborted on ${new Date(execution.abortedAt).toLocaleString("en-IN")}. `}
                <span className="font-medium">Reason:</span> {execution.abortReason}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function ParticipantRow({
  p,
  isMe,
  executionStatus
}: {
  p: Participant;
  isMe: boolean;
  executionStatus: string;
}) {
  const removalPhase =
    executionStatus === "verified" ||
    executionStatus === "work_in_progress" ||
    executionStatus === "locks_removed" ||
    executionStatus === "closed";

  return (
    <li className={cn("flex items-center gap-3 px-4 py-3", isMe && "bg-primary-50/40")}>
      <div className="shrink-0">
        {!p.isLockHolder ? (
          <Circle size={20} className="text-slate-300" />
        ) : p.lockRemovedConfirmed ? (
          <Unlock size={20} className="text-emerald-600" />
        ) : p.lockAppliedConfirmed ? (
          <Lock size={20} className="text-rose-600" />
        ) : (
          <Clock size={20} className="text-amber-500" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/* Name, never a raw user id — the platform rule. */}
          <span className="truncate font-medium text-slate-900">
            {p.userName ?? "Unknown user"}
          </span>
          {isMe && (
            <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-700">
              You
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">
          {PARTICIPANT_ROLE_LABEL[p.participantRole] ?? p.participantRole}
          {p.lockTagNumber && ` · tag ${p.lockTagNumber}`}
        </div>
      </div>

      <div className="shrink-0 text-right text-xs">
        {!p.isLockHolder ? (
          <span className="text-slate-400">Notified</span>
        ) : p.lockRemovedConfirmed ? (
          <span className="font-medium text-emerald-700">Lock off</span>
        ) : p.lockAppliedConfirmed ? (
          <span className={cn("font-medium", removalPhase ? "text-amber-700" : "text-rose-700")}>
            {removalPhase ? "Awaiting removal" : "Lock on"}
          </span>
        ) : (
          <span className="font-medium text-amber-700">Not confirmed</span>
        )}
      </div>
    </li>
  );
}

function VerificationStepRow({
  step,
  record,
  canComplete,
  busy,
  onComplete
}: {
  step: VerificationStep;
  record: { completedByName: string | null; completedAt: string; signoff: boolean; photoUrl: string | null } | null;
  canComplete: boolean;
  busy: boolean;
  onComplete: (payload: { signoff: boolean; photoUrl: string | null; notes: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [notes, setNotes] = useState("");

  const done = !!record;

  return (
    <li className="px-4 py-3">
      <div className="flex gap-3">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            done ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
          )}
        >
          {done ? <CheckCircle2 size={15} /> : step.sequence}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm", done ? "text-slate-500" : "text-slate-900")}>
            {step.stepText}
          </p>
          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-500">
            {step.requiresSignoff && <span>Sign-off required</span>}
            {step.requiresPhoto && (
              <span className="inline-flex items-center gap-1">
                <Camera size={10} /> Photo required
              </span>
            )}
          </div>

          {done && record && (
            <div className="mt-1 text-xs text-emerald-700">
              {record.completedByName ?? "—"} ·{" "}
              {new Date(record.completedAt).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </div>
          )}

          {!done && canComplete && !open && (
            <Button variant="bare"
              type="button"
              onClick={() => setOpen(true)}
              className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-primary-700"
            >
              Complete this step <ChevronRight size={14} />
            </Button>
          )}

          {!done && open && (
            <div className="mt-2 space-y-2">
              {step.requiresPhoto && (
                <Input
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="Photo reference / URL"
                  className="h-11"
                />
              )}
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
              />
              <div className="flex gap-2">
                <Button
                  className="h-11 flex-1"
                  onClick={() =>
                    onComplete({
                      // A step configured to need a sign-off IS the sign-off when
                      // completed here; one that isn't records completion without
                      // asserting one. The server re-checks either way.
                      signoff: step.requiresSignoff,
                      photoUrl: photoUrl.trim() || null,
                      notes: notes.trim() || null
                    })
                  }
                  disabled={busy || (step.requiresPhoto && !photoUrl.trim())}
                >
                  {busy && <Loader2 size={15} className="animate-spin" />}
                  {step.requiresSignoff ? "Sign off" : "Mark complete"}
                </Button>
                <Button variant="ghost" className="h-11" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
