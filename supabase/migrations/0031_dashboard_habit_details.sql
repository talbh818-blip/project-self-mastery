-- ============================================================================
-- Richer per-habit details in get_user_dashboard() (migration 0031)
-- ============================================================================
-- The admin "user detail" screen now renders the same habit cards the owner
-- sees on their own data dashboard. Each habit in the payload gains:
--   frequency_period / frequency_target — the target ("3× a week" etc.)
--   start_date                          — when the habit was assigned (active)
--   v_count                             — how many days were marked V
--   total_points                        — log-based points for the habit,
--                                         using the SAME simple formula this
--                                         RPC already uses for the overall
--                                         score (V=+5, X/auto_x=-3). Streak
--                                         bonuses / auto_x-for-grace are NOT
--                                         included here, matching the admin
--                                         total score column.
--
-- Returns jsonb so create-or-replace is enough (shape change only).
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
                   'color', h.color,
                   'frequency_period', h.frequency_period,
                   'frequency_target', h.frequency_target,
                   'start_date', a.start_date,
                   'v_count', (
                     select count(*) from public.habit_logs l
                     where l.habit_id = h.id and l.status = 'V'
                   ),
                   'total_points', (
                     select coalesce(sum(case
                              when l.status = 'V' then 5
                              when l.status in ('X', 'auto_x') then -3
                              else 0
                            end), 0)
                     from public.habit_logs l
                     where l.habit_id = h.id
                   ),
                   'success_pct', (
                     select case
                              when count(*) = 0 then null
                              else round(
                                100.0
                                * count(*) filter (where l.status = 'V')
                                / count(*)
                              )::int
                            end
                     from public.habit_logs l
                     where l.habit_id = h.id
                   )
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
