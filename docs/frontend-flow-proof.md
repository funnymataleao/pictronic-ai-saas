# Pictronic Frontend Flow Proof (JUP-4)

## Endpoint -> UI State Mapping

- `GET /api/projects`
  - UI: Projects list (`/`) grid, empty state, create/refresh controls.
- `POST /api/projects`
  - UI: Create Project form and optimistic insertion at top of projects list.
- `GET /api/projects/:id/assets`
  - UI: Workspace asset grid with status badges and metadata health state.
  - Guard: tolerates `metadataStatus` / `metadata_status` shape drift and degrades safely.
- `POST /api/projects/:id/generate`
  - UI: Generate form submit, working state, new assets in grid.
- `POST /api/assets/:id/approve`
  - UI: Approve action from card/editor, transition to `approved`, upload-eligible.
- `POST /api/assets/:id/metadata/regenerate`
  - UI: Regenerate action from card/editor, metadata recovery from timeout/failed.
- `PATCH /api/assets/:id/metadata`
  - UI: Lightbox editor save metadata (`title`, `tags`) with guard-safe fallback state.
  - Polling refresh keeps the lightbox state aligned with latest backend values.
- `GET /api/uploads?projectId=:id`
  - UI: Upload Queue panel status timeline (`queued/uploading/uploaded/failed`).
- `POST /api/uploads/adobe`
  - UI: Start Adobe Upload button for selected approved assets.
- `GET /api/local-node/status`
  - UI: `Connect Local Node` panel status badge + last-seen/checked timestamps.
- `POST /api/local-node/connection-token`
  - UI: `Generate Connection Token` button with deterministic state handling:
    - loading: button shows `Generating...`, actions disabled via `working=true`
    - success: token + expiry rendered, node status refreshed
    - error: error surfaced in `Local Node error` box
  - Runtime host mapping proof:
    - app runtime host serves endpoint: `127.0.0.1:3000`
    - control-plane host does not serve app endpoint: `127.0.0.1:3100` -> route not found
- `GET /api/runtime/readiness`
  - UI: `Runtime Readiness` panel + reliability guard message.
  - Poll guard: bridge probe now includes `/api/bridge/nodes/{nodeId}/poll` and marks readiness degraded on non-JSON/HTML fallback.
  - Recovery guidance shown in UI when poll contract breach is detected (runtime target + poll JSON contract checks).

## Pipeline Statuses Rendered

- Asset: `generating`, `processing`, `ready`, `approved`, `uploading`, `uploaded`, `failed`
- Metadata: `ok`, `pending`, `timeout`, `failed`
- Upload queue: `queued`, `uploading`, `uploaded`, `failed`

## Real-Time Behavior

- Workspace poller refreshes assets/uploads every 5 seconds while tab is visible.
- Manual refresh remains available for immediate sync.

## Contract Guard Matrix (v1.1)

- Happy path: canonical `metadataStatus=ok|pending|failed|timeout` -> normal badges and actions.
- Backward compatibility: `metadataStatus=completed|active` -> normalized to `ok|pending`.
- Snake case drift: `metadata_status` accepted when `metadataStatus` missing.
- Metadata nesting drift: missing top-level `title/tags` can fall back to `metadata.title/tags`.
- Unknown metadata status: fallback to `pending`, UI stays interactive, mismatch message shown.
- Unknown asset status: fallback to `processing`, no runtime crash.
- Missing optional fields: empty values injected, card/lightbox still render.
- Non-object item in list: converted to synthetic fallback asset entry with explicit error text.

## Proof: Generate -> Approve -> Upload Queue

1. `POST /api/projects/:id/generate` returns accepted jobs; poller refresh shows new cards.
2. `POST /api/assets/:id/approve` moves card to `approved`, enables upload queue selection.
3. `POST /api/uploads/adobe` creates queue events; Upload Queue panel shows status timeline.

## Visual Proof Artifact

- Flow diagram: `docs/public/generate-approve-upload-flow.svg`
- First-asset validation report (`JUP-10`): `docs/jup-10-first-asset-validation.md`
- Bridge UX correction proof (`JUP-10` reopen scope): `docs/jup-10-bridge-ui-proof.md`
- Token UX runtime smoke (`JUP-19`, post `JUP-18/JUP-20`): `docs/e2e/jup19-token-smoke-summary-20260404T225328Z.md`
- Poll guard proof (`JUP-34`): `docs/e2e/jup34-poll-guard-summary-20260408T212824Z.md`
- UI runtime network stabilization (`JUP-77`): `docs/e2e/jup77-network-stabilization-20260409T141523Z.md`
- Bridge auth telemetry in autonomy UI (`JUP-81`): `docs/e2e/jup81-auth-telemetry-20260409T144037Z.md`
- Preflight guard proof (`JUP-37`): `docs/e2e/jup37-preflight-guard-20260408T213313Z-summary.md`
