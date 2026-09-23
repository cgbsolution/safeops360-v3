"use client";

// Per-field settings panel (Part B §2.2).
//
// Every control here writes a property the engine's publish gate
// (app/services/form_engine/schema.py) knows about. There is no free-form
// "extra JSON" escape hatch, on purpose: the moment the Builder can attach a
// property the gate does not validate, Builder-authored and hand-authored
// configs stop being the same thing.

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import type {
  Condition,
  ConditionOperator,
  FieldOption,
  FormColumn,
  FormField,
  FormSchema
} from "../types";
import { FIELD_META, OPTION_TYPES, slugifyKey, uniqueKey } from "../types";
import { RuleBuilder } from "./rule-builder";
import { FormulaBuilder } from "./formula-builder";
import { Select, SelectItem } from "@/components/ui/select";

/** Types where a default value is meaningful. Excludes containers, computed
 *  fields (a default would be overwritten on every save), and the binary types
 *  where "pre-filled" has no sensible meaning. */
const DEFAULTABLE: FormField["type"][] = [
  "text",
  "textarea",
  "richtext",
  "number",
  "integer",
  "decimal",
  "date",
  "datetime",
  "select",
  "radio",
  "boolean"
];

/** Column types the engine permits inside a table: scalars and lists only —
 *  never a nested table or a nested calculation. */
const COLUMN_TYPES: FormColumn["type"][] = [
  "text",
  "number",
  "integer",
  "decimal",
  "date",
  "datetime",
  "select",
  "multiselect",
  "radio",
  "checkbox",
  "boolean",
  "user",
  "file"
];

