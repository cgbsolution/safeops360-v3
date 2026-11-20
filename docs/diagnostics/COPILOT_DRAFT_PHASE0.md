# Copilot "Draft from Input": Phase 0 diagnostic

- **Date:** 2026-11-19.
- **Scope:** diagnostic only. No code, schema or config changed.
- **Live data:** read-only against the database in `safeops_360_bakend/.env`, which is the production Supabase; no staging DB exists. Two guards ran on every session, using the `tests/campaign/hira_calibration/live_db.py` pattern:
  - session `READ ONLY` (checked with `SHOW transaction_read_only`);
  - a client-side refusal of any statement that isn't a read.
- **Statements:** 52 sent, 0 refused.

Paths below are relative to:
- **BE** = `safeops_360_bakend/app/`
- **FE** = `safeops_360/`

---

## 0. Where the codebase differs from what the brief assumes

These need a decision before Phase 1. They are repeated with options in §10.

| # | The brief assumes | What the code and data show | Evidence |
|---|---|---|---|
| D1 | A per-**tenant** flag | **There is no tenant model.** Each deployment is single-tenant: `DEPLOYMENT_TENANT_ID = "default"`. `Plant` has no org/tenant column. The real scoping unit is `Plant`, then `Area`. | BE `services/access_scope.py:31`; FE `prisma/schema.prisma:305`; BE `models/signal_engine.py:31-34` |
| D2 | An Azure-hosted LLM (Azure OpenAI / Foundry) | **The only provider is the direct public Anthropic API.** There is no Azure, OpenAI or endpoint/base-URL setting anywhere. There are three separate client paths plus one direct frontend call. | BE `services/ai/anthropic_client.py:44-61`; `services/copilot/runtime.py:540-542`; `services/ai/capture_providers.py:191-197`; FE `src/lib/manhours/narrative.ts:24,79-104` |
| D3 | Originals stored in private Azure Blob | **Storage is Supabase Storage only.** It is one private bucket, `incident-attachments`, accessed through signed URLs (upload ~60 s, download 300 s). There is no Azure Blob. | BE `services/storage.py:1-35,91-133`; `core/config.py:29-31` |
| D4 | Offline capture is not built | **Offline capture IS built**, but only for the Field Capture PWA at `/capture`. It has a manifest, a hand-written service worker, a Dexie IndexedDB outbox with media blobs, a sync engine and chunked upload. Observation, NM and Incident forms and the Copilot have no offline support. | FE `public/manifest.json`, `public/sw.js`, `src/lib/capture/db.ts`, `src/lib/capture/sync.ts`, `src/components/capture/sw-registrar.tsx` |
| D5 | Voice notes can be drafted from | **There is no server-side speech-to-text.** `get_transcription_provider()` always returns a stub. Transcripts come only from the browser Web Speech API (hi-IN / en-IN), on the device. | BE `services/ai/capture_providers.py:51-72`; FE `src/components/capture/voice-recorder.tsx:24-47` |
| D6 | "Live API" verification | **Main = production.** The backend deploys `main` to Azure App Service and the frontend deploys `main` to Vercel production. No staging backend exists. Gate-1 live evidence therefore means running on production, behind the flag. | `.github/workflows/main_safeops-server.yml`; memory of earlier deploys |
| D7 | Severity chosen "per the tenant's matrix" | **Observation severity is already deterministic.** The server computes a suggestion from `SeverityMatrixRule` (40 rows, one per sub-category) plus `AreaHazardTier`. It then requires `severityOverrideReason` whenever the submitted severity differs. The AI should **not** pick severity freely. | BE `services/observation_severity.py`; `routers/observations.py:126+`; FE `prisma/schema.prisma:7789,7817` |
| D8 | A photo-to-observation copilot is new | **A chat-based version already ships** (commits 05b54f4 BE / 5885b6c FE, 2026-11-19). It has photo upload and camera in the Copilot panel and the `update_observation_draft` tool, which already validates plant, area, taxonomy and severity. It pre-fills the observation form through `FormBridge`. | BE `services/copilot/tools.py:334,1270-1320`, `services/copilot/photos.py`; FE `src/components/copilot/copilot-provider.tsx:46-58`, `src/app/(dashboard)/observations/observation-form.tsx:188-245` |

