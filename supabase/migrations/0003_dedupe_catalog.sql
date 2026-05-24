-- ============================================================================
-- Migration 0003 — dedupe habit_catalog and prevent future duplicates
-- ============================================================================
-- The seed in 0001 used `on conflict do nothing` without specifying a column,
-- which only catches PK collisions. Since each row gets a fresh UUID, re-running
-- the migration produced duplicate rows by name.
-- This migration:
--   1. Removes existing duplicates, keeping the oldest of each.
--   2. Adds a unique constraint on name so the seed becomes truly idempotent.
-- ============================================================================

delete from public.habit_catalog
where id in (
  select id from (
    select id, row_number() over (partition by name order by created_at, id) as rn
    from public.habit_catalog
  ) t
  where t.rn > 1
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'habit_catalog_name_key'
      and conrelid = 'public.habit_catalog'::regclass
  ) then
    alter table public.habit_catalog
      add constraint habit_catalog_name_key unique (name);
  end if;
end$$;
