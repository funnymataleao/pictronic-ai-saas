# Integration Foundation: BullMQ + Adobe FTP (JUP-5)

This MVP integration layer models three queue lanes with deterministic handoffs:

- `generation`: create image generation jobs
- `metadata`: auto-enqueued after `generation.completed`
- `upload`: enqueued on `asset.approved` and on `/api/uploads/adobe`
- `upload_dlq`: dead-letter queue for upload failures after retries

## Queue policy

Defined in `lib/integrations/types.ts`:

- `generation`: `attempts=3`, `backoffMs=2000`
- `metadata`: `attempts=3`, `backoffMs=2000`
- `upload`: `attempts=5`, `backoffMs=10000`
- `upload_dlq`: `attempts=1`, `backoffMs=0`

## Adobe adapter + reason codes

Adapter entrypoint: `lib/integrations/adobe-ftp-adapter.ts`

- Simulates FTP upload attempts with deterministic retry behavior
- Normalizes failures to UI-friendly reason codes:
  - `ADOBE_CONNECTION_MISSING`
  - `ADOBE_AUTH_REJECTED`
  - `ADOBE_FTP_UNREACHABLE`
  - `ADOBE_IMAGE_UPLOAD_FAILED`
  - `ADOBE_CSV_UPLOAD_FAILED`
  - `ADOBE_UNKNOWN_ERROR`

### Reason-code mapping (UI + remediation)

| Reason code | UI message | Remediation action |
| --- | --- | --- |
| `ADOBE_CONNECTION_MISSING` | Adobe FTP connection settings are missing or incomplete. | Re-open Adobe stock connection setup and save host/user/password. |
| `ADOBE_AUTH_REJECTED` | Adobe FTP rejected the provided credentials. | Rotate credentials in Adobe and update stored connection values. |
| `ADOBE_FTP_UNREACHABLE` | Adobe FTP is unreachable, retry later. | Retry with backoff; if persistent, escalate as provider/network incident. |
| `ADOBE_IMAGE_UPLOAD_FAILED` | Image upload to Adobe FTP failed. | Validate generated binary path/content and retry upload. |
| `ADOBE_CSV_UPLOAD_FAILED` | Metadata CSV upload to Adobe FTP failed. | Validate CSV schema/content and regenerate metadata payload. |
| `ADOBE_UNKNOWN_ERROR` | Unexpected Adobe upload failure. | Inspect `job_events` payload + adapter logs, then retry or escalate. |

## Runtime env

- `PICTRONIC_ADOBE_FAIL_ATTEMPTS`: if set to `N>0`, the first `N` upload attempts fail (for e2e retry testing)
- `NEXT_PUBLIC_PIC_MOCK`: set to `false` to use API routes instead of frontend in-memory mock

## Local run

```bash
npm run dev
```

## Local e2e trace example

```bash
# 1) Generate two assets -> auto metadata enqueue/completion
curl -sS -X POST "http://localhost:3000/api/projects/proj_demo/generate" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: gen-001' \
  -d '{"prompt":"minimalist office","provider":"local","model":"sdxl","batch":2}'

# 2) Approve one asset -> upload enqueue + processing
curl -sS -X POST "http://localhost:3000/api/assets/asset_demo_1/approve" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: approve-001' \
  -d '{"projectId":"proj_demo","batch_id":"9ff249e3-08a2-4a68-b16e-4f18d23ae6e2"}'

# 3) Query events by trace id (from step 2 uploadJob.traceId)
curl -sS "http://localhost:3000/api/job-events?traceId=trace_approve-001"

# 4) Query uploads status
curl -sS "http://localhost:3000/api/uploads?projectId=proj_demo"
```

## JUP-8 validation snapshots

Using runtime-level verification (`npx tsx`) with deterministic simulated failures:

- Success trace: `trace_approve-jup8-001`
  - Event order confirms deterministic handoff: `upload.enqueue -> asset.approved -> upload.started -> adobe.attempt.failed (x2) -> adobe.attempt.succeeded -> upload.completed`
  - Final upload state: `uploaded`, `retryCount=2`, `attemptsMade=3`
- Failure trace: `trace_approve-jup8-dlq-001`
  - Event order confirms retry exhaustion and DLQ routing: `upload.failed -> upload_dlq.enqueue -> upload.dead_lettered`
  - Final upload state: `failed`, `retryCount=5`, reason code `ADOBE_FTP_UNREACHABLE`

Both traces include `batchId` in `asset.approved` event payload and use optional `batch_id` in request input (v1.1 alignment).
