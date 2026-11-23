"use client";

// One fire equipment asset: status and due dates, its QR label, inspection
// history, status log, and the manage actions (edit, out of service, return to
// service). "Start inspection" opens the same mobile checklist a QR scan does.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Pencil, PlugZap, Power, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { usePermissions } from "@/components/auth/can";
import { EmptyRow, ErrorBox, Field } from "@/components/ims/shared";
import {
  canInspect, canManageEquipment, fireFetch, fireLabel, fireQrUrl, fmtDate,
  type EquipmentDetail as Detail, type FireMeta, type PlantOption,
} from "@/lib/fire/api";
import { EquipmentFormDialog } from "./equipment-form";
import { FireStatusBadge, QrImage } from "./shared";

const CARD = "rounded-xl border border-slate-200 bg-white p-4";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5 text-sm last:border-0">
      <span className="text-slate-500">{k}</span>
      <span className="text-right font-medium text-slate-800">{v ?? "—"}</span>
    </div>
  );
}

export function EquipmentDetail({ initial, plants, meta }: { initial: Detail; plants: PlantOption[]; meta: FireMeta | null }) {
  const perms = usePermissions();
  const [d, setD] = useState<Detail>(initial);
  const [origin, setOrigin] = useState("");
  const [editing, setEditing] = useState(false);
  const [oosOpen, setOosOpen] = useState(false);
  const [rtsOpen, setRtsOpen] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const reload = useCallback(async () => {
    setD(await fireFetch<Detail>(`/api/fire/equipment/${initial.id}`));
  }, [initial.id]);

  const manage = canManageEquipment(perms);
  const inspectable = d.isActive && d.status !== "DECOMMISSIONED";
  const out = d.status === "OUT_OF_SERVICE" || d.status === "DEFECTIVE";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FireStatusBadge status={d.status} className="text-xs" />
        <span className="text-sm text-slate-600">{fireLabel(d.type)} · {d.location}{d.plantName ? ` · ${d.plantName}` : ""}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {inspectable && canInspect(perms) && (
            <Button asChild size="sm"><Link href={`/q/fire/${encodeURIComponent(d.equipmentCode)}?src=app`}><ClipboardCheck size={14} /> Start inspection</Link></Button>
          )}
          {manage && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button>}
          {manage && !out && inspectable && (
            <Button size="sm" variant="outline" onClick={() => setOosOpen(true)}><Power size={14} /> Out of service</Button>
          )}
          {manage && out && (
            <Button size="sm" variant="outline" onClick={() => setRtsOpen(true)}><PlugZap size={14} /> Return to service</Button>
          )}
        </div>
      </div>

      {out && d.outOfServiceReason && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <span className="font-semibold">{fireLabel(d.status)}:</span> {d.outOfServiceReason}
        </div>
      )}
      {d.status === "DEFECTIVE" && !d.outOfServiceReason && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          A critical check failed at the last inspection. A passing re-inspection clears the defect.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={CARD}>
          <div className="mb-2 text-sm font-semibold text-slate-800">Inspection schedule</div>
          <Row k="Last inspected" v={fmtDate(d.lastInspectionDate)} />
          <Row k="Next due" v={fmtDate(d.nextInspectionDueDate)} />
          <Row k="Interval" v={`${d.inspectionFrequencyDays} days`} />
          <Row k="Due status" v={<FireStatusBadge status={d.dueBucket} />} />
          <Row k="Checklist" v={d.template ? (
            <Link href="/fire-safety/checklists" className="text-primary-700 hover:underline">{d.template.name} v{d.template.version}</Link>
          ) : <span className="text-amber-700">None for this type</span>} />
        </div>
        <div className={CARD}>
          <div className="mb-2 text-sm font-semibold text-slate-800">Asset</div>
          <Row k="Capacity / spec" v={d.capacitySpec} />
          <Row k="Make / model" v={[d.make, d.model].filter(Boolean).join(" ") || null} />
          <Row k="Serial no." v={d.serialNo} />
          <Row k="Building / floor" v={[d.buildingId, d.floorLevel != null ? `floor ${d.floorLevel}` : null].filter(Boolean).join(", ") || null} />
          <Row k="Installed" v={fmtDate(d.installationDate)} />
          <Row k="Maintenance contractor" v={d.maintenanceContractor} />
          <Row k="GPS" v={d.latitude != null && d.longitude != null ? `${d.latitude.toFixed(5)}, ${d.longitude.toFixed(5)}` : null} />
        </div>
        <div className={CARD + " flex flex-col items-center"}>
          <div className="mb-2 self-start text-sm font-semibold text-slate-800">QR label</div>
          {origin && <QrImage value={fireQrUrl(origin, d.equipmentCode)} size={140} />}
          <div className="mt-2 font-mono text-sm font-semibold">{d.equipmentCode}</div>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href={`/fire-safety/labels?ids=${d.id}`}><Printer size={14} /> Print label</Link>
          </Button>
        </div>
      </div>

      <div className={CARD}>
        <div className="mb-2 text-sm font-semibold text-slate-800">Inspection history</div>
        <div className="overflow-x-auto">
          <Table className="min-w-[760px] text-sm">
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Inspection</TableHead><TableHead>Completed</TableHead><TableHead>Inspector</TableHead>
                <TableHead>Result</TableHead><TableHead>Pass / fail / NA</TableHead><TableHead>Status after</TableHead><TableHead>CAPA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.inspections.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Link href={`/fire-safety/inspections/${i.id}`} className="font-medium text-primary-700 hover:underline">{i.inspectionNo}</Link>
                    <div className="text-[11px] text-slate-500">{i.scanned ? "QR scan" : "Manual"} · checklist v{i.templateVersion}</div>
                  </TableCell>
                  <TableCell className="text-xs">{fmtDate(i.completedAt, true)}</TableCell>
                  <TableCell className="text-xs">{i.inspectorName ?? "—"}</TableCell>
                  <TableCell>
                    <FireStatusBadge status={i.result} />
                    {i.criticalFailCount > 0 && <div className="mt-0.5 text-[11px] font-medium text-rose-700">{i.criticalFailCount} critical</div>}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">{i.passCount} / {i.failCount} / {i.naCount}</TableCell>
                  <TableCell><FireStatusBadge status={i.equipmentStatusAfter} /></TableCell>
                  <TableCell className="text-xs">
                    {i.capaId ? <Link href={`/capa/${i.capaId}`} className="text-primary-700 hover:underline">{i.capaNumber ?? "CAPA"}</Link> : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {d.inspections.length === 0 && <EmptyRow text="Not inspected yet. Scan its QR label or use Start inspection." />}
        </div>
        {d.legacyInspections.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Earlier inspections (CAMS engagements)</div>
            {d.legacyInspections.map((l) => (
              <div key={l.id} className="flex gap-3 py-1 text-xs text-slate-600">
                <span className="font-medium">{l.engagementCode}</span>
                <span>{fmtDate(l.plannedDate)}</span>
                <span>{fireLabel(l.status)}</span>
                {l.scorePercent != null && <span>{l.scorePercent}%</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={CARD}>
        <div className="mb-2 text-sm font-semibold text-slate-800">Status log</div>
        {d.events.length === 0 ? (
          <EmptyRow text="No status changes recorded." />
        ) : (
          <ol className="space-y-2">
            {d.events.map((ev) => (
              <li key={ev.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="w-40 shrink-0 text-xs text-slate-500">{fmtDate(ev.createdAt, true)}</span>
                <span className="font-medium text-slate-800">{fireLabel(ev.eventType)}</span>
                {ev.fromStatus !== ev.toStatus && ev.toStatus && (
                  <span className="text-xs text-slate-500">{fireLabel(ev.fromStatus)} → {fireLabel(ev.toStatus)}</span>
                )}
                {ev.actorName && <span className="text-xs text-slate-500">by {ev.actorName}</span>}
                {ev.note && <span className="w-full text-xs text-slate-600 sm:pl-[10.5rem]">{ev.note}</span>}
              </li>
            ))}
          </ol>
        )}
      </div>

      <EquipmentFormDialog
        open={editing} onOpenChange={setEditing} equipment={d} plants={plants} meta={meta} defaultPlantId={d.plantId}
        onSaved={() => { void reload(); }}
      />
      <ReasonDialog
        open={oosOpen} onOpenChange={setOosOpen} title={`Take ${d.equipmentCode} out of service`}
        description="It stays out of service until a manager returns it, which needs a passing inspection first."
        label="Reason" minLength={5} confirm="Take out of service" destructive
        onConfirm={async (reason) => {
          await fireFetch(`/api/fire/equipment/${d.id}/out-of-service`, { method: "POST", json: { reason } });
          await reload();
        }}
      />
      <ReasonDialog
        open={rtsOpen} onOpenChange={setRtsOpen} title={`Return ${d.equipmentCode} to service`}
        description="Allowed once a passing inspection (no critical failure) has been recorded since it went out of service."
        label="What was done" minLength={3} confirm="Return to service"
        onConfirm={async (note) => {
          await fireFetch(`/api/fire/equipment/${d.id}/return-to-service`, { method: "POST", json: { note } });
          await reload();
        }}
      />
    </div>
  );
}

function ReasonDialog({
  open, onOpenChange, title, description, label, minLength, confirm, destructive, onConfirm,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description: string; label: string;
  minLength: number; confirm: string; destructive?: boolean; onConfirm: (text: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setText(""); setError(null); } }, [open]);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(text.trim());
      toast({ title: "Saved", variant: "success" });
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field label={label} required><Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={busy || text.trim().length < minLength} onClick={go}>
            {busy ? "Saving…" : confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
