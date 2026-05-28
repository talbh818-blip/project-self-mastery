-- ============================================================================
-- Per-tree placements on the plot (migration 0013)
-- ============================================================================
-- Backs the drag-and-drop UX on the "החלקה שלי" plot. Each user now stores an
-- ordered array of placements — one entry per planted tree — describing where
-- that tree sits in the grid as an offset from the current centre cell.
--
-- Element shape:
--   { "di": int, "dj": int }
--
-- "di" / "dj" are row / column offsets from the grid centre. Storing offsets
-- (instead of absolute (i, j)) means the same placement renders correctly at
-- any grid size — when the plot expands from 5×5 to 7×7, the centre moves
-- but each tree stays in the same relative spot.
--
-- Behaviour when length(tree_placements) < trees_planted:
--   the client falls back to the default cell order for the surplus trees.
--   That makes the migration backward-compatible: existing rows get the empty
--   array and keep working until the user actually drags / plants again.
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.profiles
  add column if not exists tree_placements jsonb not null default '[]'::jsonb;

-- Belt and suspenders: ensure the column is always an array, never null or an
-- object. A trivial CHECK that keeps the data shape predictable for the app.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_tree_placements_is_array'
  ) then
    alter table public.profiles
      add constraint profiles_tree_placements_is_array
      check (jsonb_typeof(tree_placements) = 'array');
  end if;
end$$;
