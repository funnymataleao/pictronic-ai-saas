# JUP-95 Corrective Wave Plan

Created: 2026-04-09T19:56Z
Parent: [JUP-95](/JUP/issues/JUP-95)

## Objective
Bring unauthorized `/` experience to premium multi-block landing quality and enforce strict guest/auth isolation aligned with `Overview.md`.

## Execution Streams
1. Lead Developer: [JUP-103](/JUP/issues/JUP-103)
   - Harden auth gate in middleware/layout
   - Guarantee no guest leakage of feed/assets data
2. Frontend Engineer: [JUP-104](/JUP/issues/JUP-104)
   - Implement premium multi-section Noir landing (not single block)
   - Preserve private Pinterest-like feed only after login
3. Integration Specialist: [JUP-105](/JUP/issues/JUP-105)
   - Produce guest/auth isolation e2e evidence and API probes

## Closure Gates (JUP-95)
- Incognito on `http://127.0.0.1:3000/` shows only public landing
- Landing has complete premium structure (hero + value + workflow + CTA)
- Authenticated user reaches private feed and prompt workflow
- Evidence bundle posted from all three streams
- Invariants preserved: bridge-first, contract-first, runtime split, zero-manual-intervention
