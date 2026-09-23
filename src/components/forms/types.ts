// Shared vocabulary for the Form & Workflow Engine's UI layer.
//
// These types mirror what the BACKEND validates
// (app/services/form_engine/schema.py). They are deliberately structural
// mirrors, not an independent model: the server is the authority on what a
// valid schema is, and the Builder fetches the live list of field types from
// GET /api/forms/meta rather than hard-coding one here. FIELD_META below
// supplies only presentation (label, icon hint, grouping) for types the server
// says exist — so an engine that gains a field type shows it in the palette
// without a frontend release, and a Builder can never offer a type the engine
// cannot execute.

export type FieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "integer"
  | "decimal"
  | "date"
  | "datetime"
  | "select"
  | "multiselect"
  | "radio"
  | "checkbox"
  | "boolean"
  | "file"
  | "signature"
  | "user"
  | "orgunit"
  | "table"
  | "calculated"
  | "section";

export type ConditionOperator =
  | "="
  | "!="
  | "in"
  | "not_in"
  | ">"
  | "<"
  | ">="
  | "<="
  | "empty"
  | "not_empty";

/** A single `visible_if` clause, or a nested AND/OR group. Compiled by the rule
 *  builder and evaluated by validation.py server-side — the browser's copy in
 *  visibility.ts is only for live rendering. */
export type Condition =
  | { field: string; operator: ConditionOperator; value?: unknown }
  | { combinator: "AND" | "OR"; rules: Condition[] };

export type FieldOption = { value: string; label?: string };

export type ValidationRules = {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
};

/** A column inside a `table` field. The engine forbids nested tables and
 *  nested calculations, so a column is a scalar or list type only. */
export type FormColumn = {
  key: string;
  type: Exclude<FieldType, "table" | "calculated" | "section">;
  label: string;
  required?: boolean;
  help?: string;
  options?: FieldOption[];
  validation?: ValidationRules;
  unit?: string;
};

export type FormField = {
  key: string;
  type: FieldType;
  label: string;
  help?: string;
  required?: boolean;
  default?: unknown;
  options?: FieldOption[];
  validation?: ValidationRules;
  unit?: string;
  visible_if?: Condition;
  /** `calculated` only. Arithmetic over sibling field keys; `rows.column` reads
   *  a table column. Parsed by the server's AST-whitelist evaluator. */
  formula?: string;
  /** `table` only. */
  columns?: FormColumn[];
  /** `section` only. */
  fields?: FormField[];
};

export type FormSchema = FormField[];

export type DefinitionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type FormDefinitionDTO = {
  id: string;
  key: string;
  version: number;
  status: DefinitionStatus;
  title: string;
  description: string | null;
  module: string;
  schemaJson: FormSchema | null;
  uiSchemaJson: Record<string, unknown> | null;
  workflowModule: string | null;
  workflowRecordType: string | null;
  numberPattern: string | null;
  storageBinding: Record<string, unknown> | null;
  orgScope: Record<string, unknown> | null;
  permissionPrefix: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  publishedById: string | null;
  publishedAt: string | null;
};

export type WorkflowModuleOption = {
  module: string;
  definitions: { recordType: string | null; name: string }[];
};

export type EngineMeta = {
  fieldTypes: FieldType[];
  conditionOperators: ConditionOperator[];
  formulaFunctions: string[];
  numberPatternTokens: string[];
  definitionStatuses: DefinitionStatus[];
  storageBindings: string[];
  /** Attachable workflows, grouped by the `module` a form binds to. Several
   *  forms naming the same module all run on that one workflow — which is how
   *  the Business Excellence registers share a single definition. */
  workflowModules: WorkflowModuleOption[];
};

/** Presentation metadata only. Keyed by every type the engine currently
 *  supports; a type the server reports that is missing here still renders,
 *  falling back to a text input and a humanised label, so the palette degrades
 *  rather than breaking when the engine adds a type. */
export const FIELD_META: Record<
  string,
  { label: string; group: "Basic" | "Choice" | "People & place" | "Advanced"; hint: string }
> = {
  text: { label: "Text", group: "Basic", hint: "Single line" },
  textarea: { label: "Paragraph", group: "Basic", hint: "Multi-line text" },
  richtext: { label: "Rich text", group: "Basic", hint: "Formatted text" },
  number: { label: "Number", group: "Basic", hint: "Any number" },
  integer: { label: "Whole number", group: "Basic", hint: "No decimals" },
  decimal: { label: "Measurement", group: "Basic", hint: "Number with a unit" },
  date: { label: "Date", group: "Basic", hint: "Calendar date" },
  datetime: { label: "Date & time", group: "Basic", hint: "Date with a time" },
  select: { label: "Dropdown", group: "Choice", hint: "Pick one" },
  radio: { label: "Radio group", group: "Choice", hint: "Pick one, all visible" },
  multiselect: { label: "Multi-select", group: "Choice", hint: "Pick several" },
  checkbox: { label: "Checkbox", group: "Choice", hint: "Single tick box" },
  boolean: { label: "Yes / No", group: "Choice", hint: "Two-state toggle" },
  user: { label: "Person", group: "People & place", hint: "Pick a user — can route approvals" },
  orgunit: { label: "Site / area", group: "People & place", hint: "Pick a plant or area" },
  file: { label: "Attachment", group: "People & place", hint: "Upload a document or photo" },
  signature: { label: "Signature", group: "People & place", hint: "Drawn sign-off" },
  table: { label: "Repeatable table", group: "Advanced", hint: "Rows of columns" },
  calculated: { label: "Calculated", group: "Advanced", hint: "Derived by the server" },
  section: { label: "Section", group: "Advanced", hint: "Groups fields together" }
};

/** Types that hold no value of their own. */
export const CONTAINER_TYPES: FieldType[] = ["section"];
/** Types the server derives and never accepts from the client. */
export const COMPUTED_TYPES: FieldType[] = ["calculated"];
/** Types whose `options` list is the set of permitted values. */
export const OPTION_TYPES: FieldType[] = ["select", "radio", "multiselect", "checkbox"];

export function fieldLabelFor(type: string): string {
  return FIELD_META[type]?.label ?? type.replace(/_/g, " ");
}

/** Flatten a schema to every field, descending into sections. Table columns are
 *  NOT included: they live in the row namespace, not the record namespace —
 *  same rule as the server's iter_fields(). */
export function iterFields(schema: FormSchema | null | undefined): FormField[] {
  const out: FormField[] = [];
  const walk = (items?: FormField[]) => {
    for (const f of items ?? []) {
      out.push(f);
      if (f.type === "section") walk(f.fields);
    }
  };
  walk(schema ?? []);
  return out;
}

/** Every key that holds or derives a value — the set a formula or a
 *  `visible_if` may legally reference. */
export function referenceableKeys(schema: FormSchema | null | undefined): FormField[] {
  return iterFields(schema).filter((f) => f.type !== "section" && !!f.key);
}

/** Auto-slug a label into a field key. Must match what the server accepts:
 *  alphanumeric/underscore, never leading with a digit (keys are parsed as bare
 *  identifiers inside formulas, so they have to be valid identifiers). */
export function slugifyKey(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  if (!base) return "field";
  return /^[0-9]/.test(base) ? `f_${base}` : base;
}

export function uniqueKey(desired: string, taken: Set<string>): string {
  if (!taken.has(desired)) return desired;
  let n = 2;
  while (taken.has(`${desired}_${n}`)) n += 1;
  return `${desired}_${n}`;
}
