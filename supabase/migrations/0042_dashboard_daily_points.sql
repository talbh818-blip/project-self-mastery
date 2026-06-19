-- ============================================================================
-- 0041_dashboard_daily_points.sql
-- get_user_dashboard() now also returns `daily_points` — a per-day point delta
-- series over the last 365 days — so the UserDetail screen can draw the same
-- "נקודות מצטברות" trend chart the owner sees in the Habits data view.
--
-- Per-day delta mirrors the client trend (scoring2.ts buildCombinedStats):
--   • v2-era days (>= 2026-06-13): Σ habit_logs.earned_points (tap-time
--     snapshots). Period-close penalties/streak-bonuses are settled per period,
--     NOT per day, so — exactly like the client chart — they are excluded here.
--   • pre-epoch days: +5 per V, -3 per X/auto_x (frozen v1 base; v1 streak
--     bonuses are omitted — a negligible, trend-only approximation).
-- The client accumulates these deltas into a running total per its range.
-- ----------------------------------------------------------------------------
create or replace function public.get_user_dashboard(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  prof     public.profiles%rowtype;
  v_shared boolean;
  can_view boolean;
  result   jsonb;
begin
  select * into prof from public.profiles where id = target and blocked = false;
  if not found then
    return null;
  end if;

  v_shared := exists (
    select 1 from public.visibility_shares vs
    where vs.owner_id = target
      and vs.viewer_id = auth.uid()
      and vs.resource_type = 'habits'
  );

  can_view := (
    target = auth.uid()
    or prof.habits_visibility = 'public'
    or v_shared
  );

  result := jsonb_build_object(
    'id', prof.id,
    'display_name', prof.display_name,
    'avatar_url', prof.avatar_url,
    'gender', prof.gender,
    'created_at', prof.created_at,
    'trees_planted', prof.trees_planted,
    'score', public.engine_user_score(target),
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
    'shared_with_me', v_shared,
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
                     where l.habit_id = h.id
                       and l.status = 'V'
                       and (
                         not h.is_quantitative
                         or l.amount is null
                         or l.amount >= greatest(1, coalesce(l.target_at_log, h.quantitative_target, 1))
                       )
                   ),
                   'total_points', round(
                     public.engine_v1_habit_points(h.id, date '2026-06-13')
                     + public.engine_v2_habit_points(h.id)
                   )::int,
                   'success_pct', (
                     select case
                              when count(*) = 0 then null
                              else round(
                                100.0
                                * count(*) filter (where l.status = 'V' and (
                                    not h.is_quantitative
                                    or l.amount is null
                                    or l.amount >= greatest(1, coalesce(l.target_at_log, h.quantitative_target, 1))
                                  ))
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
          select hl.date as d,
                 count(*) filter (where hl.status = 'V' and (
                   not h.is_quantitative
                   or hl.amount is null
                   or hl.amount >= greatest(1, coalesce(hl.target_at_log, h.quantitative_target, 1))
                 )) as v
          from public.habit_logs hl
          join public.habits h on h.id = hl.habit_id
          where hl.user_id = target
            and hl.date >= (current_date - interval '365 days')
          group by hl.date
        ) t
      ), '[]'::jsonb),
      'daily_points', coalesce((
        select jsonb_agg(jsonb_build_object('date', d, 'points', pts) order by d)
        from (
          select hl.date as d,
                 round(sum(
                   case
                     when hl.date >= date '2026-06-13' then coalesce(hl.earned_points, 0)
                     when hl.status = 'V' then 5
                     when hl.status in ('X', 'auto_x') then -3
                     else 0
                   end
                 ))::int as pts
          from public.habit_logs hl
          join public.habits h on h.id = hl.habit_id
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
