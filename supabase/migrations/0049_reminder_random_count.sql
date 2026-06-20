-- ============================================================================
-- Reminder random-time count (migration 0049)
-- ============================================================================
-- A random-time reminder can now fire MORE than once a day. `random_count` is
-- how many surprise firings per day: the 09:00–21:00 window is split into that
-- many buckets and one deterministic minute is chosen per bucket (see
-- randomTimesForDay in reminders.ts and api/send-reminders.ts). Only meaningful
-- when random_time is true; ignored for fixed-time reminders.
--
-- Additive with a default, so existing rows / older clients are unaffected.
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.notification_reminders
  add column if not exists random_count int not null default 1
    check (random_count between 1 and 12);
