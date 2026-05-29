-- ============================================================================
-- Course books + summary videos (migration 0016)
-- ============================================================================
-- The "course" screen lets every authenticated user browse a curated shelf of
-- self-development books. Each book has zero or more summary videos that the
-- app owner uploads manually (initially YouTube unlisted; Google Drive shared
-- files are supported via the `provider` column too).
--
-- Tables:
--   • course_books    — the shelf. Admin-managed catalog.
--   • course_videos   — N videos per book, ordered.
--
-- Visibility:
--   • Books and videos are world-readable for any authenticated user. No
--     per-user data lives here.
--   • Only admins can insert / update / delete (gated by public.is_admin()).
--
-- Books without any videos render as "coming soon" (grayed out) in the UI;
-- that is purely a UI concern and not enforced in SQL — admin can hide a
-- book outright via the `is_published` flag if needed.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. course_books
-- ---------------------------------------------------------------------------
create table if not exists public.course_books (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  author        text,
  -- URL to a cover image. Admin can paste any reasonably-sized JPG/PNG.
  -- NULL → UI shows a styled placeholder card with the title.
  cover_url     text,
  -- Free-form short description shown above the video list inside the sheet.
  description   text,
  -- Lower = earlier in the carousel. Defaults to insertion order via gap-100.
  sort_order    int  not null default 100,
  -- Lets an admin temporarily hide a book without deleting its videos.
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists course_books_sort_idx
  on public.course_books (sort_order, created_at);

alter table public.course_books enable row level security;

-- ---------------------------------------------------------------------------
-- 2. course_videos
-- ---------------------------------------------------------------------------
create table if not exists public.course_videos (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references public.course_books(id) on delete cascade,
  title         text not null,
  -- 'youtube' → source_id is the 11-char YouTube video id (the part after v=).
  -- 'drive'   → source_id is the Google Drive file id (used with /preview).
  provider      text not null check (provider in ('youtube', 'drive')),
  source_id     text not null,
  -- Optional override; when null the UI builds a thumbnail from the provider
  -- (e.g. https://i.ytimg.com/vi/<id>/hqdefault.jpg for YouTube).
  thumbnail_url text,
  duration_sec  int,
  sort_order    int  not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists course_videos_book_sort_idx
  on public.course_videos (book_id, sort_order, created_at);

alter table public.course_videos enable row level security;

-- ---------------------------------------------------------------------------
-- 3. updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_course_book_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists course_books_touch_updated_at on public.course_books;
create trigger course_books_touch_updated_at
  before update on public.course_books
  for each row
  execute function public.touch_course_book_updated_at();

create or replace function public.touch_course_video_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists course_videos_touch_updated_at on public.course_videos;
create trigger course_videos_touch_updated_at
  before update on public.course_videos
  for each row
  execute function public.touch_course_video_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS — read for any authenticated user; write for admins only
-- ---------------------------------------------------------------------------
drop policy if exists "books read"          on public.course_books;
drop policy if exists "books admin insert"  on public.course_books;
drop policy if exists "books admin update"  on public.course_books;
drop policy if exists "books admin delete"  on public.course_books;

create policy "books read"
  on public.course_books for select
  to authenticated
  using (true);

create policy "books admin insert"
  on public.course_books for insert
  to authenticated
  with check (public.is_admin());

create policy "books admin update"
  on public.course_books for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "books admin delete"
  on public.course_books for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "videos read"          on public.course_videos;
drop policy if exists "videos admin insert"  on public.course_videos;
drop policy if exists "videos admin update"  on public.course_videos;
drop policy if exists "videos admin delete"  on public.course_videos;

create policy "videos read"
  on public.course_videos for select
  to authenticated
  using (true);

create policy "videos admin insert"
  on public.course_videos for insert
  to authenticated
  with check (public.is_admin());

create policy "videos admin update"
  on public.course_videos for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "videos admin delete"
  on public.course_videos for delete
  to authenticated
  using (public.is_admin());

grant select, insert, update, delete on public.course_books  to authenticated;
grant select, insert, update, delete on public.course_videos to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Seed — 10 well-known self-development titles.
-- ----------------------------------------------------------------------------
-- These are inserted with cover_url = NULL so they render as placeholder cards
-- until the admin pastes a real cover URL. They start with no videos, so they
-- appear grayed out ("בקרוב") in the UI — which is the desired V1 behavior.
--
-- Uses (title, author) as a soft uniqueness key so re-running the migration
-- doesn't duplicate rows.
-- ---------------------------------------------------------------------------
insert into public.course_books (title, author, sort_order)
select v.title, v.author, v.sort_order
from (values
  ('הרגלים אטומיים',                       'James Clear',           10),
  ('כוחו של הרגע הזה',                     'Eckhart Tolle',         20),
  ('שבעת ההרגלים של אנשים אפקטיביים',    'Stephen Covey',         30),
  ('כוחו של ההרגל',                         'Charles Duhigg',        40),
  ('מיינדסט',                                'Carol Dweck',           50),
  ('המועדון של חמש בבוקר',                'Robin Sharma',          60),
  ('עבודה עמוקה',                            'Cal Newport',           70),
  ('האדם מחפש משמעות',                    'Viktor Frankl',         80),
  ('האגו הוא האויב',                         'Ryan Holiday',          90),
  ('איך לרכוש ידידים ולהשפיע על אנשים', 'Dale Carnegie',        100)
) as v(title, author, sort_order)
where not exists (
  select 1 from public.course_books b
  where b.title = v.title
    and coalesce(b.author, '') = coalesce(v.author, '')
);
