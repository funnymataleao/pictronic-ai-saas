# Supabase Migrations

## Files
- `migrations/20260404191000_pictronic_foundation.sql`: initial Pictronic MVP backend schema.

## Run (Supabase CLI)
```bash
supabase db reset
```

Or apply only new migrations:
```bash
supabase migration up
```

## Notes
- `jobs.idempotency_key` is unique per `type` to support safe retries.
- Enums align with `[JUP-2](/JUP/issues/JUP-2#document-plan)` state models.
- `set_updated_at()` keeps `updated_at` synced on mutable tables.
