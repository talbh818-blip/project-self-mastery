-- ============================================================================
-- 0040_dashboard_shared_with_me.sql
-- get_user_dashboard() now (a) returns `shared_with_me` and (b) treats an
-- explicit habits share row as authoritative for viewing — matching the
-- directory's "שותף למסע" tag (list_active_profiles).
--
-- Before: can_view required habits_visibility = 'specific' AND a share row.
-- That disagreed with the directory, which flags a user as "שותף למסע" on the
-- share row alone. A user who shared then switched back to 'private' (leaving a
-- stale share row) showed "שותף למסע" in the list but "פרטי / לא שיתף" on their
-- detail page. The owner adding a viewer to visibility_shares is an explicit
-- opt-in, so we honor it regardless of the visibility enum.
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

  -- Did this owner explicitly share their habits with the current viewer?
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
      ), '[]'::jsonb)
    );
  end if;

  return result;
end;
$$;

grant execute on function public.get_user_dashboard(uuid) to authenticated;
