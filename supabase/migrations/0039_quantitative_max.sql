-- ============================================================================
-- Optional count cap above the points target — migration 0039
-- ============================================================================
-- A daily counting habit (quantitative_target > 1) earns points up to its
-- target. quantitative_max lets the per-day tap counter run HIGHER than the
-- target purely for tracking: e.g. target 5 pages (points), max 10 (you can
-- record reading 10). Taps above the target count for display only and earn
-- no extra points — the scoring engine already caps earnings at the target
-- (effective quota), so this column only widens the cell's tap cycle.
--
-- NULL = no cap above target (the common case). Only meaningful when > target.
-- Idempotent.
-- ============================================================================

alter table public.habits
  add column if not exists quantitative_max int
    check (quantitative_max is null or quantitative_max > 1);
