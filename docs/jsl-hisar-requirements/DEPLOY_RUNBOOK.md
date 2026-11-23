# JSL Hisar build: deploy runbook

Covers every module built for the JSL Hisar requirement list (see `GAP_ANALYSIS.md`). Nothing here has been run against production yet.

## Why order matters

Each module's SQLAlchemy models select every mapped column. If the backend deploys before its tables exist, those screens return 500. Two existing screens are affected too: `/fire-safety` and the IMS dashboard both query the new `FireInspection` table. So the order is: database scripts, then backend, then frontend.

Every script is additive and idempotent: `CREATE TABLE IF NOT EXISTS`, seed rows with `ON CONFLICT DO NOTHING`, and no drops. Each script verifies its own result at the end.

## 1. Database (run from `safeops_360`, against production)

Prerequisite: `apply-firesafety-ddl.ts` has already been applied. The fire module is live, so it should have been; the fire-inspection script checks for it.

```
npm run db:apply-ims                    && npm run db:apply-ims-permissions
npm run db:apply-fire-inspection        && npm run db:apply-fire-inspection-permissions
npm run db:apply-pha                    && npm run db:apply-pha-permissions
npm run db:apply-pssr-psi               && npm run db:apply-pssr-psi-permissions
npm run db:apply-knowledge-bank         && npm run db:apply-knowledge-bank-permissions
npm run db:apply-integrations           && npm run db:apply-integrations-permissions
npm run db:apply-csm                    && npm run db:apply-csm-permissions
```

| Module | New tables | Seeds | Permission codes |
|---|---|---|---|
| IMS / MIS | ToolboxTalk, ShowCauseNotice, SafetyMeeting, MeetingActionItem | none | IMS.READ / CREATE / UPDATE / CLOSE |
| QR fire inspections | FireChecklistTemplate, FireInspection, FireInspectionItem, FireEquipmentEvent | 12 checklists (IS 2190, 13039, 884, 2189, 15105, 12469, 3614, NBC) | FIRE.READ / INSPECT / MANAGE |
| HAZOP | PhaStudy, PhaTeamMember, PhaSession, PhaNode, PhaDeviation, PhaRecommendation | CAPA source `PHA_RECOMMENDATION` and SLA profile | PHA.READ / CREATE / UPDATE / APPROVE |
| PSSR + PSI | PssrTemplate, PssrTemplateItem, PssrReview, PssrItem, PssrSignoff, PsiDocument | default 45-item PSSR template; CAPA source `PSSR_PUNCH` | PSSR.READ / MANAGE / SIGNOFF, PSI.READ / MANAGE |
| Knowledge bank | KbCategory, KbDocument, KbDocumentVersion, KbAcknowledgement, KbView | 10 categories | KB.READ (every role, all plants), KB.MANAGE, KB.APPROVE |
| Integrations (SAS) | IntegrationEndpoint, IntegrationSyncLog | JSL_SAS template (placeholder field names) | INTEGRATION.READ / MANAGE |
| CSM | 9 tables (prequalification, templates, work orders, roster, evaluations, sanctions, portal tokens) | steel-plant prequalification template | CSM.READ / MANAGE / APPROVE / EVALUATE |

No script ALTERs an existing table.

## 2. Backend (`safeops_360_bakend`, Azure)

- **New dependencies:** `pypdf` and `python-docx` are now in `pyproject.toml` and `requirements.txt`. The knowledge bank needs them for text extraction and PTW scan uses `pypdf`. Make sure the image rebuilds its dependencies.
- **New routers in `app/main.py`:**
  - `ims`, `pha`, `pssr`, `psi`, `knowledge_bank`, `integrations`, `csm`, `csm_ops`, `csm_portal`, `observation_reporting` (mounted before `observations`), and `ptw_cc` (mounted before `ptw`).
  - All are ungated like `fire_safety`, with RBAC checked per endpoint. The exception is `ptw_cc`, which is mapped to the PTW licence module.
- **`csm_portal`:** unauthenticated by design. A contractor fills its prequalification through a hashed, expiring token, following the `supplier_portal` precedent.
- **New scheduler job:** `integration_sync` runs every 60 s. It skips cleanly until the integration tables exist.
- **Optional env vars:**
  - `INTEGRATION_JSL_SAS_KEY`: outbound auth to SAS.
  - `INTEGRATION_JSL_SAS_INBOUND_KEY`: the key SAS sends as `X-API-Key`. SAS must call the backend URL directly, because the Next.js proxy does not forward API keys.
  - `AI_SNAP_REPORT=0`: disables photo reading. Otherwise it is on whenever `ANTHROPIC_API_KEY` is set.

## 3. Frontend (`safeops_360`, Vercel)

- **New dependency:** `qrcode`, used for the fire QR label sheets.
- **New sidebar sections:**
  - IMS / MIS
  - Process Safety
  - Contractor Safety (CSM)
  - Knowledge Bank
  - Fire inspection entries under Operational Safety
  - Integrations under Configuration
- **Visibility:** each entry is permission-gated, so it stays hidden until step 1's permission scripts have run.
- **Public routes:** `/contractor-prequal/[token]` (contractor portal) and `/q/fire/[code]` (QR scan; a signed-out user is sent to login and returned to the asset).

## 4. Smoke test after deploy

| Area | Check |
|---|---|
| `/ims` | Tiles load; schedule a meeting, mark it held, add an action, publish the minutes. |
| `/fire-safety/labels` | Print one label. Scan it with a phone: the checklist opens. Submit with a critical item failed: a CAPA is raised. |
| `/ptw` | Control Center tab refreshes every 30 s. Scan a paper permit photo: the permit form is prefilled. |
| `/observations` | The Quick photo report fills type, category and severity in about 3 taps. The Live tab refreshes. |
| `/process-safety/hazop` | Create a study, add a node, generate deviations, raise a recommendation, then approve. |
| `/process-safety/pssr` | Start from an MOC, answer items, sign off, check the go/no-go result. |
| `/process-safety/chemicals` | Run the compatibility check on two chemicals. |
| `/knowledge-bank` | Upload a PDF, publish it, search it, ask a question and get a cited answer. |
| `/csm` | Send a prequalification link, approve it, create a work order, evaluate, then blacklist and confirm the gate refuses the contractor. |
| `/configuration/integrations` | The JSL_SAS endpoint runs in dry-run and the sync log fills with SKIPPED payloads. |

## Known limits / open items
- **JSL SAS:** real field names, URL and auth are unknown. The mapping is configurable and the screen is labelled "Awaiting JSL SAS API specification".
- **PSSR's HAZOP link:** still free text. HAZOP now exists, so this can become a dropdown.
- **Suspension end dates:** CSM `effectiveUntil` doesn't lift a suspension automatically; reinstatement is a manual request.
- **Knowledge bank:**
  - Scanned PDFs and images aren't OCR'd, so they aren't searchable.
  - Search matches whole words ("permits" ≠ "permit").
- **PTW scan:**
  - PDFs over about 3 MB are refused (proxy body limit), and the user is asked to photograph the pages instead.
  - The attached scan isn't listed on the permit detail page yet.
- **Still mock pages:** `/industrial-hygiene`, `/occupational-health` and `/bbs` remain Phase2Scaffold. They aren't in the client list and aren't in the sidebar.
