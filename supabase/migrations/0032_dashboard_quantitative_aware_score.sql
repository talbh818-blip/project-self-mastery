-- ============================================================================
-- Quantitative-aware scoring in get_user_dashboard() (migration 0032)
-- ============================================================================
-- The dashboard previously counted EVERY 'V' habit_log as +5. For quantitative
-- ("counting") habits that's wrong: a day only completes — and scores — when
-- the logged amount reaches the per-day target. This mismatch is what made a
-- user read 125 in the admin panel while her own (engine-computed) score on the
-- habits screen was deeply negative.
--
-- A 'V' now counts as a full completion (and +5 / one v_count) only when:
--   • the habit is NOT quantitative, OR
--   • the logged amount is NULL (a legacy binary mark, made before the habit
--     became a counter — these are complete), OR
--   • the logged amount is >= the per-day target.
-- An explicit partial amount (< target) scores 0 and is not a completion,
-- matching the client scoring engine.
--
-- NOTE: like before, this dashboard score is log-based — it does NOT apply the
-- auto_x penalty for unlogged days inside an assignment window, nor streak
-- bonuses (both live in the client engine). It is a close, consistent estimate,
-- not a byte-for-byte copy of the tree's number.
--
-- Returns jsonb; create-or-replace. Idempotent.
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

  -- Quantitative-aware log score (V only counts at full target / null amount).
  select coalesce(sum(case
            when l.status = 'V' and (
                   not h.is_quantitative
                   or l.amount is null
                   or l.amount >= greatest(1, coalesce(h.quantitative_target, 1))
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
                         or l.amount >= greatest(1, coalesce(h.quantitative_target, 1))
                       )
                   ),
                   'total_points', (
                     select coalesce(sum(case
                              when l.status = 'V' and (
                                     not h.is_quantitative
                                     or l.amount is null
                                     or l.amount >= greatest(1, coalesce(h.quantitative_target, 1))
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
                                    or l.amount >= greatest(1, coalesce(h.quantitative_target, 1))
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
