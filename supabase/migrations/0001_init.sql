-- Mirror — 0001_init
-- P0 schema + RLS (default-deny, owner-only) + private Storage bucket.
-- Safe to re-run: guarded with IF NOT EXISTS / DROP POLICY IF EXISTS.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  captured_at   timestamptz not null default now(),
  lighting_score numeric,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists sessions_user_captured_idx
  on public.sessions (user_id, captured_at desc);

create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  angle       text not null check (angle in ('front', 'left', 'right')),
  storage_path text not null,
  width       int,
  height      int,
  created_at  timestamptz not null default now(),
  unique (session_id, angle)
);
create index if not exists photos_session_idx on public.photos (session_id);

create table if not exists public.logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  date           date not null,
  sleep_hours    numeric,
  note           text,
  shine_tzone    int check (shine_tzone between 0 and 3),
  shine_cheeks   int check (shine_cheeks between 0 and 3),
  breakout_count int check (breakout_count >= 0),
  breakout_zones jsonb not null default '[]'::jsonb,
  dryness        int check (dryness between 0 and 3),
  irritation     boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists logs_user_date_idx on public.logs (user_id, date desc);

create table if not exists public.stack_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  product_name text not null,
  category     text,
  started_at   date,
  ended_at     date,
  schedule     text check (schedule in ('am', 'pm', 'both')),
  created_at   timestamptz not null default now()
);
create index if not exists stack_items_user_idx on public.stack_items (user_id);

create table if not exists public.log_adherence (
  log_id        uuid not null references public.logs (id) on delete cascade,
  stack_item_id uuid not null references public.stack_items (id) on delete cascade,
  taken         boolean not null default false,
  primary key (log_id, stack_item_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security — default-deny, owner-only on every table
-- ---------------------------------------------------------------------------

alter table public.sessions      enable row level security;
alter table public.photos        enable row level security;
alter table public.logs          enable row level security;
alter table public.stack_items   enable row level security;
alter table public.log_adherence enable row level security;

-- sessions -----------------------------------------------------------------
drop policy if exists sessions_owner_all on public.sessions;
create policy sessions_owner_all on public.sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- photos (ownership derived from the parent session) ------------------------
drop policy if exists photos_owner_all on public.photos;
create policy photos_owner_all on public.photos
  for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = photos.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = photos.session_id and s.user_id = auth.uid()
    )
  );

-- logs ---------------------------------------------------------------------
drop policy if exists logs_owner_all on public.logs;
create policy logs_owner_all on public.logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- stack_items --------------------------------------------------------------
drop policy if exists stack_items_owner_all on public.stack_items;
create policy stack_items_owner_all on public.stack_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- log_adherence (ownership derived from the parent log) ---------------------
drop policy if exists log_adherence_owner_all on public.log_adherence;
create policy log_adherence_owner_all on public.log_adherence
  for all
  using (
    exists (
      select 1 from public.logs l
      where l.id = log_adherence.log_id and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.logs l
      where l.id = log_adherence.log_id and l.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Private Storage bucket + path-scoped policies
-- Objects are keyed {user_id}/{session_id}/{angle}; the first path segment
-- must equal the requester's uid.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do update set public = false;

drop policy if exists photos_bucket_select on storage.objects;
create policy photos_bucket_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists photos_bucket_insert on storage.objects;
create policy photos_bucket_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists photos_bucket_update on storage.objects;
create policy photos_bucket_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists photos_bucket_delete on storage.objects;
create policy photos_bucket_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
