-- ============================================================================
-- Profile gender + expose it in the directory feed (migration 0025)
-- ============================================================================
-- Adds an optional gender to profiles (editable in "ערוך פרטים אישיים") and
-- surfaces it through list_active_profiles() so the "בחירת שותפים" picker can
-- filter candidates by gender. Sharing itself reuses the existing
-- public.visibility_shares table from migration 0023 (resource_type='habits').
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ------------------------------------------------------------------
-- 1. profiles.gender
-- ------------------------------------------------------------------
alter table public.profiles
  add column if not exists gender text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_gender_check'
  ) then
    alter table public.profiles
      add constraint profiles_gender_check
      check (gender in ('male', 'female'));
  end if;
end$$;

-- ------------------------------------------------------------------
-- 2. list_active_profiles() — now returns gender too
-- ------------------------------------------------------------------
-- Return type changes (extra column), so drop before recreating.
drop function if exists public.list_active_profiles();

create function public.list_active_profiles()
returns table(
  id                 uuid,
  display_name       text,
  avatar_url         text,
  trees_planted      int,
  score_adjustment   int,
  vision_visibility  text,
  habits_visibility  text,
  gender             text,
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
    p.gender,
    p.last_seen_at,
    (p.id = auth.uid()) as is_me
  from public.profiles p
  where p.blocked = false
  order by p.trees_planted desc, p.last_seen_at desc nulls last;
$$;

grant execute on function public.list_active_profiles() to authenticated;
