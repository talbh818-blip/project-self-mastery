-- ============================================================================
-- Migration 0006 — archived_at on habits
-- ============================================================================
-- Adds a soft-archive timestamp. When non-null, the habit is hidden from the
-- active habit list and slot views, but its data (logs, history) is kept.
-- ============================================================================

alter table public.habits
  add column if not exists archived_at timestamptz;
