-- ============================================================================
-- Per-frequency streak bonuses + effective quota — migration 0038
-- ============================================================================
-- KEEP IN SYNC with src/features/habits/scoring2.ts. Three refinements:
--
-- 1. Streak bonuses by habit frequency:
--      daily   → run ≥7 / ≥14 / perfect month (slice/45 + /30 + /18 = 1/9)
--      weekly  → ONE bonus: every week of the month (weeks belong to the
--                month their Sunday falls in) met its quota → slice/9
--      monthly → no streak bonus at all; instead its marks earn the FULL,
--                un-reserved value (base factor 1.0 instead of 0.9) so a
--                perfect month still sums to exactly the full pie.
--
-- 2. engine_v2_day_value() now returns the RAW pie share (no 0.9 inside);
--    the reserve factor is applied per habit in engine_v2_habit_points().
--
-- 3. Effective quota: weekly/monthly periods with fewer ACTIVE days than the
--    target (created mid-week, the V2 cutover, swaps) are judged against
--    min(target, active days) — partial periods neither auto-penalize nor
--    block bonuses. (The client uses the same rule when snapshotting tap
--    earnings.)
--
-- Applied before any V2 data exists — nothing is re-judged.
-- Idempotent.
-- ============================================================================

create or replace function public.engine_v2_day_value(uid uuid, d date)
returns numeric
language sql
stable
set search_path = public
as $$
  with c as (
    select count(distinct a.habit_id) as n
    from public.habit_slot_assignments a
    where a.user_id = uid
      and a.start_date <= d
      and (a.end_date is null or d < a.end_date)
  )
  select case
           when n = 0 then 0
           else 3000.0
                * (case when n = 1 then 0.3 when n = 2 then 0.6 else 1.0 end)
                / (n * extract(day from (date_trunc('month', d::timestamp)
                                         + interval '1 month - 1 day'))::int)
         end
  from c;
$$;

create or replace function public.engine_v2_habit_points(h_id uuid)
returns numeric
language plpgsql
stable
set search_path = public
as $$
declare
  epoch     constant date := date '2026-06-13';
  hab       public.habits%rowtype;
  uid       uuid;
  today     date := (now() at time zone 'Asia/Jerusalem')::date;
  bf        numeric; -- base factor: monthly habits keep the full value
  earned    numeric := 0;
  penalties numeric := 0;
  bonuses   numeric := 0;
  r         record;
  w         record;
  quota     int;
  filled    int;
  closer    numeric;
  mw        numeric;
  -- bonus-walk state (v_ prefix — must not collide with query column names)
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
  if not found then
    return 0;
  end if;
  uid := hab.user_id;
  bf  := case when hab.frequency_period = 'monthly' then 1.0 else 0.9 end;

  -- earned: tap-time snapshots
  select coalesce(sum(l.earned_points), 0)
    into earned
  from public.habit_logs l
  where l.habit_id = h_id and l.date >= epoch and l.earned_points is not null;

  -- settlement penalties over locked periods
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
      -- effective quota: a partial period can't demand more marks than it
      -- has active days.
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
      -- filled < quota here, so the closing slot is always among the missed.
      mw := (quota - 1 - least(filled, quota - 1)) * ((1 - closer) / (quota - 1))
            + closer;
    end if;

    penalties := penalties + 0.7 * (r.pool * bf) * mw;
  end loop;

  -- streak bonuses — by habit frequency
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
          -- only LOCKED unmet days kill the perfect-month flag — today and
          -- days still inside the marking window are pending, not failed.
          if (today - v_day) >= 4 then v_alldone := false; end if;
          v_run := 0;
        end if;
        v_prevd := v_day;
      end loop;

      if v_maxrun >= 7  then bonuses := bonuses + v_slice / 45.0; end if;
      if v_maxrun >= 14 then bonuses := bonuses + v_slice / 30.0; end if;
      month_end := (date_trunc('month', (r.mkey || '-01')::timestamp)
                    + interval '1 month - 1 day')::date;
      if v_alldone
         and (today - month_end) >= 4
         and v_maxrun >= array_length(r.ds, 1) then
        bonuses := bonuses + v_slice / 18.0;
      end if;
    end loop;

  elsif hab.frequency_period = 'weekly' then
    -- ONE bonus per locked month: every week (Sunday in that month, with at
    -- least one active day) met its effective quota → slice/9 (the whole
    -- 10% reserve at once).
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
        bonuses := bonuses + v_slice / 9.0;
      end if;
    end loop;
  end if;
  -- monthly — no bonus by design.

  return earned - penalties + bonuses;
end;
$$;

grant execute on function public.engine_v2_habit_points(uuid) to authenticated;
