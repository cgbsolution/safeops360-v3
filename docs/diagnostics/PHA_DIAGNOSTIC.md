# SafeOps360: PHA / HAZOP Diagnostic (Part A)

Run date: 2026-11-19. Read-only code sweep of both repos, read-only queries against the live production DB, and unauthenticated GETs against the live API. Paths: FE = `safeops_360/`, BE = `safeops_360_bakend/`.

How the evidence was collected:
- **DB**: every query ran through `BE tests/campaign/hira_calibration/live_db.py`. That helper has two guards: a Postgres `READ ONLY` session and a client filter that only lets reads through. Across three probes, 115 statements ran and 0 were refused.
- **API**: the live backend is `https://safeops-api-main.epfassist.com`. Its OpenAPI lists 999 paths.
- **Frontend**: the live frontend is `safe-ops360.vercel.app`.

---

## 1. Executive answer

**Is HAZOP captured in SafeOps360? No.**

No table, API route or screen holds HAZOP structure: nodes, design intent, guideword × parameter deviations, causes, safeguards, LOPA/IPL or SIL. The guideword worksheet is **ABSENT** from the code, the live DB and the live API (0 of 999 paths).

What exists is task-based **HIRA** (live; 26 studies, 384 entries) and **MOC with an embedded PSSR checklist**. `HAZOP_PHA` exists only as an allowed value in a DDL script that has not been run, and no code writes it.

**Risk:** `/process-safety` is a marketing page with hard-coded mock HAZOP rows ("PHA-2026-001 HAZOP … In progress") and "Available Q3 2026". It must not be shown to Jindal.

## 2. Client-safe statement (for Harry)

> SafeOps360 does not have a dedicated HAZOP module today. At Hisar, process and task hazards are captured in our HIRA module, using your own QSD/24/F risk matrix, with controls, recommended actions tracked through CAPA, scheduled reviews, and re-review when a change goes through MOC; your 320 HIRA entries are already loaded there. A HAZOP/PHA worksheet (nodes, guidewords, deviations, safeguards) is a planned build, and we would like to scope it against your current HAZOP template.

---

## 3. Capability matrix (A2)

Verdicts: BUILT & LIVE = code, live rows and a route; BUILT NOT WIRED = code exists but there are 0 live rows or no UI path; PARTIAL; ABSENT.

