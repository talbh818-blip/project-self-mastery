-- ============================================================================
-- Reminder random-time mode (migration 0048)
-- ============================================================================
-- A reminder can now fire at a SURPRISE time instead of fixed `times`. When
-- `random_time` is true the schedulers ignore `times` and fire once a day at a
-- minute derived deterministically from the reminder id + the local date, in
-- the 09:00–21:00 window (so the foreground scheduler and the Web Push sender
-- agree on the minute with no stored state — see randomTimeForDay in both
-- reminders.ts and api/send-reminders.ts).
--
-- Additive with a default, so existing rows and older clients are unaffected.
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.notification_reminders
  add column if not exists random_time boolean not null default false;
