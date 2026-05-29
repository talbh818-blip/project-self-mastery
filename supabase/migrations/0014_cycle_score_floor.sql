-- ============================================================================
-- Decouple "trees planted" count from "current-cycle progress" (migration 0014)
-- ============================================================================
-- Before this migration, the progress bar toward the next tree was computed as
--     cycleScore = totalScore - sum(cycleTargetFor(i) for i in 0..trees_planted-1)
-- which silently coupled the two values: whenever an admin edited a user's
-- trees_planted count, the user's progress meter snapped to 0% (or near it).
--
-- The new `cycle_score_floor` column tracks the score that the user has
-- *actually spent* on planting trees through gameplay. Only the planting
-- action (clicking "שתול את העץ שלך") bumps this field; admin edits to
-- trees_planted leave it alone.
--
-- Progress math becomes
--     cycleScore = max(0, totalScore - cycle_score_floor)
--
-- ───── Backfill policy ───────────────────────────────────────────────────────
-- We DO NOT retroactively guess what the floor "should have been" for existing
-- users — defaulting to 0 means anyone with a pre-existing score gets full
-- credit toward their next tree. That's intentionally generous: it's the most
-- common interpretation of "fix my broken meter" and nobody loses progress.
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.profiles
  add column if not exists cycle_score_floor int not null default 0;

-- Sanity: floor is never negative.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_cycle_score_floor_nonnegative'
  ) then
    alter table public.profiles
      add constraint profiles_cycle_score_floor_nonnegative
      check (cycle_score_floor >= 0);
  end if;
end$$;
