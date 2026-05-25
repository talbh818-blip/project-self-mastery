-- ============================================================================
-- Migration 0007 — expand slot capacity from 5 to 10
-- ============================================================================
-- The TypeScript SlotIndex was expanded from 1..5 to 1..10 to support up to
-- 10 habits per user, but the underlying CHECK constraint still rejected
-- slot_index > 5. This migration drops the old constraint and adds the new
-- one. Already applied to the live DB via the Supabase Management API.
-- ============================================================================

alter table public.habit_slot_assignments
  drop constraint if exists habit_slot_assignments_slot_index_check;

alter table public.habit_slot_assignments
  add constraint habit_slot_assignments_slot_index_check
  check (slot_index between 1 and 10);
