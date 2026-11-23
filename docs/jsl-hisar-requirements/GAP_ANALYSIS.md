# JSL Hisar: requirement gap analysis and build plan

Source: Harpreet's email listing 10 modules for the Hisar plant. Audited 2026-11-22 against both repos (`safeops_360`, `safeops_360_bakend`), read-only, with file evidence.

**Status key**
- **BUILT**: works end to end with real data.
- **PARTIAL**: some parts exist, with named gaps.
- **MOCK**: a `Phase2Scaffold` page with fake rows.
- **MISSING**: nothing exists.

## 1. Summary

| # | Client ask | Overall | What exists | Main gaps |
|---|---|---|---|---|
| 1 | Permit to Work: scan the paper permit, realtime dashboard, analytics | PARTIAL | Full lifecycle (~45 endpoints, 15 statuses). Generic flow analytics tab. | **Scan → digital permit is missing.** No realtime board (`docs/ptw-control-center/PLAN.md` is 0% built and waiting for sign-off). No analytics by area, contractor or cycle time. The "active" count uses deprecated statuses (bug). |
| 2 | HIRA | BUILT | Study → entry → hazard register, residual risk, control hierarchy, review cycles, approvals, Copilot builder, calibration v2 (flag off) | No "HIRA reviewed" KPI on any screen (the widget exists but is never imported). No risk-matrix write API. Import is a script only. |
| 3 | HAZOP | MISSING | Nothing. `/process-safety` is MOCK (hidden from the sidebar but reachable by URL). | Everything: nodes, guideword×parameter worksheet, deviation → cause → consequence → safeguard → recommendation, sessions, report. See `docs/diagnostics/PHA_DIAGNOSTIC.md`; Part B is held for review. |
| 4 | Contractor Safety Management, end to end | PARTIAL (~45%), EPC-only | Worker onboarding, induction, medical, 9-check gate pass, prequalification fields | Works only on EPC `ConstructionSite`, not `Plant`. Sidebar block is commented out. No prequalification questionnaire or scoring, no approval flow, no contract/work-order entity, no periodic or end-of-contract evaluation, no blacklist flow, no contractor 360 view. |
| 5 | Observations: realtime dashboard, JSL SAS integration, "picture gives everything" | PARTIAL | Full CRUD/SLA/closure. Copilot photo → observation draft. Analytics tab. | **SAS portal integration is missing** (no outbound connector). The photo flow takes about 7 taps, never fills location, and is not in the mobile `(field)` layout. The Field Capture AI never fires because of the wizard step order. No auto-refresh. |
| 6 | MOC & PSSR | PARTIAL | MOC 5-step wizard, approval chain, 17-state transitions, closure gates, effectiveness review | PSSR is a 5-item JSON checklist inside MOC. No PSSR register, templates or sign-off matrix. The `pssr → implementation` transition is backwards. Impact assessment and dependent records have no create path. |
| 7 | QR-code inspections: extinguishers, hydrants, detectors | PARTIAL (backend only) | `FireEquipment` register, due dates, daily status job, CAMS inspection link | **No QR image or label printing. No scan → checklist.** No fire checklist templates. No equipment create/detail UI. `/fire-safety` is not in the sidebar. |
| 8 | IMS/MIS realtime dashboard | PARTIAL | Configurable dashboard (real data, manual refresh). Scorecard (15 indicators). LTIFR and severity rate computed. | **Missing registers:** toolbox talks, show cause notices, safety committee meetings, MOM tracker, mock drill scheduling. Missing tiles: audits, HIRA reviewed, external trainings, severity rate, manpower. No auto-refresh. |
| 9 | PSI / Chem advisor | PARTIAL (data only) | `HazardousMaterial` (CAS, GHS, SDS ref, incompatibilities) as a tab under Facilities | No chemical register screen, compatibility checker, PSI document set or AI advisor. `/industrial-hygiene` is MOCK. |
| 10 | Knowledge bank | MISSING | Nearest equivalent is One Point Lessons (versioning plus read acknowledgement) | Controlled document library, categories, versions, company-wide read access, search, AI Q&A with citations. |

## 2. Per-module detail

### 2.8 IMS/MIS indicators

| Indicator | Data captured | On a dashboard | Status |
|---|---|---|---|
| Trainings (count) | TrainingSchedule / Session | Only as % compliance | PARTIAL |
| Toolbox talks | Only as FLRA fields | No | MISSING (register) |
| Manpower | Manhours (headcount + hours) | `/manhours` only | PARTIAL |
| Frequency rate | `frequency_rates.ltifr` | Yes | BUILT |
| Severity rate | `frequency_rates.severity_rate` | Manhours KPI only | PARTIAL |
| Inspections | Inspection, CAMS | Yes | BUILT |
| Audits | CamsEngagement | `/cams` only | PARTIAL |
| External trainings | `TrainingSchedule.isExternalTrainer` | No | PARTIAL |
| Show cause notices | No | No | MISSING |
| HIRA reviewed | HiraReviewCycle | Tab counts only | PARTIAL |
| Safety committee meetings | No | No | MISSING |
| MOM tracker | No (CAPA workaround only) | No | MISSING |
| Mock drill schedule and closure | FireDrill (no create API) | `/emergency-response` is MOCK | PARTIAL |
| Safety audit schedule and closure | CAMS programme and calendar | `/cams` only | BUILT (not on the IMS view) |

