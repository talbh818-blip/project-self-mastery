-- ============================================================================
-- get_user_dashboard(target) — data for another user's profile page (0029)
-- ============================================================================
-- One round-trip for the UserDetail dashboard. Always returns the safe
-- aggregate numbers (score, trees, habit/vision counts) — those are the
-- "participants show data, not content" leaderboard figures. The detailed
-- habit list + daily V-counts (for the heatmap) are included ONLY when the
-- caller is allowed to see the target's habits (owner / public / shared).
--
-- SECURITY DEFINER so it can read across users; it never returns private
-- content (no email/phone, no vision text).
--
-- Idempotent — safe to re-run.
-- ============================================================================

create or replace function public.get_user_dashboard(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  prof   public.profiles%rowtype;
  can_view boolean;
  log_score int;
  result jsonb;
begin
  select * into prof from public.profiles where id = target and blocked = false;
  if not found then
    return null;
  end if;

  can_view := (
    target = auth.uid()
    or prof.habits_visibility = 'public'
    or (
      prof.habits_visibility = 'specific'
      and exists (
        select 1 from public.visibility_shares vs
        where vs.owner_id = target
          and vs.viewer_id = auth.uid()
          and vs.resource_type = 'habits'
      )
    )
  );

  select coalesce(sum(case
            when status = 'V' then 5
            when status in ('X', 'auto_x') then -3
            else 0
          end), 0)
    into log_score
  from public.habit_logs
  where user_id = target;

  result := jsonb_build_object(
    'id', prof.id,
    'display_name', prof.display_name,
    'avatar_url', prof.avatar_url,
    'gender', prof.gender,
    'created_at', prof.created_at,
    'trees_planted', prof.trees_planted,
    'score', log_score + prof.score_adjustment,
    'habit_count', (
      select count(distinct a.habit_id)
      from public.habit_slot_assignments a
      join public.habits h on h.id = a.habit_id and h.archived_at is null
      where a.user_id = target and a.end_date is null
    ),
    'vision_count', (
      select count(*) from public.vision_entries
      where user_id = target
        and jsonb_path_exists(content, '$.** ? (@.type == "text")')
    ),
    'habits_visibility', prof.habits_visibility,
    'can_view_habits', can_view
  );

  if can_view then
    result := result || jsonb_build_object(
      'habits', coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'id', h.id,
                   'name', h.name,
                   'icon', h.icon,
                   'type', h.type,
                   'color', h.color
                 ) order by a.slot_index
               )
        from public.habit_slot_assignments a
        join public.habits h on h.id = a.habit_id and h.archived_at is null
        where a.user_id = target and a.end_date is null
      ), '[]'::jsonb),
      'daily', coalesce((
        select jsonb_agg(jsonb_build_object('date', d, 'v', v))
        from (
          select hl.date as d, count(*) filter (where hl.status = 'V') as v
          from public.habit_logs hl
          where hl.user_id = target
            and hl.date >= (current_date - interval '365 days')
          group by hl.date
        ) t
      ), '[]'::jsonb)
    );
  end if;

  return result;
end;
$$;

grant execute on function public.get_user_dashboard(uuid) to authenticated;
