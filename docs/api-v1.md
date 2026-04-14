# Pictronic API v1.1 Draft (Binding)

This document describes the current backend scaffold contract for [JUP-3](/JUP/issues/JUP-3).

## Conventions

- Base path: `/api`
- Runtime host separation (critical):
  - Bridge routes in this document are served by the Pictronic Next.js app runtime (for example `http://127.0.0.1:3000/api/...` in local dev).
  - Paperclip control-plane API runs on `http://127.0.0.1:3100/api/...` and does not expose Pictronic bridge routes.
  - If you call bridge paths on `:3100`, you will get `404 {"error":"API route not found"}` from Express.
- Success envelope:
  - `{"ok": true, "data": ...}`
- Error envelope:
  - `{"ok": false, "error": { "code": "...", "message": "...", "details": ... }}`
- Create-job endpoints require `Idempotency-Key`:
  - `POST /projects/{projectId}/generate`
  - `POST /assets/{assetId}/approve`
  - `POST /uploads/adobe`
- Duplicate idempotency requests:
  - same `Idempotency-Key` + same payload => deterministic replay of original response (`duplicate: true`, `200`)
  - same `Idempotency-Key` + different payload => `409 IDEMPOTENCY_KEY_REUSED`

## Status models

- `assets.status`: `generating | processing | ready | approved | uploading | uploaded | failed`
- `assets.metadataStatus`: `pending | ok | failed | timeout`
- `jobs.status`: `pending | active | completed | failed`
- `uploads.status`: `queued | uploading | uploaded | failed`

## Endpoint Examples

### 1) Generate jobs

`POST /projects/{projectId}/generate`

Bridge precondition:
- at least one registered online Bridge node with `generate` capability must exist
- otherwise `409 BRIDGE_NODE_UNAVAILABLE`

Headers:
- `Idempotency-Key: gen-20260404-001`

Success (`202`):
```json
{
  "ok": true,
  "data": {
    "projectId": "proj_123",
    "idempotencyKey": "gen-20260404-001",
    "acceptedAt": "2026-04-04T19:00:00.000Z",
    "duplicate": false,
    "idempotency": {
      "key": "gen-20260404-001",
      "scope": "generate:proj_123",
      "replayed": false
    },
    "bridgeNode": {
      "nodeId": "node-local-001",
      "machineId": "machine-001",
      "status": "online"
    },
    "jobs": [
      {
        "id": "job_1",
        "type": "generate",
        "status": "completed",
        "traceId": "trace_gen-20260404-001_1",
        "assetId": "asset_1",
        "prompt": "minimalist office workspace, natural light",
        "provider": "local",
        "model": "sdxl"
      }
    ]
  }
}
```

Error (`400`, missing idempotency key):
```json
{
  "ok": false,
  "error": {
    "code": "MISSING_IDEMPOTENCY_KEY",
    "message": "Idempotency-Key header is required for this endpoint",
    "details": null
  }
}
```

Error (`409`, idempotency key reused with different payload):
```json
{
  "ok": false,
  "error": {
    "code": "IDEMPOTENCY_KEY_REUSED",
    "message": "Idempotency-Key was already used with a different request payload",
    "details": null
  }
}
```

### 2) Assets list (cursor pagination + feed shape)

`GET /projects/{projectId}/assets?status=ready&cursor={opaqueToken}&limit=20`

Query params:
- `status` (optional): one of asset statuses
- `cursor` (optional): opaque token from previous page (`nextCursor`)
- `limit` (optional): positive integer, default `20`, max `60`

Success (`200`):
```json
{
  "ok": true,
  "data": {
    "projectId": "proj_123",
    "sort": "created_at_desc,id_desc",
    "limit": 20,
    "items": [
      {
        "id": "ast_1",
        "projectId": "proj_123",
        "originalUrl": "https://example.com/original.png",
        "thumbnailUrl": "https://example.com/thumb.webp",
        "prompt": "minimalist office workspace, natural light",
        "provider": "local",
        "model": "sdxl",
        "status": "ready",
        "metadataStatus": "ok",
        "createdAt": "2026-04-04T19:00:00.000Z"
      }
    ],
    "feedItems": [
      {
        "id": "ast_1",
        "previewUrl": "https://example.com/thumb.webp",
        "width": 1024,
        "height": 1024,
        "status": "ready",
        "metadataStatus": "ok",
        "title": "Minimalist office workspace",
        "createdAt": "2026-04-04T19:00:00.000Z"
      }
    ],
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA0LTA0VDE5OjAwOjAwLjAwMFoiLCJpZCI6ImFzdF8xIn0"
  }
}
```

### Dashboard surface (main UI contract)

