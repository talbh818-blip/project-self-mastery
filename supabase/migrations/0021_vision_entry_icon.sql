-- ============================================================================
-- Per-entry icon for vision entries (migration 0021)
-- ============================================================================
-- Each vision entry (a specific scope + period — e.g. yearly 2026, monthly
-- 2026-05, weekly 2026-W22) can carry a small icon the user picks, shown next
-- to that level's title in the layered navigator.
--
-- The value is EITHER a Lucide icon name (e.g. "Flame") OR a raw emoji char
-- (e.g. "🦅") — the same dual format the habit picker uses, rendered through
-- <HabitIcon />. NULL means "no icon".
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.vision_entries
  add column if not exists icon text;

notify pgrst, 'reload schema';
