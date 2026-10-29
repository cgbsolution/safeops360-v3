"use client";

// THE runtime form renderer.
//
// This component is the reason the Builder's live preview is trustworthy. Part B
// §2.3/§5 require the preview and the production form to be the SAME component,
// not two that look alike — "looks right in the Builder, breaks in production"
// is a class of defect that only a shared renderer eliminates. Every consumer
// (the Builder preview, the record-entry screen, any future module screen)
// renders through here.
//
// CALCULATED FIELDS ARE NOT COMPUTED HERE, ON PURPOSE.
// The engine derives them server-side with an AST-whitelist evaluator
// (app/services/form_engine/formula.py) and never trusts a client value. If
// this file also evaluated formulas there would be two evaluators to keep in
// agreement, and the browser's would inevitably drift — producing a preview
// figure that differs from the stored one. Instead a calculated field renders
// read-only, showing the server's value when there is one (`computed`) and a
// plain "calculated on save" note when there isn't. The Builder preview is
// therefore honest about the one thing it cannot know.
//
// Visibility IS mirrored client-side (visibility.ts) because a form that only
// hides fields after a round trip is unusable — but the server re-evaluates it
// and is the authority.

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPicker } from "@/components/ui/user-picker";
import { SignatureField } from "@/components/ui/signature-pad";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Calculator, Info, Paperclip, Plus, Trash2 } from "lucide-react";
import type { FormColumn, FormField, FormSchema } from "./types";
import { visibleFieldKeys } from "./visibility";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";

export type FormRendererProps = {
  schema: FormSchema | null | undefined;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** Server-derived calculated values, keyed by field. Absent while drafting. */
  computed?: Record<string, unknown>;
  /** Per-field messages from a 422, keyed exactly as the server keys them —
   *  including table cells as `rows[0].column`. */
  errors?: Record<string, string>;
  disabled?: boolean;
  /** Preview mode softens the chrome and never uploads anything. */
  preview?: boolean;
  className?: string;
};

export function FormRenderer({
  schema,
  values,
  onChange,
  computed,
  errors,
  disabled,
  preview,
  className
}: FormRendererProps) {
  const shown = useMemo(() => visibleFieldKeys(schema, values), [schema, values]);

  if (!schema || schema.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        This form has no fields yet.
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      {schema.map((field) => (
        <FieldRenderer
          key={field.key}
          field={field}
          values={values}
          shown={shown}
          onChange={onChange}
          computed={computed}
          errors={errors}
          disabled={disabled}
          preview={preview}
        />
      ))}
    </div>
  );
}

type InnerProps = {
  field: FormField;
  values: Record<string, unknown>;
  shown: Set<string>;
  onChange: (key: string, value: unknown) => void;
  computed?: Record<string, unknown>;
  errors?: Record<string, string>;
  disabled?: boolean;
  preview?: boolean;
};

