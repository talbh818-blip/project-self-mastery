-- ============================================================================
-- Vision daily entries — widen scope to allow 'daily' (migration 0046)
-- ============================================================================
-- The weekly VIEW now drills down to the day: every day under a week is its
-- own vision entry (scope='daily', period_key='YYYY-MM-DD' — the calendar
-- date). This is the "כתיבה יומית / Journaling" layer. It reuses
-- vision_entries entirely — same columns, same owner-only RLS (with admin
-- moderation parity) — so the ONLY change here is widening the scope CHECK.
--
-- period_key per scope:
--   yearly  → 'YYYY'        (e.g. '2026')
--   monthly → 'YYYY-MM'     (e.g. '2026-06')
--   weekly  → 'YYYY-MM-DD'  (the week's Sunday)
--   daily   → 'YYYY-MM-DD'  (the calendar date)              ← NEW
--
-- NOTE: weekly and daily share the 'YYYY-MM-DD' shape, but they can never
-- collide on a single row because (user_id, scope, period_key) is unique and
-- the scope differs. Any reader that looks rows up by period_key ALONE must
-- therefore also key/filter by scope (see VisionWeekMap / fetchVisionRowMeta).
--
-- Idempotent — safe to re-run. The original inline CHECK (migration 0015) is
-- auto-named `vision_entries_scope_check` by Postgres; we drop it (if present)
-- and re-add the widened version under the same canonical name.
-- ============================================================================

alter table public.vision_entries
  drop constraint if exists vision_entries_scope_check;

alter table public.vision_entries
  add constraint vision_entries_scope_check
  check (scope in ('yearly', 'monthly', 'weekly', 'daily'));
