"use client";

// "New form" — creates a v1 DRAFT and drops the author straight into the
// Designer. Kept minimal on purpose: everything except the identity of the form
// (key, title, module) is authored on the canvas, so this dialog asks only for
// what cannot be changed later.
//
// `key` is the one field that is genuinely permanent — records denormalise it,
// reference numbers are scoped by it, and new versions share it. The dialog
// says so rather than letting an author discover it after publishing.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import { slugifyKey } from "@/components/forms/types";
import { Select, SelectItem } from "@/components/ui/select";

const MODULES = [
  { value: "SUSTAINABILITY", label: "Sustainability" },
  { value: "BUSINESS_EXCELLENCE", label: "Business Excellence" },
  { value: "GENERAL", label: "General" }
];

export function NewFormButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [module, setModule] = useState(MODULES[2].value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveKey = keyTouched ? key : slugifyKey(title);
  const keyValid = /^[a-z][a-z0-9_]*$/.test(effectiveKey);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/forms/definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: effectiveKey, title, module })
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(body.detail ?? "Could not create the form.");
        return;
      }
      setOpen(false);
      router.push(`/configuration/forms/${body.key}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus size={15} className="mr-1" />
          New form
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New form</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1 block text-xs font-medium text-slate-600">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Energy Consumption"
              autoFocus
            />
          </div>

          <div>
            <Label className="mb-1 block text-xs font-medium text-slate-600">Form key</Label>
            <Input
              value={effectiveKey}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value);
              }}
              className="font-mono text-xs"
              placeholder="sustainability_energy"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Permanent. Every version of this form shares it, records store it, and reference
              numbers are counted against it — it cannot be changed after the first record is filed.
            </p>
            {effectiveKey && !keyValid ? (
              <p className="mt-1 text-[11px] text-rose-600">
                Lowercase letters, numbers and underscores; must start with a letter.
              </p>
            ) : null}
          </div>

          <div>
            <Label className="mb-1 block text-xs font-medium text-slate-600">Module</Label>
            <Select
              value={module}
              onChange={(e) => setModule(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              {MODULES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </Select>
            <p className="mt-1 text-[11px] text-slate-400">
              Grouping for the register only — it does not gate access.
            </p>
          </div>

          {error ? (
            <p className="flex items-start gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy || !title.trim() || !keyValid}>
            {busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
