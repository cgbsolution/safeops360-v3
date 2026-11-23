// DDL applier for the IMS / MIS governance registers (JSL Hisar requirement #8).
//
//   ToolboxTalk        — plant TBT register
//   ShowCauseNotice    — disciplinary show-cause notices for safety violations
//   SafetyMeeting      — safety committee / apex / departmental meetings
//   MeetingActionItem  — the MOM tracker (action points from the minutes)
//
// Four NEW tables, no ALTERs on existing tables, so this is additive and
// idempotent, and safe to re-run. Mock drills reuse FireDrill (apply-firesafety-ddl.ts).
//
// ORDER: run this BEFORE the backend that carries app/models/ims.py serves
// /api/ims traffic. The rest of the backend does not read these tables, so an
// un-migrated database only breaks the IMS screens, nothing else.
//
// Also run prisma/apply-ims-permissions.ts, or every IMS endpoint returns 403.
//
//   npx tsx prisma/apply-ims-ddl.ts     (or: npm run db:apply-ims)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOFT_DELETE = `"isDeleted" BOOLEAN NOT NULL DEFAULT false, "deletedAt" TIMESTAMP(3), "deletedBy" TEXT, "deletionReason" TEXT`;

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "ToolboxTalk" (
    "id" TEXT NOT NULL, "talkNo" TEXT NOT NULL, "plantId" TEXT NOT NULL, "areaId" TEXT, "department" TEXT,
    "topic" TEXT NOT NULL, "keyPoints" TEXT, "language" TEXT, "conductedAt" TIMESTAMP(3) NOT NULL,
    "conductedById" TEXT NOT NULL, "durationMinutes" INTEGER,
    "employeeCount" INTEGER NOT NULL DEFAULT 0, "contractorCount" INTEGER NOT NULL DEFAULT 0,
    "contractorCompanyId" TEXT, "permitId" TEXT, "photoUrl" TEXT,
    ${SOFT_DELETE},
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToolboxTalk_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ToolboxTalk_counts_chk" CHECK ("employeeCount" >= 0 AND "contractorCount" >= 0))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ToolboxTalk_talkNo_key" ON "ToolboxTalk" ("talkNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_ToolboxTalk_plant_conducted" ON "ToolboxTalk" ("plantId","conductedAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_ToolboxTalk_isDeleted" ON "ToolboxTalk" ("isDeleted")`,

  `CREATE TABLE IF NOT EXISTS "ShowCauseNotice" (
    "id" TEXT NOT NULL, "noticeNo" TEXT NOT NULL, "plantId" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL, "recipientName" TEXT NOT NULL, "recipientUserId" TEXT, "contractorCompanyId" TEXT,
    "violationCategory" TEXT NOT NULL, "violationDetails" TEXT NOT NULL, "violationAt" TIMESTAMP(3),
    "sourceType" TEXT, "sourceId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL, "issuedById" TEXT NOT NULL, "replyDueDate" TIMESTAMP(3) NOT NULL,
    "replyReceivedAt" TIMESTAMP(3), "replyText" TEXT,
    "decision" TEXT, "decisionNotes" TEXT, "penaltyAmount" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'ISSUED', "closedAt" TIMESTAMP(3), "closedById" TEXT,
    ${SOFT_DELETE},
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShowCauseNotice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShowCauseNotice_status_chk" CHECK ("status" IN ('ISSUED','REPLY_RECEIVED','CLOSED')),
    CONSTRAINT "ShowCauseNotice_recipient_chk" CHECK ("recipientType" IN ('EMPLOYEE','CONTRACTOR_WORKER','CONTRACTOR_COMPANY')))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ShowCauseNotice_noticeNo_key" ON "ShowCauseNotice" ("noticeNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_ShowCauseNotice_plant_status" ON "ShowCauseNotice" ("plantId","status")`,
  `CREATE INDEX IF NOT EXISTS "ix_ShowCauseNotice_isDeleted" ON "ShowCauseNotice" ("isDeleted")`,

  `CREATE TABLE IF NOT EXISTS "SafetyMeeting" (
    "id" TEXT NOT NULL, "meetingNo" TEXT NOT NULL, "plantId" TEXT NOT NULL, "meetingType" TEXT NOT NULL,
    "title" TEXT NOT NULL, "scheduledAt" TIMESTAMP(3) NOT NULL, "heldAt" TIMESTAMP(3), "venue" TEXT,
    "chairpersonId" TEXT, "secretaryId" TEXT, "attendeeUserIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "workerRepCount" INTEGER, "managementRepCount" INTEGER, "agenda" TEXT, "minutes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED', "minutesPublishedAt" TIMESTAMP(3), "cancelReason" TEXT,
    ${SOFT_DELETE},
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SafetyMeeting_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SafetyMeeting_status_chk" CHECK ("status" IN ('SCHEDULED','HELD','MINUTES_PUBLISHED','CANCELLED')))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SafetyMeeting_meetingNo_key" ON "SafetyMeeting" ("meetingNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_SafetyMeeting_plant_scheduled" ON "SafetyMeeting" ("plantId","scheduledAt")`,
  `CREATE INDEX IF NOT EXISTS "ix_SafetyMeeting_isDeleted" ON "SafetyMeeting" ("isDeleted")`,

  `CREATE TABLE IF NOT EXISTS "MeetingActionItem" (
    "id" TEXT NOT NULL, "meetingId" TEXT NOT NULL REFERENCES "SafetyMeeting"("id"), "plantId" TEXT NOT NULL,
    "itemNo" INTEGER NOT NULL, "description" TEXT NOT NULL, "ownerUserId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "closureNote" TEXT,
    "closedAt" TIMESTAMP(3), "closedById" TEXT, "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingActionItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MeetingActionItem_status_chk" CHECK ("status" IN ('OPEN','IN_PROGRESS','CLOSED','DROPPED')))`,
  // Item numbers are per meeting ("MOM point 3 of MTG-2026-0004"). Enforced in
  // the database so two people adding points at once cannot both get #3.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_MeetingActionItem_meeting_item" ON "MeetingActionItem" ("meetingId","itemNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_MeetingActionItem_meeting" ON "MeetingActionItem" ("meetingId")`,
  `CREATE INDEX IF NOT EXISTS "ix_MeetingActionItem_plant_status" ON "MeetingActionItem" ("plantId","status")`,
];

const TABLES = ["ToolboxTalk", "ShowCauseNotice", "SafetyMeeting", "MeetingActionItem"];

async function main() {
  console.log("Applying IMS / MIS DDL…\n");
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
  // FireDrill is reused for mock drills; the schedule endpoint fails without it.
  const fd = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_name = 'FireDrill'`
  );
  if (Number(fd[0].n) === 0) {
    console.warn("\n  ⚠ FireDrill table is missing: run prisma/apply-firesafety-ddl.ts too, or mock drill scheduling will 500.");
  }
  console.log("\n✅  IMS tables ready.");
}

main()
  .catch((e) => {
    console.error("❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