---

## a. Draft-target forms

All create paths run: browser → Next catch-all proxy `FE src/app/api/[...path]/route.ts` → FastAPI. CAPA is the exception and has its own proxy, `FE src/app/api/capa/route.ts`.

Common to every type:
- `number` and the reporter/observer/originator are server-derived, taken from `user.id`, never from the payload.
- `plantId` is checked with `db.get(Plant)`.

| Form | Prisma / SQLAlchemy | Create contract → endpoint | FE form | Required in contract (excluding server-derived) | Master-backed fields (table → stored as) | Photos |
|---|---|---|---|---|---|---|
| **Safety Observation** | `Observation` schema.prisma:514 / BE `models/observation.py:128` | `ObservationCreate` BE `schemas/observation.py:18` → `POST /api/observations` `routers/observations.py:126` | FE `src/app/(dashboard)/observations/observation-form.tsx` (POST :347) | `plantId`, `type`, `description` (≥10 chars + BBS quality gate), `date`. **Conditional:** `categoryCode` + `subCategoryCode` for UNSAFE_*; `category` for SAFE_*; `workersInvolved` for UNSAFE_ACT at HIGH/CRIT; `severityOverrideReason` if severity ≠ suggestion | Plant → ID ✔checked · Area → ID (FK only) · **ObservationTaxonomy** → codes, `validate_selection` BE `services/observation_taxonomy.py:164` + DB composite FK · Severity → enum, suggestion from SeverityMatrixRule/AreaHazardTier · User (responsible) → ID · ContractorCompany → ID · workers → User/ContractorWorker IDs ✔checked | `ObservationAttachment` (INITIAL_PHOTO…), two-phase signed upload **after** create: `POST /api/observations/{id}/attachments` :680 |
| **Near Miss** | `NearMiss` :807 / BE `models/near_miss.py:27` | `NearMissCreate` BE `schemas/near_miss.py:34` → `POST /api/near-miss` `routers/near_miss.py:364` | FE `src/app/(dashboard)/near-miss/near-miss-form.tsx` (POST :330) | `plantId`, `date` (not future), `description` (≥10), `potentialSeverity` | Department, Equipment, ContractorCompany, User → ID; **unknown ID silently nulled** (:403-412) · MasterItem SHIFT / ACTIVITY_TYPE / HAZARD_CATEGORY / ENERGY_SOURCE → ID, existence only, **`type` not checked** · Area → ID (not checked) | `NearMissAttachment`, after create, `POST /api/near-miss/{id}/attachments` :917 |
| **Incident** | `Incident` :1878 / BE `models/incident.py:48` | `IncidentCreate` BE `schemas/incident.py:62` → `POST /api/incidents` `routers/incidents.py:243` | FE `src/app/(dashboard)/incidents/incident-form.tsx` (POST :387) | `type`, `plantId`, `location` (free text), `date`, `description` (≥10) | Department, Permit, NearMiss → ID (null if unknown) · Equipment (rows dropped if unknown) · MasterItem SHIFT (**not validated**) · `activityBeingPerformed` is **free text in practice** · `bodyPart`, `natureOfInjury`, `severity` free text | `IncidentAttachment`, `POST /api/incidents/{id}/attachments` :1936 |
| **PTW** | `Permit` :1109 / BE `models/permit.py:187` | `PermitCreate` BE `schemas/permit.py:203` → `POST /api/ptw` `routers/ptw.py:140` | FE `src/app/(dashboard)/ptw/permit-form.tsx` (POST :735) | `type`, `plantId`, `location`, `scopeOfWork` (≥10), `validFrom`, `validTo`, `issuerId`, `receiverId` + server rules (issuer≠receiver≠originator, validity cap, competency) | User (issuer/receiver ✔checked; crew FK only) · Equipment (rows dropped if unknown) · `hazards[].hazardType` → enum `PermitHazardType` (BE `models/permit.py:121`) driving `PermitPrecautionItem` · MasterItem ISOLATION_TYPE (not validated) · `requiredPpe` **accepted but never persisted** | None on create; `PermitAttachment` via `POST /api/ptw/{id}/attachments` (BE `routers/ptw_lifecycle.py:860`) |
| **FLRA** | `FLRA` :1658 / BE `models/flra.py:33` | `FLRACreate` BE `schemas/flra.py:60` → `POST /api/flra` `routers/flra.py:106` | FE `src/app/(dashboard)/flra/flra-form.tsx` (POST :427) | `plantId`, `date`, `location`, `jobDescription` (≥10), `teamMemberIds` (≥1), `toolboxTalkById`, ≥1 hazard step (category, controls, L/S 1-5); residual HIGH/CRIT rejected | MasterItem HAZARD_CATEGORY / ENERGY_SOURCE (not validated) · `areaCode` free text · Permit ✔checked · Department (Prisma has no relation) | `FLRAAttachment` model exists, **no upload endpoint** |
| **CAPA** | `Capa` :4743 / BE `models/capa.py:135` | `CapaCreate` BE `schemas/capa.py:365` → `POST /api/capa` `routers/capa.py:390` | FE `src/app/(dashboard)/capa/new/manual/manual-capa-form.tsx` (POST :79); source intakes use FE `src/components/capa/source-intake-form.tsx` | `plantId`, `sourceTypeCode`, `title` (≥4), `problemDescription` (**≥50**), `detectedAt`, `primaryCategory`, `primaryOwnerUserId` | CapaSourceType → **400 if unknown** · CapaSubCategory (null if unknown) · `primaryCategory` free text (FE hardcoded list) · severity uses **MODERATE**, where other modules use MEDIUM | `CapaAttachment` stores `fileUrl`, **no upload endpoint** |
| **Field Report (Capture)** | `CaptureSubmission` :10115 / BE `models/capture.py:43` | `SubmissionCreate` BE `schemas/capture.py:70` → `POST /api/capture/submissions` `routers/capture.py:416` (idempotent); `/convert` :765 | FE `src/components/capture/wizard.tsx` (POST :770; offline outbox `src/lib/capture/sync.ts:61`) | Only `clientSubmissionId` | Area → **must belong to the plant, else 400** (:442) · Equipment → must belong to the plant and be active, else dropped (:452) · CaptureTaxonomy L1/L2 (232 rows, alias-aware) · STOP codes validated, but kept in JSON only | `CaptureAttachment` PHOTO/VIDEO/VOICE/DOCUMENT; chunked upload `/api/capture/uploads/*` |

