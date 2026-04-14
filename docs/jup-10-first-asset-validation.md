# JUP-10 First Asset UX Validation

Date: 2026-04-04 (Europe/Lisbon)
Environment: local Next.js runtime (`next dev` on `http://localhost:3001`)

## Scope Covered

- First asset flow: generate -> ready -> open asset detail (lightbox-equivalent API) -> approve.
- Approval handoff verification: approve action triggers upload pipeline handoff.
- Guard/fallback check for temporary API delay risk: frontend request timeout/error handling reviewed in runtime code paths.

## Executed Proof Run

### 1. Create project and generate one asset

- `POST /api/projects` -> `projectId=proj_cbab064b`
- `POST /api/projects/proj_cbab064b/generate` (`batch=1`) -> `assetId=asset_8d00e9db`, `traceId=trace_jup10-gen-001_1`

Observed state right after generate:

- `GET /api/projects/proj_cbab064b/assets`
  - `status=ready`
  - `metadataStatus=ok`

### 2. Lightbox-equivalent asset detail read

- `GET /api/assets/asset_8d00e9db`
  - Asset returned with consistent `status=ready`, `metadataStatus=ok`
  - Metadata object present (`metadata.title`, `metadata.tags`), so editor/read panel can render without refresh.

### 3. Approve action and upload handoff

- `POST /api/assets/asset_8d00e9db/approve`
  - Response: `status=approved`
  - Upload handoff in same response: `upload.status=uploaded`, `uploadJob.status=completed`
- `GET /api/uploads?projectId=proj_cbab064b`
  - Upload record exists for the same asset with `status=uploaded`

## Event Timeline Proof (Single Trace)

Source: `GET /api/job-events?assetId=asset_8d00e9db`

1. `generation.enqueue`
2. `asset.status.generating`
3. `generation.started`
4. `generation.completed`
5. `metadata.enqueue`
6. `asset.status.processing`
7. `metadata.started`
8. `metadata.completed`
9. `asset.status.ready`
10. `upload.enqueue`
11. `asset.status.approved`
12. `asset.approved`
13. `asset.status.uploading`
14. `upload.started`
15. `adobe.attempt.succeeded`
16. `asset.status.uploaded`
17. `upload.completed`

This confirms the first-asset status chain is emitted and reproducible end-to-end in one run.

## Delay/Fallback Validation Notes

For temporary API delay/failure guards, frontend behavior is protected by:

- `lib/api/client.ts`
  - hard timeout via `AbortController` (`FETCH_TIMEOUT_MS = 8000`)
  - conversion to structured `ApiError` (`timeout` / `network_error`)
- `components/workspace-surface.tsx`
  - all async actions wrapped in `try/catch`
  - errors surface in `error-box` instead of throwing runtime exceptions
  - periodic poller (`setInterval`, 5s) re-syncs state when tab is visible

Result: temporary request failures degrade to visible error state with UI still operational.

## Conclusion

`JUP-10` acceptance target is validated for the first-asset flow and approval handoff:

- generate -> ready -> approve path is reproducible;
- upload handoff after approve is confirmed by both upload API and event timeline;
- timeout/network fallback path is implemented and non-crashing by design.
