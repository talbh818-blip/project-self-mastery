-- ============================================================================
-- Protect admin-only profile columns from self-service edits (migration 0054)
-- ============================================================================
-- Migration 0011 created `profiles` with owner-level RLS that intentionally
-- had NO per-column restriction, with the note "there is no per-column RLS, so
-- we trust the app for now". That means a logged-in user — talking to Supabase
-- directly with the public anon key, bypassing our UI — could UPDATE their own
-- row to:
--   • flip `blocked` back to false (undo an admin ban), or
--   • set `score_adjustment` to any number (inflate their displayed score).
-- Neither column is ever written by the user-facing app; both are admin-only
-- (features/admin/UserEditSheet.tsx + AdminScreen.tsx). This migration enforces
-- that at the database level.
--
-- Approach: a BEFORE UPDATE trigger that rejects a change to either column
-- unless the caller is an admin (is_admin()) OR there is no end-user identity
-- on the request (auth.uid() IS NULL — i.e. the service-role key / internal
-- backend, which we already trust). Legitimate flows are unaffected:
--   • user profile edits touch display_name / phone / theme / avatar / privacy
--     knobs — never these two columns,
--   • tree planting touches trees_planted / tree_placements — never these two,
--   • admin edits pass is_admin().
--
-- NOTE on `trees_planted`: it is deliberately NOT locked here. Unlike the two
-- columns above, the user legitimately writes it from their own browser when
-- they plant a tree (features/tree/TreeCard.tsx). Hardening the tree economy
-- against tampering requires moving planting into a server-validated function —
-- a larger change tracked separately.
--
-- Idempotent — safe to re-run.
-- ============================================================================

create or replace function public.guard_profile_admin_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted callers: the admin, and any request with no end-user identity
  -- (service-role key / internal jobs). Everything they do is allowed.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  -- Regular logged-in user: these columns must stay exactly as they were.
  if new.score_adjustment is distinct from old.score_adjustment then
    raise exception 'score_adjustment can only be changed by an admin'
      using errcode = '42501';
  end if;

  if new.blocked is distinct from old.blocked then
    raise exception 'blocked can only be changed by an admin'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_admin_columns on public.profiles;
create trigger profiles_guard_admin_columns
  before update on public.profiles
  for each row
  execute function public.guard_profile_admin_columns();
