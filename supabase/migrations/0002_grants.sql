-- ============================================================================
-- Migration 0002 — explicit GRANTs for the authenticated role
-- ============================================================================
-- Supabase no longer grants default table permissions to the `authenticated`
-- and `anon` roles in newly-created projects. RLS alone is not enough —
-- the role must also have the underlying GRANT on each table.
-- Run this in Supabase SQL Editor (idempotent — safe to re-run).
-- ============================================================================

-- Authenticated users (logged in via Supabase Auth) can read/write their
-- own rows on these tables. RLS policies (set in 0001) still enforce
-- per-row ownership via auth.uid() = user_id.
grant select, insert, update, delete on public.habits to authenticated;
grant select, insert, update, delete on public.habit_slot_assignments to authenticated;
grant select, insert, update, delete on public.habit_logs to authenticated;

-- Catalog is read-only for authenticated users (admin manages via service role).
grant select on public.habit_catalog to authenticated;

-- usage on the public schema (required to even "see" the tables).
grant usage on schema public to authenticated;
