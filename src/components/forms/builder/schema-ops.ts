// Pure schema manipulation for the Form Designer.
//
// Kept out of the React component and free of any DOM/state so it can be unit
// tested directly, and so the drag-and-drop code stays about gestures rather
// than about tree surgery.
//
// A field's position is a PATH: [2] is the third top-level field, [2, 1] is the
// second child of a section at index 2. Only sections nest, and only one level
// deep in practice — but the path model does not assume that, so a future
// nested container needs no change here.

import type { FormField, FormSchema } from "../types";
import { slugifyKey, uniqueKey } from "../types";

export type Path = number[];

export function pathEquals(a: Path | null, b: Path | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function childrenOf(field: FormField): FormField[] | null {
  return field.type === "section" ? (field.fields ?? []) : null;
}

/** The field at `path`, or undefined. */
export function getAt(schema: FormSchema, path: Path): FormField | undefined {
  let list: FormField[] | undefined = schema;
  let node: FormField | undefined;
  for (const i of path) {
    if (!list) return undefined;
    node = list[i];
    if (!node) return undefined;
    list = childrenOf(node) ?? undefined;
  }
  return node;
}

/** Immutably replace the field at `path`. */
export function setAt(schema: FormSchema, path: Path, next: FormField): FormSchema {
  if (path.length === 0) return schema;
  const [head, ...rest] = path;
  return schema.map((f, i) => {
    if (i !== head) return f;
    if (rest.length === 0) return next;
    return { ...f, fields: setAt(f.fields ?? [], rest, next) };
  });
}

/** Immutably remove the field at `path`. */
export function removeAt(schema: FormSchema, path: Path): FormSchema {
  if (path.length === 0) return schema;
  const [head, ...rest] = path;
  if (rest.length === 0) return schema.filter((_, i) => i !== head);
  return schema.map((f, i) =>
    i === head ? { ...f, fields: removeAt(f.fields ?? [], rest) } : f
  );
}

/**
 * Insert `field` so it lands at `path`.
 *
 * `path` addresses the slot the field should occupy: [0] puts it first at the
 * top level; [2, 0] makes it the first child of the section at index 2.
 */
export function insertAt(schema: FormSchema, path: Path, field: FormField): FormSchema {
  if (path.length === 0) return [...schema, field];
  const [head, ...rest] = path;
  if (rest.length === 0) {
    const next = schema.slice();
    next.splice(Math.max(0, Math.min(head, next.length)), 0, field);
    return next;
  }
  return schema.map((f, i) =>
    i === head ? { ...f, fields: insertAt(f.fields ?? [], rest, field) } : f
  );
}

/**
 * Move the field at `from` to `to`.
 *
 * The index correction is the whole reason this is a named function rather than
 * remove-then-insert at the call site: once the source is removed, every later
 * slot in the SAME parent shifts down by one, so inserting at the original
 * target index drops the field one position short. Getting this wrong produces
 * a drag that "almost" works, which is worse than one that obviously doesn't.
 */
export function moveTo(schema: FormSchema, from: Path, to: Path): FormSchema {
  const field = getAt(schema, from);
  if (!field) return schema;

  // Refuse to drop a container inside itself — that would detach the subtree.
  if (to.length > from.length && from.every((v, i) => v === to[i])) return schema;

  const sameParent =
    from.length === to.length &&
    from.slice(0, -1).every((v, i) => v === to[i]);

  const adjusted = to.slice();
  if (sameParent && from[from.length - 1] < to[to.length - 1]) {
    adjusted[adjusted.length - 1] -= 1;
  }

  return insertAt(removeAt(schema, from), adjusted, field);
}

/** Every key in use, including table column keys (which share no namespace with
 *  field keys but are worth de-duplicating for readability). */
export function collectKeys(schema: FormSchema): Set<string> {
  const keys = new Set<string>();
  const walk = (items?: FormField[]) => {
    for (const f of items ?? []) {
      if (f.key) keys.add(f.key);
      if (f.type === "section") walk(f.fields);
    }
  };
  walk(schema);
  return keys;
}

/** A new field of `type`, with a unique key derived from its default label. */
export function makeField(type: string, schema: FormSchema, label?: string): FormField {
  const base = label ?? defaultLabel(type);
  const key = uniqueKey(slugifyKey(base), collectKeys(schema));
  const field: FormField = { key, type: type as FormField["type"], label: base };

  // Seed the shape each type needs to be publishable, so a freshly dropped
  // field is never in a state the gate rejects for a reason the author cannot
  // see (an empty select, a table with no columns).
  if (["select", "radio", "multiselect", "checkbox"].includes(type)) {
    field.options = [
      { value: "OPTION_1", label: "Option 1" },
      { value: "OPTION_2", label: "Option 2" }
    ];
  }
  if (type === "table") {
    field.columns = [{ key: "item", type: "text", label: "Item" }];
  }
  if (type === "section") {
    field.fields = [];
  }
  if (type === "calculated") {
    field.formula = "";
  }
  return field;
}

function defaultLabel(type: string): string {
  const words: Record<string, string> = {
    text: "Text field",
    textarea: "Paragraph",
    richtext: "Rich text",
    number: "Number",
    integer: "Whole number",
    decimal: "Measurement",
    date: "Date",
    datetime: "Date and time",
    select: "Dropdown",
    multiselect: "Multi select",
    radio: "Choice",
    checkbox: "Checkboxes",
    boolean: "Yes or no",
    file: "Attachment",
    signature: "Signature",
    user: "Person",
    orgunit: "Site",
    table: "Table",
    calculated: "Calculated value",
    section: "Section"
  };
  return words[type] ?? "New field";
}