**The six STOP categories.** These are the "confirmed shared 6".

They are hardcoded in BE `services/observation_taxonomy.py:89-96` (`_STOP_CATEGORY_CODES`): REACTIONS_OF_PEOPLE, POSITIONS_OF_PEOPLE, PPE, TOOLS_EQUIPMENT, PROCEDURES, HOUSEKEEPING.

Sub-categories come **only** from the DB table `ObservationTaxonomy`:
- seeded by FE `prisma/seed-observation-taxonomy.ts`;
- served by `GET /api/observation-taxonomy/categories|subcategories` (BE `routers/observation_taxonomy.py:38,54`);
- the frontend fetches them and keeps no hardcoded copy.

The frontend and backend sub-category lists therefore **do not diverge**. One small mismatch exists: the capture axis for `near_miss` is CONDITION in BE `services/capture.py:99` but null in FE `wizard.tsx:331-335`.

---

## b. Field Reports capture today

| Channel | How it works | Where media goes | How it links to a record |
|---|---|---|---|
| **QR** | FE `components/capture/qr-scanner.tsx` (BarcodeDetector, jsQR fallback). Accepts `safeops:loc:<area>:<equip>`, `safeops:area:`, `safeops:equipment:` or a bare areaId. Resolved **on the device** against the `GET /api/capture/bootstrap` equipment cache (≤1000 items). The server re-checks the equipment belongs to the plant. | none | `CaptureSubmission.equipmentId`, `qrScanned` |
| **Voice** | MediaRecorder audio plus Web Speech recognition on the device. The audio is uploaded as a VOICE attachment. The scheduler job BE `services/capture_voice.py`: pass 1 calls the stub STT (no-op); pass 2 translates the device transcript to English with `complete_json`. | Supabase `capture/...` | `CaptureAttachment(kind=VOICE)`, `transcriptOriginal` |
| **Photo** | Canvas re-encode to a 1600 px JPEG at q 0.8 (FE `components/capture/upload.ts:8-53`). Small files skip it and fall back to the original. Optional AI category suggestion `POST /api/capture/ai/vision-suggest` (flag `AI_CAPTURE_ASSIST`). | Supabase `capture/...`, two-phase signed upload or chunked | `CaptureAttachment(kind=PHOTO)` |
| **Conversion** | A triage officer calls `/submissions/{id}/convert`. That calls the real `create_observation`, `create_near_miss`, `create_incident`, `create_permit` and `create_flra` handlers, then re-attributes the reporter (BE `routers/capture.py:~827-1027`). | — | `convertedEntityType/Id`. **Only Observation conversion carries media across**, as new `ObservationAttachment` rows on the same storage objects (:881-888) |

