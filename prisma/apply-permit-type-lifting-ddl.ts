// Adds LIFTING to the Postgres "PermitType" enum. schema.prisma and the backend
// (app/models/permit.py) already have it and the wizard offers "Lifting
// Operations", but the DB enum was never migrated — so submitting a Lifting
// permit failed on INSERT with `invalid input value for enum "PermitType"`.
// Additive + idempotent; existing rows are untouched.
//   npx tsx prisma/apply-permit-type-lifting-ddl.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TYPE "PermitType" ADD VALUE IF NOT EXISTS 'LIFTING' BEFORE 'GENERAL_COLD'`);
  const rows = await prisma.$queryRawUnsafe<{ v: string }[]>(
    `SELECT e.enumlabel AS v FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'PermitType' ORDER BY e.enumsortorder`
  );
  console.log("PermitType:", rows.map((r) => r.v).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
