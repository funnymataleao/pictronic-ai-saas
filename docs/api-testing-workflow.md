# API Testing Workflow (Insomnia-Only)

## Decision

- Single source of truth for API manual testing: `docs/insomnia-collection.json`.
- Browser "на глаз" checks and ad-hoc `curl` are no longer accepted as primary validation for Pictronic API contracts.

## Scope

- Runtime API on `http://localhost:3000/api/*`.
- Control-plane API on `http://localhost:3100/api/*` (for orchestration and debugging).

## Team Rule (effective immediately)

1. Any new API endpoint must be added to the Insomnia collection in the same change set.
2. Frontend integration starts only after endpoint exists in collection with request examples.
3. Failure drills (auth, readiness, queue, bridge poll) must run from Insomnia requests and be attached to issue evidence.
4. Idempotent endpoints must always be tested with explicit `Idempotency-Key` header.
5. Any UI API change description must reference the exact Insomnia request name (for example `POST /api/projects/{projectId}/generate`).

## Guardrail Automation (JUP-150)

- Route coverage + idempotency guardrail script: `python3 ops/runtime/verify_insomnia_guardrail.py`.
- NPM alias: `npm run ops:insomnia:guardrail:check`.
- CI workflow: `.github/workflows/insomnia-guardrail.yml`.

What this check enforces:
1. Every HTTP method exported from `app/api/**/route.ts` has a matching request in `docs/insomnia-collection.json`.
2. Critical idempotent POST scenarios fail-fast if `Idempotency-Key` header is missing in collection requests:
   - `/api/projects/{projectId}/generate`
   - `/api/uploads/adobe`
   - `/api/assets/{assetId}/approve` (when route exists in runtime)

## Required endpoint families in collection

- Auth: `/api/auth/*`
- Projects: `/api/projects/*`
- Bridge: `/api/bridge/nodes/*`, `/api/bridge/jobs/*`
- Runtime signals: `/api/health`, `/api/runtime/readiness`, `/api/job-events*`
- Local connector: `/api/local-node/*`
- Uploads/integrations: `/api/uploads*`, `/api/stock-connections/adobe*`

## How to use

1. Open Insomnia.
2. Import `docs/insomnia-collection.json`.
3. Set Base Environment variables (`base_url_runtime`, `base_url_control`, ids/tokens).
4. Run requests by groups; keep request/response payloads as issue evidence.

## Frontend Pre-Integration Checklist (mandatory)

Run these requests in order before FE wiring or FE API refactors:

1. `POST /api/auth/login` (capture `session_cookie`)
2. `GET /api/health`
3. `GET /api/runtime/readiness`
4. `POST /api/projects`
5. `POST /api/projects/{projectId}/generate`
6. `POST /api/uploads/adobe`
7. `GET /api/uploads`

Contract notes from runtime validation:
- `POST /api/projects/{projectId}/generate` requires `provider` in JSON body.
- For local runtime validation use `provider=local` and `model=sdxl`.
- Auth-gated routes must include runtime session cookie from `POST /api/auth/login`.

Evidence requirements per issue:
- Save raw headers and response body for every request above.
- Save `run-summary.json` with `projectId`, `assetId`, idempotency keys, and endpoint statuses.
- Add the evidence directory path to the issue comment.

## Governance

- PRs touching API routes without corresponding Insomnia update are rejected.
- Collection diffs are reviewed by Lead Developer and Integration Specialist.
- Frontend Engineer consumes only collection-defined contracts.
