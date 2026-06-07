-- ============================================================================
-- Per-log target snapshot — non-retroactive target changes (migration 0033)
-- ============================================================================
-- Problem: a habit stores a SINGLE current target. When the user raises it
-- (e.g. 1/day → 5/day) every PAST day is re-judged against the new target, so
-- days that were complete at the time suddenly read as partial and the user
-- loses points retroactively.
--
-- Fix: snapshot the target that was in effect WHEN each log was written, in a
-- new `target_at_log` column. A day's completeness is judged against ITS OWN
-- snapshot, so changing the target only affects days logged from that point on.
--
-- Backfill: existing logs are stamped with the habit's CURRENT quantitative
-- target, which (a) keeps their current scoring identical right now and
-- (b) freezes it, so any FUTURE target change can't reach back and alter them.
-- Binary (non-quantitative) habits don't use it (left NULL → "complete").
--
-- Also re-points get_user_dashboard() at the per-log snapshot.
-- Idempotent.
-- ============================================================================

alter table public.habit_logs
  add column if not exists target_at_log int;

-- Freeze existing quantitative logs at the current target.
update public.habit_logs l
set target_at_log = greatest(1, coalesce(h.quantitative_target, 1))
from public.habits h
where l.habit_id = h.id
  and h.is_quantitative
  and l.target_at_log is null
  and l.amount is not null;

-- ----------------------------------------------------------------------------
-- get_user_dashboard() — judge quantitative completion against the per-log
-- snapshot (falling back to the habit's current target for any un-stamped row).
-- ----------------------------------------------------------------------------
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
            when l.status = 'V' and (
                   not h.is_quantitative
                   or l.amount is null
                   or l.amount >= greatest(1, coalesce(l.target_at_log, h.quantitative_target, 1))
                 ) then 5
            when l.status in ('X', 'auto_x') then -3
            else 0
          end), 0)
    into log_score
  from public.habit_logs l
  join public.habits h on h.id = l.habit_id
  where l.user_id = target;

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
                     where l.habit_id = h.id
                       and l.status = 'V'
                       and (
                         not h.is_quantitative
                         or l.amount is null
                         or l.amount >= greatest(1, coalesce(l.target_at_log, h.quantitative_target, 1))
                       )
                   ),
                   'total_points', (
                     select coalesce(sum(case
                              when l.status = 'V' and (
                                     not h.is_quantitative
                                     or l.amount is null
                                     or l.amount >= greatest(1, coalesce(l.target_at_log, h.quantitative_target, 1))
                                   ) then 5
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
