-- ============================================================================
-- Project Self-Mastery — Habits schema (migration 0001)
-- ============================================================================
-- Run this in Supabase Studio → SQL Editor (or via CLI).
-- Idempotent: safe to run multiple times during development.
-- ============================================================================

-- ------------------------------------------------------------------
-- 1. habit_catalog — managed pool of habits (public read, admin write)
-- ------------------------------------------------------------------
create table if not exists public.habit_catalog (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('positive', 'negative')),
  icon        text not null,           -- lucide icon name, e.g. 'Dumbbell'
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.habit_catalog enable row level security;

drop policy if exists "catalog readable by authenticated" on public.habit_catalog;
create policy "catalog readable by authenticated"
  on public.habit_catalog for select
  to authenticated
  using (true);

-- Writes are owner-only via service role (no user-facing insert policy yet).

-- ------------------------------------------------------------------
-- 2. habits — per-user habits (either from catalog or custom "other")
-- ------------------------------------------------------------------
create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  catalog_id  uuid references public.habit_catalog(id) on delete set null,
  name        text not null,
  icon        text not null,
  type        text not null check (type in ('positive', 'negative')),
  created_at  timestamptz not null default now()
);

create index if not exists habits_user_idx on public.habits(user_id);

alter table public.habits enable row level security;

drop policy if exists "habits owner select" on public.habits;
create policy "habits owner select"
  on public.habits for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "habits owner insert" on public.habits;
create policy "habits owner insert"
  on public.habits for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "habits owner update" on public.habits;
create policy "habits owner update"
  on public.habits for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "habits owner delete" on public.habits;
create policy "habits owner delete"
  on public.habits for delete
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- 3. habit_slot_assignments — which habit lives in which slot, over time
-- ------------------------------------------------------------------
-- Active assignment = end_date IS NULL.
-- Historical lookup for date D in slot S, user U:
--   start_date <= D AND (end_date IS NULL OR end_date > D)
create table if not exists public.habit_slot_assignments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  slot_index  int  not null check (slot_index between 1 and 5),
  habit_id    uuid not null references public.habits(id) on delete cascade,
  start_date  date not null,
  end_date    date,
  created_at  timestamptz not null default now(),
  check (end_date is null or end_date > start_date)
);

create index if not exists assignments_user_slot_idx
  on public.habit_slot_assignments(user_id, slot_index);
create index if not exists assignments_active_idx
  on public.habit_slot_assignments(user_id, slot_index)
  where end_date is null;

alter table public.habit_slot_assignments enable row level security;

drop policy if exists "assignments owner select" on public.habit_slot_assignments;
create policy "assignments owner select"
  on public.habit_slot_assignments for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "assignments owner insert" on public.habit_slot_assignments;
create policy "assignments owner insert"
  on public.habit_slot_assignments for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "assignments owner update" on public.habit_slot_assignments;
create policy "assignments owner update"
  on public.habit_slot_assignments for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "assignments owner delete" on public.habit_slot_assignments;
create policy "assignments owner delete"
  on public.habit_slot_assignments for delete
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- 4. habit_logs — V / X marks per habit per day
-- ------------------------------------------------------------------
-- Status:
--   'V'      = success (+5)
--   'X'      = manual failure (-3)
--   'auto_x' = automatic failure after 2 empty days (-3, same as X)
-- Absent row = blank ("-") = 0 points.
create table if not exists public.habit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  habit_id    uuid not null references public.habits(id) on delete cascade,
  date        date not null,
  status      text not null check (status in ('V', 'X', 'auto_x')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (habit_id, date)
);

create index if not exists logs_user_date_idx on public.habit_logs(user_id, date);
create index if not exists logs_habit_date_idx on public.habit_logs(habit_id, date);

alter table public.habit_logs enable row level security;

drop policy if exists "logs owner select" on public.habit_logs;
create policy "logs owner select"
  on public.habit_logs for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "logs owner insert" on public.habit_logs;
create policy "logs owner insert"
  on public.habit_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "logs owner update" on public.habit_logs;
create policy "logs owner update"
  on public.habit_logs for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "logs owner delete" on public.habit_logs;
create policy "logs owner delete"
  on public.habit_logs for delete
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- 5. Seed — initial catalog (small starter set; owner will extend)
-- ------------------------------------------------------------------
insert into public.habit_catalog (name, type, icon, sort_order) values
  ('קריאת ספר',         'positive', 'BookOpen',    10),
  ('פעילות גופנית',     'positive', 'Dumbbell',    20),
  ('שתיית מים',         'positive', 'Droplet',     30),
  ('יקיצה מוקדמת',      'positive', 'Sunrise',     40),
  ('מדיטציה',           'positive', 'Sparkles',    50),
  ('כתיבת יומן',        'positive', 'NotebookPen', 60),
  ('עישון',             'negative', 'Cigarette',   110),
  ('רשתות חברתיות',     'negative', 'Smartphone',  120),
  ('סוכר',              'negative', 'Cookie',      130),
  ('דחיינות',           'negative', 'Clock',       140)
on conflict do nothing;