| # | Capability | Verdict | Evidence |
|---|---|---|---|
| 1 | Study register | **PARTIAL** (as HIRA) | `HiraStudy` FE `prisma/schema.prisma:4137`: number, plant/dept/area, scopeType, team leader, dates, status, supersession. There is no scribe role and no study type. Routes BE `app/routers/hira.py:711,785,883`; screens FE `/hira`, `/hira/new`, `/hira/[id]`. Live: 26 studies (ACTIVE 13, DRAFT 9, APPROVED 2, IN_PROGRESS 2). |
| 2 | Study types (HAZOP, HAZID, What-If, Checklist, FMEA, LOPA) | **ABSENT** (label only) | `HiraStudy.hiraType` CHECK includes `HAZOP_PHA`, `FMEA` (FE `prisma/apply-hira-calibration-round3-ddl.ts:23-27`), but the **column does not exist in prod** (information_schema = 0). There is no writer (no router field, no form input). BE `app/services/hira_calibration/loader.py:121-157` only reads it. |
| 3 | Node definition (node, design intent, P&ID ref, parameters) | **ABSENT** | The nearest thing is `HiraStudy.scopeType = PROCESS` (2 live studies) plus `processCode` (schema:4150-4153). No node, design-intent or drawing fields. |
| 4 | Guideword × parameter deviation worksheet | **ABSENT** | 0 hits for guideword, deviation worksheet, study node or design intent in either repo, and 0 live tables. |
| 5 | Cause → consequence → safeguards → risk pre/post → recommendations | **PARTIAL** (task-based, no cause or deviation) | Mapped onto HIRA: `HiraEntry` initial/residual/target L×S (schema:4253-4344); `HiraEntryHazard.consequence` (:4425), live 370/466 filled; `HiraEntryControl` = safeguards (:4442), live 746; `HiraEntryRecommendedControl` (:4467), live 106. No cause field and no deviation. |
| 6 | Risk matrix config (tenant-configurable) | **PARTIAL** | `RiskMatrix*` tables (schema:3972-4060); live: 3 matrices (`STD_5X5`, `STD_3X3`, `JSL_QSD24_GT`), 59 cells. Read-only: BE has GET only (`hira.py:563,591`). `HIRA.MATRIX_CONFIGURE` exists but has no write endpoint. Matrices are global; a study picks one. |
| 7 | LOPA / IPL / SIL | **ABSENT** | 0 hits, 0 tables. |
| 8 | Recommendation tracking → CAPA | **BUILT & LIVE** (HIRA) | BE `app/services/hira_capa.py:39` (source `HIRA_CONTROL`) → `capa_spawn.spawn_capa`; legacy `HiraCapa` via `POST /api/hira/entries/{id}/capas` (`hira.py:2126`). Live: 3 `Capa` rows with source `HIRA_CONTROL`, 6 `HiraCapa` rows. |
| 9 | Revalidation schedule, due alerts, revision history | **BUILT & LIVE** (HIRA, not a 5-year PHA cycle) | `nextScheduledReviewDate`/`reviewFrequency` (schema:4176-4180), `HiraReviewCycle` (:4554), `HiraVersion` (:4591); cron `POST /api/hira/cron/review-scheduler` (`hira.py:3419`, Vercel cron in FE `vercel.json`). Live: 22 review cycles, 25 versions. |
| 10 | MOC linkage | **BUILT NOT WIRED** (in live data) | MOC approval → `trigger_hira_review_for_moc` (BE `app/services/hira_moc_receiver.py:57`, called from `app/routers/moc.py:283-300`). Live: **0 of 22 review cycles were triggered by an MOC** (all `SCHEDULE`). `MocDependentRecord` has 6 `hira_entry` rows. Matching uses plant/dept/area only; equipment and process are ignored (`hira_moc_receiver.py:88-94`). |
| 11 | PSSR | **PARTIAL** (embedded in MOC only) | `ChangeRequest.pssrRequired/pssrOutcome/pssrChecklist` (schema:6440-6473); `POST /api/moc/change-requests/{id}/pssr` (`moc.py:1129`, live route registered). Live: 13 change requests; 2 require PSSR and 2 have a checklist and outcome. No standalone PSSR model or route. |
| 12 | HIRA linkage | **BUILT & LIVE** | Study→entry tree; `/api/hira/integrations/for-flra`, `for-ptw`, `for-inspection` (`hira.py:3015-3114`). |
| 13 | PTW / LOTO hazard auto-population | **PTW: BUILT NOT WIRED · LOTO: ABSENT** | `GET /api/hira/entries/{id}/hazards/{row}/ptw-prefill` (`hira.py:2191`), used in FE `src/app/(dashboard)/ptw/new/page.tsx:35`; FK `Permit.hiraEntryId` (BE `app/models/permit.py:219`). Live: **0 of 364 permits** carry a `hiraEntryId`. LOTO models have no HIRA link. |
| 14 | Equipment master linkage | **PARTIAL** | `Equipment` (schema:3062), `code` = tag. HIRA links only by value (JSON `HiraStudy.equipmentIds` :4152, `HiraEntry.equipmentUsed` :4280). Live: 454 rows across **45 of 72 plants**; **JSL-HSR has 0**. The brief's "2 of 28 plants" is out of date. |
| 15 | Team / attendance sign-off, approvals, audit trail | **PARTIAL** | `HiraStudyTeamMember.signedAt` (schema:4226) via the workflow fan-out (BE `app/services/workflow_engine.py:902-914`); live: 30/162 members signed. No per-session attendance. HIRA and MOC are **not** registered on the SHA-256 audit chain (BE `app/main.py:372-408`, `register_audited`). |
| 16 | Export (HAZOP worksheet PDF/Excel/Word) | **PARTIAL** (HIRA formats, not a HAZOP worksheet) | BE `GET /api/hira/studies/{id}/export.csv` (`hira.py:3170`); FE XLSX at `src/app/api/hira/studies/[id]/export/route.ts:35-320`; print page `src/app/(dashboard)/hira/[id]/export/page.tsx`. No HAZOP column layout and no client-template mapping. |
| 17 | Document / P&ID attachment | **PARTIAL** (MOC only) | `MocAttachment` category `pid` (schema:6586; `moc.py:1224-1343`); live: 0 MOC attachments. `HiraStudyAttachment`: 10 live rows, but there is no router that writes them (they come from seed/import). HIRA is not registered with the generic `/api/evidence` (`app/services/evidence_registry.py:44-162`). |
| 18 | AI assist for HAZOP | **ABSENT** | The HIRA Assistant and Copilot are task-based only. Calibration skips non-`TASK_BASED` studies (`hira_calibration/service.py:767`, `review_v2.py:1190`). No deviation suggestion and no historic-study reuse. |
| 19 | Analytics / Signal Engine / Daily Brief | **PARTIAL** (HIRA only) | `signal_engine/domain.py:50`, `rules/xcorr_020.py:73`; alert rule `hira_control_failed` (`app/services/alerts/__init__.py:86-101`) is registered, but `HIRA_CONTROL_FAILED` is never emitted (`events.py:37`). No PHA inputs. |
| 20 | Per-tenant enable/disable + permission codes | **PARTIAL** (HIRA/MOC only) | Licence codes `HIRA`, `MOC` (BE `app/services/licensing/registry.py:66,69`); live `FactoryModuleEntitlement`: 43 HIRA, 43 MOC, **0 PHA/PSM**. Live permissions: 15 `HIRA.*` and 9 `MOC.*`; **no `PHA.*`, `PSM.*` or `PSSR.*`**. |

