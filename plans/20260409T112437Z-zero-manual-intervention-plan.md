# Zero Manual Intervention Plan (Emergency Wave)

Date: 2026-04-09
Parent issue: [JUP-56](/JUP/issues/JUP-56)
Master blocker: [JUP-57](/JUP/issues/JUP-57)

## Objective
Bring Pictronic runtime to browser-only operability with zero manual terminal intervention.

## Workstreams
1. Lead Developer stream: [JUP-63](/JUP/issues/JUP-63)
- PM2/systemd managed processes for Next.js runtime and bridge connector.
- Watchdog recovery for 401/500 with auto `--register` and atomic token refresh.
- Remove dependency on manual `.env.local`; move to system/runtime environment provisioning.

2. Frontend stream: [JUP-64](/JUP/issues/JUP-64)
- Add explicit browser-side autonomy panel (`Autonomy Mode`).
- Disable risky actions when automation is degraded/inactive.
- Produce desktop/mobile evidence.

3. Integration stream: [JUP-65](/JUP/issues/JUP-65)
- Run 10s watchdog with documented restart behavior.
- Execute three live drills (app down, unauthorized bridge, transient 500).
- Publish SLA evidence (`<=30s`) and timelines.

## Execution Gate
Do not close [JUP-57](/JUP/issues/JUP-57) or [JUP-56](/JUP/issues/JUP-56) until all streams have proof artifacts and a browser-only validation pass.
