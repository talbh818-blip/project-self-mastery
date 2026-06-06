-- ============================================================================
-- Migration 0024 — missing GRANTs on profiles + support_tickets
-- ============================================================================
-- Migrations 0011 (profiles) and 0012 (support_tickets) wired up RLS policies
-- but forgot the underlying GRANTs to the `authenticated` role. The project
-- relies on the convention established in migration 0002: RLS alone is not
-- enough on this Supabase instance — the role must also have the GRANT.
--
-- Symptom: admin clicking "סמן כטופל" failed with
--   permission denied for table support_tickets — [42501]
-- because the UPDATE grant was missing.
--
-- INSERT on support_tickets happened to work via an older manual grant that
-- was already in place, which masked the gap until UPDATE was attempted.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- profiles: full CRUD; RLS policies (0011) restrict each operation to the
-- row owner or the admin.
grant select, insert, update, delete on public.profiles to authenticated;

-- support_tickets: owner inserts, owner reads own, admin reads + updates all.
-- DELETE is intentionally omitted — there is no admin delete policy on this
-- table (we want a permanent record of tickets).
grant select, insert, update on public.support_tickets to authenticated;
