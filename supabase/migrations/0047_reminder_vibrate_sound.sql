-- ============================================================================
-- Reminder vibration + sound (migration 0047)
-- ============================================================================
-- The reminder editor gained two "how the alert feels" controls:
--   • vibrate — whether the device buzzes when the reminder fires.
--   • sound   — which in-app chime plays (foreground / test). A free-form key
--               into the client's REMINDER_SOUNDS catalog ('chime' default,
--               'none' = silent). Stored as text so new sounds need no migration.
--
-- vibrate is delivered on BOTH paths: the foreground scheduler and the closed-
-- app Web Push (the service worker reads it from the payload). Custom `sound`
-- only plays in the foreground / test send — a closed-app push uses the OS
-- notification-channel sound, which the web platform can't override per-message.
--
-- Both columns have defaults so existing rows (and any insert that predates the
-- new client) keep working unchanged.
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.notification_reminders
  add column if not exists vibrate boolean not null default true;

alter table public.notification_reminders
  add column if not exists sound text not null default 'chime';
