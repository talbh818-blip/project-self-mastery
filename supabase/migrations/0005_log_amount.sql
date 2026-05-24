-- ============================================================================
-- Migration 0005 — quantitative amount on habit_logs
-- ============================================================================
-- For binary habits, `amount` stays NULL and `status` carries V/X/auto_x.
-- For quantitative habits (habit.is_quantitative = true), `amount` holds
-- the count the user logged for that day (e.g. 7 pages, 30 minutes).
-- `status` is set to 'V' whenever there is any amount on a quantitative day
-- so existing queries that key on status continue to work.
-- ============================================================================

alter table public.habit_logs
  add column if not exists amount int
    check (amount is null or amount > 0);
