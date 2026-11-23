# PTW Control Center — Build Plan

Status: **plan only, awaiting sign-off before Phase 1 code.** Nothing has been changed except this file.

Repos:
- `safeops_360` is Next.js 15 / React 19, Prisma (schema + hand-written DDL scripts), shadcn UI, lucide, Recharts, Playwright.
- `safeops_360_bakend` is FastAPI + SQLAlchemy 2 async (Python 3.11+), pytest, and an in-process asyncio scheduler.

---

## 1. What exists today (inspected)

| Area | What's there | File(s) |
|---|---|---|
| API layer | Every browser `/api/*` call goes through a catch-all proxy to the **Python** backend with a minted bearer token. | `src/app/api/[...path]/route.ts`, `src/lib/backend-token.ts` |
| PTW API | ~45 endpoints for CRUD, suspend/resume, gas tests, extensions, crew, annexures, lifecycle (accept/complete/handback/cancel/archive), evidence and reports. | `app/routers/ptw*.py` |
| Workflow | Python engine handles approvals and record-status sync, with `WorkflowInstance/History/Task` and a per-step `slaHours`. There is also a TS engine used by the `/ptw` page's lazy expiry sweep. | `app/services/workflow_engine.py`, `src/lib/workflow/engine.ts` |
| Permit model | `Permit` has `plantId`, `areaId`, `type` (7 types), `status` (15 values), `validFrom/validTo`, `executionState`, `closureType`, `conflictingPermitIds`, `lotoExecutionId` and `isDeleted/isArchived`. | `prisma/schema.prisma:1109`, `app/models/permit.py` |
| Children | Crew (`PermitCrewMember` with `removedAt`), gas tests (`PermitGasTestPlan` + `PermitGasTestReading.refreshDueBy`), isolations (verified flags), approvals, suspensions, extensions, action evidence. | same |
| Areas | `Area { name, plantId, ownerUserId }`. There is no geometry, layout image or sort order. | `schema.prisma:349` |
| Shifts | `MasterItem` type `SHIFT` with `startHour/endHour` extras. | `schema.prisma:447` |
| Tenancy | **No tenant column on Permit/Area/Plant.** The deployment is single-tenant per customer instance. Isolation is by plant via `access_scope.build_query_scope(actor, "PTW.READ")` plus the PTW named-party rule. | `app/services/access_scope.py`, `ptw_access.py` |
| SIMOPS | Same-area plus overlapping-window detection at post-closure writes `conflictingPermitIds`. There is no rules table or distance logic. | `app/services/ptw_post_closure.py:80` |
| Alerts | `DomainEvent` → `ImpactRule` → `Alert` (dedupe key, severity, audience roles). `ptw_expiring` rule and expiry scan. | `app/services/alerts/*`, `app/models/alerts.py` |
| Jobs | Dependency-free asyncio scheduler with `JobRun` audit, run-now and misfire recovery. **No Inngest anywhere.** | `app/services/scheduler.py` |
| Notify | `send_email`, `send_sms` (MSG91/Twilio) and `whatsapp.send_message`. | `app/services/notifications.py`, `whatsapp.py` |
| AI | `anthropic_client` wrapper, `settings.anthropic_model`, and a redaction service. | `app/services/ai/*`, `app/core/config.py` |
| Fire safety | `AssemblyPoint` and `FireEquipment` tables. There are **no impairments**. | `app/models/fire_safety.py` |
| `/ptw` UI | Server component reading Prisma directly, with tabs from `registers.ts` (`Permits | Analytics | Signals`), KPI strip and table. | `src/app/(dashboard)/ptw/page.tsx`, `src/lib/registers.ts:137` |
| UI kit | shadcn in `src/components/ui` (tabs, select, sheet, dialog, skeleton, tooltip, table…). Tokens are HSL vars in `globals.css`. | |
| Data fetching | No React Query or SWR. Client components poll with `useEffect` + `setInterval`. | e.g. `components/dashboard/kpi-card.tsx` |
| Migrations | **Hand-written, idempotent DDL scripts** (`prisma/apply-*-ddl.ts`), with the models declared in `schema.prisma` and mirrored in SQLAlchemy. `prisma db push` is **not** used because it would drop the hand-DDL tables. Alembic is empty. | `prisma/apply-ptw-execution-state-ddl.ts` |
| Tests | Backend uses pytest (many DB-less unit tests). Frontend has Playwright only (`e2e/`) and no unit runner. | |