### 2.1 PTW scan
Reuse `AnthropicVisionProvider` (`app/services/ai/capture_providers.py`) and the Copilot `update_ptw_draft` mapping. Add `POST /api/ptw/scan` (image or PDF page), a structured extraction schema, and a review screen that prefills `permit-form.tsx` and keeps the source scan as a `PermitAttachment`.

### 2.5 SAS integration
Blocked on the client. We need the SAS portal API spec, auth method, field mapping and direction (push, pull or both). Reusable pieces: the `DomainEvent` outbox, the scheduler (a `sas_sync` job), and the inbound webhook pattern from `whatsapp.py`.

## 3. Build plan

| Phase | Scope | Depends on |
|---|---|---|
| 0: quick fixes | PTW active-count bug. Mount the HIRA review-compliance widget. Add Fire Safety to the sidebar. Fix the MOC PSSR transition direction. | none |
| **1: IMS/MIS** | New registers: Toolbox Talks, Show Cause Notices, Safety Committee and other meetings with an MOM action tracker, mock drill scheduling (extends FireDrill). `/ims` dashboard with every indicator in item 8, plant and period filters, 60 s auto-refresh. | DDL and permission scripts run on prod |
| 2: QR fire inspections | Equipment create/detail. QR label sheet (print). `/q/fire/{code}` scan → mobile checklist → result updates the due date; a defect raises a CAPA or puts the item out of service. Seed checklists for extinguisher, hydrant, hose reel and detector. | Phase 1 deploy pattern |
| 3: PTW scan + control center | Scan-to-permit (above). PTW live board per PLAN.md. | PLAN.md decisions D1–D12 |
| 4: Observation one-photo | Mobile "snap & send" in `(field)`: a single photo gives AI type, category, severity and description; location from a QR area tag or GPS; one confirm tap. | SAS spec for the integration half |
| 5: Knowledge bank | Controlled documents on `Attachment`, categories, versions, read acknowledgement, company-wide read, search, Copilot Q&A with citations | none |
| 6: CSM end to end | Generalise to Plant. Prequalification questionnaire and scoring, approval, contract/work order, periodic and closing evaluation, blacklist/renewal, contractor 360 view. | none |
| 7: Process safety | HAZOP (PHA Part B), standalone PSSR, chemical register and compatibility, PSI/Chem advisor | Part B review |

## 3a. Build status

### Phase 1: IMS/MIS. Code complete 2026-11-22, not deployed
- **Backend:**
  - `app/models/ims.py`, `app/services/ims.py`, `app/routers/ims.py` (`/api/ims/*`).
  - `POST /api/fire/drills` and `POST /api/fire/drills/{id}/cancel` in `app/routers/fire_safety.py`.
  - Tests: `tests/test_ims.py` (15). The full suite passes (1,904). An in-process end-to-end run against SQLite passed all 38 workflow checks.
- **Frontend:**
  - `/ims` (dashboard, 60 s refresh), `/ims/toolbox-talks`, `/ims/show-cause`, `/ims/meetings`, `/ims/meetings/[id]`, `/ims/mom`, `/ims/mock-drills`.
  - Sidebar gets a new "IMS / MIS" section, and Fire Safety is now linked under Operational Safety.
  - Type-check is clean.
- **Deploy order:**
  1. `npm run db:apply-ims`
  2. `npm run db:apply-ims-permissions`
  3. Deploy the backend.
  4. Deploy the frontend.

  The sidebar entries stay hidden until IMS.READ is granted.

### Phases 2–7: code complete 2026-11-23, not deployed
Everything is built: QR fire inspections, PTW scan + Control Center + insights, observation Snap & Report + Live dashboard + SAS connector, knowledge bank, CSM, HAZOP + Process Safety hub, PSSR + PSI / Chem advisor.

Verification:
- Backend suite: 2,182 passed.
- In-process end-to-end scripts: IMS 38, PTW 32, observations 74, knowledge bank 97, fire 64, CSM 100, HAZOP 65, PSSR/PSI 104, all passing.
- Frontend `tsc`: 0 errors.
- Route scan: 1,435 routes, no duplicates, no shadowing.

Deploy steps are in `DEPLOY_RUNBOOK.md`.

### Phase 0 decisions
- **PTW "active" count:** left as is. The deprecated statuses are never written, so the count already equals ACTIVE, which matches its `/ptw?status=ACTIVE` drill-through.
- **MOC `pre_startup_review` order:** deferred to Phase 7. The backend treats PSSR as coming both before and after implementation (`routers/moc.py` status order vs the emergency rule at line 831). That needs a design decision, not a patch.

## 4. Open questions for the client or the team
1. JSL SAS portal: API documentation, environment URL, credentials, and which observation fields go across in which direction.
2. PTW control center: sign-off on PLAN.md decisions D1–D12.
3. HAZOP: review PHA diagnostic Part A before Part B is built.
4. Show cause notices: who issues them (HSE or HR)? Does the client want a penalty amount field and a contractor-company penalty ledger?
5. Meetings: which committee types to seed (Apex / Plant Safety Committee / Department / Contractor safety meet)?