**Live (prod):**
- 56 CaptureSubmissions: 13 converted to Observation, 17 to Near Miss, 6 to Incident; 13 submitted, 6 triaged, 1 rejected.
- 8 CaptureAttachments: 7 PHOTO and 1 VOICE.

**Note:** the capture vision prompt is hardcoded as "factory-safety triage assistant for an **Indian garment manufacturer**" (BE `services/ai/capture_providers.py:76`). That is wrong for steel plants.

---

## c. Existing LLM usage

| Concern | What exists | Path |
|---|---|---|
| SDK | `anthropic` Python SDK only, plus `@anthropic-ai/sdk` in one Next.js server file | BE `pyproject.toml`; FE `src/lib/manhours/narrative.ts` |
| Client paths | (1) `complete_json` / `complete_with_tools` wrapper; (2) the Copilot's own `AsyncAnthropic` with streaming, prompt caching and effort; (3) the capture vision provider calling `_get_client()` directly (no redaction) | BE `services/ai/anthropic_client.py:68-129,203-357`; `services/copilot/runtime.py:540-668`; `services/ai/capture_providers.py:151-219` |
| Provider abstraction | Partial: `ITranscriptionProvider` and `IVisionSuggestProvider` Protocols for capture only. **No general LLM interface.** The Copilot is tied to Anthropic types (content blocks, `anthropic.BadRequestError`). | BE `services/ai/capture_providers.py:51,134,222` |
| Config | `anthropic_api_key`, `anthropic_model` (default haiku-4-5), `copilot_enabled`, `copilot_model`, `copilot_effort`, `copilot_max_tokens`, `copilot_rate_limit_per_hour`… **No endpoint, base-URL or deployment-name setting.** The per-agent model is in DB `Agent.primaryModelId`. | BE `core/config.py:110-145`; `models/agent.py:63-64` |
| Prompts | Versioned in DB `Agent` / `AgentPrompt` and auto-synced from `.md` files (Copilot: `services/copilot/prompts/copilot_v1.md`; specialists: `services/agents/prompts/*.md`). About 10 inline, unversioned prompt constants remain (capture, incident_ai, whatsapp, near-miss CAPA draft, triage, lessons). | BE `services/copilot/runtime.py:112-182`; `models/agent.py:37,151` |
| Structured output | **None is forced.** Callers ask for "Respond ONLY with JSON" and scrape between braces. The Copilot's tools have strict `input_schema` (`additionalProperties:false`, enums), but the model calls them voluntarily; the server re-validates. | BE `services/ai/anthropic_client.py:115-129`; `services/copilot/tools.py:120-130,334` |
| Logging / audit | Loggers `safeops360.copilot` and `safeops360.agents`. **`AgentInvocation` + `AgentToolCall`** hold input context, raw response, suggestion, tokens, cost and latency. Copilot turns are `sourceModule=COPILOT`. The `complete_json` callers write **no** invocation, token or cost row. | BE `models/agent.py:196-314`; `services/copilot/runtime.py:404-481` |
| Caps | `Agent.rateLimit` counts messages per hour: Copilot per user, specialists per agent per plant. Photos are capped at 3 per turn, ~1.4 MB b64 each, 3.2 MB total. **No token or USD budget exists per plant or deployment.** Two separate hardcoded price tables. | BE `services/copilot/runtime.py:84-94,185-199`; `services/agents/agent_service.py:72-85,615-638`; `services/copilot/photos.py:20-25` |
| Flags | Licence `AI_ASSIST` module (router guard + FE `hasModule`) · `FactoryModuleEntitlement` per plant · env + licence `featureFlags` (capture `_features()`) · per-plant config tables `HiraCalibrationConfig` (mode OFF/SHADOW/ON, plant overrides tenant default) and `EaiFeatureFlag` | BE `licensing/router_map.py:76-78`, `licensing/enforcement.py:53,67`; `routers/capture.py:146-182`; `services/hira_calibration/config.py:621-662`; `models/eai.py:526` |
| Deterministic engines | **AI Insights:** no LLM, no Copilot import. **Signal Engine:** deterministic; its `narrative.maybe_rewrite` LLM hook is unimplemented (always returns None). Neither depends on the Copilot. (`hira_calibration` *does* import Copilot modules but makes no LLM calls itself.) | BE `services/insights/`, `services/signal_engine/narrative.py:47-65` |