function FieldRenderer(props: InnerProps) {
  const { field, values, shown, onChange, computed, errors, disabled, preview } = props;
  if (!shown.has(field.key)) return null;

  const error = errors?.[field.key];

  if (field.type === "section") {
    return (
      <section className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-900">{field.label}</h3>
        {field.help ? <p className="mb-4 text-xs text-slate-500">{field.help}</p> : null}
        <div className="space-y-5">
          {(field.fields ?? []).map((child) => (
            <FieldRenderer key={child.key} {...props} field={child} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={field.key} className="text-sm font-medium text-slate-800">
          {field.label}
          {field.required ? <span className="ml-0.5 text-rose-600">*</span> : null}
          {field.unit ? <span className="ml-1.5 font-normal text-slate-500">({field.unit})</span> : null}
        </Label>
      </div>

      <Control
        field={field}
        values={values}
        onChange={onChange}
        computed={computed}
        errors={errors}
        disabled={disabled}
        preview={preview}
      />

      {field.help ? (
        <p className="flex items-start gap-1 text-xs text-slate-500">
          <Info size={12} className="mt-0.5 shrink-0" />
          {field.help}
        </p>
      ) : null}
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}

function Control({
  field,
  values,
  onChange,
  computed,
  errors,
  disabled,
  preview
}: Omit<InnerProps, "shown">) {
  const value = values[field.key];
  const set = (v: unknown) => onChange(field.key, v);
  const invalid = !!errors?.[field.key];
  const ring = invalid ? "border-rose-400 focus-visible:ring-rose-400" : undefined;

  switch (field.type) {
    // ── Server-derived ────────────────────────────────────────────────────
    case "calculated": {
      const derived = computed?.[field.key];
      const has = derived !== undefined && derived !== null;
      return (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
            has ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-500"
          )}
        >
          <Calculator size={14} className="shrink-0" />
          {has ? (
            <span className="font-medium tabular-nums">{String(derived)}</span>
          ) : (
            <span>Calculated on save</span>
          )}
          {field.formula ? (
            <code className="ml-auto truncate rounded bg-white/60 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
              {field.formula}
            </code>
          ) : null}
        </div>
      );
    }

    // ── Text ──────────────────────────────────────────────────────────────
    case "textarea":
    case "richtext":
      return (
        <Textarea
          id={field.key}
          rows={field.type === "richtext" ? 6 : 3}
          value={(value as string) ?? ""}
          onChange={(e) => set(e.target.value)}
          disabled={disabled}
          className={ring}
        />
      );

    case "number":
    case "integer":
    case "decimal":
      return (
        <Input
          id={field.key}
          type="number"
          inputMode={field.type === "integer" ? "numeric" : "decimal"}
          step={field.type === "integer" ? 1 : "any"}
          min={field.validation?.min}
          max={field.validation?.max}
          value={(value as number | string) ?? ""}
          onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))}
          disabled={disabled}
          className={ring}
        />
      );

    case "date":
    case "datetime":
      return (
        <Input
          id={field.key}
          type={field.type === "date" ? "date" : "datetime-local"}
          value={(value as string) ?? ""}
          onChange={(e) => set(e.target.value || null)}
          disabled={disabled}
          className={ring}
        />
      );

    // ── Choice ────────────────────────────────────────────────────────────
    case "select":
      return (
        <Select
          id={field.key}
          value={(value as string) ?? ""}
          onChange={(e) => set(e.target.value || null)}
          disabled={disabled}
          className={cn(
            "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
            ring
          )}
        >
          <SelectItem value="">— Select —</SelectItem>
          {(field.options ?? []).map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label ?? o.value}
            </SelectItem>
          ))}
        </Select>
      );

    case "radio":
      return (
        <RadioGroup
          name={field.key}
          value={typeof value === "string" ? value : ""}
          onValueChange={(v) => set(v)}
          disabled={disabled}
          className="gap-0 space-y-1.5"
        >
          {(field.options ?? []).map((o) => (
            <Label
              key={o.value}
              htmlFor={`${field.key}-${o.value}`}
              className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 font-normal"
            >
              <RadioGroupItem id={`${field.key}-${o.value}`} value={o.value} className="h-4 w-4" />
              {o.label ?? o.value}
            </Label>
          ))}
        </RadioGroup>
      );

    case "multiselect":
    case "checkbox": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1.5">
          {(field.options ?? []).map((o) => (
            <Label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 font-normal">
              <Checkbox
                checked={arr.includes(o.value)}
                onChange={(e) =>
                  set(e.target.checked ? [...arr, o.value] : arr.filter((v) => v !== o.value))
                }
                disabled={disabled}
              />
              {o.label ?? o.value}
            </Label>
          ))}
        </div>
      );
    }

    case "boolean":
      return (
        <div className="flex gap-2">
          {[
            { v: true, l: "Yes" },
            { v: false, l: "No" }
          ].map(({ v, l }) => (
            <Button
              variant="bare"
              key={l}
              type="button"
              disabled={disabled}
              onClick={() => set(value === v ? null : v)}
              className={cn(
                "rounded-md border px-4 py-1.5 text-sm font-medium transition",
                value === v
                  ? "border-primary-500 bg-primary-50 text-primary-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              )}
            >
              {l}
            </Button>
          ))}
        </div>
      );

    // ── People & place ────────────────────────────────────────────────────
    case "user":
      return (
        <UserPicker
          id={field.key}
          value={(value as string) ?? null}
          onChange={(id) => set(id)}
          disabled={disabled}
          required={field.required}
        />
      );

    case "orgunit":
      // Deliberately a plain text control until the engine exposes an org-unit
      // lookup endpoint. Rendering a fake picker that cannot resolve a Plant id
      // would invite exactly the "never ask a user to type an id" mistake, so
      // the limitation is shown rather than disguised.
      return (
        <Input
          id={field.key}
          value={(value as string) ?? ""}
          onChange={(e) => set(e.target.value || null)}
          disabled={disabled}
          placeholder="Site / area"
          className={ring}
        />
      );

    case "file":
      return (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">
          <Paperclip size={14} />
          {preview ? (
            <span>Attachment slot — uploads to the shared evidence store</span>
          ) : (
            <span>{(value as string) || "No file attached"}</span>
          )}
        </div>
      );

    case "signature":
      return (
        <SignatureField
          value={(value as string) ?? null}
          onChange={(dataUrl) => set(dataUrl)}
          label={field.label}
          required={field.required}
        />
      );

    // ── Repeatable rows ───────────────────────────────────────────────────
    case "table":
      return (
        <TableField
          field={field}
          rows={Array.isArray(value) ? (value as Record<string, unknown>[]) : []}
          onChange={set}
          errors={errors}
          disabled={disabled}
        />
      );

    // ── text and anything the engine adds that this file predates ─────────
    default:
      return (
        <Input
          id={field.key}
          value={(value as string) ?? ""}
          onChange={(e) => set(e.target.value)}
          disabled={disabled}
          maxLength={field.validation?.maxLength}
          className={ring}
        />
      );
  }
}