`GET /projects/{projectId}`

Purpose:
- deterministic data surface for main workspace dashboard polling
- stable Empty/Loading/Ready/Error state computation on backend

Success (`200`):
```json
{
  "ok": true,
  "data": {
    "project": {
      "id": "proj_123",
      "name": "Proj 123",
      "imagesCount": 4,
      "approvedCount": 2,
      "thumbnailUrls": [
        "https://example.com/thumb/asset_1.webp"
      ],
      "createdAt": "2026-04-09T10:20:00.000Z"
    },
    "generationQueue": {
      "pendingJobs": 0,
      "activeJobs": 1,
      "completedJobs": 3,
      "failedJobs": 0,
      "totalJobs": 4
    },
    "masonryFeed": {
      "projectId": "proj_123",
      "sort": "created_at_desc,id_desc",
      "limit": 24,
      "items": [
        {
          "id": "ast_1",
          "previewUrl": "https://example.com/thumb.webp",
          "width": 1024,
          "height": 1024,
          "status": "ready",
          "metadataStatus": "ok",
          "title": "Minimalist office workspace",
          "createdAt": "2026-04-09T10:20:00.000Z"
        }
      ],
      "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA0LTA5VDEwOjIwOjAwLjAwMFoiLCJpZCI6ImFzdF8xIn0"
    },
    "runtimeBridgeBadge": {
      "runtimeStatus": "ok",
      "bridgeRoutesStatus": "online",
      "bridgeNodeStatus": "online",
      "onlineNodeCount": 1,
      "checkedAt": "2026-04-09T10:20:00.000Z"
    },
    "surfaceState": "loading",
    "stateReasonCode": "QUEUE_ACTIVE"
  }
}
```

State semantics:
- `surfaceState=empty` when `imagesCount=0` and no active/pending queue work
- `surfaceState=loading` when queue has `pendingJobs>0` or `activeJobs>0`
- `surfaceState=error` when queue has failures or bridge node is offline
- `surfaceState=ready` otherwise

Error (`400`, invalid cursor token):
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Query param 'cursor' is stale or invalid",
    "details": null
  }
}
```

Error (`400`, invalid limit):
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Query param 'limit' must be <= 60",
    "details": null
  }
}
```

### 3) Approve asset (enqueue upload)

`POST /assets/{assetId}/approve`

Headers:
- `Idempotency-Key: approve-20260404-001`

Request body:
```json
{
  "projectId": "proj_123",
  "batch_id": "9ff249e3-08a2-4a68-b16e-4f18d23ae6e2"
}
```

Success (`200`):
```json
{
  "ok": true,
  "data": {
    "assetId": "ast_1",
    "projectId": "proj_123",
    "idempotencyKey": "approve-20260404-001",
    "status": "approved",
    "approvedAt": "2026-04-04T19:00:00.000Z",
    "duplicate": false,
    "upload": {
      "id": "upl_1",
      "assetId": "ast_1",
      "projectId": "proj_123",
      "provider": "adobe",
      "status": "uploaded",
      "retryCount": 0,
      "createdAt": "2026-04-04T19:00:00.000Z",
      "updatedAt": "2026-04-04T19:00:01.000Z"
    },
    "uploadJob": {
      "id": "job_u1",
      "status": "completed",
      "traceId": "trace_approve-20260404-001",
      "queue": "upload"
    }
  }
}
```

Error (`400`, invalid `batch_id`):
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Field 'batch_id' must be a UUID",
    "details": null
  }
}
```

### 4) Uploads enqueue

`POST /uploads/adobe`

Headers:
- `Idempotency-Key: upl-20260404-001`

Request body:
```json
{
  "provider": "adobe",
  "projectId": "proj_123",
  "batch_id": "9ff249e3-08a2-4a68-b16e-4f18d23ae6e2",
  "assetIds": ["ast_1", "ast_2"]
}
```

Notes:
- `assetIds` must be unique within one request.

Success (`202`):
```json
{
  "ok": true,
  "data": {
    "projectId": "proj_123",
    "idempotencyKey": "upl-20260404-001",
    "acceptedAt": "2026-04-04T19:00:00.000Z",
    "duplicate": false,
    "idempotency": {
      "key": "upl-20260404-001",
      "scope": "uploads:proj_123",
      "replayed": false
    },
    "jobs": [
      {
        "id": "job_u1",
        "type": "upload",
        "status": "completed",
        "provider": "adobe",
        "assetId": "ast_1",
        "traceId": "trace_upl-20260404-001_1",
        "attemptsMade": 1,
        "reasonCode": null,
        "reasonMessage": null
      }
    ]
  }
}
```

Error (`400`, unsupported provider):
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Only adobe provider is supported in MVP",
    "details": null
  }
}
```