## 4. Live verification (A3)

| Item | Live DB | Live API (unauthenticated GET) | Frontend screen / nav / call site |
|---|---|---|---|
| HIRA studies/entries | `HiraStudy` 26 (JSL-HSR 11, NW 8, SW 7); `HiraEntry` 384 (JSL-HSR 320) | `/api/hira/studies` 401 (registered) | `/hira` in sidebar (FE `src/components/layout/app-sidebar.tsx:209-221`); screens fetch the API |
| Risk matrices | 3 matrices, 59 cells | `/api/hira/risk-matrices` 401 | `/configuration/risk-matrices/[id]` (read-only) |
| Hazard/control libraries | `HiraHazard` 167, `HiraControl` 12 | `/api/hira/hazards`, `/api/hira/controls` 401 | HIRA entry editor (hazard combobox) |
| HIRA → CAPA | 3 `Capa` (`HIRA_CONTROL`) + 6 `HiraCapa` | route in OpenAPI (`/api/hira/entries/{id}/capas`) | entry page |
| Review cycles / versions | 22 (all `SCHEDULE`) / 25 | `/api/hira/review-cycles` 401 | `/hira/reviews` |
| MOC + embedded PSSR | `ChangeRequest` 13 (2 with PSSR); `MocImpactAssessment` 8, all `checklist_based` (none `hazop_lite`) | `/api/moc/change-requests` 401; `/pssr` route in OpenAPI | `/moc` in sidebar (no permission gate, `app-sidebar.tsx:219`) |
| PTW ← HIRA prefill | **0 / 364 permits linked** | `/api/hira/integrations/for-flra` 401; ptw-prefill route in OpenAPI | `ptw/new/page.tsx:35` call site exists; **no live use** |
| MOC → HIRA re-review | **0 MOC-triggered cycles** | n/a (internal call) | n/a |
| PHA / HAZOP anything | **0 tables** matching hazop/hazid/pha/lopa/fmea/guideword/node/safeguard/pssr/psm/sil | `/api/pha/studies` 404, `/api/hazop/studies` 404, `/api/process-safety` 404; 0 OpenAPI paths match hazop/hazid/lopa/fmea/psm | `/process-safety` = `Phase2Scaffold` mock (FE `src/app/(dashboard)/process-safety/page.tsx:11-53`), **not in the sidebar**, reachable by URL (live 307 → sign-in) and linked from `src/components/phase2/dashboard-preview.tsx:6` |

**Standing failure pattern (built but not live), confirmed twice:** PTW→HIRA prefill (0/364 permits) and MOC→HIRA re-review (0/22 cycles). One case is the reverse: `HiraStudyAttachment` has 10 rows but no write path.

**Not verified: authenticated response shapes.** Every registered route returned 401. Reading a body needs a sign-in (a POST), which the read-only, GET-only rule ruled out. Row counts come from the DB instead.

## 5. Overlap map (A4)

