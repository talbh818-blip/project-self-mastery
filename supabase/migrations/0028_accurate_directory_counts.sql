-- ============================================================================
-- Accurate habit + vision counts in list_active_profiles() (migration 0028)
-- ============================================================================
-- Two fixes over 0026/0027:
--
--  1. habit_count was counting every non-archived habit row. But habits are
--     immutable history entities — swapping a habit out of a slot keeps the
--     old row. The number the user means is "habits currently tracked", i.e.
--     distinct habits with an OPEN slot assignment (end_date is null), and
--     not archived.
--
--  2. vision_count uses jsonb_path_exists (format-independent) to count
--     entries whose Tiptap doc has a real text node.
--
-- Full redefinition — supersedes 0026/0027. Idempotent; safe to re-run.
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
    -- "active habits" = distinct habits currently sitting in a slot
    -- (open assignment) and not archived.
    select a.user_id, count(distinct a.habit_id) as habit_count
    from public.habit_slot_assignments a
    join public.habits h
      on h.id = a.habit_id
     and h.archived_at is null
    where a.end_date is null
    group by a.user_id
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
