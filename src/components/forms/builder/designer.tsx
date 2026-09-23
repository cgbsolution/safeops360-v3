"use client";

// The Form Designer (Part B §2).
//
// Three panes: palette, canvas, inspector — plus a preview tab that renders
// through the SAME <FormRenderer/> the record screen uses (§2.3). Drag-and-drop
// is native HTML5 rather than a DnD library: nothing in the repo ships one, and
// adding a dependency for a palette drop plus list reordering is not a trade
// worth making.
//
// WHAT THIS COMPONENT IS NOT ALLOWED TO DO
// It never validates a schema itself. "Can this publish?" is answered by
// POST /api/forms/definitions/validate — the identical gate the publish
// endpoint runs — so the Builder's verdict and the server's can never disagree.
// A browser-side copy of the gate would be a second source of truth and would
// drift on the first engine change.
//
// The palette is likewise built from GET /api/forms/meta, not from a hard-coded
// list, so the Builder can only ever offer field types the engine executes
// (§5's "no new logic surface").

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileWarning,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Save,
  Send,
  Settings2,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FormRenderer } from "../form-renderer";
import { initialValues } from "../visibility";
import {
  FIELD_META,
  type EngineMeta,
  type FormDefinitionDTO,
  type FormField,
  type FormSchema
} from "../types";
import { FieldSettings } from "./field-settings";
import { FormSettings } from "./form-settings";
import {
  collectKeys,
  getAt,
  insertAt,
  makeField,
  moveTo,
  pathEquals,
  removeAt,
  setAt,
  type Path
} from "./schema-ops";

type Verdict = { ok: boolean; errors: string[] } | null;

const AUTOSAVE_MS = 2500;

