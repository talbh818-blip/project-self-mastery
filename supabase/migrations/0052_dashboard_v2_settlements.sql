-- ============================================================================
-- 0052_dashboard_v2_settlements.sql
-- Expose V2 period-close settlements (penalties + bonuses) in the trend chart.
--
-- Problem
-- -------
-- The chart on the UserDetail screen (and the same one on the owner's Habits
-- data view) is fed by get_user_dashboard()->'daily_points'. Prior to this
-- migration `daily_points` only summed tap-time snapshots (V2 earned_points)
-- and v1 base points — so every day is either flat or a rise. But V2's
-- penalties and streak bonuses are computed at period-close inside
-- engine_v2_habit_points() and never touch habit_logs. Result: the trend on
-- someone with heavy penalties (e.g. a user sitting at −624) still looks
-- like a slow climb — the drops literally aren't in the series. Toggling
-- "כולל ירידות" has nothing to draw.
--
-- Fix
-- ---
-- Add a helper engine_v2_habit_settlements(h_id) that yields one row per
-- (period_close_date, delta) for a single habit — the same penalty and
-- bonus math from engine_v2_habit_points(), but attributed to the day it
-- settled instead of collapsed into a single total. Then extend
-- get_user_dashboard() so `daily_points` aggregates BOTH log-based deltas
-- and per-day settlements. The chart now converges to the true score.
--
-- Settlement day attribution:
--   * Penalty on a locked period → (period_end + 4)  (the exact lock day)
--   * Daily-habit monthly bonus  → (month_end + 4)
--   * Weekly-habit monthly bonus → (month_end + 4)
--   * Monthly habits             → no bonus (base factor 1.0 covers it)
--
-- Idempotent — safe to re-run.
-- ============================================================================

create or replace function public.engine_v2_habit_settlements(h_id uuid)
returns table(settle_date date, delta numeric)
language plpgsql
stable
set search_path = public
as $$
declare
  epoch     constant date := date '2026-06-13';
  hab       public.habits%rowtype;
  uid       uuid;
  today     date := (now() at time zone 'Asia/Jerusalem')::date;
  bf        numeric;
  r         record;
  w         record;
  quota     int;
  filled    int;
  closer    numeric;
  mw        numeric;
  penalty   numeric;
  bonus     numeric;
  v_slice   numeric;
  v_run     int;
  v_maxrun  int;
  v_alldone boolean;
  v_allmet  boolean;
  v_nweeks  int;
  v_prevd   date;
  v_day     date;
  v_done    boolean;
  i         int;
  month_end date;
