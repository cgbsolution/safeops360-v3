"use client";

// Contractor register for plant contractors (ContractorCompany is the master),
// with registration that opens the first prequalification and, optionally,
// mints the contractor's link.

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { csmFetch, fmtDate, label, qs, type Contractor, type PlantOption } from "@/lib/csm/api";
import { InviteLinkBox } from "./invite-link";
import { ALL_PLANTS, EmptyRow, ErrorBox, Field, LinkButton, Pill, PlantSelect, plantParam } from "./shared";

const QUALS = ["ALL", "QUALIFIED", "CONDITIONAL", "EXPIRED", "NOT_QUALIFIED", "REJECTED"];
const STATUSES = ["ALL", "ACTIVE", "SUSPENDED", "BLACKLISTED"];
const SIZES = ["small", "medium", "large"];

export function ContractorsView({
  plants, defaultPlantId, initialQualification, openRegister,
}: { plants: PlantOption[]; defaultPlantId: string | null; initialQualification?: string | null; openRegister?: boolean }) {
  const [plant, setPlant] = useState(defaultPlantId ?? ALL_PLANTS);
  const [qual, setQual] = useState(initialQualification && QUALS.includes(initialQualification) ? initialQualification : "ALL");
  const [status, setStatus] = useState("ALL");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Contractor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(!!openRegister);

  const load = useCallback(async () => {
    try {
      const r = await csmFetch<{ items: Contractor[] }>(`/api/csm/contractors${qs({
        plantId: plantParam(plant), q: q.trim(), qualification: qual === "ALL" ? undefined : qual,
        status: status === "ALL" ? undefined : status,
      })}`);
      setRows(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load contractors");
    }
  }, [plant, q, qual, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PlantSelect plants={plants} value={plant} onChange={setPlant} />
        <Select value={qual} onValueChange={setQual} className="h-9 w-48" aria-label="Qualification">
          {QUALS.map((v) => <SelectItem key={v} value={v}>{v === "ALL" ? "Any qualification" : label(v)}</SelectItem>)}
        </Select>
        <Select value={status} onValueChange={setStatus} className="h-9 w-40" aria-label="Status">
          {STATUSES.map((v) => <SelectItem key={v} value={v}>{v === "ALL" ? "Any status" : label(v)}</SelectItem>)}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or code" className="h-9 w-56" />
        <span className="text-xs text-slate-500">{rows.length} contractor(s)</span>
        <Button size="sm" className="ml-auto" onClick={() => setRegisterOpen(true)}><Plus size={14} /> Register contractor</Button>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <Table className="min-w-[1000px] text-sm">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Contractor</TableHead><TableHead>Status</TableHead><TableHead>Prequalification</TableHead>
              <TableHead>Valid until</TableHead><TableHead className="text-right">Live score</TableHead>
              <TableHead className="text-right">Active WOs</TableHead><TableHead>Last evaluation</TableHead><TableHead>In progress</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <LinkButton href={`/csm/contractors/${c.id}`}>{c.name}</LinkButton>
                  <div className="text-[11px] text-slate-500">{c.code ?? ""}{c.safetyOfficerName ? ` · SO: ${c.safetyOfficerName}` : ""}</div>
                </TableCell>
                <TableCell><Pill value={(c.status || "ACTIVE").toUpperCase()} /></TableCell>
                <TableCell><Pill value={c.qualification} /></TableCell>
                <TableCell className="text-xs">{fmtDate(c.prequalificationValidUntil)}</TableCell>
                <TableCell className="text-right tabular-nums">{c.score}</TableCell>
                <TableCell className="text-right tabular-nums">{c.activeWorkOrders ?? 0}</TableCell>
                <TableCell>
                  {c.lastEvaluation ? (
                    <span className="flex items-center gap-1.5"><Pill value={c.lastEvaluation.ratingBand} /><span className="text-xs tabular-nums">{c.lastEvaluation.finalScore}</span></span>
                  ) : <span className="text-xs text-slate-400">—</span>}
                </TableCell>
                <TableCell>{c.openApplicationStatus ? <Pill value={c.openApplicationStatus} /> : <span className="text-xs text-slate-400">—</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !error && <EmptyRow text="No contractors match this filter." />}
      </div>
      <RegisterDialog open={registerOpen} onOpenChange={setRegisterOpen} plants={plants} defaultPlantId={plantParam(plant) ?? defaultPlantId} onSaved={load} />
    </div>
  );
}

type RegisterResult = { contractor: Contractor; prequalificationId: string; applicationNo: string; invite: { portalPath: string; expiresAt: string } | null };

function RegisterDialog({
  open, onOpenChange, plants, defaultPlantId, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; plants: PlantOption[]; defaultPlantId: string | null; onSaved: () => void }) {
  const { toast } = useToast();
  const empty = { name: "", tradeName: "", registrationNumber: "", panNumber: "", gstNumber: "", trades: "", contactPerson: "",
                  contactEmail: "", contactPhone: "", safetyOfficerName: "", safetyOfficerPhone: "" };
  const [f, setF] = useState(empty);
  const [plantId, setPlantId] = useState(defaultPlantId ?? "");
  const [size, setSize] = useState("small");
  const [invite, setInvite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<RegisterResult | null>(null);

  useEffect(() => {
    if (open) {
      setF(empty); setPlantId(defaultPlantId ?? plants[0]?.id ?? ""); setError(null); setDone(null); setInvite(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await csmFetch<RegisterResult>("/api/csm/contractors", {
        method: "POST",
        json: {
          name: f.name, plantId, tradeName: f.tradeName || null, registrationNumber: f.registrationNumber || null,
          panNumber: f.panNumber || null, gstNumber: f.gstNumber || null, sizeCategory: size,
          tradeCategories: f.trades.split(",").map((t) => t.trim()).filter(Boolean), contactPerson: f.contactPerson || null,
          contactEmail: f.contactEmail || null, contactPhone: f.contactPhone || null,
          safetyOfficerName: f.safetyOfficerName || null, safetyOfficerPhone: f.safetyOfficerPhone || null, sendInvite: invite,
        },
      });
      toast({ variant: "success", title: `${r.contractor.name} registered`, description: `${r.applicationNo} opened` });
      setDone(r);
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Could not register the contractor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Register contractor</DialogTitle>
          <DialogDescription>Creates the contractor and opens its prequalification against the active questionnaire.</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700"><strong>{done.contractor.name}</strong> ({done.contractor.code}) is registered and {done.applicationNo} is open.</p>
            {done.invite && <InviteLinkBox portalPath={done.invite.portalPath} expiresAt={done.invite.expiresAt} contactEmail={f.contactEmail} />}
            <DialogFooter>
              <LinkButton href={`/csm/prequalifications/${done.prequalificationId}`} variant="outline" size="default">Open application</LinkButton>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="grid max-h-[65vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              <Field label="Registered name" required><Input value={f.name} onChange={set("name")} placeholder="e.g. Shree Ram Engineering Works" /></Field>
              <Field label="Plant" required><PlantSelect plants={plants} value={plantId} onChange={setPlantId} allowAll={false} className="w-full" /></Field>
              <Field label="Trade name"><Input value={f.tradeName} onChange={set("tradeName")} /></Field>
              <Field label="Firm size">
                <Select value={size} onValueChange={setSize} className="w-full">
                  {SIZES.map((s) => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}
                </Select>
              </Field>
              <Field label="PAN"><Input value={f.panNumber} onChange={set("panNumber")} maxLength={10} /></Field>
              <Field label="GSTIN"><Input value={f.gstNumber} onChange={set("gstNumber")} maxLength={15} /></Field>
              <Field label="Registration no."><Input value={f.registrationNumber} onChange={set("registrationNumber")} /></Field>
              <Field label="Trades" hint="Comma separated, e.g. Mechanical, Fabrication, Refractory"><Input value={f.trades} onChange={set("trades")} /></Field>
              <Field label="Contact person"><Input value={f.contactPerson} onChange={set("contactPerson")} /></Field>
              <Field label="Contact email"><Input type="email" value={f.contactEmail} onChange={set("contactEmail")} /></Field>
              <Field label="Contact phone"><Input value={f.contactPhone} onChange={set("contactPhone")} /></Field>
              <Field label="Safety officer"><Input value={f.safetyOfficerName} onChange={set("safetyOfficerName")} /></Field>
              <Field label="Safety officer phone"><Input value={f.safetyOfficerPhone} onChange={set("safetyOfficerPhone")} /></Field>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox id="csm-invite" checked={invite} onCheckedChange={(v) => setInvite(v === true)} />
                <Label htmlFor="csm-invite" className="text-sm">Create a link for the contractor to fill the questionnaire and upload documents</Label>
              </div>
              <div className="sm:col-span-2"><ErrorBox error={error} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={save} disabled={busy || f.name.trim().length < 2 || !plantId}>{busy ? "Registering…" : "Register"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
