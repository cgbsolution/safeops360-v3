import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaTenant: PrismaClient | undefined;
  prismaMeta: PrismaClient | undefined;
};

function buildUrl() {
  const base = process.env.DATABASE_URL ?? "";
  // Fail with the ACTUAL cause. Without this guard an empty DATABASE_URL still
  // produced a non-empty string ("?connection_limit=1&pool_timeout=20&…"),
  // which Prisma rejected with:
  //
  //   Error validating datasource `db`: the URL must start with the protocol
  //   `postgresql://` or `postgres://`
  //
  // That message sends you hunting for a malformed connection string when the
  // variable is simply absent from the process. It is especially misleading in
  // dev because the client below is cached on globalThis: once it is built with
  // an empty URL it SURVIVES hot reload, so editing .env appears to do nothing
  // and only a full restart of `next dev` picks the value up.
  if (!base.trim()) {
    throw new Error(
      "DATABASE_URL is empty or unset in this process. " +
        "If you just added it to .env, fully restart the dev server (Ctrl+C then " +
        "`npm run dev`) — a hot reload will NOT pick it up, because the Prisma " +
        "client is cached on globalThis. On Vercel, set it in " +
        "Settings > Environment Variables and redeploy."
    );
  }
  // We run on Vercel serverless against Supabase Free tier — pgbouncer's
  // pool ceiling is ~15 connections total. Each Lambda creates its own
  // Prisma client, so the per-client limit must be SMALL or concurrent
  // Lambdas blow past the ceiling and every request fails until idle
  // Lambdas die (the "suddenly works, suddenly doesn't" symptom).
  //
  //   connection_limit=1 → up to 15 concurrent Lambdas before exhaustion
  //   connection_limit=10 → only ~1-2 concurrent Lambdas before exhaustion
  //
  // The dashboard's 7 parallel queries serialise inside the single
  // connection but Prisma queues them efficiently — slower than parallel,
  // but vastly more reliable. The real fix for dashboard latency is to
  // (a) cache the page (revalidate=30) and (b) eventually move heavy
  // aggregations to the Python backend.
  //
  // pool_timeout=20 — give queued queries enough time to complete on a
  // cold Lambda. The default of 10s was tripping on cold starts.
  //
  // statement_timeout is NOT a libpq / Prisma connection-string parameter
  // (it's a server-side GUC). Including it has caused URL-parse failures
  // against the Supabase pooler in production. Leave it off.
  const [baseNoQuery, baseQuery] = base.split("?");
  const params = new URLSearchParams(baseQuery || "");
  params.set("connection_limit", "1");
  params.set("pool_timeout", "20");
  if (!params.has("pgbouncer")) params.set("pgbouncer", "true");
  params.delete("statement_timeout");
  return `${baseNoQuery}?${params.toString()}`;
}

// ── Lazy construction ──────────────────────────────────────────────────────
// The client is built on FIRST USE, not at module import.
//
// This matters because `next build` imports every module to collect page data,
// and the build machine has no database. Constructing here at import time made
// buildUrl() run during the build, so the guard above turned a missing env var
// into a hard build failure:
//
//   Failed to collect configuration for /_not-found
//     cause: DATABASE_URL is empty or unset in this process
//
// Building must not require a database — only querying must. Deferring the
// construction keeps the clear error message but moves it to the first actual
// query, where it is a runtime problem the message can genuinely help with.
//
// Still cached on globalThis so we get exactly one client per process (in dev,
// per HMR generation) rather than one per module import.
function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      datasources: { db: { url: buildUrl() } },
      log: ["error"]
    });
  }
  return globalForPrisma.prisma;
}

// ── Tenant partition ───────────────────────────────────────────────────────
// This database hosts more than one demo tenant: Meridian Retail's sites carry
// a display-label profile (PlantDisplayProfile); every other plant has none.
// Many pages query plant-bound tables straight from Prisma with no plant filter
// at all, so without this a Retail user's permit list would show Manufacturing
// permits and vice versa. Every READ on a model with a `plantId` column (and on
// Plant itself) is therefore narrowed to the plants of the viewer's tenant:
//   viewer's home plant has profile P  → plants with profile P
//   viewer's home plant has no profile → plants with no profile (+ null plantId)
// For every pre-existing user that is every plant that existed before the
// Retail tenant, so their results are unchanged. Outside a signed-in request
// (scripts, the sign-in flow itself) nothing is filtered. Single-record reads
// (findUnique) are not rewritten here; record pages use lib/tenancy/server.ts.

