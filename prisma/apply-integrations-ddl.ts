// DDL applier for the external-system integration framework (JSL Hisar:
// "observation reporting ... should integrate with JSL SAS portal").
//
//   IntegrationEndpoint  — one configured external system (JSL_SAS first): URL,
//                          auth by environment-variable NAME (never the secret),
//                          headers, field mapping, enabled / dry-run, watermark
//   IntegrationSyncLog   — outbox + audit trail: every outbound push and every
//                          inbound receipt, with attempts, back-off, HTTP status,
//                          response excerpt, payload and the external id
//
// Two NEW tables, no ALTERs on existing tables: additive, idempotent, safe to re-run.
// Snap & Report and the Live observation dashboard need NO DDL (they read the
// existing Observation / ObservationAttachment / Area tables).
//
// ORDER: run this BEFORE deploying the backend that carries
// app/models/integration.py. The integration_sync scheduler job and the
// /api/integrations endpoints query these tables; nothing else does, so an
// un-migrated database only breaks the integrations screen and that job.
//
// Also run prisma/apply-integrations-permissions.ts, or every endpoint returns 403.
//
//   npx tsx prisma/apply-integrations-ddl.ts     (or: npm run db:apply-integrations)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "IntegrationEndpoint" (
    "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
    "entityType" TEXT NOT NULL DEFAULT 'OBSERVATION',
    "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
    "baseUrl" TEXT, "path" TEXT, "method" TEXT NOT NULL DEFAULT 'POST',
    "authType" TEXT NOT NULL DEFAULT 'NONE', "authHeaderName" TEXT,
    "secretEnvVar" TEXT, "inboundSecretEnvVar" TEXT,
    "headers" JSONB, "fieldMapping" JSONB, "triggerEvents" JSONB, "plantIds" JSONB,
    "responseIdPath" TEXT, "timeoutSeconds" INTEGER NOT NULL DEFAULT 15,
    "serviceUserId" TEXT, "defaultPlantId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false, "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "cursorAt" TIMESTAMP(3), "lastTestAt" TIMESTAMP(3), "lastTestOk" BOOLEAN, "lastTestMessage" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedBy" TEXT,
    CONSTRAINT "IntegrationEndpoint_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IntegrationEndpoint_direction_chk" CHECK ("direction" IN ('OUTBOUND','INBOUND','BOTH')),
    CONSTRAINT "IntegrationEndpoint_method_chk" CHECK ("method" IN ('POST','PUT','PATCH')),
    CONSTRAINT "IntegrationEndpoint_auth_chk" CHECK ("authType" IN ('NONE','API_KEY','BEARER','BASIC')),
    CONSTRAINT "IntegrationEndpoint_timeout_chk" CHECK ("timeoutSeconds" BETWEEN 1 AND 120),
    -- Secrets live in environment variables; the columns may only NAME one.
    CONSTRAINT "IntegrationEndpoint_secret_env_chk" CHECK ("secretEnvVar" IS NULL OR "secretEnvVar" ~ '^INTEGRATION_[A-Z0-9_]{1,64}$'),
    CONSTRAINT "IntegrationEndpoint_inbound_env_chk" CHECK ("inboundSecretEnvVar" IS NULL OR "inboundSecretEnvVar" ~ '^INTEGRATION_[A-Z0-9_]{1,64}$'))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationEndpoint_code_key" ON "IntegrationEndpoint" ("code")`,
  `CREATE INDEX IF NOT EXISTS "ix_IntegrationEndpoint_enabled" ON "IntegrationEndpoint" ("enabled","isDeleted")`,

  `CREATE TABLE IF NOT EXISTS "IntegrationSyncLog" (
    "id" TEXT NOT NULL, "endpointId" TEXT NOT NULL REFERENCES "IntegrationEndpoint"("id"),
    "entityType" TEXT NOT NULL, "entityId" TEXT, "entityRef" TEXT, "eventType" TEXT, "entityStatus" TEXT,
    "direction" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3), "lastAttemptAt" TIMESTAMP(3),
    "httpStatus" INTEGER, "responseExcerpt" TEXT, "error" TEXT, "payload" JSONB,
    "externalId" TEXT, "dedupeKey" TEXT, "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegrationSyncLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IntegrationSyncLog_direction_chk" CHECK ("direction" IN ('OUTBOUND','INBOUND')),
    CONSTRAINT "IntegrationSyncLog_status_chk" CHECK ("status" IN ('PENDING','SENT','FAILED','SKIPPED','RECEIVED')),
    CONSTRAINT "IntegrationSyncLog_attempts_chk" CHECK ("attempts" >= 0))`,
  // The delivery job's scan: due rows by status + next attempt.
  `CREATE INDEX IF NOT EXISTS "ix_IntegrationSyncLog_due" ON "IntegrationSyncLog" ("status","nextAttemptAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_IntegrationSyncLog_endpoint_created" ON "IntegrationSyncLog" ("endpointId","createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_IntegrationSyncLog_entity" ON "IntegrationSyncLog" ("entityType","entityId")`,
  // Idempotency: one outbound row per record state version, one RECEIVED row per
  // external id. Enforced in the database so overlapping job runs and a sender's
  // retries can never duplicate. Failed inbound attempts carry NULL and are exempt.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_IntegrationSyncLog_endpoint_dedupe" ON "IntegrationSyncLog" ("endpointId","dedupeKey") WHERE "dedupeKey" IS NOT NULL`,
];

const TABLES = ["IntegrationEndpoint", "IntegrationSyncLog"];

async function main() {
  console.log("Applying integration framework DDL…\n");
  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].slice(0, 78);
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ✓ ${label}`);
  }
  // Verify rather than trust: IF NOT EXISTS reports success either way.
  console.log("\nVerifying…");
  for (const t of TABLES) {
    const r = await prisma.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*)::bigint AS c FROM "${t}"`);
    console.log(`  ${t}: ${r[0].c} rows`);
  }
  const idx = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM pg_indexes WHERE indexname = 'uq_IntegrationSyncLog_endpoint_dedupe'`
  );
  if (Number(idx[0].n) !== 1) throw new Error("Idempotency index uq_IntegrationSyncLog_endpoint_dedupe is missing.");
  console.log("\n✅  Integration tables ready. JSL SAS: awaiting API specification; configure on /configuration/integrations.");
}

main()
  .catch((e) => {
    console.error("❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
