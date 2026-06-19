-- ============================================================================
-- Notification reminders (migration 0041)
-- ============================================================================
-- The "התראות" feature used to store ONE reminder per habit in localStorage
-- (key `habit-notifications:<habitId>`). The app owner wants a free-form list
-- of reminders instead: create as many as you like, each with its own days,
-- times and message phrasings, optionally LINKED to a habit (for its icon /
-- name) or left general.
--
-- Why a table (not localStorage):
--   • Delivery while the app is CLOSED needs Web Push — the server must be able
--     to read each reminder's schedule, so the schedule has to live in the DB.
--   • Storing it server-side also syncs the schedule across the user's devices.
--   (Permission + the actual push subscription stay per-device — those land in
--    a separate `push_subscriptions` table in the Push step.)
--
-- Each reminder is SELF-CONTAINED: `title` + `messages` are snapshotted so the
-- foreground scheduler (and, later, the push sender) can fire without joining
-- to `habits`. `habit_id` is optional metadata used by the UI (icon in the
-- list) and to pre-fill the title.
--
-- RLS: owner-only for every operation — reminders are personal and private,
-- and no moderation use-case needs admin access here.
--
-- Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.notification_reminders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- Optional link to a habit (icon + name in the list). Survives habit
  -- deletion (title/messages are already snapshotted onto the reminder).
  habit_id      uuid references public.habits(id) on delete set null,
  enabled       boolean not null default true,
  -- The notification's title (self-contained; pre-filled from the habit name
  -- in the UI but freely editable).
  title         text not null default '',
  -- Day-of-week indexes that fire: 0 = Sunday … 6 = Saturday (Israeli week).
  days          int[]  not null default array[0,1,2,3,4,5,6]
                  check (days <@ array[0,1,2,3,4,5,6]),
  -- Times of day in 24h "HH:MM". Each fires on every selected day.
  times         text[] not null default array['20:00']::text[],
  -- The user's own phrasings. Empty → the app uses a generic default line.
  messages      text[] not null default array[]::text[],
  -- How to choose among `messages` when more than one is set.
  message_order text   not null default 'random'
                  check (message_order in ('random', 'sequential')),
  -- Cursor for 'sequential' rotation (index into `messages`, wraps).
  next_index    int    not null default 0,
  -- IANA timezone the reminder is judged in (server-side local-time for Push).
  timezone      text   not null default 'Asia/Jerusalem',
  -- Lower = earlier in the list.
  sort_order    int    not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists notification_reminders_user_idx
  on public.notification_reminders (user_id, sort_order, created_at);

alter table public.notification_reminders enable row level security;

-- updated_at trigger ---------------------------------------------------------
create or replace function public.touch_notification_reminder_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists notification_reminders_touch_updated_at
  on public.notification_reminders;
create trigger notification_reminders_touch_updated_at
  before update on public.notification_reminders
  for each row
  execute function public.touch_notification_reminder_updated_at();

-- RLS — owner full access (no admin: reminders are personal) ------------------
drop policy if exists "reminders owner select" on public.notification_reminders;
drop policy if exists "reminders owner insert" on public.notification_reminders;
drop policy if exists "reminders owner update" on public.notification_reminders;
drop policy if exists "reminders owner delete" on public.notification_reminders;

create policy "reminders owner select"
  on public.notification_reminders for select
  to authenticated
  using (auth.uid() = user_id);

create policy "reminders owner insert"
  on public.notification_reminders for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "reminders owner update"
  on public.notification_reminders for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "reminders owner delete"
  on public.notification_reminders for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete
  on public.notification_reminders to authenticated;
