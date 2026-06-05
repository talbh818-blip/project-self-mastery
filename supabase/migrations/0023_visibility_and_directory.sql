-- ============================================================================
-- Per-resource visibility + active users directory (migration 0013)
-- ============================================================================
-- Adds per-user visibility preferences for vision + habits (two independent
-- knobs, default 'private'), a join table for the 'specific' option, and a
-- SECURITY DEFINER function the User screen calls to render a directory of
-- other active users without exposing private columns (phone, email, etc.).
--
-- The directory function bypasses RLS by design; it only returns the fields
-- that are safe to share across users. RLS on the underlying table still
-- governs everything else.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ------------------------------------------------------------------
-- 1. profiles: two visibility knobs
-- ------------------------------------------------------------------
alter table public.profiles
  add column if not exists vision_visibility text not null default 'private',
  add column if not exists habits_visibility text not null default 'private';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_vision_visibility_check'
  ) then
    alter table public.profiles
      add constraint profiles_vision_visibility_check
      check (vision_visibility in ('private', 'public', 'specific'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_habits_visibility_check'
  ) then
    alter table public.profiles
      add constraint profiles_habits_visibility_check
      check (habits_visibility in ('private', 'public', 'specific'));
  end if;
end$$;

-- ------------------------------------------------------------------
-- 2. visibility_shares — for the 'specific' option
-- ------------------------------------------------------------------
-- One row per (owner, viewer, resource_type) granting the viewer access to
-- that resource on the owner. Phase A wires the table but the UI for
-- managing it can ship later — the owner-side checkbox list is V2.
create table if not exists public.visibility_shares (
  owner_id      uuid not null references auth.users(id) on delete cascade,
  viewer_id     uuid not null references auth.users(id) on delete cascade,
  resource_type text not null check (resource_type in ('vision', 'habits')),
  created_at    timestamptz not null default now(),
  primary key (owner_id, viewer_id, resource_type)
);

create index if not exists visibility_shares_viewer_idx
  on public.visibility_shares (viewer_id, resource_type);

alter table public.visibility_shares enable row level security;

drop policy if exists "shares owner all"  on public.visibility_shares;
drop policy if exists "shares viewer read" on public.visibility_shares;

create policy "shares owner all"
  on public.visibility_shares for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "shares viewer read"
  on public.visibility_shares for select
  to authenticated
  using (auth.uid() = viewer_id);

grant select, insert, update, delete on public.visibility_shares
  to authenticated;

-- ------------------------------------------------------------------
-- 3. list_active_profiles() — directory feed
-- ------------------------------------------------------------------
-- Returns one row per non-blocked user with only the columns that are
-- safe to display in a leaderboard / participants list. Total score
-- comes from habit_logs (sum of resolved V's and X's minus auto-X's),
-- but for V1 we expose trees_planted as the proxy metric — the heavier
-- score calc will land in a follow-up that joins habit_logs.
create or replace function public.list_active_profiles()
returns table(
  id                 uuid,
  display_name       text,
  avatar_url         text,
  trees_planted      int,
  score_adjustment   int,
  vision_visibility  text,
  habits_visibility  text,
  last_seen_at       timestamptz,
  is_me              boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.trees_planted,
    p.score_adjustment,
    p.vision_visibility,
    p.habits_visibility,
    p.last_seen_at,
    (p.id = auth.uid()) as is_me
  from public.profiles p
  where p.blocked = false
  order by p.trees_planted desc, p.last_seen_at desc nulls last;
$$;

grant execute on function public.list_active_profiles() to authenticated;

-- ------------------------------------------------------------------
-- 4. get_public_profile(target uuid) — single-user fetch for /user/:id
-- ------------------------------------------------------------------
-- Returns the safe-to-share fields for ONE user plus booleans indicating
-- whether the caller can see their vision / habits given that user's
-- visibility setting + any 'specific' share row. Lets the UserDetail
-- screen render with a single round-trip.
create or replace function public.get_public_profile(target uuid)
returns table(
  id                  uuid,
  display_name        text,
  avatar_url          text,
  trees_planted       int,
  score_adjustment    int,
  vision_visibility   text,
  habits_visibility   text,
  last_seen_at        timestamptz,
  can_view_vision     boolean,
  can_view_habits     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.trees_planted,
    p.score_adjustment,
    p.vision_visibility,
    p.habits_visibility,
    p.last_seen_at,
    (
      p.id = auth.uid()
      or p.vision_visibility = 'public'
      or (
        p.vision_visibility = 'specific'
        and exists (
          select 1 from public.visibility_shares vs
          where vs.owner_id = p.id
            and vs.viewer_id = auth.uid()
            and vs.resource_type = 'vision'
        )
      )
    ) as can_view_vision,
    (
      p.id = auth.uid()
      or p.habits_visibility = 'public'
      or (
        p.habits_visibility = 'specific'
        and exists (
          select 1 from public.visibility_shares vs
          where vs.owner_id = p.id
            and vs.viewer_id = auth.uid()
            and vs.resource_type = 'habits'
        )
      )
    ) as can_view_habits
  from public.profiles p
  where p.id = target
    and p.blocked = false;
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;
