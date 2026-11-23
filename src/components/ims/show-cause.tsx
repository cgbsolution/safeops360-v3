"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { UserPicker } from "@/components/ui/user-picker";
import { fmtDate, imsFetch, label, localToIso, qs, type ImsMeta, type PlantOption, type ShowCauseNotice } from "@/lib/ims/api";
import { ALL_PLANTS, EmptyRow, ErrorBox, Field, PlantSelect, plantParam, StatusBadge } from "./shared";

const FILTERS = [
  { v: "OPEN", l: "Open" },
  { v: "ISSUED", l: "Awaiting reply" },
  { v: "REPLY_RECEIVED", l: "Reply received" },
  { v: "CLOSED", l: "Closed" },
  { v: "ALL", l: "All" },
];

export function ShowCauseView({ plants, defaultPlantId, meta }: { plants: PlantOption[]; defaultPlantId: string | null; meta: ImsMeta | null }) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  const [filter, setFilter] = useState("OPEN");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ShowCauseNotice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [selected, setSelected] = useState<ShowCauseNotice | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await imsFetch<{ items: ShowCauseNotice[] }>(
        `/api/ims/show-cause${qs({ plantId: plantParam(plant), status: filter === "ALL" ? undefined : filter, q: q.trim() })}`
      );
      setRows(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load notices");
    }
  }, [plant, filter, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={filter} onValueChange={setFilter} className="h-9 w-44" aria-label="Status">
          {FILTERS.map((f) => <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>)}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipient or notice no." className="h-9 w-64" />
        <span className="text-xs text-slate-500">{rows.length} notice(s)</span>
        <Button size="sm" className="ml-auto" onClick={() => setIssueOpen(true)}><Plus size={14} className="mr-1" /> Issue notice</Button>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[1000px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Notice no.</TableHead><TableHead>Issued</TableHead><TableHead>Recipient</TableHead><TableHead>Violation</TableHead>
              <TableHead>Reply due</TableHead><TableHead>Status</TableHead><TableHead>Decision</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium text-primary-700">{r.noticeNo}</TableCell>
                <TableCell className="text-xs">{fmtDate(r.issuedAt)}<div className="text-[11px] text-slate-500">{r.issuedByName ?? ""}</div></TableCell>
                <TableCell>
                  <div className="font-medium text-slate-800">{r.recipientName}</div>
                  <div className="text-[11px] text-slate-500">{label(r.recipientType)}</div>
                </TableCell>
                <TableCell>
                  <div className="text-xs font-medium">{label(r.violationCategory)}</div>
                  <div className="line-clamp-1 max-w-xs text-[11px] text-slate-500">{r.violationDetails}</div>
                </TableCell>
                <TableCell className="text-xs">{fmtDate(r.replyDueDate)}</TableCell>
                <TableCell><StatusBadge status={r.status} overdue={r.replyOverdue} /></TableCell>
                <TableCell className="text-xs">
                  {r.decision ? label(r.decision) : "—"}
                  {r.penaltyAmount ? <div className="text-[11px] text-slate-500">₹{r.penaltyAmount.toLocaleString("en-IN")}</div> : null}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setSelected(r)}>{r.status === "CLOSED" ? "View" : "Act"}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !error && <EmptyRow text="No show cause notices match this filter." />}
      </div>
      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} plants={plants} meta={meta} defaultPlantId={plantParam(plant) ?? defaultPlantId} onSaved={load} />
      <NoticeDialog notice={selected} meta={meta} onClose={() => setSelected(null)} onSaved={(n) => { setSelected(n); load(); }} />
    </div>
  );
}

