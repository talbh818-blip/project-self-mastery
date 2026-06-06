-- ============================================================================
-- Per-habit success percentage in get_user_dashboard() (migration 0030)
-- ============================================================================
-- Adds success_pct to each habit in the dashboard payload: of the days that
-- were resolved (V / X / auto_x), the share marked V. Null when there are no
-- logged days yet. Returns jsonb so create-or-replace is enough (shape change
-- only, no signature change).
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
                   'color', h.color,
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
