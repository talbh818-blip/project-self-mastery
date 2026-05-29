-- ============================================================================
-- Vision (journaling) entries (migration 0015)
-- ============================================================================
-- The "vision" screen lets a user write a personal yearly / monthly / weekly
-- journal entry. Each entry is keyed by (user_id, scope, period_key):
--   scope        — 'yearly' | 'monthly' | 'weekly'
--   period_key   — canonical string per scope:
--                    yearly  → 'YYYY'         (e.g. '2026')
--                    monthly → 'YYYY-MM'      (e.g. '2026-05')
--                    weekly  → 'YYYY-Www'     (ISO week, e.g. '2026-W22')
--
-- `content` stores the editor document as ProseMirror/Tiptap JSON.
--
-- ───── Privacy ───────────────────────────────────────────────────────────────
-- Default visibility is 'private'. The schema also allows 'public' and
-- 'specific' so future sharing features can land without another migration,
-- but in V1 the UI never exposes sharing controls and RLS only grants access
-- to the owner (and admin, for moderation parity with other tables).
--
-- A user opting into sharing is the ONLY way an entry should ever be visible
-- to anyone else — we never make sharing the default behaviour. When sharing
-- ships, new RLS policies will be added that read this column.
--
-- Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.vision_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  scope       text not null check (scope in ('yearly', 'monthly', 'weekly')),
  period_key  text not null,
  content     jsonb not null default '{}'::jsonb,
  visibility  text not null default 'private'
                check (visibility in ('private', 'public', 'specific')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, scope, period_key)
);

create index if not exists vision_entries_user_scope_idx
  on public.vision_entries (user_id, scope, period_key);

alter table public.vision_entries enable row level security;

-- ------------------------------------------------------------------
-- updated_at trigger
-- ------------------------------------------------------------------
create or replace function public.touch_vision_entry_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vision_entries_touch_updated_at on public.vision_entries;
create trigger vision_entries_touch_updated_at
  before update on public.vision_entries
  for each row
  execute function public.touch_vision_entry_updated_at();

-- ------------------------------------------------------------------
-- RLS — owner full access; admin read & delete (moderation parity)
-- ------------------------------------------------------------------
drop policy if exists "vision owner select"  on public.vision_entries;
drop policy if exists "vision owner insert"  on public.vision_entries;
drop policy if exists "vision owner update"  on public.vision_entries;
drop policy if exists "vision owner delete"  on public.vision_entries;
drop policy if exists "vision admin select"  on public.vision_entries;
drop policy if exists "vision admin delete"  on public.vision_entries;

create policy "vision owner select"
  on public.vision_entries for select
  to authenticated
  using (auth.uid() = user_id);

create policy "vision owner insert"
  on public.vision_entries for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "vision owner update"
  on public.vision_entries for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "vision owner delete"
  on public.vision_entries for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "vision admin select"
  on public.vision_entries for select
  to authenticated
  using (public.is_admin());

create policy "vision admin delete"
  on public.vision_entries for delete
  to authenticated
  using (public.is_admin());

grant select, insert, update, delete on public.vision_entries to authenticated;