function IssueDialog({
  open, onOpenChange, plants, meta, defaultPlantId, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; plants: PlantOption[]; meta: ImsMeta | null; defaultPlantId: string | null; onSaved: () => void }) {
  const { toast } = useToast();
  const [plantId, setPlantId] = useState(defaultPlantId ?? "");
  const [recipientType, setRecipientType] = useState("CONTRACTOR_WORKER");
  const [recipientUserId, setRecipientUserId] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [category, setCategory] = useState("PPE_NON_COMPLIANCE");
  const [details, setDetails] = useState("");
  const [violationAt, setViolationAt] = useState("");
  const [replyDays, setReplyDays] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPlantId(defaultPlantId ?? plants[0]?.id ?? "");
      setError(null);
    }
  }, [open, defaultPlantId, plants]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await imsFetch<ShowCauseNotice>("/api/ims/show-cause", {
        method: "POST",
        json: {
          plantId, recipientType, recipientName, recipientUserId: recipientType === "EMPLOYEE" ? recipientUserId : null,
          violationCategory: category, violationDetails: details,
          violationAt: violationAt ? localToIso(violationAt) : null, replyWithinDays: Number(replyDays),
        },
      });
      toast({ title: `${r.noticeNo} issued`, description: `Reply due ${fmtDate(r.replyDueDate)}`, variant: "success" });
      setRecipientName(""); setRecipientUserId(null); setDetails(""); setViolationAt("");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Could not issue the notice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue show cause notice</DialogTitle>
          <DialogDescription>The recipient is asked to explain the violation in writing before a decision is taken.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Plant" required><PlantSelect plants={plants} value={plantId} onChange={setPlantId} allowAll={false} className="w-full" /></Field>
          <Field label="Issued to" required>
            <Select value={recipientType} onValueChange={setRecipientType} className="w-full">
              {(meta?.recipientTypes ?? ["EMPLOYEE", "CONTRACTOR_WORKER", "CONTRACTOR_COMPANY"]).map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
            </Select>
          </Field>
          {recipientType === "EMPLOYEE" ? (
            <Field label="Employee" required>
              <UserPicker value={recipientUserId} onChange={(id, u) => { setRecipientUserId(id); setRecipientName(u?.name ?? ""); }} filter={{ plantId }} placeholder="Search employee" />
            </Field>
          ) : (
            <Field label={recipientType === "CONTRACTOR_COMPANY" ? "Contractor company" : "Worker name, ID and contractor"} required>
              <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder={recipientType === "CONTRACTOR_COMPANY" ? "e.g. ABC Engineering Pvt Ltd" : "e.g. Ramesh Kumar (Gate pass 4412), ABC Engg"} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Violation category" required>
              <Select value={category} onValueChange={setCategory} className="w-full">
                {(meta?.violationCategories ?? []).map((c) => <SelectItem key={c} value={c}>{label(c)}</SelectItem>)}
              </Select>
            </Field>
            <Field label="Violation date & time"><Input type="datetime-local" value={violationAt} onChange={(e) => setViolationAt(e.target.value)} /></Field>
          </div>
          <Field label="What happened" required hint="At least 10 characters. State the rule broken, where and when.">
            <Textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)} />
          </Field>
          <Field label="Reply within">
            <Select value={replyDays} onValueChange={setReplyDays} className="w-full">
              {["1", "2", "3", "5", "7"].map((d) => <SelectItem key={d} value={d}>{d} day{d === "1" ? "" : "s"}</SelectItem>)}
            </Select>
          </Field>
          <ErrorBox error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !plantId || recipientName.trim().length < 2 || details.trim().length < 10}>
            {busy ? "Issuing…" : "Issue notice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoticeDialog({
  notice, meta, onClose, onSaved,
}: { notice: ShowCauseNotice | null; meta: ImsMeta | null; onClose: () => void; onSaved: (n: ShowCauseNotice) => void }) {
  const { toast } = useToast();
  const [reply, setReply] = useState("");
  const [decision, setDecision] = useState("WARNING");
  const [notes, setNotes] = useState("");
  const [penalty, setPenalty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReply(""); setNotes(""); setPenalty(""); setDecision("WARNING"); setError(null);
  }, [notice?.id]);

  if (!notice) return null;
  const n = notice;

  async function post(path: string, json: unknown, msg: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await imsFetch<ShowCauseNotice>(`/api/ims/show-cause/${n.id}/${path}`, { method: "POST", json });
      toast({ title: msg, variant: "success" });
      onSaved(r);
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{n.noticeNo} · {n.recipientName}</DialogTitle>
          <DialogDescription>{label(n.violationCategory)} · issued {fmtDate(n.issuedAt)} by {n.issuedByName ?? "—"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2"><StatusBadge status={n.status} overdue={n.replyOverdue} /><span className="text-xs text-slate-500">Reply due {fmtDate(n.replyDueDate)}</span></div>
          <div className="rounded-lg bg-slate-50 p-3 text-slate-700">{n.violationDetails}</div>
          {n.replyText && (
            <div>
              <div className="text-xs font-semibold text-slate-600">Reply ({fmtDate(n.replyReceivedAt)})</div>
              <div className="rounded-lg border border-slate-200 p-3 text-slate-700">{n.replyText}</div>
            </div>
          )}
          {n.status === "CLOSED" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
              <div className="font-semibold">Decision: {label(n.decision)}{n.penaltyAmount ? ` · ₹${n.penaltyAmount.toLocaleString("en-IN")}` : ""}</div>
              {n.decisionNotes && <div className="mt-1 text-xs">{n.decisionNotes}</div>}
              <div className="mt-1 text-[11px]">Closed {fmtDate(n.closedAt)} by {n.closedByName ?? "—"}</div>
            </div>
          )}
          {n.status === "ISSUED" && (
            <Field label="Record the recipient's reply">
              <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
              <Button size="sm" variant="outline" className="mt-2" disabled={busy || reply.trim().length < 3} onClick={() => post("reply", { replyText: reply }, "Reply recorded")}>Save reply</Button>
            </Field>
          )}
          {n.status !== "CLOSED" && (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-semibold text-slate-600">Close with decision {n.status === "ISSUED" && "(no reply received)"}</div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={decision} onValueChange={setDecision} className="w-full" aria-label="Decision">
                  {(meta?.noticeDecisions ?? []).map((d) => <SelectItem key={d} value={d}>{label(d)}</SelectItem>)}
                </Select>
                {decision === "PENALTY" && <Input type="number" min={1} placeholder="Penalty ₹" value={penalty} onChange={(e) => setPenalty(e.target.value)} />}
              </div>
              <Textarea rows={2} placeholder="Decision notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <Button size="sm" disabled={busy} onClick={() => post("close", { decision, decisionNotes: notes || null, penaltyAmount: penalty ? Number(penalty) : null }, "Notice closed")}>Close notice</Button>
            </div>
          )}
          <ErrorBox error={error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