Error (`400`, duplicate asset ids):
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Field 'assetIds' must contain unique asset ids",
    "details": null
  }
}
```

### 5) Batch run summary

`GET /job-events/run-summary?projectId={projectId}&idempotencyKey={key}&type={optional}`

Success (`200`):
```json
{
  "ok": true,
  "data": {
    "projectId": "proj_123",
    "idempotencyKey": "upl-20260404-001",
    "tracePrefix": "trace_upl-20260404-001",
    "totalJobs": 2,
    "totalAssets": 2,
    "statusCounts": {
      "pending": 0,
      "active": 0,
      "completed": 2,
      "failed": 0
    },
    "typeCounts": {
      "generate": 0,
      "metadata": 0,
      "upload": 2
    },
    "traces": [
      {
        "traceId": "trace_upl-20260404-001_1",
        "assetId": "ast_1",
        "type": "upload",
        "status": "completed",
        "attemptsMade": 1,
        "reasonCode": null,
        "reasonMessage": null,
        "updatedAt": "2026-04-04T19:00:01.000Z"
      }
    ],
    "eventsCount": 10,
    "latestEventAt": "2026-04-04T19:00:01.000Z"
  }
}
```

## Bridge Core (JUP-12)

This section defines the local-node Bridge API contract for [JUP-12](/JUP/issues/JUP-12).

### Auth model

- Bootstrap registration auth:
  - Header: `x-bridge-bootstrap-key`
  - Env: `BRIDGE_BOOTSTRAP_KEY`
  - Dev default: `bridge-bootstrap-dev`
- Admin token management and node status auth:
  - Header: `x-bridge-admin-key`
  - Env: `BRIDGE_ADMIN_KEY`
  - Dev default: `bridge-admin-dev`
- Node heartbeat auth:
  - Header: `Authorization: Bearer <connection-token>`
  - Fallback header (for environments that strip `Authorization`): `x-bridge-connection-token: <connection-token>`

### Connection token expiry policy

- Token TTL is configurable per issuance with `ttlSeconds`.
- Allowed range: `60..2592000` seconds (`1 minute..30 days`).
- Default TTL: `86400` seconds (`24 hours`).
- Rotation immediately revokes prior token for the same node.

### 5) Register local node

`POST /bridge/nodes/register`

Headers:
- `x-bridge-bootstrap-key: bridge-bootstrap-dev`

Request body:
```json
{
  "machineId": "machine-001",
  "nodeId": "node-local-001",
  "capabilities": ["generate", "metadata", "upload"],
  "ttlSeconds": 86400
}
```

Success (`201`):
```json
{
  "ok": true,
  "data": {
    "node": {
      "nodeId": "node-local-001",
      "machineId": "machine-001",
      "capabilities": ["generate", "metadata", "upload"],
      "status": "online",
      "registeredAt": "2026-04-04T20:00:00.000Z",
      "lastSeenAt": "2026-04-04T20:00:00.000Z",
      "updatedAt": "2026-04-04T20:00:00.000Z"
    },
    "connectionToken": {
      "token": "pct_bridge_xxx_secret_xxx",
      "tokenId": "ctk_1",
      "issuedAt": "2026-04-04T20:00:00.000Z",
      "expiresAt": "2026-04-05T20:00:00.000Z"
    },
    "auth": {
      "bootstrapHeader": "x-bridge-bootstrap-key",
      "adminHeader": "x-bridge-admin-key",
      "heartbeatAuthHeader": "Authorization: Bearer <connection-token>"
    }
  }
}
```

### 6) Poll from local node

`POST /bridge/nodes/{nodeId}/poll`

Headers:
- `Authorization: Bearer <connection-token>`

Request body:
```json
{
  "machineId": "machine-001",
  "capabilities": ["generate", "upload"]
}
```

Success (`200`):
```json
{
  "ok": true,
  "data": {
    "node": {
      "nodeId": "node-local-001",
      "status": "online",
      "lastSeenAt": "2026-04-04T20:01:00.000Z"
    },
    "token": {
      "tokenId": "ctk_1",
      "expiresAt": "2026-04-05T20:00:00.000Z"
    },
    "job": {
      "jobId": "job_1",
      "kind": "generate",
      "payload": {},
      "leaseId": "lease_1",
      "leaseExpiresAt": "2026-04-04T20:01:30.000Z"
    },
    "receivedAt": "2026-04-04T20:01:00.000Z"
  }
}
```

### 7) Rotate connection token

`POST /bridge/nodes/{nodeId}/connection-token/rotate`

Headers:
- `x-bridge-admin-key: bridge-admin-dev`

Request body:
```json
{
  "ttlSeconds": 86400
}
```

Success (`200`):
```json
{
  "ok": true,
  "data": {
    "node": {
      "nodeId": "node-local-001"
    },
    "connectionToken": {
      "token": "pct_bridge_new_secret",
      "tokenId": "ctk_2",
      "issuedAt": "2026-04-04T20:02:00.000Z",
      "expiresAt": "2026-04-05T20:02:00.000Z"
    },
    "rotatedAt": "2026-04-04T20:02:00.000Z"
  }
}
```

### 8) Node statuses for UI

`GET /bridge/nodes`

Headers:
- `x-bridge-admin-key: bridge-admin-dev`

Success (`200`):
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "nodeId": "node-local-001",
        "machineId": "machine-001",
        "capabilities": ["generate", "upload"],
        "status": "online",
        "registeredAt": "2026-04-04T20:00:00.000Z",
        "lastSeenAt": "2026-04-04T20:01:00.000Z",
        "updatedAt": "2026-04-04T20:01:00.000Z"
      }
    ],
    "total": 1,
    "checkedAt": "2026-04-04T20:01:05.000Z"
  }
}
```

