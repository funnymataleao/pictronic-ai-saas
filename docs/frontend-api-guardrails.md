# Frontend API Guardrails (API v1.1)

Owner: Senior Backend Engineer (Lead Developer guardrails)

This document is binding for frontend foundation work and must be treated as the source of truth alongside `docs/api-v1.md`.

## 1) Contract Boundaries (FE Foundation vs API v1.1)

Base path: `/api`

Runtime split (non-negotiable):
- App runtime (Next.js): `http://127.0.0.1:3000/api/...`
- Control plane (Paperclip): `http://127.0.0.1:3100/api/...`
- Pictronic bridge/runtime routes (`/api/projects/...`, `/api/uploads/...`, `/api/runtime/readiness`, `/api/bridge/...`) must be called on `:3000`, not `:3100`.

Required FE domains and endpoints:
- Readiness: `GET /runtime/readiness`
- Projects: `GET /projects`, `POST /projects`, `GET /projects/{projectId}`
- Generate: `POST /projects/{projectId}/generate`
- Metadata: `PATCH /assets/{assetId}/metadata`, `POST /assets/{assetId}/metadata/regenerate`
- Upload: `POST /assets/{assetId}/approve`, `POST /uploads/adobe`, `GET /uploads?projectId={id}`
- Bridge visibility for ops UX: `GET /bridge/nodes`, `POST /bridge/nodes/{nodeId}/poll`

`GET /projects/{projectId}` must be treated as the canonical main-dashboard aggregation endpoint and include:
- `project` summary for header cards
- `generationQueue` counters for queue strip/badges
- `masonryFeed` items for gallery bootstrapping
- `runtimeBridgeBadge` (`runtimeStatus`, `bridgeRoutesStatus`, `bridgeNodeStatus`)
- `surfaceState` + `stateReasonCode` for deterministic Empty/Loading/Error rendering

Idempotency requirement (write routes):
- FE must always send `Idempotency-Key` for:
  - `POST /projects/{projectId}/generate`
  - `POST /assets/{assetId}/approve`
  - `POST /uploads/adobe`

## 2) Canonical DTO Rules

Success envelope:
```json
{ "ok": true, "data": ... }
```

Error envelope:
```json
{ "ok": false, "error": { "code": "...", "message": "...", "details": ... } }
```

Status enums (client-facing canonical):
- `Asset.status`: `generating | processing | ready | approved | uploading | uploaded | failed`
- `Asset.metadataStatus`: `pending | ok | failed | timeout`
- `Upload.status`: `queued | uploading | uploaded | failed`

Dashboard surface state:
- `surfaceState`: `empty | loading | ready | error`
- `stateReasonCode`: `EMPTY_DATASET | QUEUE_ACTIVE | BRIDGE_NODE_UNAVAILABLE | TRANSIENT_FAILURE | READY`

Cursor semantics:
- Cursor token is opaque to FE.
- FE must pass cursor as returned by backend (`nextCursor`) without decoding/mutating.
- Assets list contract:
  - `GET /projects/{projectId}/assets?status={optional}&cursor={optional}`
  - returns `{ projectId, sort, items, nextCursor }` in `data`.

## 3) Typed FE Contract/Guard Coverage (implemented)

Implemented in frontend client layer:
- `lib/api/contracts.ts`
  - Added typed envelopes: `ApiSuccessEnvelope<T>`, `ApiErrorEnvelope`, `ApiEnvelope<T>`.
  - Added typed cursor pages: `CursorPage<T>`, `AssetListPayload`, `ProjectListPayload`, `UploadListPayload`.
- `lib/api/guards.ts`
  - Added `parseApiErrorEnvelope()` for strict backend error-envelope parsing.
  - Added `parseAssetListPage()` with typed cursor extraction and required `projectId/sort` validation.
  - Added page parsers for projects/uploads cursor contracts.
- `lib/api/client.ts`
  - Error handling now parses `{ ok:false, error:{...} }` correctly instead of assuming flat error payloads.
  - Added `listAssetsPage(projectId, { status?, cursor? })` to keep cursor-aware fetch path typed.
  - Kept existing `listAssets(projectId)` as a compatibility wrapper returning `page.items`.

