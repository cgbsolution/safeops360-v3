"use client";

// Form-level settings: the properties that belong to the form rather than to
// any one field — description, reference numbering, and the approval workflow.
//
// THE WORKFLOW PICKER IS WHERE PART B §3.4 IS ACTUALLY AUTHORED.
// Attachment runs form → workflow: a form names a `workflowModule`, and every
// form naming the same module runs on that one WorkflowDefinition. So "attach
// one workflow to several forms" is not a workflow-side gesture at all — it is
// several forms picking the same entry here. The panel says so explicitly and
// shows which other forms already share the choice, because editing a shared
// workflow later affects all of them and an author picking it should know that
// at the moment of picking, not afterwards.

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Info, Link2, Users } from "lucide-react";
import type { EngineMeta, FormDefinitionDTO } from "../types";
import { Select, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type AttachedForm = { key: string; title: string; version: number };

export function FormSettings({
  def,
  meta,
  disabled,
  onChange
}: {
  def: FormDefinitionDTO;
  meta: EngineMeta;
  disabled: boolean;
  onChange: (patch: Partial<FormDefinitionDTO>) => void;
}) {
  const [siblings, setSiblings] = useState<AttachedForm[]>([]);

  // Who else is on this workflow. Read from the engine rather than inferred,
  // so it reflects what is actually published.
  useEffect(() => {
    if (!def.workflowModule) {
      setSiblings([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/forms/definitions");
        if (!r.ok) return;
        const all: (FormDefinitionDTO & { workflowModule: string | null })[] = await r.json();
        if (cancelled) return;
        setSiblings(
          all
            .filter((d) => d.workflowModule === def.workflowModule && d.key !== def.key)
            .map((d) => ({ key: d.key, title: d.title, version: d.version }))
        );
      } catch {
        /* the panel degrades to hiding the sibling list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [def.workflowModule, def.key]);

  const patternValid = !def.numberPattern || isPatternPlausible(def.numberPattern);

  return (
    <div className="space-y-5">
      <div>
        <Label className="mb-1 block text-xs font-medium text-slate-600">Description</Label>
        <Textarea
          rows={2}
          disabled={disabled}
          value={def.description ?? ""}
          onChange={(e) => onChange({ description: e.target.value || null })}
          placeholder="What this form is for, shown above it when someone fills it in."
        />
      </div>

      {/* ── approval workflow ── */}
      <div>
        <Label className="mb-1 block text-xs font-medium text-slate-600">Approval workflow</Label>
        <Select
          disabled={disabled}
          value={def.workflowModule ?? ""}
          onChange={(e) => onChange({ workflowModule: e.target.value || null })}
          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:opacity-60"
        >
          <SelectItem value="">No approval — submitting is final</SelectItem>
          {meta.workflowModules.map((w) => (
            <SelectItem key={w.module} value={w.module}>
              {w.module}
              {w.definitions.length > 1 ? ` (${w.definitions.length} variants)` : ""}
            </SelectItem>
          ))}
        </Select>

        {def.workflowModule ? (
          <>
            <p className="mt-1.5 flex items-start gap-1 text-[11px] text-slate-500">
              <Info size={12} className="mt-0.5 shrink-0" />
              Approvals appear in the same inbox as every other module. Records move through this
              workflow&apos;s steps exactly as a permit or an observation does.
            </p>

            {(meta.workflowModules.find((w) => w.module === def.workflowModule)?.definitions
              .length ?? 0) > 1 ? (
              <div className="mt-2">
                <Label className="mb-1 block text-xs font-medium text-slate-600">
                  Variant (record type)
                </Label>
                <Select
                  disabled={disabled}
                  value={def.workflowRecordType ?? ""}
                  onChange={(e) => onChange({ workflowRecordType: e.target.value || null })}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm disabled:opacity-60"
                >
                  <SelectItem value="">Default</SelectItem>
                  {meta.workflowModules
                    .find((w) => w.module === def.workflowModule)
                    ?.definitions.filter((d) => d.recordType)
                    .map((d) => (
                      <SelectItem key={d.recordType!} value={d.recordType!}>
                        {d.recordType} — {d.name}
                      </SelectItem>
                    ))}
                </Select>
              </div>
            ) : null}

            {siblings.length > 0 ? (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-900">
                  <Users size={12} />
                  Shared with {siblings.length} other form{siblings.length === 1 ? "" : "s"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {siblings.map((s) => (
                    <Badge
                      key={s.key}
                      className="border-amber-200 bg-white text-[10px] text-amber-800"
                    >
                      <Link2 size={9} className="mr-1" />
                      {s.title}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-amber-800">
                  Changing the workflow&apos;s steps will change them for these forms too. That is
                  intended — one workflow serving several registers is the design — but it is not
                  reversible per-form.
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-1.5 flex items-start gap-1 text-[11px] text-slate-500">
            <Info size={12} className="mt-0.5 shrink-0" />
            Records will be marked submitted, never approved — nobody reviews them. Pick a workflow
            if this form needs sign-off.
          </p>
        )}
      </div>

      {/* ── reference numbering ── */}
      <div>
        <Label className="mb-1 block text-xs font-medium text-slate-600">Reference number</Label>
        <Input
          disabled={disabled}
          value={def.numberPattern ?? ""}
          onChange={(e) => onChange({ numberPattern: e.target.value || null })}
          placeholder="KAIZEN-{YYYY}-{####}"
          className={cn("font-mono text-xs", !patternValid && "border-rose-400")}
        />
        <div className="mt-1 flex flex-wrap gap-1">
          {meta.numberPatternTokens.map((t) => (
            <Button
              variant="bare"
              key={t}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ numberPattern: `${def.numberPattern ?? ""}${t}` })}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600 hover:border-primary-300 disabled:opacity-50"
            >
              {t}
            </Button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Numbers are assigned on submit, not while drafting — an abandoned draft never burns one.
          Including <code className="font-mono">{"{YYYY}"}</code> restarts the count each year;{" "}
          <code className="font-mono">{"{SITE}"}</code> numbers each site separately.
        </p>
        {!patternValid ? (
          <p className="mt-1 flex items-start gap-1 text-[11px] text-rose-600">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            A pattern needs exactly one sequence token (e.g. {"{####}"}) and a literal prefix.
          </p>
        ) : def.numberPattern ? (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
            <CheckCircle2 size={11} />
            Next: {previewNumber(def.numberPattern)}
          </p>
        ) : null}
      </div>

      {/* ── read-only facts worth surfacing ── */}
      <dl className="space-y-1 rounded-md border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-[11px]">
        <Fact label="Form key" value={def.key} mono />
        <Fact label="Permission prefix" value={`${def.permissionPrefix}.*`} mono />
        <Fact
          label="Storage"
          value={String((def.storageBinding as { kind?: string } | null)?.kind ?? "NATIVE")}
        />
      </dl>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn("text-slate-700", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

/** Mirrors the server's validate_pattern well enough to warn early. The server
 *  is still the authority — publish runs the real check. */
function isPatternPlausible(pattern: string): boolean {
  const tokens = pattern.match(/\{[^}]*\}/g) ?? [];
  const seq = tokens.filter((t) => /^\{#{2,8}\}$/.test(t));
  if (seq.length !== 1) return false;
  const known = /^\{(YYYY|YY|MM|SITE|#{2,8})\}$/;
  if (!tokens.every((t) => known.test(t))) return false;
  return /^[A-Z]/.test(pattern);
}

function previewNumber(pattern: string): string {
  const now = new Date();
  return pattern
    .replace("{YYYY}", String(now.getFullYear()))
    .replace("{YY}", String(now.getFullYear() % 100).padStart(2, "0"))
    .replace("{MM}", String(now.getMonth() + 1).padStart(2, "0"))
    .replace("{SITE}", "NW")
    .replace(/\{(#{2,8})\}/, (_m, hashes: string) => "1".padStart(hashes.length, "0"));
}