export function FieldSettings({
  field,
  schema,
  allKeys,
  operators,
  functions,
  onChange,
  onDelete
}: {
  field: FormField;
  schema: FormSchema;
  allKeys: Set<string>;
  operators: ConditionOperator[];
  functions: string[];
  onChange: (next: FormField) => void;
  onDelete: () => void;
}) {
  const patch = (p: Partial<FormField>) => onChange({ ...field, ...p });
  const meta = FIELD_META[field.type];

  // A field may not reference itself in a rule or a formula — the gate rejects
  // it, so the option is never offered.
  const referenceable = collectReferenceable(schema).filter((f) => f.key !== field.key);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {meta?.label ?? field.type}
          </span>
          <Button
            variant="bare"
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={12} /> Remove
          </Button>
        </div>
      </div>

      <Row label="Label">
        <Input
          value={field.label ?? ""}
          onChange={(e) => {
            const label = e.target.value;
            // Keep the key in step with the label ONLY while it still looks
            // auto-generated. Once an author edits the key by hand it is
            // load-bearing — formulas and rules reference it — so silently
            // rewriting it would break them.
            const autoKey = slugifyKey(field.label ?? "");
            if (field.key === autoKey || !field.key) {
              const taken = new Set(allKeys);
              taken.delete(field.key);
              patch({ label, key: uniqueKey(slugifyKey(label), taken) });
            } else {
              patch({ label });
            }
          }}
        />
      </Row>

      <Row
        label="Field key"
        hint="Used by formulas and visibility rules. Letters, numbers and underscores."
      >
        <Input
          value={field.key ?? ""}
          onChange={(e) => patch({ key: e.target.value })}
          className={cn("font-mono text-xs", !isValidKey(field.key) && "border-rose-400")}
        />
        {!isValidKey(field.key) ? (
          <p className="mt-1 text-[11px] text-rose-600">
            Must start with a letter and contain only letters, numbers and underscores.
          </p>
        ) : null}
      </Row>

      <Row label="Help text">
        <Textarea
          rows={2}
          value={field.help ?? ""}
          onChange={(e) => patch({ help: e.target.value || undefined })}
        />
      </Row>

      {field.type !== "calculated" && field.type !== "section" ? (
        <Label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 font-normal">
          <Checkbox
            checked={!!field.required}
            onChange={(e) => patch({ required: e.target.checked || undefined })}
          />
          Required
        </Label>
      ) : null}

      {field.type === "calculated" ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500">
          Calculated fields are derived by the server and can never be marked required — there is
          nothing for a user to fill in.
        </p>
      ) : null}

      {/* Default value. Offered only for types where a single pre-filled value
          is meaningful — a default attachment or signature is not a thing, and
          a default on a calculated field would be overwritten on every save. */}
      {DEFAULTABLE.includes(field.type) ? (
        <Row label="Default value" hint="Pre-filled when the form opens. The user can change it.">
          {OPTION_TYPES.includes(field.type) ? (
            <Select
              value={(field.default as string) ?? ""}
              onChange={(e) => patch({ default: e.target.value || undefined })}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
            >
              <SelectItem value="">— none —</SelectItem>
              {(field.options ?? []).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label ?? o.value}
                </SelectItem>
              ))}
            </Select>
          ) : field.type === "boolean" ? (
            <Select
              value={field.default === true ? "true" : field.default === false ? "false" : ""}
              onChange={(e) =>
                patch({ default: e.target.value === "" ? undefined : e.target.value === "true" })
              }
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
            >
              <SelectItem value="">— none —</SelectItem>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </Select>
          ) : (
            <Input
              type={["number", "integer", "decimal"].includes(field.type) ? "number" : "text"}
              value={(field.default as string | number) ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") return patch({ default: undefined });
                patch({
                  default: ["number", "integer", "decimal"].includes(field.type)
                    ? Number(raw)
                    : raw
                });
              }}
            />
          )}
        </Row>
      ) : null}

      {/* ── unit ── */}
      {["decimal", "number", "integer"].includes(field.type) ? (
        <Row label="Unit" hint="Shown beside the label. Stored on the field, not converted.">
          <Input
            value={field.unit ?? ""}
            onChange={(e) => patch({ unit: e.target.value || undefined })}
            placeholder="kWh, KL, tonnes…"
          />
        </Row>
      ) : null}

      {/* ── numeric / length bounds ── */}
      {["decimal", "number", "integer"].includes(field.type) ? (
        <div className="grid grid-cols-2 gap-2">
          <Row label="Minimum">
            <Input
              type="number"
              value={field.validation?.min ?? ""}
              onChange={(e) => patchValidation(field, patch, "min", e.target.value)}
            />
          </Row>
          <Row label="Maximum">
            <Input
              type="number"
              value={field.validation?.max ?? ""}
              onChange={(e) => patchValidation(field, patch, "max", e.target.value)}
            />
          </Row>
        </div>
      ) : null}

      {["text", "textarea", "richtext"].includes(field.type) ? (
        <div className="grid grid-cols-2 gap-2">
          <Row label="Min length">
            <Input
              type="number"
              value={field.validation?.minLength ?? ""}
              onChange={(e) => patchValidation(field, patch, "minLength", e.target.value)}
            />
          </Row>
          <Row label="Max length">
            <Input
              type="number"
              value={field.validation?.maxLength ?? ""}
              onChange={(e) => patchValidation(field, patch, "maxLength", e.target.value)}
            />
          </Row>
        </div>
      ) : null}

      {/* ── options ── */}
      {OPTION_TYPES.includes(field.type) ? (
        <OptionEditor
          options={field.options ?? []}
          onChange={(options) => patch({ options })}
        />
      ) : null}

      {/* ── table columns ── */}
      {field.type === "table" ? (
        <ColumnEditor columns={field.columns ?? []} onChange={(columns) => patch({ columns })} />
      ) : null}

      {/* ── calculated ── */}
      {field.type === "calculated" ? (
        <Row label="Formula">
          <FormulaBuilder
            value={field.formula ?? ""}
            onChange={(formula) => patch({ formula })}
            available={referenceable}
            functions={functions}
            schemaForCheck={schema as unknown[]}
          />
        </Row>
      ) : null}

      {/* ── conditional visibility ── */}
      <Row
        label="Visibility"
        hint="A hidden field is neither required nor stored — the server enforces both."
      >
        <RuleBuilder
          value={field.visible_if}
          onChange={(visible_if) => patch({ visible_if })}
          available={referenceable}
          operators={operators}
        />
      </Row>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function isValidKey(key: string | undefined): boolean {
  return !!key && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

function patchValidation(
  field: FormField,
  patch: (p: Partial<FormField>) => void,
  key: keyof NonNullable<FormField["validation"]>,
  raw: string
) {
  const validation = { ...(field.validation ?? {}) };
  if (raw === "") delete validation[key];
  else validation[key] = Number(raw);
  patch({ validation: Object.keys(validation).length ? validation : undefined });
}

function collectReferenceable(schema: FormSchema): FormField[] {
  const out: FormField[] = [];
  const walk = (items?: FormField[]) => {
    for (const f of items ?? []) {
      if (f.type === "section") {
        walk(f.fields);
        continue;
      }
      if (f.key) out.push(f);
    }
  };
  walk(schema);
  return out;
}

function Row({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs font-medium text-slate-600">{label}</Label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

function OptionEditor({
  options,
  onChange
}: {
  options: FieldOption[];
  onChange: (next: FieldOption[]) => void;
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs font-medium text-slate-600">Options</Label>
      <div className="space-y-1.5">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              className="h-8 flex-1 text-xs"
              placeholder="Label shown to the user"
              value={o.label ?? ""}
              onChange={(e) =>
                onChange(options.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))
              }
            />
            <Input
              className="h-8 w-32 font-mono text-[11px]"
              placeholder="STORED_VALUE"
              value={o.value}
              onChange={(e) =>
                onChange(options.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))
              }
            />
            <Button
              variant="bare"
              type="button"
              aria-label="Remove option"
              onClick={() => onChange(options.filter((_, idx) => idx !== i))}
              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={13} />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => onChange([...options, { value: "", label: "" }])}
      >
        <Plus size={13} className="mr-1" />
        Add option
      </Button>
      {options.length === 0 ? (
        <p className="mt-1 text-[11px] text-amber-600">
          A choice field needs at least one option before it can be published.
        </p>
      ) : null}
    </div>
  );
}

