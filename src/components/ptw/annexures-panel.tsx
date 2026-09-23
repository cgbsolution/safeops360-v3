"use client";

/**
 * Permit detail — hazard annexures + precaution checklists.
 *
 * This is the screen the site EHS officer reads BEFORE approving. The whole
 * point of the layout is that one person sees every attached checklist in one
 * place and signs once: the approval step in the workflow is the certification
 * of all of them together, exactly as on the paper form.
 *
 * The verdict rendered here comes from the server
 * (`GET /api/ptw/{id}/annexures`, backed by `ptw_annexures.evaluate`) — the
 * same function the approval gate calls. The panel therefore cannot say
 * "clear" about something the API is about to refuse.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CircleSlash,
  Loader2,
  Lock,
  X
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { readApiError } from "@/lib/client-errors";
import { cn } from "@/lib/utils";
import { UserRefLabel, type UserDirectory } from "@/lib/users/user-ref";
import type { PrecautionAnswer } from "@/lib/ptw/hazards";

type Item = {
  id: string;
  sequence: number;
  text: string;
  isMandatory: boolean;
  allowsNA: boolean;
  sourceRef?: string | null;
};

type Answer = {
  itemId: string;
  response: PrecautionAnswer;
  remark: string | null;
  respondedById: string | null;
  respondedAt: string | null;
};

type Annexure = {
  id: string;
  hazardType: string;
  label: string;
  isPrimary: boolean;
  completedAt: string | null;
  completedById: string | null;
  notes: string | null;
  items: Item[];
  answers: Answer[];
  complete: boolean;
  unanswered: string[];
  refused: string[];
  naWithoutRemark: string[];
};

type Payload = {
  complete: boolean;
  blocker: string | null;
  effectiveRiskType: string | null;
  validityCapHours: number | null;
  requiredControls: string[];
  precautionsCertifiedAt: string | null;
  precautionsCertifiedById: string | null;
  annexures: Annexure[];
};

const CONTROL_LABELS: Record<string, string> = {
  GAS_TEST: "Gas testing",
  FIRE_WATCH: "Fire watch",
  STANDBY: "Standby person",
  RESCUE_PLAN: "Rescue plan"
};

export function AnnexuresPanel({
  permitId,
  editable
}: {
  permitId: string;
  /** DRAFT / SUBMITTED and uncertified — the server enforces this too. */
  editable: boolean;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, { response: PrecautionAnswer; remark: string }>>({});
  // Never render a raw user id — resolve the certifier to name / plant / role.
  const [userDir, setUserDir] = useState<UserDirectory>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ptw/${permitId}/annexures`);
      if (!res.ok) return;
      const j: Payload = await res.json();
      setData(j);
      setActive((prev) => prev ?? j.annexures[0]?.hazardType ?? null);
    } finally {
      setLoading(false);
    }
  }, [permitId]);

  useEffect(() => { void load(); }, [load]);

  // Resolve the one id this panel renders. Best-effort: a failure degrades to
  // the component's own "Unknown user" fallback rather than breaking the card.
  const certifierId = data?.precautionsCertifiedById ?? null;
  useEffect(() => {
    if (!certifierId || userDir[certifierId]) return;
    let alive = true;
    fetch(`/api/users/by-ids?ids=${encodeURIComponent(certifierId)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((j: UserDirectory) => { if (alive && j) setUserDir((d) => ({ ...d, ...j })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [certifierId, userDir]);

  const current = data?.annexures.find((a) => a.hazardType === active) ?? null;

  // Seed the edit draft from the server answers whenever the open tab changes,
  // so switching tabs never carries another annexure's edits across.
  useEffect(() => {
    if (!current) return;
    const seeded: Record<string, { response: PrecautionAnswer; remark: string }> = {};
    for (const a of current.answers) {
      seeded[a.itemId] = { response: a.response, remark: a.remark ?? "" };
    }
    setDraft(seeded);
  }, [current?.hazardType, current?.answers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!current) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ptw/${permitId}/annexures/${current.hazardType}/answers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: Object.entries(draft).map(([itemId, a]) => ({
            itemId,
            response: a.response,
            remark: a.remark.trim() || null
          }))
        })
      });
      if (!res.ok) {
        toast({ variant: "error", title: "Could not save", description: await readApiError(res, "Save failed") });
        return;
      }
      const j: Payload = await res.json();
      setData(j);
      toast({ variant: "success", title: "Checklist saved", description: current.label });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Hazard Annexures</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-slate-500">Loading checklists…</p></CardContent>
      </Card>
    );
  }
  if (!data || data.annexures.length === 0) {
    // Permits raised before this build carry no annexures. Say so rather than
    // rendering an empty card that looks like a loading failure.
    return (
      <Card>
        <CardHeader><CardTitle>Hazard Annexures</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            No hazard annexures on this permit — it was raised before precaution
            checklists were introduced.
          </p>
        </CardContent>
      </Card>
    );
  }

  const certified = Boolean(data.precautionsCertifiedAt);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Hazard Annexures</CardTitle>
            <CardDescription>
              {data.annexures.length} hazard{data.annexures.length === 1 ? "" : "s"} on this permit
              {data.validityCapHours ? ` · ${data.validityCapHours}h validity cap` : ""}
              {data.requiredControls.length > 0
                ? ` · ${data.requiredControls.map((c) => CONTROL_LABELS[c] ?? c).join(", ")}`
                : ""}
            </CardDescription>
          </div>
          {certified ? (
            <Badge className="border-emerald-600 bg-emerald-600 text-white">
              <BadgeCheck className="h-3.5 w-3.5" /> Certified
            </Badge>
          ) : data.complete ? (
            <Badge className="border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Ready to certify
            </Badge>
          ) : (
            <Badge className="border-amber-500 bg-amber-500 text-white">Incomplete</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── The one permit-wide certification ── */}
        {certified ? (
          <div className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <div className="font-medium">
                Precautions certified for the whole permit
              </div>
              <div className="text-xs">
                Signed by{" "}
                {data.precautionsCertifiedById ? (
                  <UserRefLabel dir={userDir} id={data.precautionsCertifiedById} />
                ) : (
                  "the approver"
                )}{" "}
                on {new Date(data.precautionsCertifiedAt!).toLocaleString()}. One signature
                covers every checklist below; they are now read-only.
              </div>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "flex items-start gap-2 rounded-md border p-3 text-sm",
              data.complete
                ? "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300"
                : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
            )}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="min-w-0">
              {data.complete ? (
                <>
                  <div className="font-medium">Awaiting site EHS officer certification</div>
                  <div className="text-xs">
                    Approving this permit at the safety step certifies every checklist below
                    at once.
                  </div>
                </>
              ) : (
                <>
                  <div className="font-medium">Certification is blocked</div>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-xs">
                    {data.blocker}
                  </pre>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
          {data.annexures.map((a) => (
            <Button
              variant="bare"
              key={a.hazardType}
              type="button"
              onClick={() => setActive(a.hazardType)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                active === a.hazardType
                  ? "border-[#1E295A] font-medium text-[#1E295A] dark:border-slate-200 dark:text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              {a.label}
              {a.isPrimary && (
                <Badge className="border-slate-300 bg-slate-200 text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                  base
                </Badge>
              )}
              {a.items.length === 0 ? (
                <Badge className="border-slate-300 bg-transparent text-[10px] font-normal text-slate-500 dark:border-slate-700">
                  no checklist
                </Badge>
              ) : a.complete ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <span className="text-[10px] text-amber-600">
                  {a.unanswered.length + a.refused.length + a.naWithoutRemark.length} open
                </span>
              )}
            </Button>
          ))}
        </div>

        {/* ── Checklist ── */}
        {current && (
          <div className="space-y-2">
            {current.items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700">
                No precaution checklist is configured for {current.label}. The hazard still
                sets the approval chain, the validity cap and any mandatory controls.
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  {current.items.length} precaution{current.items.length === 1 ? "" : "s"}
                  {current.items[0]?.sourceRef ? ` · ${current.items[0].sourceRef}` : ""}
                </p>
                <ol className="space-y-1.5">
                  {current.items.map((item, idx) => {
                    const saved = current.answers.find((a) => a.itemId === item.id);
                    const val = editable && !certified ? draft[item.id] : undefined;
                    const response = val?.response ?? saved?.response ?? null;
                    const remark = val?.remark ?? saved?.remark ?? "";
                    const bad =
                      (response === "NO" && item.isMandatory) ||
                      (response === "NA" && !item.allowsNA);
                    const warn = response === "NA" && item.allowsNA && !remark.trim();
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          "rounded-md border p-2.5",
                          bad
                            ? "border-rose-300 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30"
                            : warn
                              ? "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30"
                              : "border-slate-200 dark:border-slate-800"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 w-5 flex-shrink-0 text-right text-xs text-slate-400">
                            {idx + 1}.
                          </span>
                          <p className="flex-1 text-sm leading-snug">{item.text}</p>
                          {editable && !certified ? (
                            <div className="flex flex-shrink-0 gap-1">
                              {(["YES", "NO", "NA"] as PrecautionAnswer[]).map((r) => {
                                if (r === "NA" && !item.allowsNA) return null;
                                const on = response === r;
                                return (
                                  <Button
                                    variant="bare"
                                    key={r}
                                    type="button"
                                    onClick={() =>
                                      setDraft((d) => ({
                                        ...d,
                                        [item.id]: { response: r, remark: d[item.id]?.remark ?? "" }
                                      }))
                                    }
                                    className={cn(
                                      "flex h-6 w-9 items-center justify-center rounded border text-xs",
                                      on
                                        ? r === "YES"
                                          ? "border-emerald-600 bg-emerald-600 text-white"
                                          : r === "NO"
                                            ? "border-rose-600 bg-rose-600 text-white"
                                            : "border-slate-500 bg-slate-500 text-white"
                                        : "border-slate-300 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900"
                                    )}
                                  >
                                    {r === "YES" ? <Check className="h-3 w-3" /> : r === "NO" ? <X className="h-3 w-3" /> : <CircleSlash className="h-3 w-3" />}
                                  </Button>
                                );
                              })}
                            </div>
                          ) : (
                            <AnswerChip response={response} />
                          )}
                        </div>
                        {response === "NA" && (
                          <div className="mt-1.5 pl-8">
                            {editable && !certified ? (
                              <Textarea
                                rows={2}
                                value={remark}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    [item.id]: {
                                      response: d[item.id]?.response ?? "NA",
                                      remark: e.target.value
                                    }
                                  }))
                                }
                                placeholder="Why does this not apply? (required)"
                              />
                            ) : (
                              <p className="text-xs italic text-slate-500">
                                {remark || "No reason recorded"}
                              </p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
                {editable && !certified && (
                  <div className="flex justify-end pt-1">
                    <Button type="button" onClick={save} disabled={saving}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {saving ? "Saving…" : `Save ${current.label} checklist`}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AnswerChip({ response }: { response: PrecautionAnswer | null }) {
  if (!response) {
    return <span className="flex-shrink-0 text-xs text-slate-400">unanswered</span>;
  }
  const map: Record<PrecautionAnswer, string> = {
    YES: "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    NO: "border-rose-600 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    NA: "border-slate-400 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
  };
  return (
    <Badge className={cn("flex-shrink-0 text-[10px]", map[response])}>
      {response === "NA" ? "N/A" : response}
    </Badge>
  );
}
