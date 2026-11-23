"use client";

// /configuration/integrations — external-system connectors (JSL SAS first).
//
// Honest by construction: until JSL publishes the SAS API specification there is
// no base URL to configure, so the endpoint runs in dry-run and every outbound
// row is recorded as SKIPPED with the exact payload it WOULD send. That is what
// the payload preview and sync log show, so the mapping can be agreed with JSL
// before a single byte leaves the platform.
//
// Secrets are never typed here: the form takes the NAME of a server environment
// variable (INTEGRATION_*), and only shows whether it resolves on the server.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Plug, Plus, RefreshCw, RotateCcw, Save, Send, Trash2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { UserPicker } from "@/components/ui/user-picker";
import { usePermission } from "@/components/auth/can";
import { cn } from "@/lib/utils";
import {
  EMPTY_DRAFT,
  LOG_TONE,
  apiJson,
  fmtTime,
  qs,
  toDraft,
  type EndpointDraft,
  type IntegrationEndpoint,
  type IntegrationMeta,
  type MappingRow,
  type SyncLog,
} from "@/lib/integrations/api";

type PlantOption = { id: string; name: string };
const ANY = "__any__";

function F({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-slate-700">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-800">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

// ── mapping editor ───────────────────────────────────────────────────────────
function MappingEditor({ rows, onChange, meta, readOnly }: { rows: MappingRow[]; onChange: (r: MappingRow[]) => void; meta: IntegrationMeta; readOnly: boolean }) {
  const set = (i: number, patch: Partial<MappingRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const help = Object.fromEntries(meta.transforms.map((t) => [t.code, t.help]));
  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[1.2fr_1.2fr_0.9fr_1fr_0.7fr_auto] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid">
        <span>SafeOps field</span><span>External field (dotted path)</span><span>Transform</span><span>Argument</span><span>Direction</span><span />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-2 md:grid-cols-[1.2fr_1.2fr_0.9fr_1fr_0.7fr_auto] md:border-0 md:p-0">
          <Select value={r.source} onValueChange={(v) => set(i, { source: v })} disabled={readOnly} aria-label="SafeOps field">
            <SelectItem value="" disabled>Pick a field</SelectItem>
            {meta.safeopsFields.map((f) => (
              <SelectItem key={f.code} value={f.code}>{f.label}</SelectItem>
            ))}
          </Select>
          <Input value={r.target} onChange={(e) => set(i, { target: e.target.value })} placeholder="e.g. location.area" disabled={readOnly} aria-label="External field" />
          <Select value={r.transform ?? "none"} onValueChange={(v) => set(i, { transform: v })} disabled={readOnly} aria-label="Transform">
            {meta.transforms.map((t) => (
              <SelectItem key={t.code} value={t.code}>{t.code}</SelectItem>
            ))}
          </Select>
          <Input
            value={r.arg ?? ""}
            onChange={(e) => set(i, { arg: e.target.value })}
            placeholder={help[r.transform ?? "none"] ?? ""}
            title={help[r.transform ?? "none"] ?? ""}
            disabled={readOnly}
            aria-label="Argument"
          />
          <Select value={r.direction ?? "BOTH"} onValueChange={(v) => set(i, { direction: v as MappingRow["direction"] })} disabled={readOnly} aria-label="Direction">
            <SelectItem value="BOTH">Both</SelectItem>
            <SelectItem value="OUT">Out only</SelectItem>
            <SelectItem value="IN">In only</SelectItem>
          </Select>
          {!readOnly && (
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove mapping row">
              <Trash2 className="h-4 w-4 text-slate-500" />
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { source: "", target: "", transform: "none", direction: "BOTH" }])}>
          <Plus className="h-4 w-4" /> Add field
        </Button>
      )}
      <p className="text-[11px] text-slate-500">
        Out rows build the JSON sent to the external system; In rows read an inbound record. The record id from the external
        system must map onto <span className="font-mono">externalId</span> so repeated deliveries create one observation.
      </p>
    </div>
  );
}

