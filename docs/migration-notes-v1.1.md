# Migration Notes v1.1 (Supabase)

Scope: [JUP-3](/JUP/issues/JUP-3) binding contract sync for [JUP-4](/JUP/issues/JUP-4) and [JUP-5](/JUP/issues/JUP-5).

## Breaking changes

- `assets.metadata_status` value model is now canonicalized to:
  - `pending | ok | failed | timeout`
- Transition mapping in migration:
  - `active -> pending`
  - `completed -> ok`
  - `failed -> failed`
  - `pending -> pending`

Impact:
- Consumers expecting `completed` must switch to `ok`.
- FE/API guards should parse only canonical values listed above.

## Non-breaking changes

- Added nullable `uploads.batch_id uuid` for batch-level upload grouping.
- Added `idx_uploads_batch_id` index.

Impact:
- Existing write/read paths continue working without `batch_id`.
- Integration workers may start writing `batch_id` incrementally.

## Rollout order

1. Apply migration `20260404192500_binding_v1_1_alignment.sql`.
2. Deploy API payload changes and docs (`docs/api-v1.md`).
3. Update FE/Integration consumers to canonical `metadata_status` values.