const READ_OPS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "groupBy", "aggregate"]);
const PLANT_FIELD: Map<string, boolean> = new Map(
  Prisma.dmmf.datamodel.models.flatMap((m) =>
    m.fields
      .filter((f) => f.name === "plantId" && f.kind === "scalar")
      .map((f) => [m.name, f.isRequired] as [string, boolean])
  )
);

type TenantMap = { profileOf: Map<string, string | null>; loadedAt: number };
let tenantMap: TenantMap | null = null;

// The map is read on its OWN client (own connection): the main client runs with
// connection_limit=1, so reading through it from inside an interactive
// transaction would wait for the connection that transaction is holding.
function metaClient(): PrismaClient {
  if (!globalForPrisma.prismaMeta) {
    globalForPrisma.prismaMeta = new PrismaClient({ datasources: { db: { url: buildUrl() } }, log: ["error"] });
  }
  return globalForPrisma.prismaMeta;
}

async function loadTenantMap(): Promise<TenantMap> {
  if (tenantMap && Date.now() - tenantMap.loadedAt < 60_000) return tenantMap;
  const rows = await metaClient().$queryRaw<{ id: string; profileCode: string | null }[]>`
    select p.id, d."profileCode" from "Plant" p left join "PlantDisplayProfile" d on d."plantId" = p.id`;
  tenantMap = { profileOf: new Map(rows.map((r) => [r.id, r.profileCode])), loadedAt: Date.now() };
  return tenantMap;
}

// The viewer's home plant, read straight from the NextAuth session cookie (a
// JWT decode — no callbacks, no database). undefined = no signed-in request.
async function viewerPlantId(): Promise<string | null | undefined> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    const raw = jar.get("__Secure-next-auth.session-token")?.value ?? jar.get("next-auth.session-token")?.value;
    if (!raw) return undefined;
    const { decode } = await import("next-auth/jwt");
    const token = await decode({ token: raw, secret: process.env.NEXTAUTH_SECRET ?? "" });
    if (!token) return undefined;
    return ((token as any).plantId as string | undefined) ?? null;
  } catch {
    return undefined; // not inside a request (script, build, sign-in callback)
  }
}

async function viewerPlants(): Promise<string[] | null> {
  const viewerPlant = await viewerPlantId();
  if (viewerPlant === undefined) return null;
  const map = await loadTenantMap();
  const tenant = (viewerPlant && map.profileOf.get(viewerPlant)) || null;
  return [...map.profileOf].filter(([, p]) => (p || null) === tenant).map(([id]) => id);
}

function withTenant(base: PrismaClient): PrismaClient {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const isPlant = model === "Plant";
          if (!READ_OPS.has(operation) || (!isPlant && !PLANT_FIELD.has(model))) return query(args);
          const plants = await viewerPlants();
          if (!plants) return query(args);
          const map = await loadTenantMap();
          const viewerIsDefault = !plants.some((id) => map.profileOf.get(id));
          const clause: any = isPlant
            ? { id: { in: plants } }
            : PLANT_FIELD.get(model) || !viewerIsDefault
              ? { plantId: { in: plants } }
              : { OR: [{ plantId: { in: plants } }, { plantId: null }] };
          const a: any = args ?? {};
          return query({ ...a, where: a.where ? { AND: [a.where, clause] } : clause });
        },
      },
    },
  }) as unknown as PrismaClient;
}

function getTenantClient(): PrismaClient {
  if (!globalForPrisma.prismaTenant) globalForPrisma.prismaTenant = withTenant(getClient());
  return globalForPrisma.prismaTenant;
}

// A Proxy so every existing `prisma.user.findMany()` call site keeps working
// unchanged — the real client is created by the first property access.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getTenantClient();
    const value = Reflect.get(client, prop, client);
    // Bind methods ($transaction, $queryRaw, $connect…) so `this` stays the
    // real client rather than the proxy.
    return typeof value === "function" ? value.bind(client) : value;
  },
  set(_target, prop, value) {
    return Reflect.set(getTenantClient(), prop, value);
  },
  has(_target, prop) {
    return prop in getTenantClient();
  }
});
