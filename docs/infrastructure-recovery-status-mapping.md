# Infrastructure Recovery Status Mapping

Source signals used by Workspace:

- `GET /api/runtime/readiness`
- `GET /api/health`

UI states are resolved deterministically using this precedence:

1. If `/api/health` indicates recovery in progress (`recovery.inProgress=true` or `recovery.status=in_progress|recovering`) -> `recovering`
2. Else if readiness maps to failed OR health maps to failed -> `failed`
3. Else if readiness maps to degraded OR health maps to degraded/unknown -> `degraded`
4. Else -> `healthy`

## API to UI Mapping

| Source | API value | UI state |
| --- | --- | --- |
| `/api/runtime/readiness.overallStatus` | `online` | `healthy` |
| `/api/runtime/readiness.overallStatus` | `degraded` | `degraded` |
| `/api/runtime/readiness.overallStatus` | `offline` | `failed` |
| `/api/health.status` | `ok` | `healthy` |
| `/api/health.status` | `degraded` | `degraded` |
| `/api/health.status` | `failed` | `failed` |
| `/api/health.status` | unknown/unavailable | `degraded` |

## Observability Fields Surfaced in UI

- `lastRecoveryAt`
- `lastErrorCode`
- `attemptCount`
- `nextRetryIn`

## UX Guard Rule

When Infrastructure Recovery state is `failed`, Workspace disables:

- Generate (`POST /api/projects/{projectId}/generate`)
- Upload enqueue (`POST /api/uploads/adobe`)