**Live (prod):**
- `AgentInvocation` rows: COPILOT 19 (all in the last 30 days), INCIDENT 16, CAPA 7, HIRA 3.
- Six active agents. SAFEOPS_COPILOT rateLimit is 60 per hour.

**What to reuse:** `AgentInvocation` / `AgentToolCall` (audit), `AgentPrompt` (versioned prompts), `photos.py` (validation, magic bytes), `_update_observation_draft` (master validation and severity), `redact_payload`, and `HiraCalibrationConfig` (flag pattern).

**What to generalize:**
1. One provider interface (complete / tools / vision / structured / usage) with an Azure adapter and endpoint settings.
2. Forced structured output.
3. Per-plant token and call caps.
4. A single price table.
5. Form kinds hardcoded as `FORM_KINDS = ("OBSERVATION","HIRA_ENTRY")` (BE `services/copilot/form_drafts.py:19`) and FE `FormKind`, with a hand-written `applyPatch` per form and a single active bridge.

---

## d. Form-schema / Form Builder capability

- The **Form & Workflow Engine** is BE `services/form_engine/`, `models/form_engine.py:86-204` and `routers/form_engine.py`.
  - It stores `FormDefinition.schemaJson` with versions.
  - Its field contract (BE `services/form_engine/schema.py:40-81`) has key, label, type (20 types), required, static `options`, `visible_if` and formula.
  - `GET /api/forms/definitions/{key}` returns a machine-readable schema.
- **It cannot describe the target forms:**
  - **No master-data option sources.** Options are static lists only.
  - **Only the NATIVE storage binding** is implemented; ENTITY binding raises (BE `services/form_engine/binding.py`).
  - **No production forms use it.** Live `FormDefinition` has 0 rows; the only definition is a parity fixture.
  - **The six target forms are hardcoded** as Pydantic + React.
- **Conclusion:** Phase-1 descriptors must be **code-defined**, as Python modules next to the Pydantic contracts. They should be derived from the create contract plus explicit master bindings. They should not come from the form engine. The `form_drafts.py` per-kind whitelist is the seed to generalise.

---

## e. Auth, permissions and scope

- **Authentication:**
  - HS256 JWT bearer, `get_current_user` (BE `core/deps.py:16-42`).
  - The browser never calls Python directly. The Next proxy mints the backend JWT from the NextAuth session (FE `src/lib/backend-token.ts:29-36`).
- **Permissions:**
  - `can(db, user_id, "MODULE.ACTION", PermissionContext)` (BE `services/permissions.py:237-296`).
  - Chain: User → UserRole (scope PLANT/DEPARTMENT, validity) → Role → RolePermission (ALL_PLANTS / OWN_PLANT / OWN_DEPARTMENT / OWN_RECORDS + conditions).
  - In-process cache, 5 min.
  - Helpers: `require_permission`, `require_permission_with_context` (BE `core/deps.py:45-79`).
  - A second layer is the licence guard `require_module`: OBSERVATION, NEAR_MISS, PTW, FLRA, INCIDENT, CAPA, and AI_ASSIST for the copilot.
- **Create gates** (checked in the handler with `plant_id=payload.plantId`):