## 4) Bridge Route + Runtime Split Safety Checks

Frontend must preserve these checks:
- If bridge poll/preflight responds with HTML or non-JSON, treat as contract breach and block reliability actions.
- If readiness reports degraded/offline critical dependencies (`bridge_routes`, `bridge_node`, `comfyui`, `ollama`, `redis_bullmq`, `queue`), show blocker state and prevent reliability run actions.
- Keep ops link target on app runtime route: `/api/runtime/readiness`.

Runtime env contract:
- Supabase runtime contract is defined in `docs/env-contract.md`.
- Missing required runtime env values now fail fast with deterministic `503` + `ENV_CONTRACT_MISSING` (error envelope), instead of degraded fallback.

## 5) Supabase/BullMQ Compatibility Notes (No Breaking Change)

Compatibility stance:
- No API shape changes were made to bridge/generation/upload endpoints.
- New typed contracts are frontend-client-side safety additions only.
- Existing queue/integration semantics remain unchanged (`generation`, `metadata`, `upload`, `upload_dlq`).
- Readiness `contract_v2` remains backward-compatible; FE uses existing keys and status semantics.

Operational implications:
- Missing required Supabase env values are now hard runtime contract failures (`503 ENV_CONTRACT_MISSING`) until fixed and runtime restarted.
- Supabase network/service reachability continues to surface via `contract_v2.dependencies.supabase` (`ok`/`failed`) once env contract is satisfied.
- Redis/BullMQ degradation continues to surface via readiness and queue diagnostics; FE gate behavior remains guardrail-level (prevent risky actions), not schema-changing behavior.

## 6) Risks / Constraints for FE + Integration Specialist

- `details` in error envelope is intentionally open (`unknown`); FE must treat it as display/log context, not typed business logic.
- Cursor format is backend-owned and may change encoding; FE must treat it as opaque string.
- `listAssets()` remains backward-compatible but drops cursor in its return type by design; pagination-aware surfaces must use `listAssetsPage()`.
- Idempotency keys are required for create-job routes; missing key remains hard failure (`400`).
- Runtime host confusion (`:3000` vs `:3100`) is still the highest operational integration risk for connector flows.

## 7) Contract Parity Statement

Contract parity with API v1.1 is confirmed for FE guardrails in scope (readiness, projects, generate, metadata, upload), including:
- envelope semantics,
- status enums,
- cursor pagination handling,
- bridge/runtime host split constraints.

## 8) Runtime Contract Smoke Command

Use the backend guardrail smoke command before integration handoff:

- `npm run ops:runtime:contract:check`

This command validates:
- runtime/control-plane split expectations (`:3000` runtime routes, `:3100` Paperclip control API),
- readiness + health reachability from runtime,
- bridge poll auth boundary behavior on invalid token (`401` expected),
- cursor + retry invariants for dashboard asset pagination.

## 9) JUP-125 Release Invariants (Landing Hero + Page Composition)

Release gate for [JUP-118](/JUP/issues/JUP-118) landing work:
- Public landing (`GET /`) stays reachable to guests (`200`) and remains the only guest-visible app surface.
- Private app surfaces stay protected:
  - `GET /admin` for guests must redirect (`307`) to `/`.
  - `GET /api/projects` for guests must return `401` with contract error envelope.
- Runtime/control-plane split remains hard:
  - Runtime UI/API on `:3000`.
  - Control-plane API on `:3100`.
  - `GET :3100/api/agents/me` is reachable (`200`) while `GET :3000/api/agents/me` remains unavailable to app runtime (`404` expected).

Evidence (2026-04-10):
- Guardrail probes: `docs/e2e/jup125-guardrails-20260410T142041Z/`
- Runtime contract smoke: `docs/e2e/jup94-infinite-scroll-guardrail-20260410T142001Z-summary.json`
- Guest isolation regression: command `npm run ops:auth:guest-isolation:check` (PASS)
- Build stability: command `npm run build:isolated` (PASS)
