"use client";

// Before and after, side by side, above the prose.
//
// A Kaizen without a photograph is a paragraph nobody can evaluate. This is the
// artefact-first card: two images, one question ("did this actually change?"),
// answerable at a glance by somebody who was not there.
//
// It rides the platform's shared Attachment layer (/api/evidence/be_kaizen/{id}),
// which was already registered for this entity with BEFORE_PHOTO and
// AFTER_PHOTO categories — no second file-storage pathway. The generic
// <EvidenceAttachment/> list is still mounted below for supporting documents;
// this component exists only because a list of filenames does not answer the
// before/after question, and the before/after question is the whole point.

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImageOff, Loader2, Upload, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { readApiError } from "@/lib/client-errors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm-dialog";

type Attachment = {
  id: string;
  category: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy?: { id: string; name: string } | null;
};

const MAX_SIZE = 25 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function BeforeAfterPhotos({
  kaizenId,
  canManage,
  // The AFTER photo is disabled until the work has actually started. A photo of
  // "after" taken before anything changed is the one piece of evidence on this
  // record that would be actively misleading.
  afterEnabled,
}: {
  kaizenId: string;
  canManage: boolean;
  afterEnabled: boolean;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const base = `/api/evidence/be_kaizen/${kaizenId}`;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(base);
      if (!res.ok) {
        // 503 means Supabase storage is not configured on this deployment.
        // Degrade to a quiet notice — a broken upload box on a record that is
        // otherwise fine is worse than no upload box.
        setUnavailable(await readApiError(res, "Photos are unavailable."));
        return;
      }
      const json = await res.json();
      const photos: Attachment[] = (json.items ?? []).filter((a: Attachment) =>
        ["BEFORE_PHOTO", "AFTER_PHOTO"].includes(a.category)
      );
      setItems(photos);

      // Signed URLs are minted per file and are short-lived, so they are
      // fetched on view rather than stored. Failures are per-photo: one
      // expired link must not blank the whole card.
      const resolved: Record<string, string> = {};
      await Promise.all(
        photos
          .filter((a) => IMAGE_TYPES.includes(a.mimeType))
          .map(async (a) => {
            try {
              const r = await fetch(`${base}/${a.id}/download`);
              if (r.ok) resolved[a.id] = (await r.json()).url;
            } catch {
              /* leave this one unresolved */
            }
          })
      );
      setUrls(resolved);
    } catch (e: any) {
      setUnavailable(e?.message ?? "Photos are unavailable.");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const before = items.find((a) => a.category === "BEFORE_PHOTO");
  const after = items.find((a) => a.category === "AFTER_PHOTO");

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> Loading photos…
        </div>
      </section>
    );
  }

  if (unavailable && !items.length) {
    if (!canManage) return null;
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <ImageOff size={14} /> {unavailable}
        </div>
      </section>
    );
  }

  // Nothing uploaded and nothing the viewer can do about it: don't take up the
  // top of the page with an empty frame.
  if (!before && !after && !canManage) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Camera size={14} className="text-slate-400" /> Before and after
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slot
          label="Before"
          hint="The problem as it stood."
          category="BEFORE_PHOTO"
          attachment={before}
          url={before ? urls[before.id] : undefined}
          base={base}
          canManage={canManage}
          disabled={false}
          onChanged={refresh}
        />
        <Slot
          label="After"
          hint={
            afterEnabled
              ? "The same view, once the change was made."
              : "Available once the idea is being implemented."
          }
          category="AFTER_PHOTO"
          attachment={after}
          url={after ? urls[after.id] : undefined}
          base={base}
          canManage={canManage}
          disabled={!afterEnabled}
          onChanged={refresh}
        />
      </div>
    </section>
  );
}

function Slot({
  label,
  hint,
  category,
  attachment,
  url,
  base,
  canManage,
  disabled,
  onChanged,
}: {
  label: string;
  hint: string;
  category: string;
  attachment?: Attachment;
  url?: string;
  base: string;
  canManage: boolean;
  disabled: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!IMAGE_TYPES.includes(file.type)) {
      toast({
        variant: "error",
        title: "That is not a photo",
        description: "Use a JPEG, PNG or WebP image.",
      });
      return;
    }
    if (file.size > MAX_SIZE) {
      toast({
        variant: "error",
        title: "Photo is too large",
        description: `The limit is ${MAX_SIZE / 1024 / 1024} MB.`,
      });
      return;
    }
    setBusy(true);
    try {
      // The platform's two-phase signed-URL flow, byte-for-byte the same
      // sequence <EvidenceAttachment/> uses: init → PUT straight to storage →
      // complete. The service-role key never reaches the browser, and the
      // `complete` call is what versions the slot — skipping it leaves a row
      // that points at a file nothing supersedes.
      const initRes = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "init",
          category,
          documentCategory: "photo",
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          // The slot key versions a re-upload rather than accumulating a pile
          // of "before" photos with no way to tell which one is current.
          slotKey: category,
        }),
      });
      if (!initRes.ok) throw new Error(await readApiError(initRes, "Could not start the upload"));
      const init = await initRes.json();

      const put = await fetch(init.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`Storage upload failed (${put.status}).`);

      const done = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "complete", attachmentId: init.attachmentId }),
      });
      if (!done.ok) throw new Error(await readApiError(done, "Could not save the photo"));

      await onChanged();
      toast({ variant: "success", title: `${label} photo saved` });
    } catch (e: any) {
      toast({ variant: "error", title: "Upload failed", description: e?.message });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!attachment) return;
    if (
      !(await confirmDialog({
        title: `Remove the ${label.toLowerCase()} photo?`,
        description: `Remove the ${label.toLowerCase()} photo? Prior versions stay in the audit trail.`,
        confirmLabel: "Remove",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/${attachment.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiError(res, "Could not remove the photo"));
      await onChanged();
    } catch (e: any) {
      toast({ variant: "error", title: "Could not remove it", description: e?.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {attachment && canManage && (
          <Button variant="bare"
            type="button"
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-600"
          >
            <X size={11} /> Remove
          </Button>
        )}
      </div>

      <div
        className={cn(
          "flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border",
          attachment ? "border-slate-200 bg-slate-50" : "border-dashed border-slate-300 bg-slate-50/60"
        )}
      >
        {attachment && url ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed
          // short-lived storage URL; next/image would try to proxy and cache it.
          <img
            src={url}
            alt={`${label}: ${attachment.fileName}`}
            className="h-full w-full object-cover"
          />
        ) : attachment ? (
          <span className="px-3 text-center text-xs text-slate-500">{attachment.fileName}</span>
        ) : busy ? (
          <Loader2 size={18} className="animate-spin text-slate-400" />
        ) : canManage && !disabled ? (
          <Button variant="bare"
            type="button"
            onClick={() => input.current?.click()}
            className="flex flex-col items-center gap-1 px-3 text-center text-xs text-slate-500 hover:text-primary-700"
          >
            <Upload size={16} />
            Add the {label.toLowerCase()} photo
          </Button>
        ) : (
          <span className="px-3 text-center text-xs text-slate-400">{hint}</span>
        )}
      </div>

      <p className="mt-1 text-[11px] text-slate-400">
        {attachment
          ? `${attachment.fileName}${
              attachment.uploadedBy ? ` · ${attachment.uploadedBy.name}` : ""
            }`
          : hint}
      </p>

      <Input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