| Record | Permission | Where |
|---|---|---|
| Observation | `OBSERVATION.CREATE` | BE `routers/observations.py:133` |
| Near Miss | `NEAR_MISS.CREATE` | `routers/near_miss.py:364-370` |
| Incident | `INCIDENT.CREATE` | `routers/incidents.py:243-255` |
| PTW | `PTW.CREATE` (direct `can`) | `routers/ptw.py:140-148` |
| FLRA | `FLRA.CREATE` | `routers/flra.py:106-112` |
| CAPA | `CAPA.CREATE` (child CAPAs: `INCIDENT.UPDATE` / NM workflow assignee) | `routers/capa.py:390-397` |
| Capture | `CAPTURE.CREATE` / `TRIAGE` / `UNMASK` | `routers/capture.py:56-59` |

- **Row-level scope:**
  - It is **enforced in the app only**; there is no Postgres RLS.
  - `QueryScope` / `build_query_scope` (BE `services/access_scope.py:34-77`): plant IN user's plants; empty set means no rows.
  - `RecordScope` (`:103-167`) adds department and owner.
  - Module helpers: `observation_access.py`, `ptw_access.py`.
- **Gaps relevant to grounding:**
  - Observation, NM, Incident, FLRA and CAPA creates **do not check that `areaId` / `departmentId` belong to the chosen plant**. Only capture does.
  - MasterItem IDs are never checked against their `type`.
  - The Observation, Incident, PTW and FLRA "new" pages read the plant list with `prisma.plant.findMany` **unscoped**. Only Near Miss uses the RBAC-scoped `/api/plants`.
  - The draft service must apply its own plant-scoped grounding and must not rely on create-time validation.

---

## f. Audit log

- **Table:** `AuditLog` (BE `models/audit_log.py:22-52`; DDL in FE `prisma/apply-auditlog-ddl.ts`).
  - Columns: field-level `before`/`after` JSON, `changedFields`, `correlationId`, and a per-entity SHA-256 hash chain.
  - It is written automatically by ORM flush listeners, with explicit `record_event(...)` calls on top (BE `services/audit_log.py:127-240`).
  - Append-only is enforced in the app only.
- **Coverage:** only entities passed to `register_audited` are captured (BE `main.py:372-408`). **Observation, NearMiss, FLRA and ObservationAttachment are not registered.** Incident, Capa, Permit and its children, and CaptureSubmission are.
  - Live AuditLog top entities: ComplianceAudit 278, Permit 154, PermitAttachment 115, Incident 74, CaptureSubmission 65.
- **For AI input and output:** `AgentInvocation` already holds the scrubbed input context, raw model output, suggestion, tokens, cost and latency (`ACOP-…` numbering). The `copilot_draft` table should point at an `AgentInvocation` and not duplicate those fields. Draft status changes can also go through `record_event` (or `register_audited(CopilotDraft)`) to get hash-chained, tamper-evident history.

---

## g. Live data (prod, read-only, 2026-11-19)

**Records**

| Register | Rows | Distribution |
|---|---|---|
| Observation | **6,744** (JSL-HSR 6,308 · NW 248 · SW 134 · the rest ≤6) | **Type:** UNSAFE_CONDITION 5,911 · UNSAFE_ACT 706 · SAFE_ACT 84 · SAFE_CONDITION 43 |
| | | **STOP (category/axis):** TOOLS_EQUIPMENT/COND 3,782 · HOUSEKEEPING/COND 1,900 · HOUSEKEEPING/ACT 311 · PROCEDURES/COND 102 · TOOLS_EQUIPMENT/ACT 96 · PROCEDURES/ACT 68 · POSITIONS/ACT 33 · PPE/ACT 30 · PPE/COND 2 · **null 420** (127 safe + **293 at-risk without a STOP code**) |
| | | **Severity:** LOW 4,621 · MEDIUM 1,775 · CRITICAL 252 · HIGH 96 |
| | | `areaId` set on 6,597 / 6,744 |
| Near Miss | **209** | **potentialSeverity:** HIGH 90 · MEDIUM 83 · CRITICAL 28 · LOW 8 |
| | | `hazardCategory` set on only **8 / 209**; equipment on **3**; department on **4** |
| Incident | **140** | FIRST_AID 52 · LTI 35 · MTC 29 · RWC 10 · PROPERTY_DAMAGE 7 · FIRE 3 · ENVIRONMENTAL 2 · PROCESS_SAFETY 1 · HIPO_NEAR_MISS 1 |
| Others | — | Permit 364 · FLRA 264 · CAPA 116 |
| **Photos** | — | `Observation.photoUrl` non-empty: **0** · ObservationAttachment: **20 files on 12 observations** · NearMissAttachment: 16 on 9 · IncidentAttachment: 5 · CaptureAttachment PHOTO: 7 |

