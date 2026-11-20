# Copilot "Draft from Input": decisions and open questions

This file is updated every phase. Status is one of OPEN, PROPOSED or DECIDED. Evidence for every item is in `docs/diagnostics/COPILOT_DRAFT_PHASE0.md`.

## Open: needed before Phase 1

| ID | Question | Proposed answer | Status |
|---|---|---|---|
| Q1 | The brief asks for a per-**tenant** flag, but the codebase has no tenant model (single-tenant deployment, scope = Plant). Where does `copilot_draft_enabled` live? | Per-plant config table on the `HiraCalibrationConfig` pattern. `plantId NULL` is the deployment default; a plant row overrides it. A JSON `config` holds caps, allowed form types and the confidence threshold. Effective = licence `AI_ASSIST` AND plant module entitlement AND flag row. No rows = OFF. | OPEN |
| Q2 | Which Azure LLM: Azure OpenAI or an Azure AI Foundry deployment? Endpoint, deployment name, API version, auth method and region? | Provider interface `DraftLLMProvider` (vision + forced structured output + usage) with an Azure adapter first. The existing Anthropic paths are left unchanged; the draft service never calls the public Anthropic API. | OPEN, **blocking** |
| Q3 | Originals "in private Blob only": the platform stores all media in a private Supabase Storage bucket with signed URLs, not Azure Blob. Reuse it, or provision Azure Blob for draft media? | Reuse the existing private bucket under a `copilot-drafts/` prefix, through the existing `storage.py`. It is private, short-lived signed URLs only. Revisit if Azure Blob is mandated. | OPEN |
| Q4 | Gate-1 "live API" = production (main deploys to Azure / Vercel; no staging). OK to run Gate 1 on prod with the flag ON for one test plant only? | Yes, on one low-traffic plant (not JSL-HSR), with additive DDL only. | OPEN |
| Q5 | Observation severity is already computed by `SeverityMatrixRule`, and deviations need an override reason. Should the AI propose severity at all? | The AI proposes type and STOP category/sub-category. Severity defaults to the matrix suggestion (`source: from_context`). The AI may flag "consider higher" as a warning only, never set it. | OPEN |
| Q6 | Voice: no server-side STT exists; the browser Web Speech transcript is the only one. Use Azure AI Speech, or accept the on-device transcript as `text`? | Phase 1: accept the on-device transcript as `text`. Add Azure AI Speech behind `ITranscriptionProvider` later if needed. | OPEN |
| Q7 | The existing chat Copilot already pre-fills observations from photos. Keep both paths? | Keep both, with one shared validator and grounding module so they can't diverge. The draft service is the structured, audited path; the chat path stays as it is. | OPEN |
| Q8 | Phase 4: offline capture already exists for `/capture` (Dexie outbox, service worker). Is extending it in scope? | Extend the capture outbox with a "request draft on sync" flag rather than build a new queue. | OPEN |

## Decided

None yet. Phase 0 is diagnostic only.
