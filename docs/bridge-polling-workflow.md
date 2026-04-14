# Bridge Polling Workflow (JUP-11 scope correction)

This document defines the bridge channel where backend schedules jobs and Local Node workers execute them via pull-based polling.

## Goal

- Backend publishes jobs to the bridge queue.
- Local connector polls and leases a job.
- Local connector returns outcome using `ack`, `retry`, or `fail`.
- No direct localhost/cloud calls from backend integration runtime.

## Auth Boundaries

- Backend/admin endpoints require `x-bridge-admin-key`.
- Node registration requires `x-bridge-bootstrap-key`.
- Local worker runtime endpoints require `Authorization: Bearer <connection-token>`.

## Endpoints

- `POST /api/bridge/nodes/register`
  - Bootstrap a node and issue connection token.
- `POST /api/bridge/nodes/{nodeId}/heartbeat`
  - Keep node online and refresh metadata.
- `POST /api/bridge/jobs`
  - Enqueue a bridge job (`kind`, `payload`, optional `maxAttempts`, `backoffMs`).
- `GET /api/bridge/jobs?status=queued|leased|completed|failed`
  - Observe queue state.
- `POST /api/bridge/nodes/{nodeId}/poll`
  - Pull one available job. Returns `job: null` if queue is empty.
  - Successful poll creates lease (`leaseId`, `leaseExpiresAt`) and increments `attemptsMade`.
- `POST /api/bridge/jobs/{jobId}/result`
  - Settle active lease with `outcome: ack|retry|fail`.

## Settlement Semantics

- `ack`
  - Marks job `completed`.
  - Stores optional result payload.
- `retry`
  - If `attemptsMade < maxAttempts`: moves job back to `queued` with delay (`retryDelayMs` or default `backoffMs`).
  - If retry budget exhausted: marks `failed`.
- `fail`
  - Marks job `failed` immediately with `reason`.

## Lease Semantics

- Poll returns an exclusive lease bound to `{nodeId, leaseId}`.
- Settlement requires exact lease match; stale/foreign lease is rejected.
- If lease expires before settlement:
  - job is re-queued with backoff when retry budget remains,
  - or marked `failed` when retry budget is exhausted.

## Stability Rules

- Poll is idempotent in empty-queue case (`job: null`).
- Job ordering is FIFO by enqueue order for available jobs.
- All bridge state is process-global in runtime (`globalThis.__pictronicBridgeRuntime__`) for route-to-route consistency.

## Integration Direction

Backend should enqueue upload work into bridge queue and wait for Local Node result events, rather than performing direct Adobe FTP calls itself.
