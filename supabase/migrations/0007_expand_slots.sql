-- 0007_expand_slots.sql
-- Expand the per-user habit slot count from 5 to 10.
-- The original check constraint was created inline in 0001 (so unnamed by
-- the user, auto-named by Postgres). We drop by the standard auto-name and
-- re-add with the new range.

alter table public.habit_slot_assignments
  drop constraint if exists habit_slot_assignments_slot_index_check;

alter table public.habit_slot_assignments
  add constraint habit_slot_assignments_slot_index_check
  check (slot_index between 1 and 10);