begin
  select * into hab from public.habits where id = h_id;
  if not found then return; end if;
  uid := hab.user_id;
  bf  := case when hab.frequency_period = 'monthly' then 1.0 else 0.9 end;

  -- ─── Penalties (per locked period) ───────────────────────────────────────
  -- Same CTE + loop as engine_v2_habit_points; yield each per-period penalty
  -- as its own settlement row on (period_end + 4).
  for r in
    with days as (
      select distinct gs::date as day
      from public.habit_slot_assignments a
      cross join lateral generate_series(
        greatest(a.start_date, epoch)::timestamp,
        least(coalesce(a.end_date - 1, today), today)::timestamp,
        interval '1 day'
      ) gs
      where a.habit_id = h_id
    ),
    keyed as (
      select day,
             case hab.frequency_period
               when 'weekly'  then (day - extract(dow from day)::int)::date
               when 'monthly' then date_trunc('month', day)::date
               else day
             end as pstart
      from days
    ),
    pe as (
      select pstart,
             case hab.frequency_period
               when 'weekly'  then pstart + 6
               when 'monthly' then (date_trunc('month', pstart::timestamp)
                                    + interval '1 month - 1 day')::date
               else pstart
             end as pend,
             count(*) as ndays,
             sum(public.engine_v2_day_value(uid, day)) as pool
      from keyed
      group by pstart
    )
    select p.pstart, p.pend, p.ndays, p.pool,
           (select count(*) from public.habit_logs l
             where l.habit_id = h_id and l.status = 'V'
               and l.date between p.pstart and p.pend) as vdays,
           (select l.amount from public.habit_logs l
             where l.habit_id = h_id and l.status = 'V'
               and l.date = p.pstart) as day_amount
    from pe p
    where (today - p.pend) >= 4
  loop
    if hab.frequency_period = 'daily' then
      quota := case when hab.is_quantitative
                    then greatest(1, coalesce(hab.quantitative_target, 1))
                    else 1 end;
      if r.vdays > 0 then
        filled := case when hab.is_quantitative
                       then least(quota, coalesce(r.day_amount, 1))
                       else 1 end;
      else
        filled := 0;
      end if;
    else
      quota  := greatest(1, least(greatest(1, hab.frequency_target), r.ndays));
      filled := least(quota, r.vdays);
    end if;

    if filled >= quota then
      continue;
    end if;

    if quota = 1 then
      mw := 1.0;
    else
      closer := case
                  when quota = 2 then 0.6
                  when quota <= 5 then 0.4
                  else greatest(0.2, 0.4 - 0.04 * (quota - 5))
                end;
      mw := (quota - 1 - least(filled, quota - 1)) * ((1 - closer) / (quota - 1))
            + closer;
    end if;

    penalty := 0.7 * (r.pool * bf) * mw;
    if penalty <> 0 then
      settle_date := r.pend + 4;
      delta := -penalty;
      return next;
    end if;
  end loop;

  -- ─── Daily-frequency streak bonuses (per locked month) ───────────────────
  if hab.frequency_period = 'daily' then
    for r in
      with days as (
        select distinct gs::date as day
        from public.habit_slot_assignments a
        cross join lateral generate_series(
          greatest(a.start_date, epoch)::timestamp,
          least(coalesce(a.end_date - 1, today), today)::timestamp,
          interval '1 day'
        ) gs
        where a.habit_id = h_id
      ),
      flags as (
        select day,
               exists (
                 select 1 from public.habit_logs l
                 where l.habit_id = h_id and l.date = day and l.status = 'V'
                   and (
                     not hab.is_quantitative
                     or l.amount is null
                     or l.amount >= greatest(1, coalesce(l.target_at_log,
                                                         hab.quantitative_target, 1))
                   )
               ) as done
        from days
      )
      select to_char(day, 'YYYY-MM') as mkey,
             array_agg(day order by day) as ds,
             array_agg(done order by day) as dones
      from flags
      group by 1
    loop
      v_slice := 0;
      v_run := 0;
      v_maxrun := 0;
      v_alldone := true;
      v_prevd := null;
      for i in 1 .. array_length(r.ds, 1) loop
        v_day := r.ds[i];
        v_done := r.dones[i];
        v_slice := v_slice + public.engine_v2_day_value(uid, v_day) * 0.9;
        if v_done then
          if v_prevd is not null and (v_day - v_prevd) = 1 then
            v_run := v_run + 1;
          else
            v_run := 1;
          end if;
          if v_run > v_maxrun then v_maxrun := v_run; end if;
        else
          if (today - v_day) >= 4 then v_alldone := false; end if;
          v_run := 0;
        end if;
        v_prevd := v_day;
      end loop;

      bonus := 0;
      if v_maxrun >= 7  then bonus := bonus + v_slice / 45.0; end if;
      if v_maxrun >= 14 then bonus := bonus + v_slice / 30.0; end if;
      month_end := (date_trunc('month', (r.mkey || '-01')::timestamp)
                    + interval '1 month - 1 day')::date;
      if v_alldone
         and (today - month_end) >= 4
         and v_maxrun >= array_length(r.ds, 1) then
        bonus := bonus + v_slice / 18.0;
      end if;
      -- Only surface the bonus once the month has actually locked, so the
      -- chart doesn't advertise a bonus before it's earned.
      if bonus > 0 and (today - month_end) >= 4 then
        settle_date := month_end + 4;
        delta := bonus;
        return next;
      end if;
    end loop;

  -- ─── Weekly-frequency bonus (single per locked month if all weeks met) ──
  elsif hab.frequency_period = 'weekly' then
    for r in
      with days as (
        select distinct gs::date as day
        from public.habit_slot_assignments a
        cross join lateral generate_series(
          greatest(a.start_date, epoch)::timestamp,
          least(coalesce(a.end_date - 1, today), today)::timestamp,
          interval '1 day'
        ) gs
        where a.habit_id = h_id
      )
      select to_char(day, 'YYYY-MM') as mkey,
             array_agg(day order by day) as ds
      from days
      group by 1
    loop
      month_end := (date_trunc('month', (r.mkey || '-01')::timestamp)
                    + interval '1 month - 1 day')::date;
      if (today - month_end) < 4 then
        continue;
      end if;

      v_slice := 0;
      for i in 1 .. array_length(r.ds, 1) loop
        v_slice := v_slice + public.engine_v2_day_value(uid, r.ds[i]) * 0.9;
      end loop;
      if v_slice <= 0 then
        continue;
      end if;

      v_allmet := true;
      v_nweeks := 0;
      for w in
        with days as (
          select distinct gs::date as day
          from public.habit_slot_assignments a
          cross join lateral generate_series(
            greatest(a.start_date, epoch)::timestamp,
            least(coalesce(a.end_date - 1, today), today)::timestamp,
            interval '1 day'
          ) gs
          where a.habit_id = h_id
        ),
        weeks as (
          select (day - extract(dow from day)::int)::date as wstart,
                 count(*) as ndays
          from days
          group by 1
        )
        select wk.wstart, wk.ndays,
               (select count(*) from public.habit_logs l
                 where l.habit_id = h_id and l.status = 'V'
                   and l.date between wk.wstart and wk.wstart + 6) as vmarks
        from weeks wk
        where to_char(wk.wstart, 'YYYY-MM') = r.mkey
      loop
        v_nweeks := v_nweeks + 1;
        quota := greatest(1, least(greatest(1, hab.frequency_target), w.ndays::int));
        if least(quota, w.vmarks::int) < quota then
          v_allmet := false;
        end if;
      end loop;

      if v_nweeks > 0 and v_allmet then
        settle_date := month_end + 4;
        delta := v_slice / 9.0;
        return next;
      end if;
    end loop;
  end if;
  -- monthly frequency: no bonus by design; penalties above cover the drops.
