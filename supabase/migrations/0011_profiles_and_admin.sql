-- ============================================================================
-- Profiles + admin layer (migration 0011)
-- ============================================================================
-- Introduces a `profiles` table mirroring auth.users with app-level fields:
--   - trees_planted     (moved from localStorage so admin can edit it)
--   - score_adjustment  (admin-applied points added to computed totalScore)
--   - blocked           (admin can revoke access)
--   - last_seen_at      (heartbeat, refreshed on each session bootstrap)
--   - display_name, avatar_url, email (copied from auth metadata)
--
-- Adds an `is_admin()` SQL helper that checks the current user's email
-- against a hardcoded allowlist (currently: talbh818@gmail.com). Admins can
-- read every profile, edit selected admin-only fields, and delete activity
-- data of any user.
--
-- Existing per-user RLS on habits / habit_logs / habit_slot_assignments is
-- left intact and EXTENDED so admins can also read & delete those rows.
-- Idempotent — safe to re-run.
-- ============================================================================

-- ------------------------------------------------------------------
-- 1. profiles table
-- ------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text,
  display_name      text,
  avatar_url        text,
  trees_planted     int  not null default 0,
  score_adjustment  int  not null default 0,
  blocked           boolean not null default false,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles(email);

alter table public.profiles enable row level security;

-- ------------------------------------------------------------------
-- 2. is_admin() helper
-- ------------------------------------------------------------------
-- Reads the email claim from the request's JWT. Returning a stable boolean
-- means RLS policies don't need to know the allowlist themselves.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() ->> 'email') in ('talbh818@gmail.com'),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------------
-- 3. profiles RLS — owner full access; admin read all / update some
-- ------------------------------------------------------------------
drop policy if exists "profiles owner select"  on public.profiles;
drop policy if exists "profiles admin select"  on public.profiles;
drop policy if exists "profiles owner insert"  on public.profiles;
drop policy if exists "profiles owner update"  on public.profiles;
drop policy if exists "profiles admin update"  on public.profiles;
drop policy if exists "profiles admin delete"  on public.profiles;

create policy "profiles owner select"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles admin select"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- Owner can insert their own row (bootstrap on first login).
create policy "profiles owner insert"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Owner can update their own row. App should only edit "safe" fields
-- (email/display_name/avatar/last_seen_at/trees_planted); admin-only fields
-- (blocked, score_adjustment) are still writable here for the owner — there
-- is no per-column RLS, so we trust the app for now. The admin update policy
-- below is what lets admins write to *other* users' rows.
create policy "profiles owner update"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles admin update"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "profiles admin delete"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- ------------------------------------------------------------------
-- 4. auto-update updated_at on profiles
-- ------------------------------------------------------------------
create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row
  execute function public.touch_profile_updated_at();

-- ------------------------------------------------------------------
-- 5. auto-create a profile row whenever a new auth user is created
-- ------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name',
             split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- Backfill: create profiles for any auth.users that exist already.
insert into public.profiles (id, email, display_name, avatar_url)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name',
           u.raw_user_meta_data ->> 'name',
           split_part(u.email, '@', 1)),
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
on conflict (id) do nothing;

-- ------------------------------------------------------------------
-- 6. Extend existing RLS so admins can read & delete user activity data
-- ------------------------------------------------------------------
-- habits ----------------------------------------------------------------
drop policy if exists "habits admin select" on public.habits;
create policy "habits admin select"
  on public.habits for select
  to authenticated
  using (public.is_admin());

drop policy if exists "habits admin delete" on public.habits;
create policy "habits admin delete"
  on public.habits for delete
  to authenticated
  using (public.is_admin());

-- habit_slot_assignments -----------------------------------------------
drop policy if exists "assignments admin select" on public.habit_slot_assignments;
create policy "assignments admin select"
  on public.habit_slot_assignments for select
  to authenticated
  using (public.is_admin());

drop policy if exists "assignments admin delete" on public.habit_slot_assignments;
create policy "assignments admin delete"
  on public.habit_slot_assignments for delete
  to authenticated
  using (public.is_admin());

-- habit_logs -----------------------------------------------------------
drop policy if exists "logs admin select" on public.habit_logs;
create policy "logs admin select"
  on public.habit_logs for select
  to authenticated
  using (public.is_admin());

drop policy if exists "logs admin delete" on public.habit_logs;
create policy "logs admin delete"
  on public.habit_logs for delete
  to authenticated
  using (public.is_admin());
