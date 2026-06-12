-- ============================================================================
-- Closer-mark weight scales down with the target size — migration 0037
-- ============================================================================
-- The closing mark's share of a period's value was a flat 40% (60% for
-- target 2). At high targets that's too steep — per the owner: "at 10 the
-- last one should be ~20%". New rule (KEEP IN SYNC with closerWeight() in
-- src/features/habits/scoring2.ts):
--
--   target 2  → closer 60%
--   target 3-5 → closer 40%   (the original 15/15/15/15/40 example)
--   target 6+ → 40% − 4% per extra slot, floored at 20% (reached at 10)
--
-- Earlier marks split the remainder equally: early = (1 − closer)/(n − 1).
-- Redefines engine_v2_habit_points() with the new miss-weight math; the
-- earning side lives client-side (tap-time snapshots) in scoring2.ts.
-- Applied before the V2 epoch (2026-06-13) — no earned_points snapshots
-- exist yet, so nothing is re-judged.
-- Idempotent.
-- ============================================================================

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
  earned    numeric := 0;
  penalties numeric := 0;
  bonuses   numeric := 0;
  r         record;
  quota     int;
  filled    int;
  closer    numeric;
  mw        numeric;
  -- bonus-walk state (v_ prefix — must not collide with query column names)
  v_slice   numeric;
  v_run     int;
  v_maxrun  int;
  v_alldone boolean;
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
             sum(public.engine_v2_day_value(uid, day)) as pool
      from keyed
      group by pstart
    )
    select p.pstart, p.pend, p.pool,
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
      quota  := greatest(1, hab.frequency_target);
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

    penalties := penalties + 0.7 * r.pool * mw;
  end loop;

  -- streak bonuses (daily-frequency habits only), per calendar month
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
        v_slice := v_slice + public.engine_v2_day_value(uid, v_day);
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
  end if;

  return earned - penalties + bonuses;
end;
$$;

grant execute on function public.engine_v2_habit_points(uuid) to authenticated;