end;
$$;

grant execute on function public.engine_v2_habit_settlements(uuid) to authenticated;

-- ─── Refresh get_user_dashboard() to fold settlements into daily_points ───
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
      -- daily_points now merges TWO sources of per-day deltas:
      --  1. log-based (v1 base + v2 earned_points snapshots)
      --  2. settlement-based (per-period penalties + streak bonuses)
      -- Both sources are grouped by date and summed together so the chart
      -- rises on marking days and drops on lock days.
      'daily_points', coalesce((
        select jsonb_agg(jsonb_build_object('date', d, 'points', pts) order by d)
        from (
          select d, round(sum(delta))::int as pts
          from (
            -- (1) log-based per-day deltas
            select hl.date as d,
                   sum(
                     case
                       when hl.date >= date '2026-06-13' then coalesce(hl.earned_points, 0)
                       when hl.status = 'V' then 5
                       when hl.status in ('X', 'auto_x') then -3
                       else 0
                     end
                   ) as delta
            from public.habit_logs hl
            join public.habits h on h.id = hl.habit_id
            where hl.user_id = target
              and hl.date >= (current_date - interval '365 days')
            group by hl.date

            union all

            -- (2) V2 settlement deltas (penalties + streak bonuses).
            -- Cross-join every habit that has appeared in a slot for this
            -- user, then unpack that habit's settlement rows.
            select s.settle_date as d, sum(s.delta) as delta
            from (
              select distinct habit_id
              from public.habit_slot_assignments
              where user_id = target
            ) hids
            cross join lateral public.engine_v2_habit_settlements(hids.habit_id) s
            where s.settle_date >= (current_date - interval '365 days')
            group by s.settle_date
          ) merged
          group by d
        ) t
        where t.pts <> 0
      ), '[]'::jsonb)
    );
  end if;

  return result;
end;
$$;

grant execute on function public.get_user_dashboard(uuid) to authenticated;
