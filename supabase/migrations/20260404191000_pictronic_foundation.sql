-- Pictronic MVP foundation schema
-- Covers JUP-3 scope: users, projects, assets, asset_metadata, jobs,
-- stock_connections, uploads, job_events.

create extension if not exists pgcrypto;

create type asset_status as enum (
  'generating',
  'processing',
  'ready',
  'approved',
  'uploading',
  'uploaded',
  'failed'
);

create type job_type as enum ('generate', 'metadata', 'upload');
create type job_status as enum ('pending', 'active', 'completed', 'failed');
create type stock_provider as enum ('adobe');
create type upload_status as enum ('queued', 'uploading', 'uploaded', 'failed');

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  plan_tier text not null default 'free',
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  prompt_template text not null default '',
  style_hints text not null default '',
  tags_hints text not null default '',
  provider_default text not null default 'local',
  upload_defaults jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  original_url text,
  thumbnail_url text,
  prompt text not null,
  provider text not null,
  model text,
  status asset_status not null default 'generating',
  metadata_status job_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists asset_metadata (
  asset_id uuid primary key references assets(id) on delete cascade,
  title text,
  tags_json jsonb not null default '[]'::jsonb,
  category_hint text,
  generated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  type job_type not null,
  asset_id uuid references assets(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  payload_json jsonb not null default '{}'::jsonb,
  idempotency_key text,
  status job_status not null default 'pending',
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(type, idempotency_key)
);

create table if not exists stock_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider stock_provider not null default 'adobe',
  ftp_host text not null,
  ftp_login text not null,
  ftp_password_encrypted text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists uploads (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  provider stock_provider not null default 'adobe',
  csv_url text,
  remote_path text,
  status upload_status not null default 'queued',
  error text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  level text not null,
  message text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_user_id on projects(user_id);
create index if not exists idx_projects_created_at on projects(created_at desc);

create index if not exists idx_assets_project_id on assets(project_id);
create index if not exists idx_assets_status on assets(status);
create index if not exists idx_assets_created_at on assets(created_at desc);

create index if not exists idx_jobs_project_id on jobs(project_id);
create index if not exists idx_jobs_asset_id on jobs(asset_id);
create index if not exists idx_jobs_status on jobs(status);
create index if not exists idx_jobs_created_at on jobs(created_at desc);

create index if not exists idx_uploads_asset_id on uploads(asset_id);
create index if not exists idx_uploads_status on uploads(status);
create index if not exists idx_uploads_created_at on uploads(created_at desc);

create index if not exists idx_job_events_job_id on job_events(job_id);
create index if not exists idx_job_events_created_at on job_events(created_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_assets_updated_at
before update on assets
for each row execute function set_updated_at();

create trigger trg_jobs_updated_at
before update on jobs
for each row execute function set_updated_at();

create trigger trg_uploads_updated_at
before update on uploads
for each row execute function set_updated_at();
