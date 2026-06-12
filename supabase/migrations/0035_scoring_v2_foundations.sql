-- ============================================================================
-- Scoring V2 foundations: per-tap earned-points snapshot + tree ledger
-- (migration 0035)
-- ============================================================================
-- The "monthly pie" scoring system (see src/features/habits/scoring2.ts)
-- starts at the epoch 2026-06-13. Two pieces of storage support it:
--
-- 1. habit_logs.earned_points — the points a row's taps earned, computed and
--    SNAPSHOTTED at tap time (slot value × late-marking decay) and
--    accumulated across taps. Snapshotting at write time is what makes the
--    system non-retroactive: nothing recomputes a mark's worth later.
--    NULL on pre-epoch rows (frozen v1 scoring covers those days).
--
-- 2. tree_plantings — one row per planted tree, with the price paid (the
--    monthly ladder position at planting time). Powers the 10-trees-a-month
--    cap and the carryover bank. profiles.trees_planted keeps counting
--    lifetime trees for display/admin as before.
--
-- Idempotent.
-- ============================================================================

alter table public.habit_logs
  add column if not exists earned_points numeric;

create table if not exists public.tree_plantings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  planted_at  timestamptz not null default now(),
  price       int not null check (price > 0)
);

create index if not exists tree_plantings_user_idx
  on public.tree_plantings (user_id, planted_at);

alter table public.tree_plantings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tree_plantings'
      and policyname = 'tree_plantings_select_own'
  ) then
    create policy tree_plantings_select_own on public.tree_plantings
      for select using (auth.uid() = user_id or public.is_admin());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tree_plantings'
      and policyname = 'tree_plantings_insert_own'
  ) then
    create policy tree_plantings_insert_own on public.tree_plantings
      for insert with check (auth.uid() = user_id);
  end if;
end $$;

grant select, insert on public.tree_plantings to authenticated;
