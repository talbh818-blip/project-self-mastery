-- ============================================================================
-- Canonical server-side score — exact port of the client scoring engine
-- (migration 0034)
-- ============================================================================
-- Problem: three different "scores" were live at the same time:
--   1. The user's own app (src/features/habits/scoring.ts — the engine, shown
--      under the tree): snapshot-aware completion, -3 for auto-missed
--      (unlogged) past days, one-time streak bonuses (7/14/30 → +20/+40/+100),
--      plus the admin score_adjustment.
--   2. get_user_dashboard() (profile page KPI): snapshot-aware but counts log
--      ROWS only — no auto-miss penalty for days with no row, no streak
--      bonuses.
--   3. list_active_profiles() (the directory on the User screen) and the
--      admin panel rollup: counted EVERY 'V' row as +5, including
--      below-target partials on quantitative habits.
-- Bar Aviv read 185 in the directory, 105 on the profile page and 116 under
-- her tree — one person, three numbers.
--
-- Fix: engine_habit_points() is a faithful port of scoreHabit() and
-- engine_user_score() of computeUserStats() + score_adjustment. Every RPC
-- that reports a score now reads from these, so every surface shows the same
-- number the user sees under their tree.
--
-- Ported rules — KEEP IN SYNC with src/features/habits/scoring.ts:
--   * V complete per the day's OWN target snapshot (target_at_log, falling
--     back to the habit's current target; null amount = legacy binary mark =
--     complete)                                        → +5, streak +1
--   * X / auto_x rows                                  → -3, streak reset
--   * unlogged past day inside an assignment window, past the 2-day grace
--     (AUTO_X_GRACE_DAYS)                              → -3, streak reset
--   * quantitative V below its snapshot target (partial) → 0, streak UNCHANGED
--   * streak bonuses at exactly 7/14/30 consecutive V days → +20/+40/+100,
--     each at most once per habit lifetime
--   * days outside every assignment window and with no log simply don't
--     exist for scoring (a habit swapped out of a slot keeps its streak)
--   * archived habits keep their historical points (the engine iterates ALL
--     of the user's habits)
--
-- "Today" is the Israeli calendar day — the app is Hebrew/IL-only and the
-- client engine uses the device's local date.
--
-- Idempotent.
-- ============================================================================

create or replace function public.engine_habit_points(h_id uuid, today date)
returns int
language plpgsql
stable
set search_path = public
as $$
declare
  quant   boolean;
  qtarget int;
  pts     int := 0;
  streak  int := 0;
  b7      boolean := false;
  b14     boolean := false;
  b30     boolean := false;
  r       record;
  s       text;
begin
  select h.is_quantitative, greatest(1, coalesce(h.quantitative_target, 1))
    into quant, qtarget
  from public.habits h
  where h.id = h_id;
  if not found then
    return 0;
  end if;

  for r in
    with assignment_days as (
      -- Every date the habit sat in a slot, clipped to today. end_date is
      -- EXCLUSIVE (matches activeDatesForHabit in scoring.ts).
      select distinct gs::date as day
      from public.habit_slot_assignments a
      cross join lateral generate_series(
        a.start_date::timestamp,
        least(coalesce(a.end_date - 1, today), today)::timestamp,
        interval '1 day'
      ) gs
      where a.habit_id = h_id
    ),
    all_days as (
      -- Union with logged dates: marks outside assignment windows (backfills
      -- on past weeks, tomorrow's early mark) still count — engine parity.
      select day from assignment_days
      union
      select l.date from public.habit_logs l where l.habit_id = h_id
    )
    select d.day,
           l.status,
           l.amount,
           l.target_at_log,
           (ad.day is not null) as in_window
    from all_days d
    left join public.habit_logs l on l.habit_id = h_id and l.date = d.day
    left join assignment_days ad on ad.day = d.day
    order by d.day
  loop
    if r.status is not null then
      if quant and r.status = 'V' then
        -- Judged against the target snapshotted ON the day (null amount =
        -- legacy binary mark = complete). Below target = explicit partial:
        -- neutral — no points, no miss penalty, streak unchanged.
        if r.amount is null or r.amount >= coalesce(r.target_at_log, qtarget) then
          s := 'V';
        else
          s := 'blank';
        end if;
      else
        s := r.status; -- V (binary) / X / auto_x rows as-is
      end if;
    elsif r.in_window and (today - r.day) >= 2 then
      s := 'auto_x'; -- unlogged past day beyond the grace period
    else
      s := 'blank';
    end if;

    if s = 'V' then
      pts := pts + 5;
      streak := streak + 1;
      if streak = 7  and not b7  then b7  := true; pts := pts + 20;  end if;
      if streak = 14 and not b14 then b14 := true; pts := pts + 40;  end if;
      if streak = 30 and not b30 then b30 := true; pts := pts + 100; end if;
    elsif s in ('X', 'auto_x') then
      pts := pts - 3;
      streak := 0;
    end if;
    -- 'blank' — nothing, streak unchanged.
  end loop;

  return pts;
end;
$$;

create or replace function public.engine_user_score(target uuid)
returns int
language sql
stable
set search_path = public
as $$
  select coalesce((
           select sum(public.engine_habit_points(
                        h.id,
                        (now() at time zone 'Asia/Jerusalem')::date))
           from public.habits h
           where h.user_id = target
         ), 0)::int
         + coalesce((select p.score_adjustment
                     from public.profiles p
                     where p.id = target), 0);
$$;

grant execute on function public.engine_habit_points(uuid, date) to authenticated;
grant execute on function public.engine_user_score(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- get_user_dashboard() — score + per-habit total_points now come from the
-- engine port (so the profile page matches the user's own tree), and the
-- 'daily' series counts only COMPLETE V days (a below-target partial is not
-- a completion).
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
  today  date := (now() at time zone 'Asia/Jerusalem')::date;
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
                   'total_points', public.engine_habit_points(h.id, today),
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

-- ----------------------------------------------------------------------------
-- list_active_profiles() — directory score now comes from the engine port
-- instead of the naive every-V-row-is-5 sum.
-- ----------------------------------------------------------------------------
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
    es.score,
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
  cross join lateral (
    select public.engine_user_score(p.id) as score
  ) es
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
  order by es.score desc, p.last_seen_at desc nulls last;
$$;

grant execute on function public.list_active_profiles() to authenticated;
