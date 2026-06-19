-- ============================================================================
-- pg_cron: trigger the Web Push sender every minute (migration 0044)
-- ============================================================================
-- Runs api/send-reminders on Vercel once a minute. The real CRON_SECRET is
-- injected when this is applied via the Management API (kept OUT of git — the
-- placeholder below is intentional). The same secret must be set as the
-- CRON_SECRET env var in Vercel so the function accepts the call.
--
-- Re-running cron.schedule with the same job name replaces the schedule.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-reminders-every-min',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project-self-mastery.vercel.app/api/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
