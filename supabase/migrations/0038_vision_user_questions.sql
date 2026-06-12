-- ============================================================================
-- Per-user guided-writing questions (migration 0038)
-- ============================================================================
-- Every user can author their own guided-writing prompts, per scope, from a
-- settings sheet on the vision screen. They can also choose to REPLACE the
-- admin defaults (vision_questions, migration 0035) with their own set via a
-- profile flag — when the flag is on and the user has at least one question
-- in a scope, the picker uses only theirs for that scope.
--
--   • vision_user_questions — owner-only rows (these are personal content,
--     same privacy stance as vision entries: nobody else reads them).
--   • profiles.vision_questions_own_only — the "only my questions" toggle.
--
-- Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.vision_user_questions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  scope       text not null check (scope in ('yearly', 'monthly', 'weekly')),
  text        text not null,
  -- Lower = earlier in the settings list. Has no effect on the random pick.
  sort_order  int  not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists vision_user_questions_user_scope_idx
  on public.vision_user_questions (user_id, scope, sort_order, created_at);

alter table public.vision_user_questions enable row level security;

-- updated_at trigger ---------------------------------------------------------
create or replace function public.touch_vision_user_question_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vision_user_questions_touch_updated_at on public.vision_user_questions;
create trigger vision_user_questions_touch_updated_at
  before update on public.vision_user_questions
  for each row
  execute function public.touch_vision_user_question_updated_at();

-- RLS — owner only, on every operation ---------------------------------------
drop policy if exists "user questions owner select" on public.vision_user_questions;
drop policy if exists "user questions owner insert" on public.vision_user_questions;
drop policy if exists "user questions owner update" on public.vision_user_questions;
drop policy if exists "user questions owner delete" on public.vision_user_questions;

create policy "user questions owner select"
  on public.vision_user_questions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user questions owner insert"
  on public.vision_user_questions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user questions owner update"
  on public.vision_user_questions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user questions owner delete"
  on public.vision_user_questions for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.vision_user_questions to authenticated;

-- "Only my questions" toggle on the profile -----------------------------------
alter table public.profiles
  add column if not exists vision_questions_own_only boolean not null default false;