### 9) Local runtime preflight (deterministic health contract)

`GET /local-node/preflight`

Purpose:
- single machine-readable readiness probe for local mode before bridge polling
- checks backend runtime + local dependencies used by connector ops flow

Default checks:
- `next_runtime` (always required)
- `redis_bullmq` (required unless `PREFLIGHT_REQUIRE_REDIS_BULLMQ=false`)
- `comfyui` (required unless `PREFLIGHT_REQUIRE_COMFYUI=false`)
- `ollama` (required unless `PREFLIGHT_REQUIRE_OLLAMA=false`)

Status code:
- `200` when `data.preflight = "ok"`
- `503` when any required check fails (`data.preflight = "failed"`)

Success (`200`):
```json
{
  "ok": true,
  "data": {
    "preflight": "ok",
    "checkedAt": "2026-04-08T17:30:00.000Z",
    "runtime": {
      "nodeVersion": "v20.18.0",
      "pid": 12345,
      "uptimeSec": 240
    },
    "summary": {
      "total": 4,
      "ok": 4,
      "failed": 0,
      "skipped": 0
    },
    "checks": [
      {
        "name": "next_runtime",
        "target": "internal://next-runtime",
        "required": true,
        "status": "ok",
        "latencyMs": 0,
        "observedAt": "2026-04-08T17:30:00.000Z",
        "details": "pid=12345"
      }
    ]
  }
}
```

### 10) Runtime readiness contract v2

`GET /runtime/readiness`

Success (`200`):
```json
{
  "ok": true,
  "data": {
    "checkedAt": "2026-04-08T18:00:00.000Z",
    "overallStatus": "degraded",
    "dependencies": [],
    "contract_v2": {
      "status": "degraded",
      "dependencies": {
        "supabase": {
          "status": "degraded",
          "message": "Supabase URL is not configured."
        },
        "queue": {
          "status": "ok",
          "message": "Queue healthy: pending=0, active=0, completed=10."
        },
        "bridge": {
          "status": "ok",
          "message": "Bridge routes healthy: register=reachable (HTTP 201), jobs=reachable (HTTP 200)."
        }
      }
    }
  }
}
```

Contract semantics:
- `contract_v2.status`: `ok | degraded | failed`
- `contract_v2.dependencies`: machine-readable dependency map for `supabase`, `queue`, `bridge`

### 11) Job events telemetry contract

`GET /job-events?traceId={traceId}` (also works with `assetId` or `limit`)

Each event includes normalized telemetry fields:
- `batch_id`
- `trace_id`
- `queue_latency_ms`
- `worker_duration_ms`
- `retry_count`
- `final_status`

Telemetry sample:
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "jobId": "job_u1",
        "eventName": "upload.completed",
        "status": "completed",
        "traceId": "trace_upl-20260408-001_1",
        "batch_id": "9ff249e3-08a2-4a68-b16e-4f18d23ae6e2",
        "trace_id": "trace_upl-20260408-001_1",
        "queue_latency_ms": 4,
        "worker_duration_ms": 22,
        "retry_count": 0,
        "final_status": "completed",
        "telemetry": {
          "batch_id": "9ff249e3-08a2-4a68-b16e-4f18d23ae6e2",
          "trace_id": "trace_upl-20260408-001_1",
          "queue_latency_ms": 4,
          "worker_duration_ms": 22,
          "retry_count": 0,
          "final_status": "completed"
        }
      }
    ]
  }
}
```
