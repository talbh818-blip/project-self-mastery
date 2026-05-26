-- ============================================================================
-- Migration 0008 — difficulty + sort_order on habits
-- ============================================================================
-- The client code (HabitPickerSheet + mutations) started sending two new
-- fields, but the underlying columns hadn't been added. Inserts and updates
-- failed silently in the form's try/catch, so editing or creating a habit
-- looked like a no-op from the user's perspective.
--
--   difficulty — self-reported by the user ('easy' | 'medium' | 'hard')
--   sort_order — user-controlled display order within the type group;
--                written in bulk after a drag-and-drop reorder.
--
-- Both were applied to the live DB via the Supabase Management API; this
-- file documents them for fresh deployments.
-- ============================================================================

alter table public.habits
  add column if not exists difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard'));

alter table public.habits
  add column if not exists sort_order int not null default 0;
