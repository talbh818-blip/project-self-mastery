-- ============================================================================
-- User profile extensions + support tickets + avatars storage (migration 0012)
-- ============================================================================
-- Backs the "משתמש" (User) screen:
--   - Adds first_name / last_name / phone / theme to public.profiles so the
--     user can manage their own identity + UI preference.
--   - Creates public.support_tickets for feedback + support submissions that
--     surface in the admin "ניהול" panel.
--   - Creates a public `avatars` storage bucket with per-user folder RLS so
--     each user can only manage files under their own auth.uid().
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ------------------------------------------------------------------
-- 1. profiles: new columns
-- ------------------------------------------------------------------
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text,
  add column if not exists phone      text,
  add column if not exists theme      text not null default 'dark';

-- Constraint on theme — add separately so re-runs don't fail.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_theme_check'
  ) then
    alter table public.profiles
      add constraint profiles_theme_check
      check (theme in ('dark', 'light'));
  end if;
end$$;

-- ------------------------------------------------------------------
-- 2. support_tickets table
-- ------------------------------------------------------------------
create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('feedback', 'support')),
  subject     text,
  message     text not null check (length(message) > 0),
  status      text not null default 'open' check (status in ('open', 'closed')),
  created_at  timestamptz not null default now()
);

create index if not exists support_tickets_user_created_idx
  on public.support_tickets (user_id, created_at desc);

create index if not exists support_tickets_status_idx
  on public.support_tickets (status);

alter table public.support_tickets enable row level security;

drop policy if exists "tickets owner insert" on public.support_tickets;
drop policy if exists "tickets owner select" on public.support_tickets;
drop policy if exists "tickets admin select" on public.support_tickets;
drop policy if exists "tickets admin update" on public.support_tickets;

create policy "tickets owner insert"
  on public.support_tickets for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "tickets owner select"
  on public.support_tickets for select
  to authenticated
  using (auth.uid() = user_id);

create policy "tickets admin select"
  on public.support_tickets for select
  to authenticated
  using (public.is_admin());

create policy "tickets admin update"
  on public.support_tickets for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------------
-- 3. avatars storage bucket + per-user folder policies
-- ------------------------------------------------------------------
-- Bucket is created idempotently. Public read so <img src> works without
-- signed URLs; writes are scoped to the authenticated user's own folder.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars public read"  on storage.objects;
drop policy if exists "avatars owner insert" on storage.objects;
drop policy if exists "avatars owner update" on storage.objects;
drop policy if exists "avatars owner delete" on storage.objects;

create policy "avatars public read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy "avatars owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
