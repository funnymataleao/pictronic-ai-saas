# Runtime Dashboard Contract Guardrail

Date: 2026-04-09
Issue: [JUP-88](/JUP/issues/JUP-88)
Parent: [JUP-86](/JUP/issues/JUP-86)

## Policy

Production dashboard surfaces must not consume temporary/debug recovery artifacts directly.

Guardrail:
- `GET /api/health` now serves a dashboard-safe payload by default.
- `GET /api/health?view=ops` serves full operational diagnostics for runbooks and debugging.

## Dashboard-safe contract rules

Dashboard payload must not include:
- recovery log timelines (`recovery.log`)
- bridge auth debug history (`autonomyMode.bridgeAuth.history`)
- raw low-level recovery reason strings from watchdog internals

Dashboard payload may include stable operational state:
- status (`ok | degraded | failed`)
- recovery status and coarse reason
- last recovery/error timestamps and counters
- autonomy mode summary fields

## Rationale

This preserves API stability for existing ops/debug tooling while preventing technical debug data from leaking into normal UI flows.

## Implementation notes

- UI health hook now calls `GET /api/health?view=dashboard`.
- Ops tools can continue using `GET /api/health?view=ops` for full diagnostics.
