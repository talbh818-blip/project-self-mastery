-- ============================================================================
-- SQL port of scoring V2 (the "monthly pie") + frozen V1 — migration 0036
-- ============================================================================
-- KEEP IN SYNC with src/features/habits/scoring2.ts (the TS engine) — both
-- must produce identical numbers. The displayed score everywhere is:
--
--     frozen-v1 (days < epoch, old rules, "today" pinned to the epoch)
--   + v2        (earned_points snapshots − settlement penalties + bonuses)
--   + profiles.score_adjustment
--
-- Epoch: 2026-06-13. Pie: 3,000/month; base factor 0.9; multiplier
-- 30/60/100% by active-habit count; slot weights (1 → [1], 2 → [.4,.6],
-- n≥3 → first n−1 split 0.6 + closer 0.4); lock after 4 days; miss penalty
-- 70% of the unfilled slots; daily-habit streak bonuses per month
-- (run ≥7 → slice/45, ≥14 → slice/30, perfect month → slice/18).
--
-- engine_user_score(uuid) keeps its signature, so get_user_dashboard() and
-- list_active_profiles() (migration 0034) pick the new math up through it;
-- get_user_dashboard is redefined anyway for the per-habit total_points.
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Day value of ONE habit's day for a user (v2): pie share by habit count.
-- ----------------------------------------------------------------------------
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
           else 3000.0 * 0.9
                * (case when n = 1 then 0.3 when n = 2 then 0.6 else 1.0 end)
                / (n * extract(day from (date_trunc('month', d::timestamp)
                                         + interval '1 month - 1 day'))::int)
         end
  from c;
$$;

-- ----------------------------------------------------------------------------
-- Frozen V1: the 0034 engine walk, clipped to days BEFORE the epoch with
-- "today" pinned to the epoch (the auto-miss grace never drifts).
-- ----------------------------------------------------------------------------
create or replace function public.engine_v1_habit_points(h_id uuid, epoch date)
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
      select distinct gs::date as day
      from public.habit_slot_assignments a
      cross join lateral generate_series(
        a.start_date::timestamp,
        least(coalesce(a.end_date - 1, epoch - 1), epoch - 1)::timestamp,
        interval '1 day'
      ) gs
      where a.habit_id = h_id
    ),
    all_days as (
      select day from assignment_days
      union
      select l.date from public.habit_logs l
      where l.habit_id = h_id and l.date < epoch
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
        if r.amount is null or r.amount >= coalesce(r.target_at_log, qtarget) then
          s := 'V';
        else
          s := 'blank';
        end if;
      else
        s := r.status;
      end if;
    elsif r.in_window and (epoch - r.day) >= 2 then
      s := 'auto_x';
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
  end loop;

  return pts;
end;
$$;

-- ----------------------------------------------------------------------------
-- V2 per-habit points: Σ earned_points − settlement penalties + bonuses.
-- ----------------------------------------------------------------------------
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
    elsif quota = 2 then
      mw := case when filled = 0 then 1.0 else 0.6 end;
    else
      mw := (quota - 1 - least(filled, quota - 1)) * (0.6 / (quota - 1)) + 0.4;
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

grant execute on function public.engine_v2_day_value(uuid, date) to authenticated;
grant execute on function public.engine_v1_habit_points(uuid, date) to authenticated;
grant execute on function public.engine_v2_habit_points(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- engine_user_score(uuid) — same signature as 0034, new math: frozen v1 + v2
-- (+ score_adjustment). list_active_profiles() picks this up unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.engine_user_score(target uuid)
returns int
language sql
stable
set search_path = public
as $$
  select round(
           coalesce((
             select sum(
                      public.engine_v1_habit_points(h.id, date '2026-06-13')
                      + public.engine_v2_habit_points(h.id)
                    )
             from public.habits h
             where h.user_id = target
           ), 0)
           + coalesce((select p.score_adjustment
                       from public.profiles p
                       where p.id = target), 0)
         )::int;
$$;

-- ----------------------------------------------------------------------------
-- get_user_dashboard() — per-habit total_points now use frozen-v1 + v2 too.
-- (Identical to the 0034 version otherwise.)
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
