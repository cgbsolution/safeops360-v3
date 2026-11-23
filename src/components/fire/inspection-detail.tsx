"use client";

// One completed fire inspection: the answers as recorded (item text snapshot),
// photos (signed on view), GPS, and the follow-up it triggered.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PrintButton } from "@/components/ui/print-button";
import { fireFetch, fireLabel, fmtDate, type FireInspection } from "@/lib/fire/api";
import { FireStatusBadge } from "./shared";

const CARD = "rounded-xl border border-slate-200 bg-white p-4";

function Photo({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fireFetch<{ url: string }>("/api/fire/inspections/view-url", { method: "POST", json: { storagePath: path } })
      .then((r) => { if (live) setUrl(r.url); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [path]);
  if (failed) return <span className="text-[11px] text-slate-400">Photo unavailable</span>;
  if (!url) return <div className="h-16 w-16 animate-pulse rounded bg-slate-100" />;
  return (
    <Link href={url} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Checklist item photo" className="h-16 w-16 rounded border border-slate-200 object-cover" />
    </Link>
  );
}

export function InspectionDetail({ i }: { i: FireInspection }) {
  const items = i.items ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FireStatusBadge status={i.result} className="text-xs" />
        {i.criticalFailCount > 0 && <Badge className="border border-rose-300 bg-rose-50 text-xs text-rose-800">{i.criticalFailCount} critical failure(s)</Badge>}
        <span className="text-sm text-slate-600">
          <Link href={`/fire-safety/equipment/${i.equipmentId}`} className="font-medium text-primary-700 hover:underline">{i.equipmentCode}</Link>
          {" · "}{fireLabel(i.equipmentType)} · {i.location ?? "—"}
        </span>
        <span className="ml-auto"><PrintButton /></span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className={CARD}>
          <div className="mb-2 text-sm font-semibold text-slate-800">Inspection</div>
          <Kv k="Inspector" v={i.inspectorName} />
          <Kv k="Completed" v={fmtDate(i.completedAt, true)} />
          <Kv k="Started" v={fmtDate(i.startedAt, true)} />
          <Kv k="Opened by" v={i.scanned ? "Scanning the asset QR" : "From the app"} />
          <Kv k="Checklist" v={`${i.templateCode} v${i.templateVersion}`} />
        </div>
        <div className={CARD}>
          <div className="mb-2 text-sm font-semibold text-slate-800">Outcome</div>
          <Kv k="OK / not OK / N/A" v={`${i.passCount} / ${i.failCount} / ${i.naCount}`} />
          <Kv k="Asset status" v={<span className="flex items-center gap-1"><FireStatusBadge status={i.equipmentStatusBefore} /> → <FireStatusBadge status={i.equipmentStatusAfter} /></span>} />
          <Kv k="Next due" v={fmtDate(i.nextDueDate)} />
          <Kv k="CAPA" v={i.capaId ? <Link href={`/capa/${i.capaId}`} className="text-primary-700 hover:underline">{i.capaNumber}</Link> : null} />
          {i.followUpNote && <p className="mt-2 text-xs text-slate-600">{i.followUpNote}</p>}
        </div>
        <div className={CARD}>
          <div className="mb-2 text-sm font-semibold text-slate-800">Location evidence</div>
          {i.latitude != null && i.longitude != null ? (
            <>
              <Kv k="GPS" v={`${i.latitude.toFixed(5)}, ${i.longitude.toFixed(5)}`} />
              <Kv k="Accuracy" v={i.gpsAccuracyM != null ? `±${Math.round(i.gpsAccuracyM)} m` : null} />
            </>
          ) : (
            <p className="text-sm text-slate-500">No GPS fix was captured.</p>
          )}
          {i.remarks && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{i.remarks}</p>}
        </div>
      </div>

      <div className={CARD}>
        <div className="mb-2 text-sm font-semibold text-slate-800">Checklist answers</div>
        <div className="overflow-x-auto">
          <Table className="min-w-[720px] text-sm">
            <TableHeader className="bg-slate-50">
              <TableRow><TableHead className="w-10">#</TableHead><TableHead>Check</TableHead><TableHead>Answer</TableHead><TableHead>Remarks</TableHead><TableHead>Photo</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.key} className={it.response === "FAIL" ? "bg-rose-50/60" : undefined}>
                  <TableCell className="text-xs text-slate-500">{it.sortOrder}</TableCell>
                  <TableCell className="text-sm">
                    {it.text}
                    {it.critical && <Badge className="ml-2 border border-rose-200 bg-rose-50 text-[10px] text-rose-700">Critical</Badge>}
                  </TableCell>
                  <TableCell><FireStatusBadge status={it.response} /></TableCell>
                  <TableCell className="text-xs text-slate-700">{it.remarks ?? "—"}</TableCell>
                  <TableCell>{it.photoPath ? <Photo path={it.photoPath} /> : <span className="text-xs text-slate-400">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5 text-sm last:border-0">
      <span className="text-slate-500">{k}</span>
      <span className="text-right font-medium text-slate-800">{v ?? "—"}</span>
    </div>
  );
}