The STOP distribution is heavily skewed, because 93% of rows are the JSL-HSR import (almost all TOOLS_EQUIPMENT / HOUSEKEEPING conditions). Any eval built from live rows inherits that skew.

**Masters (are they populated enough for grounding?)**

| Master | Live | Verdict |
|---|---|---|
| Plant | 72 | OK |
| Area | 628 across **56 / 72** plants | **16 plants have no areas** |
| ObservationTaxonomy (active) | **40 rows**: ACT axis has all 6 categories (RP 5, PP 8, PPE 3, TE 3, PROC 3, HK 3); CONDITION axis has 4 categories (PPE 3, TE 4, PROC 3, HK 5) | OK, complete |
| SeverityMatrixRule | 40 (one per sub-category) | OK |
| AreaHazardTier | **4 rows total**, all area-specific; **no plant-default rows** | Thin. Severity falls back to the matrix default for almost every area |
| Equipment | 454 across **45 / 72** plants; **JSL-HSR = 0** | **Empty for the main client plant**: equipment grounding is impossible there |
| Department | 168 active (JSL-HSR 24) | OK |
| MasterItem | HAZARD_CATEGORY 15, ENERGY_SOURCE 11, ACTIVITY_TYPE 15, SHIFT 3 active, INCIDENT_TYPE 7, PERMIT_TYPE 8, PPE_TYPE 14, ROOT_CAUSE_CATEGORY 6 | OK in size, but NM usage is 8 / 209 |
| User / ContractorCompany | 260 / 11 | OK |
| RiskMatrix* | RiskMatrix, Cell, Likelihood, Severity (13) tables present | OK (used by HIRA) |
| FormDefinition | **0** | Not usable as a descriptor source |

**JSL-HSR:** 226 areas, **0 equipment**, 24 departments, 6,308 observations.

**Eval-set implication (Phase 2):** there are only 12 observations with any photo, so a labelled photo eval set **cannot** be built from live records. It needs the seed set the brief says you will supply.

---

## h. Mobile and offline

- **Field Capture (`/capture`)** is an installable PWA with offline-first submission:
  - manifest scope `/capture`;
  - `sw.js` cache `capture-v2`, network-first for navigation and boot APIs, registered in production only;
  - Dexie DB `safeops-capture` with `outbox`, `media` and `bootCache`;
  - retry on `online` plus an interval;
  - chunked upload above 3 MB.
- **Observation, NM, Incident, PTW, FLRA and CAPA forms, and the Copilot panel, are online-only.**
- So the brief's premise "offline capture is not built" is **incorrect**. Phase 4 can extend the existing capture outbox by adding a "draft requested" flag to the queued submission. It does not need a new queue.

---

## Gap list