| Module | Holds | Overlap with PHA | Reuse or duplicate |
|---|---|---|---|
| **HIRA** | `HiraStudy`, `HiraEntry`, `HiraEntryHazard` (+consequence), `HiraEntryControl`, `HiraEntryRecommendedControl`, `HiraStudyTeamMember`, `HiraReviewCycle`, `HiraVersion`, `HiraHazard`/`HiraControl` libraries, `RiskMatrix*` | hazard, consequence, risk pre/post, safeguard (= control), recommendation, team, review/revision | Reusable for the register, team, review and versioning patterns. No node/deviation/cause, so a HAZOP worksheet needs its own rows. |
| **MOC (+PSSR)** | `ChangeRequest` (risk as JSON `riskMatrixPre/Residual`, `hazardCategories` string array, `psmApplicable` 2 live, `pssrChecklist` JSON), `MocImpactAssessment.methodology` (free text, hint lists `hazop_lite`) | risk rating (a separate JSON copy), hazards, PSSR | Link, not copy. MOC's risk JSON is a third rating store. |
| **ERM register** | `ScoringMatrixConfig` (multi-dimension), `EnterpriseRisk`, bow-tie JSON (`PUT /api/erm/risks/{id}/bowtie`) | risk rating, bow-tie view | A separate matrix system; the only one with multi-dimension consequence scoring. The ERM bow-tie is not tied to process scenarios. |
| **PTW hazard spine** | `PermitPrecautionItem`/`PermitHazardAnnexure` keyed by permit type | safeguard-like checklists | Different taxonomy (PermitType, not the HIRA hazard library). |
| **FLRA ("Site Safety Check")** | `FLRAStepHazard` (free-text hazard, inline L×S, no matrix FK) | hazard, risk rating | A fourth risk-rating implementation; would be duplicated. |
| **LOTO** | `LotoProcedure`, `LotoEnergySource`, `LotoIsolationPoint`… | isolation safeguards, review date | No HIRA/PHA link. |
| **CAPA** | `Capa` (+ `CapaSourceType` data-driven codes, SLA profiles) | recommendation lifecycle | **Receives PHA recommendations with no new plumbing:** seed a `PHA_RECOMMENDATION` source type + SLA profile, then add a receiver that mirrors `app/services/hira_capa.py`. No schema change. |
| **Training/Competency** | `TrainingTriggerEvent.sourceModule` ∈ {INCIDENT, NEAR_MISS, OBSERVATION}; competency `FMEA-FACILITATOR` (seed only) | none (consumer only) | Would need a new trigger branch. |

Answers to the three specific questions:
- **Is HIRA's risk matrix enough for PHA?** The tables are generic (3×3–6×6, explicit cell→band maps, product/plant-index scoring in BE `app/services/hira_calibration/matrix.py:46-150`). They are global with no per-plant scope, single-dimension severity, and **read-only** (no write API). A PHA can reuse them by adding FK back-relations. It needs its own matrix only if it must score several consequence dimensions (people/environment/asset/reputation); today only ERM does that.
- **Is HIRA's hazard/control library reusable as a safeguard library?** Partly. `HiraControl` (12 live) has code, hierarchy and verification fields and could seed a safeguard library. It has no IPL/SIL attributes, and neither library has a create/update API (seed-only; the only write is `PATCH /hazards/{id}/permit-gate`). `HiraHazard` is a task-hazard taxonomy, not a guideword/parameter set.
- **Which CAPA entity can receive PHA recommendations?** The universal `Capa` via `capa_spawn.spawn_capa`, as `HIRA_CONTROL` already does (3 live rows).

## 6. Reusable platform assets (A5)

| Asset | Where / how invoked | Constraint that would bite a PHA build |
|---|---|---|
| Form Builder | `FormDefinition`/`FormRecord` (schema:11434-11545), BE `app/routers/form_engine.py` (`/api/forms`), FE `/configuration/forms` | Published versions are immutable (good). Data is flat JSON with no nested node→deviation→cause grid, so it suits PSSR or checklist studies but **not** the HAZOP worksheet. |
| Workflow engine | `WorkflowDefinition/Step/Instance/Task`; BE `app/services/workflow_engine.py` `initiate()` :1033 | Needs a PHA branch in the per-module status-sync if-chain (:516-672). `HIRA_TEAM_FAN_OUT` (:901) is reusable for team sign-off. Re-seeding workflows is destructive. |
| Risk matrix service | `hira_calibration/matrix.py` (`MatrixConfig.from_db`), `GET /api/hira/risk-matrices` | Gated by `HIRA.READ`. The calibration engine is TASK_BASED-only. |
| CAPA | `capa_spawn.spawn_capa` | Needs a seeded source type. `CAPA_CREATED` is never emitted (`events.py:33`). |
| Notifications / scheduler | `services/notifications.py`; `JOBS` registry (`scheduler.py:320-356`); `SCHEDULER_ENABLED` defaults to false | HIRA review runs as a Vercel cron endpoint, not a Job. PHA revalidation should pick one of the two. |
| Export | BE fpdf2 (`services/report_pdf.py`), openpyxl, python-pptx (`scorecard/export_pptx.py`); FE exceljs (HIRA XLSX) | HIRA has no PDF export; the HAZOP worksheet layout would be new. |
| Permissions / scope | `can()` (`services/permissions.py:237`), `build_query_scope` (`access_scope.py:70`), fail-closed | New codes must go in via a surgical `prisma/apply-*-permissions.ts`, because `seed-rbac` is destructive. |
| Audit trail | `services/audit_log.py` SHA-256 chain, opt-in `register_audited` | HIRA/MOC are not registered; a PHA must opt in. |
| AI Copilot / agents | `app/services/copilot/*`, `app/services/agents/*`; flag `hira.calibration.v2` via `HiraCalibrationConfig.mode` (live: 0 rows, so every plant is OFF) | A PHA needs a context builder, a `source_access` entry and tools. Keep the LLM optional and per-tenant. |
| Signal Engine | `signal_engine/registry.py` `RULES`; `MODULE_BY_MODEL_FILE` (`data_access.py:41`) | Rules are registered in code. A new `app/models/pha.py` must be mapped or the data-quality rules won't see it. |
| Daily Brief / DomainEvent | `events.emit()` outbox → `alerts_impact_resolver` | Each event type is a constant plus a rule file. |
| Licensing | Ed25519 `.lic`, `MODULE_REGISTRY` (`licensing/registry.py:40-128`), `ROUTER_MODULE` gate (`main.py:448-451`) | No PHA code. **A router missing from `ROUTER_MODULE` is ungated.** A new code needs licences re-issued. |
| Attachments / evidence | `Attachment` + `/api/evidence/{type}/{id}` (`routers/attachments.py`) | The entity must be registered in `evidence_registry.py:41`. Live `Attachment` = 0 rows (no general document-management layer in use). |

