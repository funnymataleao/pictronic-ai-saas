-- Binding v1.1 alignment
-- - assets.metadata_status enum alignment to pending|ok|failed|timeout
-- - uploads.batch_id nullable UUID for batch-level tracking

create type metadata_status as enum ('pending', 'ok', 'failed', 'timeout');

alter table assets
  alter column metadata_status drop default;

alter table assets
  alter column metadata_status type metadata_status
  using (
    case metadata_status::text
      when 'pending' then 'pending'::metadata_status
      when 'active' then 'pending'::metadata_status
      when 'completed' then 'ok'::metadata_status
      when 'failed' then 'failed'::metadata_status
      else 'timeout'::metadata_status
    end
  );

alter table assets
  alter column metadata_status set default 'pending'::metadata_status;

alter table uploads
  add column if not exists batch_id uuid null;

create index if not exists idx_uploads_batch_id on uploads(batch_id);
