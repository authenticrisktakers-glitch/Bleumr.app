-- License keys table for Bleumr subscription validation
create table if not exists license_keys (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  tier text not null check (tier in ('pro', 'stellur')),
  active boolean not null default true,
  max_activations int not null default 3,
  current_activations int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz -- null = never expires
);

-- Index for fast lookup
create index idx_license_keys_key on license_keys (key);

-- RLS: no direct client access — only edge functions read this table
alter table license_keys enable row level security;
-- No RLS policies = no client access (edge functions use service_role key)
