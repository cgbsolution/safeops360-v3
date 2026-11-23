// External-system integrations (JSL SAS portal first): client types for
// /api/integrations/* (proxied to the Python backend). The JSL SAS API
// specification has not been supplied yet; every SAS-specific fact is endpoint
// configuration edited on /configuration/integrations.

export { apiJson, qs } from "@/lib/observation-reporting/api";

export type MappingRow = {
  source: string;
  target: string;
  transform?: string;
  arg?: string;
  direction?: "BOTH" | "OUT" | "IN";
};

export type IntegrationEndpoint = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  entityType: string;
  direction: "OUTBOUND" | "INBOUND" | "BOTH";
  baseUrl: string | null;
  path: string | null;
  method: string;
  authType: string;
  authHeaderName: string | null;
  secretEnvVar: string | null;
  inboundSecretEnvVar: string | null;
  headers: Record<string, string>;
  fieldMapping: MappingRow[];
  triggerEvents: string[];
  plantIds: string[];
  responseIdPath: string | null;
  timeoutSeconds: number;
  serviceUserId: string | null;
  defaultPlantId: string | null;
  enabled: boolean;
  dryRun: boolean;
  secretConfigured: boolean;
  inboundKeyConfigured: boolean;
  targetUrl: string | null;
  inboundPath: string | null;
  awaitingSpec: boolean;
  statusNote: string | null;
  cursorAt: string | null;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  logCounts: Record<string, number>;
};

export type EndpointDraft = Omit<
  IntegrationEndpoint,
  | "id" | "entityType" | "secretConfigured" | "inboundKeyConfigured" | "targetUrl" | "inboundPath" | "awaitingSpec"
  | "statusNote" | "cursorAt" | "lastTestAt" | "lastTestOk" | "lastTestMessage" | "logCounts"
>;

export type IntegrationMeta = {
  directions: string[];
  methods: string[];
  authTypes: string[];
  logStatuses: string[];
  logDirections: string[];
  triggerEvents: string[];
  transforms: { code: string; help: string }[];
  mappingDirections: string[];
  safeopsFields: { code: string; label: string; inbound: boolean }[];
  templates: Record<string, Partial<EndpointDraft> & { code: string; name: string }>;
  maxAttempts: number;
  backoffMinutes: number[];
  awaitingSpecNote: string;
};

export type SyncLog = {
  id: string;
  endpointId: string;
  endpointCode: string | null;
  entityType: string;
  entityId: string | null;
  entityRef: string | null;
  eventType: string | null;
  entityStatus: string | null;
  direction: "OUTBOUND" | "INBOUND";
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED" | "RECEIVED";
  attempts: number;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  httpStatus: number | null;
  error: string | null;
  externalId: string | null;
  sentAt: string | null;
  createdAt: string | null;
  retrying: boolean;
  payload?: unknown;
  responseExcerpt?: string | null;
};

export const EMPTY_DRAFT: EndpointDraft = {
  code: "",
  name: "",
  description: null,
  direction: "OUTBOUND",
  baseUrl: null,
  path: null,
  method: "POST",
  authType: "NONE",
  authHeaderName: null,
  secretEnvVar: null,
  inboundSecretEnvVar: null,
  headers: {},
  fieldMapping: [],
  triggerEvents: ["observation.created", "observation.status_changed"],
  plantIds: [],
  responseIdPath: null,
  timeoutSeconds: 15,
  serviceUserId: null,
  defaultPlantId: null,
  enabled: false,
  dryRun: true,
};

export function toDraft(e: IntegrationEndpoint): EndpointDraft {
  const d: any = { ...EMPTY_DRAFT };
  for (const k of Object.keys(EMPTY_DRAFT)) d[k] = (e as any)[k] ?? (EMPTY_DRAFT as any)[k];
  return d as EndpointDraft;
}

export const LOG_TONE: Record<string, string> = {
  PENDING: "bg-sky-100 text-sky-800 border-sky-200",
  SENT: "bg-emerald-100 text-emerald-800 border-emerald-200",
  RECEIVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  FAILED: "bg-rose-100 text-rose-800 border-rose-200",
  SKIPPED: "bg-slate-100 text-slate-600 border-slate-200",
};

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
