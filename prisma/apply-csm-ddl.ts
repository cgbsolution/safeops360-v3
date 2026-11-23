// DDL applier for Contractor Safety Management (CSM), JSL Hisar requirement:
// "CSM end to end process, from contractor qualification to contractor evaluation".
//
//   CsmQuestionnaireTemplate  prequalification questionnaire (sections/questions JSON)
//   CsmPrequalification       one application: answers, scores, workflow, validity
//   CsmPortalToken            tokenised contractor link (hash only, expiring, revocable)
//   CsmPortalAccessLog        every portal attempt, for forensics
//   CsmDocument               contractor documents with expiry dates
//   CsmWorkOrder              contract / work order with the safety checklist
//   CsmWorkOrderWorker        work-order roster (existing ContractorWorker rows)
//   CsmEvaluation             periodic / contract-end performance evaluation
//   CsmSanction               suspend / blacklist / reinstate with approval
//
// NINE NEW tables. No ALTER on any existing table: the contractor master stays
// ContractorCompany (written to by CSM through columns it already has), and
// plant mobilisation uses a work-order roster instead of adding plantId to
// ConstructionSite. Additive, idempotent, safe to re-run.
//
// ORDER: run this BEFORE deploying the backend that carries app/models/csm.py.
// Only the CSM routers read these tables, so an un-migrated database breaks the
// CSM screens and nothing else (the EPC gate change reads no new column).
//
// It also seeds the default steel-plant prequalification template, ACTIVE, so
// a contractor can be registered on day one. The seed is generated from
// app/services/csm.py DEFAULT_TEMPLATE (do not hand-edit; regenerate).
//
// Then run prisma/apply-csm-permissions.ts, or every CSM endpoint returns 403.
//
//   npx tsx prisma/apply-csm-ddl.ts     (or: npm run db:apply-csm)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOFT_DELETE = `"isDeleted" BOOLEAN NOT NULL DEFAULT false, "deletedAt" TIMESTAMP(3), "deletedBy" TEXT, "deletionReason" TEXT`;
const STAMPS = `"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`;

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "CsmQuestionnaireTemplate" (
    "id" TEXT NOT NULL, "code" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "name" TEXT NOT NULL,
    "description" TEXT, "status" TEXT NOT NULL DEFAULT 'DRAFT', "sections" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "passScore" DOUBLE PRECISION NOT NULL DEFAULT 70, "conditionalScore" DOUBLE PRECISION NOT NULL DEFAULT 55,
    "validityMonths" INTEGER NOT NULL DEFAULT 12, "conditionalValidityMonths" INTEGER NOT NULL DEFAULT 6,
    "activatedAt" TIMESTAMP(3), "createdBy" TEXT,
    ${SOFT_DELETE}, ${STAMPS},
    CONSTRAINT "CsmQuestionnaireTemplate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CsmQuestionnaireTemplate_status_chk" CHECK ("status" IN ('DRAFT','ACTIVE','RETIRED')),
    CONSTRAINT "CsmQuestionnaireTemplate_scores_chk" CHECK ("conditionalScore" <= "passScore" AND "passScore" <= 100))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_CsmQuestionnaireTemplate_code_version" ON "CsmQuestionnaireTemplate" ("code","version")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmQuestionnaireTemplate_isDeleted" ON "CsmQuestionnaireTemplate" ("isDeleted")`,

  `CREATE TABLE IF NOT EXISTS "CsmPrequalification" (
    "id" TEXT NOT NULL, "applicationNo" TEXT NOT NULL, "contractorCompanyId" TEXT NOT NULL REFERENCES "ContractorCompany"("id"),
    "plantId" TEXT NOT NULL, "templateId" TEXT NOT NULL, "templateSnapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "status" TEXT NOT NULL DEFAULT 'DRAFT', "answers" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "overrides" JSONB NOT NULL DEFAULT '{}'::jsonb, "autoScore" DOUBLE PRECISION, "finalScore" DOUBLE PRECISION,
    "criticalFailures" JSONB NOT NULL DEFAULT '[]'::jsonb, "recommendation" TEXT, "reviewNotes" TEXT, "conditions" TEXT,
    "decision" TEXT, "decisionNotes" TEXT, "validFrom" TIMESTAMP(3), "validUntil" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false, "isRenewal" BOOLEAN NOT NULL DEFAULT false, "previousPrequalificationId" TEXT,
    "submittedVia" TEXT, "submittedAt" TIMESTAMP(3), "submittedByName" TEXT, "reviewStartedAt" TIMESTAMP(3), "reviewerId" TEXT,
    "recommendedAt" TIMESTAMP(3), "recommendedById" TEXT, "decidedAt" TIMESTAMP(3), "decidedById" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]'::jsonb, "createdBy" TEXT,
    ${SOFT_DELETE}, ${STAMPS},
    CONSTRAINT "CsmPrequalification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CsmPrequalification_status_chk" CHECK ("status" IN ('DRAFT','SUBMITTED','HSE_REVIEW','APPROVAL','QUALIFIED','CONDITIONAL','REJECTED','WITHDRAWN')),
    CONSTRAINT "CsmPrequalification_rec_chk" CHECK ("recommendation" IS NULL OR "recommendation" IN ('QUALIFIED','CONDITIONAL','REJECTED')),
    CONSTRAINT "CsmPrequalification_via_chk" CHECK ("submittedVia" IS NULL OR "submittedVia" IN ('PORTAL','INTERNAL')))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CsmPrequalification_applicationNo_key" ON "CsmPrequalification" ("applicationNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmPrequalification_company" ON "CsmPrequalification" ("contractorCompanyId")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmPrequalification_plant_status" ON "CsmPrequalification" ("plantId","status")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmPrequalification_isDeleted" ON "CsmPrequalification" ("isDeleted")`,

  `CREATE TABLE IF NOT EXISTS "CsmPortalToken" (
    "id" TEXT NOT NULL, "prequalificationId" TEXT NOT NULL REFERENCES "CsmPrequalification"("id"),
    "contractorCompanyId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "tokenPrefix" TEXT NOT NULL,
    "contactEmail" TEXT, "contactName" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT, "revokedReason" TEXT, "lastAccessedAt" TIMESTAMP(3), "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdById" TEXT,
    CONSTRAINT "CsmPortalToken_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CsmPortalToken_tokenHash_key" ON "CsmPortalToken" ("tokenHash")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmPortalToken_prequal" ON "CsmPortalToken" ("prequalificationId")`,

  `CREATE TABLE IF NOT EXISTS "CsmPortalAccessLog" (
    "id" TEXT NOT NULL, "tokenId" TEXT, "tokenPrefix" TEXT, "outcome" TEXT NOT NULL, "action" TEXT NOT NULL,
    "isWrite" BOOLEAN NOT NULL DEFAULT false, "ipAddress" TEXT, "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CsmPortalAccessLog_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmPortalAccessLog_token" ON "CsmPortalAccessLog" ("tokenId","createdAt")`,

  `CREATE TABLE IF NOT EXISTS "CsmDocument" (
    "id" TEXT NOT NULL, "contractorCompanyId" TEXT NOT NULL REFERENCES "ContractorCompany"("id"),
    "prequalificationId" TEXT, "questionCode" TEXT, "docType" TEXT NOT NULL, "title" TEXT, "documentNo" TEXT,
    "fileName" TEXT NOT NULL, "storagePath" TEXT NOT NULL, "mimeType" TEXT, "fileSize" INTEGER,
    "issuedOn" TIMESTAMP(3), "expiresOn" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "uploadedVia" TEXT NOT NULL DEFAULT 'INTERNAL', "uploadedById" TEXT, "uploadedByName" TEXT,
    "verifiedAt" TIMESTAMP(3), "verifiedById" TEXT,
    ${SOFT_DELETE}, ${STAMPS},
    CONSTRAINT "CsmDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CsmDocument_status_chk" CHECK ("status" IN ('ACTIVE','SUPERSEDED','REJECTED')),
    CONSTRAINT "CsmDocument_via_chk" CHECK ("uploadedVia" IN ('INTERNAL','PORTAL')),
    CONSTRAINT "CsmDocument_dates_chk" CHECK ("expiresOn" IS NULL OR "issuedOn" IS NULL OR "expiresOn" > "issuedOn"))`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmDocument_company_type" ON "CsmDocument" ("contractorCompanyId","docType")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmDocument_expires" ON "CsmDocument" ("expiresOn")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmDocument_isDeleted" ON "CsmDocument" ("isDeleted")`,

  `CREATE TABLE IF NOT EXISTS "CsmWorkOrder" (
    "id" TEXT NOT NULL, "workOrderNo" TEXT NOT NULL, "contractorCompanyId" TEXT NOT NULL REFERENCES "ContractorCompany"("id"),
    "plantId" TEXT NOT NULL, "areaId" TEXT, "areaName" TEXT, "title" TEXT NOT NULL, "scope" TEXT NOT NULL,
    "workType" TEXT NOT NULL DEFAULT 'MAINTENANCE', "contractRef" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3) NOT NULL, "engineerInChargeId" TEXT,
    "estimatedManpower" INTEGER NOT NULL DEFAULT 0, "supervisorCount" INTEGER,
    "highRiskActivities" JSONB NOT NULL DEFAULT '[]'::jsonb, "safetyChecklist" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "safetyNotes" TEXT, "status" TEXT NOT NULL DEFAULT 'DRAFT', "activatedAt" TIMESTAMP(3), "activatedById" TEXT,
    "suspendedReason" TEXT, "completedAt" TIMESTAMP(3), "closureNotes" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]'::jsonb, "createdBy" TEXT,
    ${SOFT_DELETE}, ${STAMPS},
    CONSTRAINT "CsmWorkOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CsmWorkOrder_status_chk" CHECK ("status" IN ('DRAFT','ACTIVE','SUSPENDED','COMPLETED','CANCELLED')),
    CONSTRAINT "CsmWorkOrder_type_chk" CHECK ("workType" IN ('MAINTENANCE','AMC','SHUTDOWN','PROJECT','SERVICE','OTHER')),
    CONSTRAINT "CsmWorkOrder_dates_chk" CHECK ("endDate" > "startDate"),
    CONSTRAINT "CsmWorkOrder_manpower_chk" CHECK ("estimatedManpower" >= 0 AND ("supervisorCount" IS NULL OR "supervisorCount" >= 0)))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CsmWorkOrder_workOrderNo_key" ON "CsmWorkOrder" ("workOrderNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmWorkOrder_plant_status" ON "CsmWorkOrder" ("plantId","status")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmWorkOrder_company" ON "CsmWorkOrder" ("contractorCompanyId")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmWorkOrder_isDeleted" ON "CsmWorkOrder" ("isDeleted")`,

  `CREATE TABLE IF NOT EXISTS "CsmWorkOrderWorker" (
    "id" TEXT NOT NULL, "workOrderId" TEXT NOT NULL REFERENCES "CsmWorkOrder"("id"),
    "contractorWorkerId" TEXT NOT NULL REFERENCES "ContractorWorker"("id"), "contractorCompanyId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL, "tradeAtSite" TEXT, "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "inductionAt" TIMESTAMP(3), "inductionValidUntil" TIMESTAMP(3), "inductionById" TEXT,
    "lastCheck" JSONB, "lastCheckedAt" TIMESTAMP(3), "gatePassNo" TEXT, "gatePassValidUntil" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3), "createdBy" TEXT, ${STAMPS},
    CONSTRAINT "CsmWorkOrderWorker_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CsmWorkOrderWorker_status_chk" CHECK ("status" IN ('PROPOSED','CLEARED','BLOCKED','RELEASED')))`,
  // One roster row per worker per work order; the gate-pass number is unique.
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_CsmWorkOrderWorker_wo_worker" ON "CsmWorkOrderWorker" ("workOrderId","contractorWorkerId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_CsmWorkOrderWorker_gatePassNo" ON "CsmWorkOrderWorker" ("gatePassNo") WHERE "gatePassNo" IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmWorkOrderWorker_company_status" ON "CsmWorkOrderWorker" ("contractorCompanyId","status")`,

  `CREATE TABLE IF NOT EXISTS "CsmEvaluation" (
    "id" TEXT NOT NULL, "evaluationNo" TEXT NOT NULL, "contractorCompanyId" TEXT NOT NULL REFERENCES "ContractorCompany"("id"),
    "plantId" TEXT NOT NULL, "workOrderId" TEXT, "evaluationType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL,
    "kpis" JSONB NOT NULL DEFAULT '[]'::jsonb, "counts" JSONB NOT NULL DEFAULT '{}'::jsonb, "manual" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "autoScore" DOUBLE PRECISION, "manualScore" DOUBLE PRECISION, "finalScore" DOUBLE PRECISION, "ratingBand" TEXT,
    "evaluatorRemarks" TEXT, "status" TEXT NOT NULL DEFAULT 'DRAFT', "evaluatorId" TEXT, "submittedAt" TIMESTAMP(3),
    "signedOffById" TEXT, "signedOffAt" TIMESTAMP(3), "signOffNotes" TEXT, "createdBy" TEXT,
    ${SOFT_DELETE}, ${STAMPS},
    CONSTRAINT "CsmEvaluation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CsmEvaluation_status_chk" CHECK ("status" IN ('DRAFT','SUBMITTED','SIGNED_OFF')),
    CONSTRAINT "CsmEvaluation_type_chk" CHECK ("evaluationType" IN ('MONTHLY','QUARTERLY','CONTRACT_END')),
    CONSTRAINT "CsmEvaluation_band_chk" CHECK ("ratingBand" IS NULL OR "ratingBand" IN ('EXCELLENT','GOOD','AVERAGE','POOR','UNACCEPTABLE')),
    CONSTRAINT "CsmEvaluation_period_chk" CHECK ("periodEnd" > "periodStart"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CsmEvaluation_evaluationNo_key" ON "CsmEvaluation" ("evaluationNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmEvaluation_company_period" ON "CsmEvaluation" ("contractorCompanyId","periodEnd")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmEvaluation_plant_status" ON "CsmEvaluation" ("plantId","status")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmEvaluation_isDeleted" ON "CsmEvaluation" ("isDeleted")`,

  `CREATE TABLE IF NOT EXISTS "CsmSanction" (
    "id" TEXT NOT NULL, "sanctionNo" TEXT NOT NULL, "contractorCompanyId" TEXT NOT NULL REFERENCES "ContractorCompany"("id"),
    "plantId" TEXT NOT NULL, "action" TEXT NOT NULL, "reasonCategory" TEXT NOT NULL, "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]'::jsonb, "effectiveUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL', "previousStatus" TEXT,
    "requestedById" TEXT NOT NULL, "requestedAt" TIMESTAMP(3) NOT NULL, "decidedById" TEXT, "decidedAt" TIMESTAMP(3),
    "decisionNotes" TEXT, ${STAMPS},
    CONSTRAINT "CsmSanction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CsmSanction_action_chk" CHECK ("action" IN ('SUSPEND','BLACKLIST','REINSTATE')),
    CONSTRAINT "CsmSanction_status_chk" CHECK ("status" IN ('PENDING_APPROVAL','APPROVED','REJECTED')))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CsmSanction_sanctionNo_key" ON "CsmSanction" ("sanctionNo")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmSanction_company" ON "CsmSanction" ("contractorCompanyId")`,
  `CREATE INDEX IF NOT EXISTS "ix_CsmSanction_plant_status" ON "CsmSanction" ("plantId","status")`,
];

const TABLES = [
  "CsmQuestionnaireTemplate", "CsmPrequalification", "CsmPortalToken", "CsmPortalAccessLog", "CsmDocument",
  "CsmWorkOrder", "CsmWorkOrderWorker", "CsmEvaluation", "CsmSanction",
];

// ── seed: default steel-plant prequalification template ─────────────────────
// Generated from app/services/csm.py DEFAULT_TEMPLATE["sections"].
// BEGIN DEFAULT_SECTIONS
const DEFAULT_SECTIONS = [
  {
    "code": "POLICY",
    "title": "HSE policy and leadership",
    "weight": 10,
    "questions": [
      {
        "code": "HSE_POLICY_EXISTS",
        "text": "Do you have a written HSE policy signed by your top management?",
        "answerType": "YES_NO",
        "weight": 3
      },
      {
        "code": "HSE_POLICY_DOC",
        "text": "Upload the signed HSE policy.",
        "answerType": "DOCUMENT_REQUIRED",
        "weight": 3,
        "docType": "HSE_POLICY"
      },
      {
        "code": "HSE_OBJECTIVES",
        "text": "How are HSE objectives set and reviewed? (1 = none, 5 = annual targets reviewed by management)",
        "answerType": "SCALE_1_5",
        "weight": 2
      },
      {
        "code": "MGMT_REVIEW",
        "text": "Does top management review HSE performance at least every quarter?",
        "answerType": "YES_NO",
        "weight": 2
      }
    ]
  },
  {
    "code": "ORGANISATION",
    "title": "Organisation and safety officer",
    "weight": 12,
    "questions": [
      {
        "code": "SAFETY_OFFICER",
        "text": "Do you employ a full-time qualified safety officer (diploma in industrial safety)?",
        "answerType": "YES_NO",
        "weight": 4,
        "critical": true
      },
      {
        "code": "SAFETY_OFFICER_DETAILS",
        "text": "Name, qualification and phone number of the safety officer.",
        "answerType": "TEXT",
        "weight": 0,
        "required": true
      },
      {
        "code": "SAFETY_OFFICER_CERT",
        "text": "Upload the safety officer's qualification certificate.",
        "answerType": "DOCUMENT_REQUIRED",
        "weight": 2,
        "docType": "SAFETY_OFFICER_QUALIFICATION"
      },
      {
        "code": "SUPERVISOR_RATIO",
        "text": "How many workers does one supervisor control on a typical job?",
        "answerType": "NUMBER",
        "weight": 2,
        "bands": [
          {
            "max": 10,
            "score": 1
          },
          {
            "max": 15,
            "score": 0.7
          },
          {
            "max": 25,
            "score": 0.3
          },
          {
            "max": null,
            "score": 0
          }
        ]
      },
      {
        "code": "SAFETY_COMMITTEE",
        "text": "Do you hold a monthly safety meeting with worker representatives?",
        "answerType": "YES_NO",
        "weight": 2
      },
      {
        "code": "HSE_ROLES",
        "text": "How clearly are HSE roles defined for site in-charges and supervisors? (1 = not defined, 5 = written and trained)",
        "answerType": "SCALE_1_5",
        "weight": 2
      }
    ]
  },
  {
    "code": "PERFORMANCE",
    "title": "Safety performance, last 3 years",
    "weight": 20,
    "questions": [
      {
        "code": "MANHOURS_3Y",
        "text": "Total man-hours worked in the last 3 years.",
        "answerType": "NUMBER",
        "weight": 0,
        "required": true
      },
      {
        "code": "LTIFR_3Y",
        "text": "Average LTIFR for the last 3 years (lost-time injuries x 1,000,000 / man-hours).",
        "answerType": "NUMBER",
        "weight": 8,
        "bands": [
          {
            "max": 0.5,
            "score": 1
          },
          {
            "max": 1.0,
            "score": 0.8
          },
          {
            "max": 2.0,
            "score": 0.5
          },
          {
            "max": 4.0,
            "score": 0.2
          },
          {
            "max": null,
            "score": 0
          }
        ]
      },
      {
        "code": "FATALITIES_3Y",
        "text": "Number of fatalities in the last 3 years.",
        "answerType": "NUMBER",
        "weight": 6,
        "critical": true,
        "bands": [
          {
            "max": 0,
            "score": 1
          },
          {
            "max": null,
            "score": 0
          }
        ]
      },
      {
        "code": "LTI_3Y",
        "text": "Number of lost-time injuries in the last 3 years.",
        "answerType": "NUMBER",
        "weight": 2,
        "bands": [
          {
            "max": 0,
            "score": 1
          },
          {
            "max": 2,
            "score": 0.6
          },
          {
            "max": 5,
            "score": 0.3
          },
          {
            "max": null,
            "score": 0
          }
        ]
      },
      {
        "code": "STATUTORY_NOTICES",
        "text": "Prohibitory or improvement notices received from authorities in the last 3 years.",
        "answerType": "NUMBER",
        "weight": 2,
        "bands": [
          {
            "max": 0,
            "score": 1
          },
          {
            "max": 1,
            "score": 0.5
          },
          {
            "max": null,
            "score": 0
          }
        ]
      },
      {
        "code": "INCIDENT_REPORTING",
        "text": "How mature is your incident reporting and investigation? (1 = none, 5 = all incidents incl. near misses investigated with CAPA)",
        "answerType": "SCALE_1_5",
        "weight": 2
      }
    ]
  },
  {
    "code": "STATUTORY",
    "title": "Statutory compliance",
    "weight": 22,
    "questions": [
      {
        "code": "LABOUR_LICENCE",
        "text": "Valid labour licence under the Contract Labour (R&A) Act.",
        "answerType": "DOCUMENT_REQUIRED",
        "weight": 5,
        "critical": true,
        "docType": "LABOUR_LICENCE"
      },
      {
        "code": "PF_REG",
        "text": "EPF registration and the latest remittance challan.",
        "answerType": "DOCUMENT_REQUIRED",
        "weight": 4,
        "critical": true,
        "docType": "PF_REGISTRATION"
      },
      {
        "code": "ESIC_REG",
        "text": "ESIC registration and the latest contribution challan.",
        "answerType": "DOCUMENT_REQUIRED",
        "weight": 4,
        "critical": true,
        "docType": "ESIC_REGISTRATION"
      },
      {
        "code": "WC_INSURANCE",
        "text": "Workmen's compensation / employee's compensation insurance covering every deployed worker.",
        "answerType": "DOCUMENT_REQUIRED",
        "weight": 5,
        "critical": true,
        "docType": "WC_INSURANCE"
      },
      {
        "code": "MIN_WAGES",
        "text": "Are wages paid at or above notified minimum wages, by bank transfer?",
        "answerType": "YES_NO",
        "weight": 2
      },
      {
        "code": "STATUTORY_REGISTERS",
        "text": "Do you maintain the statutory registers (workmen, wages, attendance, accidents)?",
        "answerType": "YES_NO",
        "weight": 2
      }
    ]
  },
  {
    "code": "CERTIFICATION",
    "title": "Management system certification",
    "weight": 8,
    "questions": [
      {
        "code": "ISO_45001",
        "text": "ISO 45001 certificate (current).",
        "answerType": "DOCUMENT_REQUIRED",
        "weight": 5,
        "docType": "ISO_45001"
      },
      {
        "code": "OTHER_ISO",
        "text": "Are you certified to ISO 14001 or ISO 9001?",
        "answerType": "YES_NO",
        "weight": 3
      }
    ]
  },
  {
    "code": "TRAINING",
    "title": "Training and competence",
    "weight": 10,
    "questions": [
      {
        "code": "INDUCTION",
        "text": "Does every worker receive an HSE induction before deployment?",
        "answerType": "YES_NO",
        "weight": 3
      },
      {
        "code": "TRAINING_SYSTEM",
        "text": "How mature is your training system? (1 = none, 5 = needs analysis, calendar, records and effectiveness checks)",
        "answerType": "SCALE_1_5",
        "weight": 3
      },
      {
        "code": "SKILLED_CERTS",
        "text": "Are specialised workers certified (welders, riggers, licensed electricians, crane operators)?",
        "answerType": "YES_NO",
        "weight": 2
      },
      {
        "code": "TRAINING_RECORDS",
        "text": "Upload training records for the last 12 months.",
        "answerType": "DOCUMENT_REQUIRED",
        "weight": 2,
        "docType": "TRAINING_RECORD"
      }
    ]
  },
  {
    "code": "PPE",
    "title": "Personal protective equipment",
    "weight": 6,
    "questions": [
      {
        "code": "PPE_ISSUE",
        "text": "Is PPE issued free of cost to every worker, with issue records?",
        "answerType": "YES_NO",
        "weight": 3
      },
      {
        "code": "PPE_STANDARD",
        "text": "Is the PPE you issue BIS or CE certified?",
        "answerType": "YES_NO",
        "weight": 2
      },
      {
        "code": "PPE_SPECIAL",
        "text": "Availability of task-specific PPE for steel-plant hazards (aluminised suits, full-body harness, SCBA). (1 = none, 5 = all, inspected)",
        "answerType": "SCALE_1_5",
        "weight": 1
      }
    ]
  },
  {
    "code": "EQUIPMENT",
    "title": "Tools and equipment fitness",
    "weight": 7,
    "questions": [
      {
        "code": "EQUIP_REGISTER",
        "text": "Do you keep an inventory of tools, tackles and equipment with inspection dates?",
        "answerType": "YES_NO",
        "weight": 2
      },
      {
        "code": "EQUIP_FITNESS",
        "text": "Third-party fitness certificates for lifting tools & tackles, cranes and pressure equipment (Factories Act s.28 / s.29).",
        "answerType": "DOCUMENT_REQUIRED",
        "weight": 3,
        "docType": "EQUIPMENT_FITNESS"
      },
      {
        "code": "ELECTRICAL_TOOLS",
        "text": "Are portable electrical tools inspected every month and protected by ELCB / RCCB?",
        "answerType": "YES_NO",
        "weight": 2
      }
    ]
  },
  {
    "code": "SUBCONTRACTING",
    "title": "Subcontracting control",
    "weight": 5,
    "questions": [
      {
        "code": "SUBCONTRACTS",
        "text": "Do you intend to subcontract any part of the work?",
        "answerType": "YES_NO",
        "weight": 1,
        "preferredAnswer": "NO"
      },
      {
        "code": "SUB_CONTROL",
        "text": "How do you control subcontractor HSE? (1 = no control, 5 = same prequalification, supervision and audits as your own workforce)",
        "answerType": "SCALE_1_5",
        "weight": 4
      }
    ]
  }
];
// END DEFAULT_SECTIONS

const SEED_TEMPLATE = {
  id: "csm-tpl-plant-contractor-pq-v1",
  code: "PLANT_CONTRACTOR_PQ",
  version: 1,
  name: "Plant contractor HSE prequalification",
  description: "Steel-plant prequalification for maintenance, AMC, shutdown and project contractors.",
  passScore: 70,
  conditionalScore: 55,
  validityMonths: 12,
  conditionalValidityMonths: 6,
};

async function main() {
  console.log("Applying CSM DDL…\n");
  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].slice(0, 78);
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ✓ ${label}`);
  }

  // ON CONFLICT DO NOTHING (no target) covers both the id and (code, version):
  // a template someone already edited or re-versioned is never overwritten.
  const t = SEED_TEMPLATE;
  const inserted = await prisma.$executeRawUnsafe(
    `INSERT INTO "CsmQuestionnaireTemplate"
       ("id","code","version","name","description","status","sections","passScore","conditionalScore",
        "validityMonths","conditionalValidityMonths","activatedAt","createdBy","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6::jsonb,$7,$8,$9,$10,CURRENT_TIMESTAMP,'system',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
     ON CONFLICT DO NOTHING`,
    t.id, t.code, t.version, t.name, t.description, JSON.stringify(DEFAULT_SECTIONS),
    t.passScore, t.conditionalScore, t.validityMonths, t.conditionalValidityMonths
  );
  console.log(`\n  ${inserted ? "✓ seeded" : "– already present:"} template ${t.code} v${t.version}`);

  // Verify rather than trust: IF NOT EXISTS reports success either way.
  console.log("\nVerifying…");
  for (const tbl of TABLES) {
    const r = await prisma.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*)::bigint AS c FROM "${tbl}"`);
    console.log(`  ${tbl}: ${r[0].c} rows`);
  }
  const active = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT count(*)::bigint AS c FROM "CsmQuestionnaireTemplate" WHERE "status" = 'ACTIVE' AND NOT "isDeleted"`
  );
  if (Number(active[0].c) === 0) {
    console.warn("\n  ⚠ No ACTIVE questionnaire template: contractor registration will refuse until one is activated.");
  }
  // CSM reads ContractorCompany / ContractorWorker (EPC tables) and the IMS
  // registers for the Contractor 360 and evaluation KPIs.
  for (const dep of ["ContractorCompany", "ContractorWorker", "ToolboxTalk", "ShowCauseNotice"]) {
    const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_name = $1`, dep
    );
    if (Number(r[0].n) === 0) console.warn(`  ⚠ ${dep} is missing: the CSM screens that read it will fail.`);
  }
  console.log("\n✅  CSM tables ready.");
}

main()
  .catch((e) => {
    console.error("❌  DDL apply failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
