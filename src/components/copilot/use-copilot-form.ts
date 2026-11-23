"use client";

// One hook any form can use to let the copilot fill it.
//
// The form describes its fields (label, type, the options of each dropdown)
// and their current values; the copilot proposes values through its
// `update_form_draft` tool, the backend checks them against this description
// (an option must be one of the field's options), and `apply` puts them in
// the form. Nothing is saved by the copilot: the user reviews and submits as
// usual, through the form's own submit and the normal API checks.
//
// A form joins with a few lines:
//
//   useCopilotForm({
//     kind: "NEAR_MISS", title: "New near miss form",
//     fields: () => [{ name: "description", label: "Description", type: "textarea", required: true, value: ... }, ...],
//     apply: (patch) => { if ("description" in patch) ... },
//     attachPhotos: (files) => addFiles(files),   // optional
//   });

import { useEffect, useRef } from "react";
import { useCopilot } from "@/components/copilot/copilot-provider";

export type CopilotFieldType =
  | "text"
  | "textarea"
  | "select"
  | "multiselect"
  | "datetime"
  | "date"
  | "number"
  | "boolean";

export type CopilotOption = { value: string; label: string };

export type CopilotField = {
  /** The key the copilot sends back in a patch. */
  name: string;
  label: string;
  type: CopilotFieldType;
  value: unknown;
  required?: boolean;
  /** select / multiselect: the only values the copilot may choose. */
  options?: CopilotOption[];
  /** number: allowed range. */
  min?: number;
  max?: number;
  /** text / textarea limits. */
  minLength?: number;
  maxLength?: number;
  /** A plain-language hint for the copilot (what the field means here). */
  help?: string;
  /** This field's options change with another field (e.g. areas with the plant). */
  dependsOn?: string;
  /** Shown to the copilot for context only; it can't change it. */
  readOnly?: boolean;
};

export type CopilotFormPatch = Record<string, unknown>;

export function useCopilotForm(spec: {
  kind: string;
  title: string;
  fields: () => CopilotField[];
  apply: (patch: CopilotFormPatch) => void;
  attachPhotos?: (files: File[]) => void;
}) {
  const { registerFormBridge } = useCopilot();
  // Kept in refs so the bridge registers once and always reads the latest state.
  const fields = useRef(spec.fields);
  const apply = useRef(spec.apply);
  const photos = useRef(spec.attachPhotos);
  fields.current = spec.fields;
  apply.current = spec.apply;
  photos.current = spec.attachPhotos;
  const { kind, title } = spec;
  const canAttach = Boolean(spec.attachPhotos);

  useEffect(
    () =>
      registerFormBridge({
        kind,
        title,
        getDraft: () => ({ title, fields: fields.current() }),
        applyPatch: (p) => apply.current(p),
        attachPhotos: canAttach ? (files) => photos.current?.(files) : undefined
      }),
    [registerFormBridge, kind, title, canAttach]
  );
}

/** Options from a master list, for a select field. */
export function toOptions<T>(items: T[], value: (i: T) => string, label: (i: T) => string): CopilotOption[] {
  return items.map((i) => ({ value: value(i), label: label(i) }));
}

/** Set an uncontrolled input / textarea (a field read from FormData on submit). */
export function setNamedInput(form: HTMLFormElement | null, name: string, value: unknown) {
  const el = form?.elements.namedItem(name);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = value == null ? "" : String(value);
  }
}

/** Read an uncontrolled input / textarea. */
export function readNamedInput(form: HTMLFormElement | null, name: string): string {
  const el = form?.elements.namedItem(name);
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : "";
}
