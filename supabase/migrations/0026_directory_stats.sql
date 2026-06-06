-- ============================================================================
-- Enrich the directory feed with per-user stats (migration 0026)
-- ============================================================================
-- Rebuilds list_active_profiles() to also return, for every active user:
--   - created_at  (join date, shown as a small tag)
--   - score       (log score: V=+5, X/auto_x=-3, + admin score_adjustment)
--   - habit_count (active, non-archived habits)
--   - vision_count(entries that actually contain typed text)
--   - shared_with_me (this user shared their habits with the caller)
--
-- These are aggregate NUMBERS only — never content — so exposing them across
-- users matches the app's "participants show data, never writing" rule. The
-- function is SECURITY DEFINER so it can read across users; it returns nothing
-- private (no email / phone / real name).
--
-- Idempotent — safe to re-run.
-- ============================================================================

drop function if exists public.list_active_profiles();

create function public.list_active_profiles()
returns table(
  id                 uuid,
  display_name       text,
  avatar_url         text,
  gender             text,
  created_at         timestamptz,
  trees_planted      int,
  score              int,
  habit_count        int,
  vision_count       int,
  vision_visibility  text,
  habits_visibility  text,
  shared_with_me     boolean,
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
    p.gender,
    p.created_at,
    p.trees_planted,
    (coalesce(ls.log_score, 0) + p.score_adjustment)::int as score,
    coalesce(hc.habit_count, 0)::int as habit_count,
    coalesce(vc.vision_count, 0)::int as vision_count,
    p.vision_visibility,
    p.habits_visibility,
    exists (
      select 1 from public.visibility_shares vs
      where vs.owner_id = p.id
        and vs.viewer_id = auth.uid()
        and vs.resource_type = 'habits'
    ) as shared_with_me,
    (p.id = auth.uid()) as is_me
  from public.profiles p
  left join (
    select user_id,
           sum(case
                 when status = 'V' then 5
                 when status in ('X', 'auto_x') then -3
                 else 0
               end) as log_score
    from public.habit_logs
    group by user_id
  ) ls on ls.user_id = p.id
  left join (
    select user_id, count(*) as habit_count
    from public.habits
    where archived_at is null
    group by user_id
  ) hc on hc.user_id = p.id
  left join (
    -- A vision counts as "written" when its Tiptap doc has at least one text
    -- node — mirrors isVisionContentEmpty() on the client closely enough.
    select user_id, count(*) as vision_count
    from public.vision_entries
    where content::text like '%"type":"text"%'
    group by user_id
  ) vc on vc.user_id = p.id
  where p.blocked = false
  order by
    (coalesce(ls.log_score, 0) + p.score_adjustment) desc,
    p.last_seen_at desc nulls last;
$$;

grant execute on function public.list_active_profiles() to authenticated;