function ColumnEditor({
  columns,
  onChange
}: {
  columns: FormColumn[];
  onChange: (next: FormColumn[]) => void;
}) {
  const patchCol = (i: number, p: Partial<FormColumn>) =>
    onChange(columns.map((c, idx) => (idx === i ? { ...c, ...p } : c)));

  return (
    <div>
      <Label className="mb-1 block text-xs font-medium text-slate-600">Columns</Label>
      <div className="space-y-2">
        {columns.map((c, i) => (
          <div key={i} className="rounded-md border border-slate-200 bg-white p-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <GripVertical size={12} className="text-slate-300" />
              <Input
                className="h-7 flex-1 text-xs"
                placeholder="Column label"
                value={c.label ?? ""}
                onChange={(e) => {
                  const label = e.target.value;
                  const autoKey = slugifyKey(c.label ?? "");
                  patchCol(i, c.key === autoKey || !c.key ? { label, key: slugifyKey(label) } : { label });
                }}
              />
              <Button
                variant="bare"
                type="button"
                aria-label="Remove column"
                onClick={() => onChange(columns.filter((_, idx) => idx !== i))}
                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 size={13} />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Select
                value={c.type}
                onChange={(e) => patchCol(i, { type: e.target.value as FormColumn["type"] })}
                className="h-7 rounded border border-slate-200 bg-white px-1.5 text-[11px]"
              >
                {COLUMN_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {FIELD_META[t]?.label ?? t}
                  </SelectItem>
                ))}
              </Select>
              <Input
                className="h-7 font-mono text-[11px]"
                placeholder="column_key"
                value={c.key ?? ""}
                onChange={(e) => patchCol(i, { key: e.target.value })}
              />
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <Label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600 font-normal">
                <Checkbox
                  checked={!!c.required}
                  onChange={(e) => patchCol(i, { required: e.target.checked || undefined })}
                />
                Required
              </Label>
              {["decimal", "number", "integer"].includes(c.type) ? (
                <Input
                  className="h-7 w-24 text-[11px]"
                  placeholder="unit"
                  value={c.unit ?? ""}
                  onChange={(e) => patchCol(i, { unit: e.target.value || undefined })}
                />
              ) : null}
            </div>
            {OPTION_TYPES.includes(c.type) ? (
              <div className="mt-1.5">
                <OptionEditor
                  options={c.options ?? []}
                  onChange={(options) => patchCol(i, { options })}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => onChange([...columns, { key: "", type: "text", label: "" }])}
      >
        <Plus size={13} className="mr-1" />
        Add column
      </Button>
      <p className="mt-1 text-[11px] text-slate-400">
        Tables cannot contain other tables or calculated columns — the engine rejects both.
      </p>
    </div>
  );
}
