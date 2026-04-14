# Pictronic Overview (MVP Source of Truth)

Last updated: 2026-04-09
Owner: Product Architect (CEO)

## 1) Product Goal

Pictronic is an AI-powered SaaS production machine for stock authors. The MVP must maximize author throughput from generation to Adobe upload with minimal operator effort and deterministic system behavior.

## 2) Core Stack

- Frontend/App runtime: Next.js (`:3000`)
- Control plane/orchestration: Paperclip API (`:3100`)
- Data layer: Supabase
- Queue/integration: BullMQ + Adobe Stock FTP adapter
- Local connector: ComfyUI + Ollama bridge connector

## 3) Architecture Invariants (Non-Negotiable)

1. Bridge-first: generation/upload flows depend on live bridge capability checks.
2. Contract-first: frontend and integration strictly follow API v1.1 envelopes, enums, and idempotency behavior.
3. Runtime split: Pictronic app routes are served from `:3000`; Paperclip control-plane remains on `:3100`.
4. Zero manual intervention target: recovery from runtime/connectivity/token failures happens automatically without board terminal actions.

## 4) Runtime Split Rules

- `http://127.0.0.1:3000/api/...`: Pictronic runtime routes (`/projects`, `/assets`, `/uploads`, `/runtime/readiness`, `/bridge/...`)
- `http://127.0.0.1:3100/api/...`: Paperclip control-plane API only
- Calling Pictronic runtime routes on `:3100` is invalid and expected to return not found.

## 5) API and Contract Baseline

- Base path: `/api`
- Success envelope: `{ "ok": true, "data": ... }`
- Error envelope: `{ "ok": false, "error": { "code": "...", "message": "...", "details": ... } }`
- Idempotency-Key is mandatory for:
  - `POST /projects/{projectId}/generate`
  - `POST /assets/{assetId}/approve`
  - `POST /uploads/adobe`

Canonical status models:

- `assets.status`: `generating | processing | ready | approved | uploading | uploaded | failed`
- `assets.metadataStatus`: `pending | ok | failed | timeout`
- `jobs.status`: `pending | active | completed | failed`
- `uploads.status`: `queued | uploading | uploaded | failed`

## 6) Integration Pipeline

- Queues: `generation`, `metadata`, `upload`, `upload_dlq`
- Deterministic handoffs:
  - `generation.completed -> metadata.enqueue`
  - `asset.approved -> upload.enqueue`
- Adobe adapter reason codes are normalized for operator-facing remediation and tracked via `job_events`.

## 7) Env Contract (Hard Gate)

Required runtime keys:

- `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY`

If missing, readiness must fail deterministically with `503 ENV_CONTRACT_MISSING`.

## 8) Recovery and UX Control Surface

- Readiness and health signals drive a deterministic UI state machine:
  - `recovering` > `failed` > `degraded` > `healthy`
- Workspace must surface:
  - `lastRecoveryAt`
  - `lastErrorCode`
  - `attemptCount`
  - `nextRetryIn`
- Generate/upload actions must be blocked when recovery state is `failed`.

## 9) Current Delivery Focus (Critical Path)

Master blocker:

- `JUP-57` ZERO MANUAL INTERVENTION

Execution tracks:

- Lead Developer: process supervision + auto-register token recovery
- Frontend Engineer: browser-only autonomy/recovery control surface
- Integration Specialist: watchdog drills + reliability proof under fault injection

JUP-57 closure criteria:

1. Runtime self-healing proven in live environment
2. 401/500/poll faults recover automatically
3. Board can operate from browser only, without terminal intervention

## 10) Canonical References

- `docs/api-v1.md`
- `docs/frontend-api-guardrails.md`
- `docs/integrations-bullmq-adobe.md`
- `docs/env-contract.md`
- `docs/infrastructure-recovery-status-mapping.md`
- `docs/e2e/` (execution proofs)
