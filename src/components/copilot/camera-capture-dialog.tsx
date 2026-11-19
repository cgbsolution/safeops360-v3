"use client";

// "Take photo" for the copilot: a live camera preview with a shutter button
// (laptop webcam or phone back camera). When the browser can't open the camera
// (no permission, insecure origin, no device), it falls back to the device's
// own camera picker (`capture="environment"` on mobile, a file picker on desktop).

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCcw, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";

type Facing = "environment" | "user";

export function CameraCaptureDialog({
  open, onOpenChange, onCapture
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCapture: (files: File[]) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackRef = useRef<HTMLInputElement | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [state, setState] = useState<"starting" | "live" | "unavailable">("starting");
  const [shot, setShot] = useState<{ url: string; file: File } | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open || shot) return;
    let cancelled = false;
    setState("starting");
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) {
      setState("unavailable");
      return;
    }
    media.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        setState("live");
      })
      .catch(() => { if (!cancelled) setState("unavailable"); });
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, facing, shot, stopStream]);

  // Release the camera and the preview when the dialog closes.
  useEffect(() => {
    if (open) return;
    stopStream();
    setShot((s) => { if (s) URL.revokeObjectURL(s.url); return null; });
  }, [open, stopStream]);

  const takeShot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const file = new File([blob], `photo-${stamp}.jpg`, { type: "image/jpeg" });
      stopStream();
      setShot({ url: URL.createObjectURL(blob), file });
    }, "image/jpeg", 0.9);
  };

  const retake = () => setShot((s) => { if (s) URL.revokeObjectURL(s.url); return null; });

  const usePhoto = () => {
    if (!shot) return;
    onCapture([shot.file]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Take a photo</DialogTitle>
          <DialogDescription>
            Point the camera at what you saw. The copilot looks at the photo, and it is saved with the observation.
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-slate-900">
          {shot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shot.url} alt="Captured photo" className="h-full w-full object-contain" />
          ) : (
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          )}
          {!shot && state === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-200">
              <Loader2 size={16} className="animate-spin" /> Opening the camera…
            </div>
          )}
          {!shot && state === "unavailable" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-200">
              <span>The camera couldn&apos;t be opened here (permission denied or no camera). Use your device camera instead.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => fallbackRef.current?.click()}>
                <Camera size={14} /> Open device camera
              </Button>
            </div>
          )}
        </div>

        <Input
          ref={fallbackRef}
          type="file"
          accept="image/*"
          className="hidden"
          {...({ capture: "environment" } as Record<string, string>)}
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (files.length) { onCapture(files); onOpenChange(false); }
          }}
        />

        <DialogFooter className="gap-2 sm:justify-between">
          {shot ? (
            <>
              <Button type="button" variant="outline" onClick={retake}><RefreshCcw size={14} /> Retake</Button>
              <Button type="button" onClick={usePhoto}>Use photo</Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={state !== "live"}
                onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}>
                <SwitchCamera size={14} /> Switch camera
              </Button>
              <Button type="button" onClick={takeShot} disabled={state !== "live"}>
                <Camera size={14} /> Capture
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
