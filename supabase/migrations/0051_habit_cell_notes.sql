-- ============================================================================
-- Per-cell notes on the habit grid (migration 0050)
-- ============================================================================
-- A long-press on any day cell in the habit grid opens a small popup where the
-- user can attach EXTRA documentation to that single (habit, day):
--   • symbol — an emoji char OR a Lucide icon name (rendered by <HabitIcon/>,
--     which auto-detects which it is), shown inside the cell.
--   • color  — an optional tint override for the cell.
--   • text   — free note; when present the cell shows a small white dot
--     (mirrors the "written" marker on the vision squares).
--
-- This is a SEPARATE table from habit_logs on purpose: a note can exist on a
-- cell that was never marked (no V/X), and it must never interfere with the
-- scoring engine, which reads habit_logs only. Owner-only rows — this is
-- personal documentation, same privacy stance as vision entries.
--
-- Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.habit_cell_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  habit_id    uuid not null references public.habits(id) on delete cascade,
  date        date not null,
  text        text,
  -- emoji char OR Lucide icon name; null = no symbol on the cell.
  symbol      text,
  -- hex color override for the cell tint; null = keep the status colour.
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, habit_id, date)
);

create index if not exists habit_cell_notes_user_idx
  on public.habit_cell_notes (user_id, habit_id, date);

alter table public.habit_cell_notes enable row level security;

-- updated_at trigger ---------------------------------------------------------
create or replace function public.touch_habit_cell_note_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists habit_cell_notes_touch_updated_at on public.habit_cell_notes;
create trigger habit_cell_notes_touch_updated_at
  before update on public.habit_cell_notes
  for each row
  execute function public.touch_habit_cell_note_updated_at();

-- RLS — owner only, on every operation ---------------------------------------
drop policy if exists "cell notes owner select" on public.habit_cell_notes;
drop policy if exists "cell notes owner insert" on public.habit_cell_notes;
drop policy if exists "cell notes owner update" on public.habit_cell_notes;
drop policy if exists "cell notes owner delete" on public.habit_cell_notes;

create policy "cell notes owner select"
  on public.habit_cell_notes for select
  to authenticated
  using (auth.uid() = user_id);

create policy "cell notes owner insert"
  on public.habit_cell_notes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "cell notes owner update"
  on public.habit_cell_notes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "cell notes owner delete"
  on public.habit_cell_notes for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.habit_cell_notes to authenticated;
