-- ============================================================================
-- Migration 0004 — extended metadata on habits
-- ============================================================================
-- Adds the fields needed by the new habit-creation form:
--   description           — optional free text
--   color                 — accent color picked by user (default forest-700)
--   frequency_period      — 'daily' | 'weekly' | 'monthly'
--   frequency_target      — target count of completions within the period
--   is_quantitative       — true when the habit logs a numeric amount
--                            (e.g. "10 pages") instead of a simple V/X.
--   quantitative_target   — target amount per log (e.g. 10 pages)
--   quantitative_unit     — unit label (e.g. "pages", "minutes")
-- Existing rows take the column defaults.
-- ============================================================================

alter table public.habits
  add column if not exists description text,
  add column if not exists color text default '#56aa70',
  add column if not exists frequency_period text default 'daily'
    check (frequency_period in ('daily', 'weekly', 'monthly')),
  add column if not exists frequency_target int default 1
    check (frequency_target > 0),
  add column if not exists is_quantitative boolean default false,
  add column if not exists quantitative_target int
    check (quantitative_target is null or quantitative_target > 0),
  add column if not exists quantitative_unit text;
