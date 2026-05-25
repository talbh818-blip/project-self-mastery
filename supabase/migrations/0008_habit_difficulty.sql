-- 0008_habit_difficulty.sql
-- Add a self-reported difficulty rating to each habit.
-- Existing rows default to 'medium'; the column is NOT NULL going forward.

alter table public.habits
  add column if not exists difficulty text not null
  default 'medium'
  check (difficulty in ('easy', 'medium', 'hard'));
