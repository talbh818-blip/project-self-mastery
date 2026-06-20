-- ============================================================================
-- Per-user feature flags (migration 0047)
-- ============================================================================
-- Opt-in features on the "פיצ'רים" screen (notifications, journaling, …) are
-- on/off PER USER and now SYNC across devices. The state lives in this jsonb
-- column (e.g. {"notifications": true, "journaling": false}); the client
-- mirrors each flag to a localStorage key for synchronous reads, and pulls
-- this column on load so every device matches.
--
-- Owner read/update is already covered by the existing profiles RLS policies
-- (auth.uid() = id), so no new policy is needed.
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.profiles
  add column if not exists feature_flags jsonb not null default '{}'::jsonb;