function TableField({
  field,
  rows,
  onChange,
  errors,
  disabled
}: {
  field: FormField;
  rows: Record<string, unknown>[];
  onChange: (rows: Record<string, unknown>[]) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}) {
  const columns = field.columns ?? [];

  const setCell = (i: number, key: string, v: unknown) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, [key]: v } : r));
    onChange(next);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader className="bg-slate-50 text-left">
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600">
                  {c.label}
                  {c.required ? <span className="ml-0.5 text-rose-600">*</span> : null}
                  {c.unit ? <span className="ml-1 font-normal text-slate-400">({c.unit})</span> : null}
                </TableHead>
              ))}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="px-3 py-4 text-center text-xs text-slate-400">
                  No rows yet
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => (
                <TableRow key={i} className="border-t border-slate-100">
                  {columns.map((c) => (
                    <TableCell key={c.key} className="px-2 py-1.5 align-top">
                      <Cell
                        column={c}
                        value={row[c.key]}
                        onChange={(v) => setCell(i, c.key, v)}
                        // The server keys table errors exactly like this.
                        error={errors?.[`${field.key}[${i}].${c.key}`]}
                        disabled={disabled}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="px-2 py-1.5 align-top">
                    <Button
                      variant="bare"
                      type="button"
                      aria-label="Remove row"
                      disabled={disabled}
                      onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/60 p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || (field.validation?.maxItems != null && rows.length >= field.validation.maxItems)}
          onClick={() => onChange([...rows, Object.fromEntries(columns.map((c) => [c.key, null]))])}
        >
          <Plus size={14} className="mr-1" />
          Add row
        </Button>
      </div>
    </div>
  );
}

function Cell({
  column,
  value,
  onChange,
  error,
  disabled
}: {
  column: FormColumn;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  disabled?: boolean;
}) {
  const cls = cn("h-9 text-sm", error && "border-rose-400");

  if (column.type === "select" || column.type === "radio") {
    return (
      <Select
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        title={error}
        className={cn(
          "h-9 w-full min-w-[9rem] rounded-md border border-slate-200 bg-white px-2 text-sm",
          error && "border-rose-400"
        )}
      >
        <SelectItem value="">—</SelectItem>
        {(column.options ?? []).map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label ?? o.value}
          </SelectItem>
        ))}
      </Select>
    );
  }

  if (column.type === "boolean" || column.type === "checkbox") {
    return (
      <Checkbox
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
    );
  }

  const numeric = column.type === "number" || column.type === "integer" || column.type === "decimal";
  return (
    <Input
      type={numeric ? "number" : column.type === "date" ? "date" : "text"}
      step={column.type === "integer" ? 1 : "any"}
      value={(value as string | number) ?? ""}
      onChange={(e) => onChange(numeric ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
      disabled={disabled}
      title={error}
      className={cls}
    />
  );
}
