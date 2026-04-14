# Runtime Env Contract (Supabase)

This contract is mandatory for Next.js runtime startup/readiness paths.

## Required variables

### Public variables (accessible on client and server)

- `NEXT_PUBLIC_SUPABASE_URL` (preferred) or `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (preferred) or `SUPABASE_ANON_KEY`

### Server-only variables (secrets)

- `SUPABASE_SERVICE_ROLE_KEY` (preferred) or `SUPABASE_SERVICE_KEY`

## Expected sources

- Local dev: `.env.runtime`
- Shared/dev/prod: secrets manager
- Managed startup: PM2/systemd environment injection (no `.env.local`)

## Implementation Details

- **Server-side:** All variables are required. Use `assertRuntimeEnvContract("context")` from `@/lib/runtime/env-contract` for strict validation.
- **Client-side:** Only public variables are available. Use `readPublicSupabaseEnv()` from `@/lib/env/public` for type-safe access.

## Runtime behavior

- `GET /api/runtime/readiness` validates the full contract before dependency probing.
- If any required variable is missing, runtime returns deterministic error envelope:
  - HTTP status: `503`
  - error code: `ENV_CONTRACT_MISSING`
  - `error.details.missing[]` includes logical key + accepted env variable names.
- No implicit degraded fallback is allowed for missing required env values.

## Managed Startup Guard (JUP-72)

- Managed runtime startup must pass `ops/runtime/verify-runtime-env.sh` before `npm run dev`.
- `.env.local` is automatically quarantined to `docs/e2e/.env-quarantine/.env.local.<timestamp>` and excluded from managed startup.
- Validation command:
  - `npm run ops:env:check`
