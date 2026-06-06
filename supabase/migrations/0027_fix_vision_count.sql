-- ============================================================================
-- Fix vision_count detection in list_active_profiles() (migration 0027)
-- ============================================================================
-- 0026 used `content::text like '%"type":"text"%'`, but jsonb's text form
-- inserts a space after the colon ("type": "text"), so the pattern never
-- matched and vision_count was always 0. Switch to jsonb_path_exists, which
-- is format-independent: counts an entry as "written" when its Tiptap doc has
-- at least one text node anywhere.
--
-- Full redefinition so this works whether or not 0026 applied cleanly.
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
    -- "written" = the Tiptap doc has at least one text node, at any depth.
    select user_id, count(*) as vision_count
    from public.vision_entries
    where jsonb_path_exists(content, '$.** ? (@.type == "text")')
    group by user_id
  ) vc on vc.user_id = p.id
  where p.blocked = false
  order by
    (coalesce(ls.log_score, 0) + p.score_adjustment) desc,
    p.last_seen_at desc nulls last;
$$;

grant execute on function public.list_active_profiles() to authenticated;
