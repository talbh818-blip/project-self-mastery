-- ============================================================================
-- Reminder send dedup (migration 0043)
-- ============================================================================
-- The server-side sender (api/send-reminders) runs every minute. To avoid
-- firing the same reminder twice for the same local minute (cron jitter /
-- overlap), it records the last fired "<local-date> <HH:MM>" key per reminder
-- and skips if it matches. Server-managed only (the client never writes it).
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.notification_reminders
  add column if not exists last_fired_key text;