The dual schema is a cost on every table: the Prisma schema (FE) and SQLAlchemy models (BE) are kept in step by hand, DDL is applied by idempotent `prisma/apply-*-ddl.ts` scripts, and the BE probes `information_schema` for columns that may not exist yet.

## 7. Risks and unknowns

1. **Over-claim risk:** the `/process-safety` mock page (fake HAZOP/What-If rows, "Available Q3 2026", now past) is reachable by URL and from `/dashboard/preview`. Recommend hiding it before any Jindal session.
2. **`HAZOP_PHA` is not live:** the round-3 DDL has not been applied in prod (column absent), so no study can be typed as HAZOP today.
3. **MOC→HIRA and PTW→HIRA have never fired in prod** (0 rows each). Whether they work end to end is UNVERIFIED.
4. **Authenticated API response shapes and 500s are UNVERIFIED.** GET-only access stopped at 401.
5. **Jindal's HAZOP template:** not supplied. Export-format fit is UNVERIFIED.
6. **Equipment at JSL-HSR = 0 rows.** Tag-level linkage is impossible for Jindal until the equipment master is loaded.
7. **Signal-rule comment drift:** `signal_engine/rules/xcorr_019.py:6-7` says consequences are "0 of 96" filled; live shows 370/466. The comment is out of date. Whether the rule logic has the same drift is UNVERIFIED.
8. HIRA and MOC are off the tamper-evident audit chain, which matters if a PHA approval must be audit-grade.

## 8. Verification checklist

- [ ] **Every BUILT claim has file:line AND a live DB row count AND a live API status.** PARTLY. Every BUILT row has file:line and a live row count. The API status is 401 ("route registered"), not a 200 with a body, because authenticated reads were out of scope (item 7.4).
- [x] **Every false-positive grep hit is classified, none silently dropped.** The sweep classified each cluster. False positives: ERM `whatIfAdjustments` (BCM stress test); the Copilot HIRA "what-if" (control change); RCA BOWTIE method; ERM bow-tie; `PROCESS_SAFETY` incident/observation type; `MocImpactAssessment.methodology` hint comment (`hazop_lite`, 0 live uses); seed text (audit question "Are HAZOP/PHA studies current…", `seed-audit-compliance.ts:391-396`; competency `FMEA-FACILITATOR`; hazard `regRef` OSHA 1910.119); the corpus fixture "HAZOP node 3" (`build_corpus.py:767`, test only); `pid` as process/project id; competency `revalidation*`; the `/process-safety` mock. Real but partial: `hiraType` label, embedded MOC PSSR, MOC `psmApplicable`, MOC P&ID attachment category.
- [ ] **No file in the repo was modified (`git status` clean except the report).** NOT MET as worded:
  - (a) Both repos already had uncommitted Copilot work from 2026-11-04 (resumable turn streaming) before this run.
  - (b) The same request asked for a Copilot photo-observation feature, built after the diagnostic.
  - The diagnostic itself wrote only this report. All DB access was read-only (115 statements, 0 refused).
- [x] **No references to the excluded vendor platform in the report.**
- [x] **Executive answer matches the matrix.** "No"; the guideword worksheet (#4) is ABSENT.

*Part B (consolidation plan) is held until this Part A is reviewed, per the brief.*