---

## 2. Where the brief doesn't match this repo (decisions needed)

| # | Brief says | Repo reality | Recommendation |
|---|---|---|---|
| D1 | TypeScript Node API | All PTW logic, RBAC and scoping live in **Python**, and the browser reaches it through the proxy. | Build the API, rules engine and jobs in **Python** and the UI in TS. A Node API would duplicate the workflow, RBAC and scope logic. |
| D2 | Inngest | Not installed. The deployment is on-prem/airgapped-capable and already has a scheduler with `JobRun` audit. | Use the **existing scheduler** for cron jobs, and `DomainEvent` plus a direct call for event-triggered evaluation. Same function names (`ptw.exceptions.evaluate` …). Adding Inngest means new infra in every customer instance. |
| D3 | `tenant_id` on every table | There is no tenant concept, and isolation is by plant. | **Don't add `tenant_id`**: it would always be null. Scope everything by `plantId` through `build_query_scope`. Test "no cross-plant leakage" instead of cross-tenant. |
| D4 | `permit_events` written from the workflow service | Status changes happen in at least 5 places: Python engine, lifecycle routers, suspend/resume, scheduler expiry, and the TS sweep. | **Postgres trigger on `"Permit".status` change** as the single writer, so nothing gets missed. The actor comes from a `SET LOCAL safeops.actor_id` the backend sets per request, and falls back to `SYSTEM`. This would be the repo's first trigger. The alternative is a helper called at every site, which is easy to miss. |
| D5 | `permit_workers` | `PermitCrewMember` exists (user, role, contractor via user, `removedAt`). | **Extend `PermitCrewMember`** with `checkedInAt/checkedOutAt` instead of a new table. "Workers under permit" means crew on ACTIVE permits with no `removedAt`. |
| D6 | `gas_readings` | `PermitGasTestReading.refreshDueBy` exists. | Skip, and reuse it. |
| D7 | React Query/SWR | Neither is installed. | A small `usePolling(url, 30s)` hook: refetch on focus, keep last good data, back off on error. No new dependency. |
| D8 | `/ptw/control-center?mode=wall` with no sidebar | `(dashboard)/layout.tsx` always renders the sidebar, and layouts can't read `searchParams`. | Middleware **rewrites** `?mode=wall` to `src/app/(kiosk)/ptw-wall`, which has a bare layout and no next-auth. The URL stays as specified. |
| D9 | Control Center is the default `/ptw` tab | Existing links and bookmarks point at `/ptw` expecting the register. | Make Control Center the default as asked. `/ptw?tab=register` stays the register, and inbox and email links are repointed. Say if you'd rather keep the register as default. |
| D10 | Exceptions table | The `Alert` framework is similar but has no owner, ack, resolve-on-clear or `notified` log. | New `PtwException` table per the brief. Notifications go through the existing mailer and WhatsApp. Critical exceptions also emit an `Alert` so they appear in the existing bell/inbox. |
| D11 | Unit tests for the TS delta formatter | No frontend unit runner. | Use `tsx --test` (Node's built-in runner, `tsx` is already a dev dep). No vitest. |
| D12 | Seed script `pnpm seed:ptw-control-center` | npm + `tsx prisma/seed-*.ts` convention. | `npm run db:seed-ptw-control-center`. It creates its own plant "Meridian North Works · West DC Bhiwandi" and refuses to run unless `ALLOW_DEMO_SEED=1`, because **main is the production deploy**. |

Also: DDL scripts are written but **not run by me**, which matches how earlier PTW DDL was handled. You run them, and I'll list the commands per phase.

---

## 3. Data model (Phase 1). One DDL script: `prisma/apply-ptw-control-center-ddl.ts`

All changes are additive and idempotent. They are declared in `schema.prisma` and mirrored in `app/models/ptw_control_center.py`.

| Table / change | Notes |
|---|---|
| `PlantLayout { id, plantId, storagePath, widthPx, heightPx, metresPerPct, updatedAt }` | One layout image per plant, in the existing Supabase storage service. Scale for SIMOPS distance lives here; the brief put it on the area, but every area shares the image's scale. |
| `Area` + `layoutId?`, `geometry Json?` (`[{x,y}]` 0–100), `sortOrder Int?` | `ownerUserId` already exists. |
| `ZoneGuidance` | As in the brief, keyed by `areaId` (unique). `assemblyPoint` and `extinguisherLocations` are text, pre-filled from `AssemblyPoint/FireEquipment` where present. |
| `Impairment` | As in the brief. `code` is per plant (`IMP-0001` via the existing `numbering` service). `systemType` and `status` are TEXT with CHECK constraints, the house style with no new native enums. Also `escalationCount`, `lastEscalatedAt`. |
| `ImpairmentRule` | As in the brief, plus `plantId?` (null = global default). Seeded with the four defaults. |
| `PermitControl { permitId, controlKey, satisfiedAt, satisfiedById, attachmentId? }` | **Added, not in the brief.** It stores "required control ticked or attached" for `require_controls`. |
| `SimopsRule` | As in the brief, plus `plantId?`. |
| `PermitCrewMember` + `checkedInAt`, `checkedOutAt` | See D5. |
| `PermitEvent` | Columns as in the brief, plus the trigger (D4). Backfill inserts one synthetic row per permit (`createdAt`, current status). It also replays existing `WorkflowHistory` and `PermitActionEvidence` rows so dwell history isn't empty on day one. |
| `PtwException` | As in the brief, plus `plantId`, and a unique open key `(ruleKey, permitId, impairmentId, areaId) WHERE resolvedAt IS NULL`. |
| `PtwShiftBrief` | As in the brief, plus `plantId`. |
| `PtwKioskToken { id, plantId, label, tokenHash, createdBy, revokedAt, lastSeenAt }` | Revocable. The JWT carries `{kiosk:true, plantId, scope:"ptw.cc.read"}`. |
| Indexes | `Permit(plantId, status, validTo)` and `PermitEvent(permitId, createdAt)`. Payload-path indexes get checked with `EXPLAIN` against 10k permits. |

**Derived statuses** are SQL expressions in one Python module (`ptw_cc/derived.py`) used by both the API and the rules. "Open" means not in `CLOSED|CANCELLED|REJECTED`.
- `expired_open`: past `validTo` and still open. This includes `status=EXPIRED` rows with `closureType IS NULL`.
- `active_outside_validity`
- `expiring_2h`
- `starting_2h`

**Pipeline steps:** Submitted → Issuer Review → Safety Review → Plant Head → Issued (awaiting accept) → Active → Suspended → Work completed → Closure pending (Handback) → Closed. Dwell comes from `PermitEvent`, and the SLA from `WorkflowStep.slaHours`, with config fallback `PTW_STEP_SLA_MIN_*` for non-workflow steps.

---

## 4. Backend layout (Python)

```
app/services/ptw_cc/
  derived.py            derived status predicates (SQL + pure)
  impairment_check.py   pure: (permit, active impairments, rules, controls) → Allow | Block(reason) | RequireControls([...])
  simops.py             pure: polygon centroid, distance × metresPerPct, rule match
  rules/                one file per exception rule, each a pure fn(snapshot) → list[ExceptionDraft]
    permit_expired_open.py, simops_conflict.py, impairment_overdue.py,
    hot_work_blocked_by_impairment.py, gas_test_overdue.py, loto_not_verified.py,
    approval_sla_breach.py, competency_expiring.py, handover_unacknowledged.py
  engine.py             load snapshot per plant → run rules → upsert open / resolve cleared
  payload.py            builds the single control-center payload (one round of ~8 SQL aggregates)
  brief.py              redacted input → Claude → cache by inputs_hash
  notify.py             email + WhatsApp, appends to PtwException.notified
app/routers/ptw_control_center.py   GET /api/ptw/control-center, zones/:id/guidance (GET/PUT), kiosk tokens
app/routers/ptw_impairments.py      CRUD, approve, activate, restore, cancel
```

**Hooks into existing code:**
- The impairment check is called from permit create/submit (`ptw.py`) and from `workflow_engine.approve` for PTW.
- A permit whose `require_controls` controls are unmet **cannot leave Issuer Review**: approve returns 409 with the missing list.
- Raising or activating an impairment calls the engine for that plant right away, which creates the `high` exceptions for running permits.

**Jobs:** these are added to the scheduler registry in place of Inngest.

| Job | Interval / trigger |
|---|---|
| `ptw_exceptions_evaluate` | Every 5 min for all plants. Also called inline after permit and impairment writes, debounced per plant. |
| `ptw_impairment_escalate` | Every 30 min. Notifies the area owner and approver; after 2 misses it escalates to the plant head (role `PLANT_HEAD` at that plant). |
| `ptw_shift_brief` | Hourly, plus at shift start (from `MasterItem SHIFT.startHour`). Skips if the `inputs_hash` is unchanged. |

**Shift brief:**
- Model from `ANTHROPIC_MODEL` via the existing client.
- The input is the payload's counts only: no names, no user ids, run through `redaction`.
- The prompt requires 3 sentences or fewer, numbers only from the input, and the riskiest phrase wrapped in `[[…]]` so the UI can highlight it.
- Model, cost and latency are logged server-side only and never shown in the UI.

---

## 5. Frontend layout

```
src/app/(dashboard)/ptw/page.tsx                 tab=control-center (default) | register | analytics | signals | impairments
src/app/(kiosk)/ptw-wall/{layout,page}.tsx       wall mode (rewritten from /ptw/control-center?mode=wall)
src/features/ptw/control-center/
  use-control-center.ts      polling hook + URL-synced filters (plant, area, shift, range)
  theme.css                  [data-theme="ops"] scoped tokens (added to globals.css token block)
  header-bar.tsx  shift-brief.tsx  kpi-band.tsx  site-map.tsx  zone-guidance.tsx
  exceptions-list.tsx  impairments-panel.tsx  pipeline.tsx  timeline.tsx  type-mix.tsx
  compliance-health.tsx  contractors.tsx  safety-signals.tsx  wall-rotator.tsx
  format.ts (+ format.test.ts)   zero-baseline delta, durations, "Ns ago"
src/features/ptw/impairments/   register tab, raise/approve/restore forms, guidance editor, layout + polygon editor
```

- The UI uses shadcn primitives only (Select, Tabs, Dialog, Sheet, Tooltip, Skeleton).
- Charts are plain SVG and divs. Recharts isn't needed for these shapes.
- Fonts come from `next/font` (Inter, Space Grotesk, JetBrains Mono), self-hosted at build time, so they're airgap-safe.
- The permit type colour map covers all 7 repo types. `GENERAL_COLD` gets slate `#94A3B8` and glyph `G`. `ELECTRICAL_LOTO` uses the electrical colour and glyph `E`.

---

## 6. Phases (each ends with lint + typecheck + pytest and a checklist report)

1. **Phase 1, data and logic.**
   - DDL script plus Prisma/SQLAlchemy models.
   - `PermitEvent` trigger and backfill, and derived statuses.
   - Impairment and SIMOPS checks wired into create/approve.
   - The 9 exception rules and engine, the payload endpoint, and the seed.
   - Pytest units for every rule, the checks, and the derived statuses. Integration tests against a seeded DB.
   - A 10k-permit perf script (`scripts/ptw_cc_perf.py`).
   - **Stop.**
2. **Phase 2, UI core.**
   - Ops theme, header, brief banner, KPI band, exceptions, pipeline, timeline, type mix, bottom row.
   - Screenshots at 1440 and 390 px. **Stop.**
3. **Phase 3, map and impairments.**
   - Layout upload and polygon editor, pins, SIMOPS ring, guidance strip and editor, impairments panel and tab with CRUD.
   - **Stop.**
4. **Phase 4, live and wall mode.**
   - Scheduler jobs, notifications, shift brief, kiosk token and wall route, reconnect behaviour.
   - Playwright smoke test. **Stop.**

## 7. Risks and open points

- **Two workflow engines (TS and Python).** The trigger (D4) covers both. I won't refactor the TS sweep.
- **"Approved by" on impairments** needs a permission. Proposed: `PTW_IMPAIRMENT.APPROVE` (EHS admin, Fire Officer). Guidance write needs the area owner or `PTW_ZONE.MANAGE`. Both are added by an `apply-*-permissions.ts` script, the same way as LOTO/BE.
- **`loto_not_verified`** fires when the permit is ACTIVE and has a `PermitIsolation` without `isolationVerifiedAt`, or a linked `lotoExecutionId` whose execution isn't verified.
- **`competency_expiring`** uses the training-engine certificate expiry for active crew.
- **`handover_unacknowledged`** has no handover entity today. Proposal: a permit ACTIVE across a shift boundary with no `PermitEvent`/evidence from the incoming shift's receiver within 30 min. Confirm, or drop it for v1.
- **The 10k-permit p95** is measured locally against the dev DB, not production.
