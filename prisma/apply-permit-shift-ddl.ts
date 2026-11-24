// Adds Permit.shiftId — the shift a permit's work is planned in — and backfills
// it for existing permits from validFrom's plant-local (IST) time.
//
//   npx tsx prisma/apply-permit-shift-ddl.ts        (npm run db:apply-permit-shift)
//
// ⚠ ORDERING: the backend's SQLAlchemy Permit model and the frontend's Prisma
// Permit model both map this column, and both select every mapped column. Run
// this BEFORE deploying that code, or every permit query 500s.
//
// FK by value to MasterItem(type = 'SHIFT') — the same list incidents and near
// misses use, and the one the PTW Control Center's shift filter reads.
// Backfill rules match app/services/ptw_ops/shifts.py:shift_at — only ACTIVE
// shifts with startHour/endHour count; on an overlap the shift that started
// most recently wins; a time in a gap between shifts stays NULL.
// Additive and idempotent: only rows with shiftId IS NULL are touched.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BACKFILL = `
UPDATE "Permit" p SET "shiftId" = x.sid
FROM (
  SELECT p2.id AS pid,
    (SELECT m.id FROM "MasterItem" m
      WHERE m.type = 'SHIFT' AND m.active
        AND (m.metadata->>'startHour') IS NOT NULL AND (m.metadata->>'endHour') IS NOT NULL
        AND (
          ((m.metadata->>'startHour')::int < (m.metadata->>'endHour')::int % 24
            AND t.h >= (m.metadata->>'startHour')::int AND t.h < (m.metadata->>'endHour')::int % 24)
          OR ((m.metadata->>'startHour')::int >= (m.metadata->>'endHour')::int % 24
            AND (t.h >= (m.metadata->>'startHour')::int OR t.h < (m.metadata->>'endHour')::int % 24))
        )
      ORDER BY mod((t.h - (m.metadata->>'startHour')::int + 24)::numeric, 24), m."sortOrder"
      LIMIT 1) AS sid
  FROM "Permit" p2
  CROSS JOIN LATERAL (
    SELECT extract(hour FROM (p2."validFrom" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'))
         + extract(minute FROM (p2."validFrom" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) / 60.0 AS h
  ) t
  WHERE p2."shiftId" IS NULL
) x
WHERE p.id = x.pid AND x.sid IS NOT NULL`;

async function main() {
  console.log("→ Permit.shiftId DDL\n");
  await prisma.$executeRawUnsafe(`ALTER TABLE "Permit" ADD COLUMN IF NOT EXISTS "shiftId" TEXT`);
  console.log(`  ✓ ALTER TABLE "Permit" ADD COLUMN IF NOT EXISTS "shiftId" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Permit_shiftId_idx" ON "Permit" ("shiftId")`);
  console.log(`  ✓ CREATE INDEX IF NOT EXISTS "Permit_shiftId_idx"`);
  const n = await prisma.$executeRawUnsafe(BACKFILL);
  console.log(`  ✓ backfilled shiftId on ${n} permit(s) from validFrom (IST)`);
  const rows = await prisma.$queryRawUnsafe<{ code: string | null; n: bigint }[]>(
    `SELECT m.code, count(*)::bigint AS n FROM "Permit" p LEFT JOIN "MasterItem" m ON m.id = p."shiftId"
      GROUP BY m.code ORDER BY m.code NULLS LAST`
  );
  console.log("\n  permits by shift:", rows.map((r) => `${r.code ?? "none (gap)"}=${r.n}`).join(", "));
  console.log("\n✅ Permit.shiftId in place.");
}

main()
  .catch((e) => {
    console.error("❌ DDL failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