export function FormDesigner({
  initial,
  meta
}: {
  initial: FormDefinitionDTO;
  meta: EngineMeta;
}) {
  const router = useRouter();

  const [def, setDef] = useState<FormDefinitionDTO>(initial);
  const [schema, setSchema] = useState<FormSchema>(initial.schemaJson ?? []);
  const [selected, setSelected] = useState<Path | null>(null);
  const [tab, setTab] = useState<"build" | "settings" | "preview">("build");
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [banner, setBanner] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  // Seeded from the schema's configured defaults so the preview shows what a
  // user would actually see on opening the form — a default that only appears
  // in production would make the preview quietly wrong.
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>(() =>
    initialValues(initial.schemaJson)
  );

  const editable = def.status === "DRAFT";
  const dirty = useRef(false);
  const keys = useMemo(() => collectKeys(schema), [schema]);
  const selectedField = selected ? getAt(schema, selected) : undefined;

  const mutate = useCallback((next: FormSchema) => {
    dirty.current = true;
    setSchema(next);
  }, []);

  // ── validation, always against the server's gate ──────────────────────────
  const runValidate = useCallback(
    async (candidate: FormSchema) => {
      try {
        const r = await fetch("/api/forms/definitions/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schemaJson: candidate, numberPattern: def.numberPattern })
        });
        const body = await r.json();
        setVerdict({ ok: !!body.ok, errors: body.errors ?? [] });
      } catch {
        setVerdict(null); // unknown beats a wrong verdict
      }
    },
    [def.numberPattern]
  );

  // ── autosave (Part B §4: authoring-session state, not a record) ───────────
  //
  // Depends on `def` as well as `schema` so a change made on the Settings tab
  // (workflow attachment, number pattern) is saved too — those live on the
  // definition, not the schema, and a settings edit that silently failed to
  // persist would be found only after publishing.
  useEffect(() => {
    if (!editable) return;
    const t = setTimeout(() => {
      if (dirty.current) void save({ silent: true });
      void runValidate(schema);
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, def, editable]);

  async function save({ silent }: { silent?: boolean } = {}) {
    if (!editable) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/forms/definitions/${def.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: def.title,
          description: def.description,
          schemaJson: schema,
          numberPattern: def.numberPattern,
          workflowModule: def.workflowModule,
          workflowRecordType: def.workflowRecordType
        })
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setBanner({ kind: "error", text: body.detail ?? "Could not save." });
        return;
      }
      dirty.current = false;
      setSavedAt(new Date());
      if (!silent) setBanner({ kind: "ok", text: "Draft saved." });
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    setBanner(null);
    try {
      if (dirty.current) await save({ silent: true });
      const r = await fetch(`/api/forms/definitions/${def.id}/publish`, { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        // The gate's message is a ' | '-joined list of every problem; split it
        // back out so the author sees them as a list rather than a wall.
        const detail: string = body.detail ?? "Publish failed.";
        setVerdict({ ok: false, errors: detail.split(" | ") });
        setBanner({ kind: "error", text: "This form cannot be published yet." });
        return;
      }
      setDef(body);
      setBanner({ kind: "ok", text: `Published v${body.version}.` });
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }

  async function newVersion() {
    const r = await fetch(`/api/forms/definitions/${def.key}/new-version`, { method: "POST" });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      setBanner({ kind: "error", text: body.detail ?? "Could not start a new version." });
      return;
    }
    const created: FormDefinitionDTO = await r.json();
    setDef(created);
    setSchema(created.schemaJson ?? []);
    setSelected(null);
    setBanner({ kind: "ok", text: `Draft v${created.version} created. The live form is unchanged.` });
  }

  // ── drag & drop ───────────────────────────────────────────────────────────
  const [dragging, setDragging] = useState<{ kind: "new"; type: string } | { kind: "move"; path: Path } | null>(
    null
  );
  const [dropTarget, setDropTarget] = useState<Path | null>(null);

  const handleDrop = (to: Path) => {
    if (!dragging || !editable) return;
    if (dragging.kind === "new") {
      mutate(insertAt(schema, to, makeField(dragging.type, schema)));
      setSelected(to);
    } else {
      mutate(moveTo(schema, dragging.path, to));
      setSelected(null);
    }
    setDragging(null);
    setDropTarget(null);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* ── header ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-3">
        <Link
          href="/configuration/forms"
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={15} /> Forms
        </Link>

        <Input
          value={def.title}
          disabled={!editable}
          onChange={(e) => {
            dirty.current = true;
            setDef({ ...def, title: e.target.value });
          }}
          className="h-9 max-w-sm font-medium"
        />

        <Badge
          className={cn(
            "shrink-0",
            def.status === "PUBLISHED"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : def.status === "DRAFT"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-slate-200 bg-slate-50 text-slate-500"
          )}
        >
          {def.status === "PUBLISHED" ? "Live" : def.status === "DRAFT" ? "Draft" : "Superseded"} · v
          {def.version}
        </Badge>

        <div className="ml-auto flex items-center gap-2">
          {savedAt && editable ? (
            <span className="text-xs text-slate-400">
              Saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}

          <div className="flex overflow-hidden rounded-md border border-slate-200">
            {(
              [
                { id: "build", label: "Build", icon: Pencil },
                { id: "settings", label: "Settings", icon: Settings2 },
                { id: "preview", label: "Preview", icon: Eye }
              ] as const
            ).map((t) => (
              <Button
                variant="bare"
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm",
                  tab === t.id ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                <t.icon size={14} />
                {t.label}
              </Button>
            ))}
          </div>

          {editable ? (
            <>
              <Button variant="outline" size="sm" onClick={() => save()} disabled={saving}>
                {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
                Save
              </Button>
              <Button size="sm" onClick={publish} disabled={publishing || verdict?.ok === false}>
                {publishing ? (
                  <Loader2 size={14} className="mr-1 animate-spin" />
                ) : (
                  <Send size={14} className="mr-1" />
                )}
                Publish
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={newVersion}>
              <Plus size={14} className="mr-1" />
              Edit as new version
            </Button>
          )}
        </div>
      </div>

      {banner ? (
        <div
          className={cn(
            "mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
            banner.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          )}
        >
          {banner.kind === "ok" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {banner.text}
        </div>
      ) : null}

      {!editable ? (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <Lock size={15} />
          v{def.version} is {def.status.toLowerCase()} and immutable. Records already filed stay
          pinned to the version they were submitted against.
        </div>
      ) : null}

      {verdict && !verdict.ok ? (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-rose-800">
            <FileWarning size={15} />
            {verdict.errors.length} thing{verdict.errors.length === 1 ? "" : "s"} to fix before publishing
          </p>
          <ul className="space-y-0.5">
            {verdict.errors.map((e, i) => (
              <li key={i} className="text-xs text-rose-700">
                • {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── body ── */}
      {tab === "settings" ? (
        <div className="mt-4 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-5">
            <FormSettings
              def={def}
              meta={meta}
              disabled={!editable}
              onChange={(patch) => {
                dirty.current = true;
                setDef({ ...def, ...patch });
              }}
            />
          </div>
        </div>
      ) : tab === "preview" ? (
        <div className="mt-4 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Sparkles size={15} className="text-primary-600" />
              <div>
                <h2 className="text-base font-semibold text-slate-900">{def.title}</h2>
                {def.description ? (
                  <p className="text-xs text-slate-500">{def.description}</p>
                ) : null}
              </div>
            </div>
            {/* The production renderer. Not a preview lookalike — §2.3. */}
            <FormRenderer
              schema={schema}
              values={previewValues}
              onChange={(k, v) => setPreviewValues((p) => ({ ...p, [k]: v }))}
              preview
            />
            <Button
              variant="bare"
              type="button"
              onClick={() => setPreviewValues(initialValues(schema))}
              className="mt-3 text-[11px] text-slate-500 underline hover:text-slate-700"
            >
              Reset preview to a blank form
            </Button>
            <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
              This is the same component that renders the form for real. Calculated fields show
              &ldquo;calculated on save&rdquo; because the server derives them — the browser never
              computes a formula.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[13rem_1fr_20rem]">
          <Palette meta={meta} disabled={!editable} onDragStart={(type) => setDragging({ kind: "new", type })} />

          <div className="overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <Canvas
              schema={schema}
              parentPath={[]}
              selected={selected}
              dropTarget={dropTarget}
              editable={editable}
              onSelect={setSelected}
              onDragStartField={(path) => setDragging({ kind: "move", path })}
              onDragOverSlot={setDropTarget}
              onDrop={handleDrop}
            />
          </div>

          <div className="overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
            {selectedField && selected ? (
              <fieldset disabled={!editable} className="disabled:opacity-60">
                <FieldSettings
                  field={selectedField}
                  schema={schema}
                  allKeys={keys}
                  operators={meta.conditionOperators}
                  functions={meta.formulaFunctions}
                  onChange={(next) => mutate(setAt(schema, selected, next))}
                  onDelete={() => {
                    mutate(removeAt(schema, selected));
                    setSelected(null);
                  }}
                />
              </fieldset>
            ) : (
              <p className="px-1 py-8 text-center text-sm text-slate-400">
                Select a field to edit its settings, or drag one in from the palette.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── palette ─────────────────────────────────────────────────────────────────

function Palette({
  meta,
  disabled,
  onDragStart
}: {
  meta: EngineMeta;
  disabled: boolean;
  onDragStart: (type: string) => void;
}) {
  // Grouped for scanning, but the SOURCE of the list is the server's meta —
  // a type the engine drops disappears here without a frontend change.
  const groups = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const t of meta.fieldTypes) {
      const group = FIELD_META[t]?.group ?? "Advanced";
      (g[group] ??= []).push(t);
    }
    return g;
  }, [meta.fieldTypes]);

  return (
    <div className="overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
      {Object.entries(groups).map(([group, types]) => (
        <div key={group} className="mb-3">
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {group}
          </p>
          <div className="space-y-1">
            {types.map((t) => (
              <div
                key={t}
                draggable={!disabled}
                onDragStart={() => onDragStart(t)}
                className={cn(
                  "rounded-md border border-slate-200 bg-white px-2 py-1.5",
                  disabled ? "cursor-not-allowed opacity-50" : "cursor-grab hover:border-primary-300 hover:bg-primary-50/40"
                )}
              >
                <p className="text-xs font-medium text-slate-700">{FIELD_META[t]?.label ?? t}</p>
                <p className="text-[10px] text-slate-400">{FIELD_META[t]?.hint ?? ""}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── canvas ──────────────────────────────────────────────────────────────────

function Canvas({
  schema,
  parentPath,
  selected,
  dropTarget,
  editable,
  onSelect,
  onDragStartField,
  onDragOverSlot,
  onDrop
}: {
  schema: FormField[];
  parentPath: Path;
  selected: Path | null;
  dropTarget: Path | null;
  editable: boolean;
  onSelect: (p: Path) => void;
  onDragStartField: (p: Path) => void;
  onDragOverSlot: (p: Path | null) => void;
  onDrop: (p: Path) => void;
}) {
  const slot = (index: number) => {
    const path = [...parentPath, index];
    const active = pathEquals(dropTarget, path);
    return (
      <div
        key={`slot-${index}`}
        onDragOver={(e) => {
          if (!editable) return;
          e.preventDefault();
          e.stopPropagation();
          onDragOverSlot(path);
        }}
        onDrop={(e) => {
          if (!editable) return;
          e.preventDefault();
          e.stopPropagation();
          onDrop(path);
        }}
        className={cn(
          "rounded transition-all",
          active ? "my-1 h-8 border-2 border-dashed border-primary-400 bg-primary-50" : "h-2"
        )}
      />
    );
  };

  return (
    <div>
      {slot(0)}
      {schema.map((field, i) => {
        const path = [...parentPath, i];
        const isSelected = pathEquals(selected, path);
        return (
          <div key={field.key || i}>
            <div
              draggable={editable}
              onDragStart={(e) => {
                e.stopPropagation();
                onDragStartField(path);
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(path);
              }}
              className={cn(
                "rounded-lg border bg-white px-3 py-2 transition",
                editable && "cursor-grab",
                isSelected
                  ? "border-primary-400 ring-2 ring-primary-100"
                  : "border-slate-200 hover:border-slate-300"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800">
                  {field.label || <span className="italic text-slate-400">Untitled</span>}
                </span>
                {field.required ? <span className="text-rose-600">*</span> : null}
                <Badge className="ml-auto shrink-0 border-slate-200 bg-slate-50 text-[10px] text-slate-500">
                  {FIELD_META[field.type]?.label ?? field.type}
                </Badge>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <code className="font-mono text-[10px] text-slate-400">{field.key}</code>
                {field.visible_if ? (
                  <span className="rounded bg-violet-50 px-1 text-[10px] text-violet-600">conditional</span>
                ) : null}
                {field.type === "calculated" && field.formula ? (
                  <code className="truncate rounded bg-emerald-50 px-1 font-mono text-[10px] text-emerald-700">
                    {field.formula}
                  </code>
                ) : null}
              </div>

              {field.type === "section" ? (
                <div className="mt-2 rounded-md border border-dashed border-slate-200 bg-slate-50/70 p-2">
                  <Canvas
                    schema={field.fields ?? []}
                    parentPath={path}
                    selected={selected}
                    dropTarget={dropTarget}
                    editable={editable}
                    onSelect={onSelect}
                    onDragStartField={onDragStartField}
                    onDragOverSlot={onDragOverSlot}
                    onDrop={onDrop}
                  />
                  {(field.fields ?? []).length === 0 ? (
                    <p className="py-2 text-center text-[11px] text-slate-400">
                      Drop fields here to group them
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            {slot(i + 1)}
          </div>
        );
      })}

      {schema.length === 0 && parentPath.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-300 py-12 text-center text-sm text-slate-400">
          Drag a field from the palette to start building.
        </div>
      ) : null}
    </div>
  );
}