// ── endpoint editor ──────────────────────────────────────────────────────────
function EndpointEditor({
  meta, plants, endpoint, onSaved, onDeleted, canManage,
}: {
  meta: IntegrationMeta; plants: PlantOption[]; endpoint: IntegrationEndpoint | null; onSaved: (e: IntegrationEndpoint) => void;
  onDeleted: () => void; canManage: boolean;
}) {
  const [d, setD] = useState<EndpointDraft>(endpoint ? toDraft(endpoint) : EMPTY_DRAFT);
  const [headersText, setHeadersText] = useState(() => Object.entries((endpoint?.headers ?? {}) as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join("\n"));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [previewRef, setPreviewRef] = useState("");
  const [preview, setPreview] = useState<any>(null);

  useEffect(() => {
    setD(endpoint ? toDraft(endpoint) : EMPTY_DRAFT);
    setHeadersText(Object.entries(endpoint?.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"));
    setMsg(null);
    setPreview(null);
  }, [endpoint]);

  const up = (patch: Partial<EndpointDraft>) => setD((x) => ({ ...x, ...patch }));
  const inbound = d.direction === "INBOUND" || d.direction === "BOTH";
  const outbound = d.direction === "OUTBOUND" || d.direction === "BOTH";
  const ro = !canManage;

  function parseHeaders(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of headersText.split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return out;
  }

  async function run<T>(label: string, fn: () => Promise<T>, success?: (r: T) => string) {
    setBusy(label);
    setMsg(null);
    try {
      const r = await fn();
      if (success) setMsg({ ok: true, text: success(r) });
      return r;
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? "Request failed" });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const body = { ...d, headers: parseHeaders() };
    const saved = await run("save", () =>
      endpoint
        ? apiJson<IntegrationEndpoint>(`/api/integrations/endpoints/${endpoint.id}`, { method: "PUT", json: body })
        : apiJson<IntegrationEndpoint>("/api/integrations/endpoints", { method: "POST", json: body }),
      () => "Saved."
    );
    if (saved) onSaved(saved);
  }

  const applyTemplate = (code: string) => {
    const t = meta.templates[code];
    if (!t) return;
    setD({ ...EMPTY_DRAFT, ...t, headers: {}, fieldMapping: (t.fieldMapping ?? []) as MappingRow[] } as EndpointDraft);
    setHeadersText("");
  };

  return (
    <div className="space-y-5">
      {!endpoint && canManage && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Start from a template:
          {Object.keys(meta.templates).map((k) => (
            <Button key={k} size="sm" variant="outline" onClick={() => applyTemplate(k)}>{meta.templates[k].name}</Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <F label="Code" hint="Identifies the endpoint and its inbound URL; cannot change later.">
          <Input value={d.code} onChange={(e) => up({ code: e.target.value.toUpperCase() })} disabled={ro || !!endpoint} placeholder="JSL_SAS" />
        </F>
        <F label="Name"><Input value={d.name} onChange={(e) => up({ name: e.target.value })} disabled={ro} placeholder="JSL SAS portal" /></F>
        <F label="Direction">
          <Select value={d.direction} onValueChange={(v) => up({ direction: v as EndpointDraft["direction"] })} disabled={ro} aria-label="Direction">
            <SelectItem value="OUTBOUND">Outbound (SafeOps → external)</SelectItem>
            <SelectItem value="INBOUND">Inbound (external → SafeOps)</SelectItem>
            <SelectItem value="BOTH">Both</SelectItem>
          </Select>
        </F>
      </div>
      <F label="Description"><Textarea rows={2} value={d.description ?? ""} onChange={(e) => up({ description: e.target.value })} disabled={ro} /></F>

      {outbound && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Outbound: where and how to send</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1.5fr_0.8fr]">
              <F label="Base URL" hint={d.baseUrl ? undefined : `${meta.awaitingSpecNote}. Leave empty until JSL provides it; rows are recorded as SKIPPED with their payload.`}>
                <Input value={d.baseUrl ?? ""} onChange={(e) => up({ baseUrl: e.target.value })} disabled={ro} placeholder="https://sas.jindalstainless.com" />
              </F>
              <F label="Path"><Input value={d.path ?? ""} onChange={(e) => up({ path: e.target.value })} disabled={ro} placeholder="/api/observations" /></F>
              <F label="Method">
                <Select value={d.method} onValueChange={(v) => up({ method: v })} disabled={ro} aria-label="Method">
                  {meta.methods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </Select>
              </F>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <F label="Authentication">
                <Select value={d.authType} onValueChange={(v) => up({ authType: v })} disabled={ro} aria-label="Authentication">
                  {meta.authTypes.map((a) => <SelectItem key={a} value={a}>{a.replace("_", " ")}</SelectItem>)}
                </Select>
              </F>
              {d.authType !== "NONE" && (
                <F
                  label="Secret: environment variable name"
                  hint={endpoint ? (endpoint.secretConfigured ? "Set on the server." : "Not set on the server yet.") : "Set it on the backend server; never paste the secret here."}
                >
                  <Input value={d.secretEnvVar ?? ""} onChange={(e) => up({ secretEnvVar: e.target.value.toUpperCase() })} disabled={ro} placeholder="INTEGRATION_JSL_SAS_KEY" />
                </F>
              )}
              {d.authType === "API_KEY" && (
                <F label="API key header"><Input value={d.authHeaderName ?? ""} onChange={(e) => up({ authHeaderName: e.target.value })} disabled={ro} placeholder="X-API-Key" /></F>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <F label="Extra headers" hint="One per line, Name: value. No credentials.">
                <Textarea rows={3} value={headersText} onChange={(e) => setHeadersText(e.target.value)} disabled={ro} placeholder="X-Source-System: SafeOps360" />
              </F>
              <F label="External id in the response" hint="Dotted path, e.g. data.id">
                <Input value={d.responseIdPath ?? ""} onChange={(e) => up({ responseIdPath: e.target.value })} disabled={ro} placeholder="id" />
              </F>
              <F label="Timeout (seconds)">
                <Input type="number" min={1} max={120} value={d.timeoutSeconds} onChange={(e) => up({ timeoutSeconds: Number(e.target.value) || 15 })} disabled={ro} />
              </F>
            </div>
            <F label="Send when">
              <div className="flex flex-wrap gap-4">
                {meta.triggerEvents.map((ev) => (
                  <Label key={ev} className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox
                      checked={d.triggerEvents.includes(ev)}
                      onCheckedChange={(c) => up({ triggerEvents: c ? [...d.triggerEvents, ev] : d.triggerEvents.filter((x) => x !== ev) })}
                      disabled={ro}
                    />
                    {ev === "observation.created" ? "An observation is created" : "Its status changes"}
                  </Label>
                ))}
              </div>
            </F>
            <F label="Plants" hint="Only observations from these plants are sent. Leave on 'Every plant' to send all.">
              <Select
                value={d.plantIds[0] ?? ANY}
                onValueChange={(v) => up({ plantIds: v === ANY ? [] : [v] })}
                disabled={ro}
                aria-label="Plant filter"
              >
                <SelectItem value={ANY}>Every plant</SelectItem>
                {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </Select>
            </F>
          </CardContent>
        </Card>
      )}

      {inbound && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Inbound: receiving observations</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <F
                label="Inbound API key: environment variable name"
                hint={endpoint ? (endpoint.inboundKeyConfigured ? "Set on the server." : "Not set on the server: every inbound call is refused.") : "The sender presents this key as X-API-Key."}
              >
                <Input value={d.inboundSecretEnvVar ?? ""} onChange={(e) => up({ inboundSecretEnvVar: e.target.value.toUpperCase() })} disabled={ro} placeholder="INTEGRATION_JSL_SAS_INBOUND_KEY" />
              </F>
              <F label="Service user" hint="Inbound observations are created under this account (needs OBSERVATION.CREATE).">
                <UserPicker value={d.serviceUserId} onChange={(id) => up({ serviceUserId: id })} disabled={ro} placeholder="Pick the integration account" />
              </F>
              <F label="Default plant" hint="Used when the inbound record names no known plant.">
                <Select value={d.defaultPlantId ?? ""} onValueChange={(v) => up({ defaultPlantId: v || null })} disabled={ro} aria-label="Default plant">
                  <SelectItem value="">None</SelectItem>
                  {plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </Select>
              </F>
            </div>
            {endpoint?.inboundPath && (
              <p className="text-xs text-slate-600">
                The external system POSTs JSON to <span className="font-mono">{"<backend URL>"}{endpoint.inboundPath}</span> with header{" "}
                <span className="font-mono">X-API-Key</span>. The same external id twice returns the first observation.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Field mapping</CardTitle></CardHeader>
        <CardContent>
          <MappingEditor rows={d.fieldMapping} onChange={(r) => up({ fieldMapping: r })} meta={meta} readOnly={ro} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <Label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={d.enabled} onCheckedChange={(c) => up({ enabled: !!c })} disabled={ro} /> Enabled
        </Label>
        <Label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={d.dryRun} onCheckedChange={(c) => up({ dryRun: !!c })} disabled={ro} /> Dry run (record payloads, send nothing)
        </Label>
        {canManage && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button onClick={save} disabled={!!busy}>
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
            {endpoint && (
              <>
                <Button variant="outline" disabled={!!busy} onClick={() => run("test", () => apiJson<{ ok: boolean; message: string }>(`/api/integrations/endpoints/${endpoint.id}/test`, { method: "POST" }).then((r) => {
                  setMsg({ ok: r.ok, text: r.message });
                  return r;
                }))}>
                  <Plug className="h-4 w-4" /> Test connection
                </Button>
                <Button variant="outline" disabled={!!busy} onClick={() => run("sync", () => apiJson<any>(`/api/integrations/endpoints/${endpoint.id}/sync-now`, { method: "POST" }), (r) =>
                  `Scanned ${r.captured.scanned}, queued ${r.captured.enqueued}; sent ${r.delivered.sent}, skipped ${r.delivered.skipped}, failed ${r.delivered.failed}.`)}>
                  <RefreshCw className="h-4 w-4" /> Sync now
                </Button>
                <Button variant="ghost" disabled={!!busy} onClick={async () => {
                  if (!window.confirm(`Delete endpoint ${endpoint.code}? Its sync log is kept.`)) return;
                  const r = await run("delete", () => apiJson(`/api/integrations/endpoints/${endpoint.id}`, { method: "DELETE" }));
                  if (r) onDeleted();
                }}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {msg && (
        <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700")}>
          {msg.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <XCircle className="mt-0.5 h-4 w-4" />} {msg.text}
        </div>
      )}

      {endpoint && outbound && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Payload preview</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input className="max-w-xs" value={previewRef} onChange={(e) => setPreviewRef(e.target.value)} placeholder="Observation number (blank = latest)" />
              <Button variant="outline" disabled={!!busy} onClick={() => run("preview", () => apiJson<any>(`/api/integrations/endpoints/${endpoint.id}/preview`, { method: "POST", json: { observationId: previewRef.trim() || null } }).then((r) => {
                setPreview(r);
                return r;
              }))}>
                Preview
              </Button>
              {canManage && preview && (
                <Button variant="outline" disabled={!!busy} onClick={() => run("push", () => apiJson<SyncLog>(`/api/integrations/endpoints/${endpoint.id}/push`, { method: "POST", json: { observationId: preview.observationId } }), () =>
                  `Queued ${preview.observationNumber}. It is sent on the next sync.`)}>
                  <Send className="h-4 w-4" /> Queue this record
                </Button>
              )}
            </div>
            {preview && (
              <>
                <p className="text-xs text-slate-600">
                  {preview.method} {preview.targetUrl ?? "(no URL yet)"} · headers: {preview.headers.join(", ")}
                  {preview.wouldSkip && <span className="ml-1 text-amber-700">· would be skipped: {preview.wouldSkip}</span>}
                </p>
                <Json value={preview.payload} />
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── sync log ─────────────────────────────────────────────────────────────────
function SyncLogPanel({ meta, endpoints, canManage, refreshKey }: { meta: IntegrationMeta; endpoints: IntegrationEndpoint[]; canManage: boolean; refreshKey: number }) {
  const [endpointId, setEndpointId] = useState(ANY);
  const [status, setStatus] = useState(ANY);
  const [direction, setDirection] = useState(ANY);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SyncLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<SyncLog | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiJson<{ items: SyncLog[] }>(`/api/integrations/logs${qs({
        endpointId: endpointId === ANY ? undefined : endpointId, status: status === ANY ? undefined : status,
        direction: direction === ANY ? undefined : direction, q: q.trim() || undefined,
      })}`);
      setRows(r.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load the sync log");
    } finally {
      setLoading(false);
    }
  }, [endpointId, status, direction, q]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function retry(id: string) {
    try {
      await apiJson(`/api/integrations/logs/${id}/retry`, { method: "POST" });
      setOpen(null);
      void load();
    } catch (e: any) {
      setError(e?.message ?? "Retry failed");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Sync log</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={endpointId} onValueChange={setEndpointId} className="h-9 w-48" aria-label="Endpoint">
            <SelectItem value={ANY}>All endpoints</SelectItem>
            {endpoints.map((e) => <SelectItem key={e.id} value={e.id}>{e.code}</SelectItem>)}
          </Select>
          <Select value={status} onValueChange={setStatus} className="h-9 w-40" aria-label="Status">
            <SelectItem value={ANY}>Any status</SelectItem>
            {meta.logStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </Select>
          <Select value={direction} onValueChange={setDirection} className="h-9 w-40" aria-label="Direction">
            <SelectItem value={ANY}>Both directions</SelectItem>
            {meta.logDirections.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </Select>
          <Input className="h-9 w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Observation no. or external id" />
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
          </Button>
          {canManage && (
            <Button variant="outline" size="sm" onClick={async () => {
              try {
                await apiJson("/api/integrations/logs/retry-failed", { method: "POST", json: { endpointId: endpointId === ANY ? null : endpointId } });
                void load();
              } catch (e: any) {
                setError(e?.message ?? "Retry failed");
              }
            }}>
              <RotateCcw className="h-4 w-4" /> Retry all failed
            </Button>
          )}
        </div>
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead><TableHead>Endpoint</TableHead><TableHead>Direction</TableHead><TableHead>Record</TableHead>
                <TableHead>Event</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead>HTTP</TableHead><TableHead>Detail</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="py-8 text-center text-xs text-slate-400">{loading ? "Loading…" : "Nothing logged yet"}</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">{fmtTime(r.createdAt)}</TableCell>
                  <TableCell className="text-xs font-medium">{r.endpointCode}</TableCell>
                  <TableCell className="text-xs">{r.direction === "OUTBOUND" ? "Out" : "In"}</TableCell>
                  <TableCell className="text-xs">{r.entityRef ?? r.externalId ?? "—"}</TableCell>
                  <TableCell className="text-xs text-slate-500">{r.eventType?.replace("observation.", "") ?? "—"} {r.entityStatus ? `· ${r.entityStatus}` : ""}</TableCell>
                  <TableCell>
                    <Badge className={cn("border text-[11px]", LOG_TONE[r.status])}>{r.status}</Badge>
                    {r.retrying && <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] text-slate-500"><Clock className="h-3 w-3" />{fmtTime(r.nextAttemptAt)}</span>}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">{r.attempts}/{meta.maxAttempts}</TableCell>
                  <TableCell className="text-xs tabular-nums">{r.httpStatus ?? "—"}</TableCell>
                  <TableCell className="max-w-[18rem] truncate text-xs text-slate-500" title={r.error ?? ""}>{r.error ?? (r.externalId ? `ext ${r.externalId}` : "")}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={async () => setOpen(await apiJson<SyncLog>(`/api/integrations/logs/${r.id}`))}>Payload</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-[11px] text-slate-500">
          Failed pushes retry automatically after {meta.backoffMinutes.slice(0, 4).join(", ")} … minutes (up to {meta.maxAttempts} attempts). An HTTP 4xx other than 408/429 is not retried automatically: fix the mapping, then retry.
        </p>
      </CardContent>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{open?.entityRef ?? open?.externalId ?? "Sync log entry"} · {open?.status}</DialogTitle></DialogHeader>
          {open && (
            <div className="space-y-3 text-sm">
              {open.error && <p className="text-rose-700">{open.error}</p>}
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">{open.direction === "OUTBOUND" ? "Payload (sent or would be sent)" : "Received body"}</p>
                <Json value={open.payload} />
              </div>
              {open.responseExcerpt && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-600">Response (excerpt)</p>
                  <pre className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px]">{open.responseExcerpt}</pre>
                </div>
              )}
              {canManage && open.direction === "OUTBOUND" && (open.status === "FAILED" || open.status === "SKIPPED") && (
                <Button onClick={() => retry(open.id)}><RotateCcw className="h-4 w-4" /> Retry</Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── page body ────────────────────────────────────────────────────────────────
export function IntegrationsAdmin({ meta, initialEndpoints, plants }: { meta: IntegrationMeta; initialEndpoints: IntegrationEndpoint[]; plants: PlantOption[] }) {
  const canManage = usePermission("INTEGRATION.MANAGE");
  const [endpoints, setEndpoints] = useState(initialEndpoints);
  const [selected, setSelected] = useState<string | null>(initialEndpoints[0]?.id ?? (canManage ? "new" : null));
  const [refreshKey, setRefreshKey] = useState(0);
  const current = useMemo(() => endpoints.find((e) => e.id === selected) ?? null, [endpoints, selected]);

  async function reload(select?: string | null) {
    const r = await apiJson<{ items: IntegrationEndpoint[] }>("/api/integrations/endpoints");
    setEndpoints(r.items);
    if (select !== undefined) setSelected(select);
    setRefreshKey((k) => k + 1);
  }

  const sas = endpoints.find((e) => e.code === "JSL_SAS");
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">JSL SAS portal: {meta.awaitingSpecNote.toLowerCase()}.</p>
          <p className="text-xs">
            The connector is built and configurable. Until JSL shares the SAS API (URL, authentication, field names), keep the endpoint in dry run:
            each new or status-changed observation is logged as SKIPPED with the exact payload it would send, so the mapping can be reviewed with JSL.
            {sas && !sas.awaitingSpec && " A base URL is now configured."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {endpoints.map((e) => (
          <Button key={e.id} variant={selected === e.id ? "default" : "outline"} size="sm" onClick={() => setSelected(e.id)}>
            {e.code}
            <span className={cn("ml-1 h-2 w-2 rounded-full", e.enabled ? (e.dryRun || e.awaitingSpec ? "bg-amber-400" : "bg-emerald-500") : "bg-slate-300")} />
            {(e.logCounts.FAILED ?? 0) > 0 && <Badge className="ml-1 border border-rose-200 bg-rose-100 text-[10px] text-rose-700">{e.logCounts.FAILED} failed</Badge>}
          </Button>
        ))}
        {canManage && (
          <Button variant={selected === "new" ? "default" : "ghost"} size="sm" onClick={() => setSelected("new")}>
            <Plus className="h-4 w-4" /> New endpoint
          </Button>
        )}
      </div>

      {(selected === "new" || current) && (
        <EndpointEditor
          key={selected ?? "none"}
          meta={meta}
          plants={plants}
          endpoint={selected === "new" ? null : current}
          canManage={canManage}
          onSaved={(e) => void reload(e.id)}
          onDeleted={() => void reload(null)}
        />
      )}
      {!endpoints.length && !canManage && <p className="text-sm text-slate-500">No integrations are configured.</p>}

      <SyncLogPanel meta={meta} endpoints={endpoints} canManage={canManage} refreshKey={refreshKey} />
    </div>
  );
}
