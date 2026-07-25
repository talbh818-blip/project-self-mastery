-- ============================================================================
-- Dev board — Trello-style kanban for the app owner (migration 0053)
-- ============================================================================
-- Backs the "פיתוח" tab in the admin ("ניהול") panel. A private planning board
-- the owner uses to track what to build: named columns (בקרוב / השבוע / בפיתוח…)
-- holding task cards, each with a title, a free-text description, and a color
-- label the owner picks.
--
--   • Two tables: dev_board_columns (the lanes) and dev_board_cards (the tasks,
--     cascade-deleted with their column). `position` orders both — lower first.
--   • Admin-only for EVERY operation (select included): this is the owner's
--     private board, not app content, so a regular user never reads it. Same
--     is_admin() gate the rest of the admin surface uses.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ------------------------------------------------------------------
-- 1. Columns (the board lanes)
-- ------------------------------------------------------------------
create table if not exists public.dev_board_columns (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  -- Lower = further to the (RTL) right, i.e. earlier in the board.
  position    int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists dev_board_columns_position_idx
  on public.dev_board_columns (position, created_at);

-- ------------------------------------------------------------------
-- 2. Cards (the tasks inside a lane)
-- ------------------------------------------------------------------
create table if not exists public.dev_board_cards (
  id          uuid primary key default gen_random_uuid(),
  column_id   uuid not null references public.dev_board_columns(id) on delete cascade,
  title       text not null,
  description text,
  -- Free label color the owner picks — a small keyed palette lives in the app
  -- (DevBoardAdminPanel.tsx). Stored as the key, not a hex, so the palette can
  -- shift without a data migration; unknown keys fall back to 'slate' in the UI.
  color       text not null default 'slate',
  position    int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists dev_board_cards_column_position_idx
  on public.dev_board_cards (column_id, position, created_at);

-- ------------------------------------------------------------------
-- 3. updated_at triggers (shared function for both tables)
-- ------------------------------------------------------------------
create or replace function public.touch_dev_board_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dev_board_columns_touch_updated_at on public.dev_board_columns;
create trigger dev_board_columns_touch_updated_at
  before update on public.dev_board_columns
  for each row
  execute function public.touch_dev_board_updated_at();

drop trigger if exists dev_board_cards_touch_updated_at on public.dev_board_cards;
create trigger dev_board_cards_touch_updated_at
  before update on public.dev_board_cards
  for each row
  execute function public.touch_dev_board_updated_at();

-- ------------------------------------------------------------------
-- 4. RLS — admins only, every operation
-- ------------------------------------------------------------------
alter table public.dev_board_columns enable row level security;
alter table public.dev_board_cards   enable row level security;

drop policy if exists "dev board columns admin" on public.dev_board_columns;
create policy "dev board columns admin"
  on public.dev_board_columns for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "dev board cards admin" on public.dev_board_cards;
create policy "dev board cards admin"
  on public.dev_board_cards for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.dev_board_columns to authenticated;
grant select, insert, update, delete on public.dev_board_cards   to authenticated;
