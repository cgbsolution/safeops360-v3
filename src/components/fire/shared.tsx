"use client";

// Shared bits for the fire safety screens: section nav, status badges, the
// in-app "Scan QR" button and the QR image used on labels.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { QrCode, ScanLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { QrScannerModal, parseFireQr, qrSupported, type QrResult } from "@/components/capture/qr-scanner";
import { cn } from "@/lib/utils";
import { FIRE_STATUS_TONE, fireLabel } from "@/lib/fire/api";

const NAV = [
  { href: "/fire-safety", label: "Overview", exact: true },
  { href: "/fire-safety/equipment", label: "Equipment" },
  { href: "/fire-safety/due", label: "Due / Overdue" },
  { href: "/fire-safety/inspections", label: "Inspection Register" },
  { href: "/fire-safety/checklists", label: "Checklists" },
  { href: "/fire-safety/labels", label: "QR Labels" },
];

export function FireNav() {
  const path = usePathname() ?? "";
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3 print:hidden">
      {NAV.map((n) => {
        const active = n.exact ? path === n.href : path.startsWith(n.href);
        return (
          <Button key={n.href} asChild size="sm" variant={active ? "default" : "ghost"}>
            <Link href={n.href}>{n.label}</Link>
          </Button>
        );
      })}
      <FireScanButton className="ml-auto" />
    </div>
  );
}

export function FireStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>;
  return (
    <Badge className={cn("border text-[11px] font-medium", FIRE_STATUS_TONE[status] ?? "bg-slate-100 text-slate-700 border-slate-200", className)}>
      {fireLabel(status)}
    </Badge>
  );
}

const NO_AREAS = new Set<string>();

/** Opens the camera, reads a fire equipment label and goes to /q/fire/<code>.
 *  No camera (desk browser, denied permission) → type the code instead. */
export function FireScanButton({ className, size = "sm" }: { className?: string; size?: "sm" | "default" | "lg" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [raw, setRaw] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function go(code: string) {
    setOpen(false);
    setManual(false);
    setRaw("");
    router.push(`/q/fire/${encodeURIComponent(code)}`);
  }

  function onScan(r: QrResult) {
    if (r.fireEquipmentCode) go(r.fireEquipmentCode);
  }

  function submitManual() {
    const v = raw.trim();
    const code = parseFireQr(v) ?? (/^[A-Za-z0-9._-]{3,}$/.test(v) ? v : null);
    if (!code) {
      setErr("Type the equipment code printed under the QR, e.g. FE-JSLH-0001.");
      return;
    }
    go(code);
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="outline"
        className={className}
        onClick={() => {
          setErr(null);
          if (qrSupported()) setOpen(true);
          else setManual(true);
        }}
      >
        <QrCode size={14} /> Scan QR
      </Button>
      {open && (
        <QrScannerModal
          lang="en"
          knownAreaIds={NO_AREAS}
          acceptFire
          title="Scan fire equipment QR"
          hint="Point the camera at the QR label on the extinguisher, hydrant or detector"
          unrecognised="That QR is not a fire equipment label. Use 'Type code' instead."
          onResult={onScan}
          onClose={() => setOpen(false)}
        />
      )}
      {open && (
        <div className="fixed inset-x-0 bottom-16 z-[60] flex justify-center">
          <Button type="button" variant="secondary" size="sm" onClick={() => { setOpen(false); setManual(true); }}>
            <ScanLine size={14} /> Type code
          </Button>
        </div>
      )}
      <Dialog open={manual} onOpenChange={setManual}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enter equipment code</DialogTitle>
            <DialogDescription>Type the code printed under the QR label.</DialogDescription>
          </DialogHeader>
          <Input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitManual(); }}
            placeholder="FE-JSLH-0001"
            autoFocus
          />
          {err && <p className="text-xs text-rose-700">{err}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setManual(false)}>Cancel</Button>
            <Button onClick={submitManual} disabled={!raw.trim()}>Open checklist</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** QR image for a URL (rendered client-side with the `qrcode` package). */
export function QrImage({ value, size = 160, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(value, { errorCorrectionLevel: "M", margin: 1, width: size * 2 })
      .then((d) => { if (live) setSrc(d); })
      .catch(() => { if (live) setSrc(null); });
    return () => { live = false; };
  }, [value, size]);
  if (!src) return <div className={cn("animate-pulse rounded bg-slate-100", className)} style={{ width: size, height: size }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`QR code: ${value}`} width={size} height={size} className={className} />;
}
