-- ============================================================================
-- Push subscriptions (migration 0042)
-- ============================================================================
-- Web Push needs a per-device subscription (endpoint + ECDH keys) that the
-- server signs and POSTs to. One row per browser/device push endpoint.
--
-- RLS: owner-only — the client manages only its own subscriptions. The sender
-- (a serverless function) uses the Supabase SERVICE ROLE key, which bypasses
-- RLS, so it can read every user's subscriptions to deliver due reminders.
--
-- Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- The push service endpoint URL (unique per browser/device subscription).
  endpoint     text not null unique,
  -- ECDH public key + auth secret from PushSubscription.getKey (base64url).
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push subs owner select" on public.push_subscriptions;
drop policy if exists "push subs owner insert" on public.push_subscriptions;
drop policy if exists "push subs owner update" on public.push_subscriptions;
drop policy if exists "push subs owner delete" on public.push_subscriptions;

create policy "push subs owner select"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "push subs owner insert"
  on public.push_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "push subs owner update"
  on public.push_subscriptions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "push subs owner delete"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;