| # | Gap | Blocks | Size |
|---|---|---|---|
| G1 | No Azure LLM provider, endpoint config or provider interface (D2) | Non-negotiable 5; Gate 1 | M (interface + Azure adapter) **plus your Azure deployment and credentials** |
| G2 | No tenant entity; the flag must be per plant with a deployment default (D1) | Non-negotiable 4 wording | S (decision) |
| G3 | No Azure Blob; storage is Supabase private bucket + signed URLs (D3) | Non-negotiable 8 wording | S (decision) or M (new storage adapter) |
| G4 | No server-side EXIF/GPS strip. The Copilot path loses EXIF only incidentally (canvas). Capture vision sends **raw JPEGs with GPS** to the model. Stored originals keep GPS, and `exifData` deliberately stores GPS. | Non-negotiable 8 | S (Pillow re-encode before the model call; originals unchanged in the private bucket) |
| G5 | No per-plant or deployment token/call budget; only messages-per-hour per user | Non-negotiable 8 cap | S-M |
| G6 | No forced structured output; JSON is scraped from text | Pipeline step 3 | S (forced tool / json_schema in the adapter) |
| G7 | No server STT (D5) | Voice input | M (Azure AI Speech) or S (accept the on-device transcript as text) |
| G8 | Form kinds hardcoded (BE `FORM_KINDS`, FE `FormKind`, one bridge, hand-written `applyPatch`) | Form registry | M |
| G9 | Creates don't verify area/department belong to the plant; MasterItem type unchecked | Grounding must be self-contained | S (draft-side grounding) |
| G10 | Observation / NearMiss / FLRA are not in the audit hash-chain | Audit of AI-confirmed records | S (register `CopilotDraft`; leave existing registrations unchanged) |
| G11 | JSL-HSR has 0 equipment; 16 plants have 0 areas; AreaHazardTier has 4 rows | Equipment and area grounding quality | Data, not code |
| G12 | 293 at-risk observations have no STOP code; only 12 observations have photos | Phase-2 eval set | Seed set from you |
| G13 | Capture vision prompt says "garment manufacturer"; Copilot prompt names "stainless steel plant" | Prompt portability | S |
| G14 | No staging; Gate-1 live evidence = production behind the flag (D6) | Gate 1 | Decision |
| G15 | Observation photos upload only after create (`/{id}/attachments`). A draft must hold its photos until confirm, then attach them to the new record. | Phase 1 confirm flow | S (draft stores its own private copies; confirm links them as INITIAL_PHOTO, like the capture conversion at BE `routers/capture.py:881-888`) |
| G16 | The existing chat Copilot already pre-fills observations from photos (D8); the two must not diverge | Phase 1 design | Decision: the draft service reuses the same validators |

---

## Recommended Phase-1 form: **Safety Observation**

1. **The richest grounded master.** `ObservationTaxonomy` covers the 6 STOP categories (40 rows) with a DB composite FK. A hallucinated category or sub-category literally cannot be saved.
2. **Severity is already deterministic.** `SeverityMatrixRule` gives the suggestion, and the create endpoint forces an override reason on any deviation. The AI can propose type, category and sub-category, and severity follows the rule. This satisfies "conservative and practical, not all-High" without the model setting severity. My recommendation: the AI may propose a severity only with a stated reason, and the matrix value is the default.
3. **The volume is there:** 6,744 rows, against 209 NM and 140 incidents. The user base already raises observations daily.
4. **Most of the pipeline exists:**
   - `_update_observation_draft` validation (BE `services/copilot/tools.py:1270-1320`);
   - photo validation (`services/copilot/photos.py`);
   - `FormBridge.applyPatch` and `attachPhotos` on the form;
   - the capture conversion's photo-linking pattern.
5. **It has a single, simple create gate**, `OBSERVATION.CREATE` with `plant_id`, and a small required set: plant, type, description, date, plus the STOP pair.

Not recommended first:
- **Near Miss:** its masters are barely used live (hazardCategory 8 / 209).
- **Incident:** much free text and legal weight.
- **PTW:** issuer, receiver and competency rules plus SIMOPS gating.
- **FLRA:** step hazards on an unvalidated MasterItem.
- **CAPA:** ≥50-char problem statement and a free-text category.

---

## What Gate 1 needs from you before work can start

1. **An Azure LLM deployment:** Azure OpenAI or Azure AI Foundry, with endpoint, deployment name, API version, auth (key or managed identity) and region. Nothing Azure-LLM exists in the code or `.env` today.
2. **Decisions D1, D3, D6, D7 and G7** (see `docs/COPILOT_DECISIONS.md`).
3. **Approval to run additive DDL on production** for `copilot_draft`, `copilot_draft_edit` and the flag table. No staging DB exists.
4. **At least 10 site photos** for the Gate-1 run, including one with no hazard and one blurry.
5. **A test plant** to switch the flag on (suggest a low-traffic plant, not JSL-HSR), and **two test users**: one without `OBSERVATION.CREATE`, and one scoped to a different plant for the cross-site denial.
