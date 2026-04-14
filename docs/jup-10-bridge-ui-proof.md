# JUP-10 Bridge UX Proof

Date: 2026-04-04 (Europe/Lisbon)

## Scope Correction Delivered

- Removed any direct ComfyUI URL input requirement from frontend flow.
- Added `Connect Local Node` section in workspace UI.
- Added node status visibility: `Online/Offline` + `Last Seen` + `Checked At`.
- Added `Generate Connection Token` action that works through backend bridge endpoints.

## Frontend Changes

- `components/workspace-surface.tsx`
  - New `Connect Local Node` panel.
  - Status badge + node metadata + refresh button.
  - Token generation button and token expiry display.
- `lib/api/client.ts`
  - Added `getLocalNodeStatus()` and `generateLocalNodeToken()`.
- `lib/api/contracts.ts`
  - Added local node + token payload contracts.

## Backend Bridge Adapters for UI

- `GET /api/local-node/status`
  - Reads bridge node state via backend runtime.
- `POST /api/local-node/connection-token`
  - Generates/rotates connection token via backend runtime.
  - Registers first node when missing, rotates token for existing node otherwise.

Note: `/api/local-node/status` is forced dynamic to avoid stale static output.

## Runtime Smoke Check

Executed against production server (`next start`, port `3011`):

1. `POST /api/local-node/connection-token` returned:
   - `mode=registered`
   - `node.status=online`
   - `connectionToken.tokenId` present
2. `GET /api/local-node/status` returned:
   - `items.length=1`
   - same `nodeId`
   - `status=online`
   - `lastSeenAt` populated

Outcome: frontend now controls local worker onboarding through backend bridge API, with visible node health and token issuance flow as requested.
