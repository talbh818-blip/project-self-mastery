-- ============================================================================
-- Switch book covers to locally-hosted assets (migration 0019)
-- ============================================================================
-- Migration 0018 pointed cover_url at Open Library (covers.openlibrary.org).
-- Those URLs 302-redirect to archive.org, which is often slow — covers took
-- several seconds to appear on the course screen.
--
-- We now ship the 10 covers as static assets under /public/book-covers/, so
-- they're served from Vercel's edge CDN: one fast hop, no redirect, no
-- third-party uptime dependency. This migration repoints cover_url at those
-- local paths.
--
-- Safety:
--   • Only updates rows whose cover_url is NULL or still points at Open
--     Library. If an admin pasted a custom cover via the dashboard, it is
--     preserved.
--   • Matched by exact (title, author) from the original seed.
--
-- 0016 has been updated in parallel to seed the local paths directly, so a
-- fresh setup skips the Open Library hop entirely.
--
-- Idempotent — safe to re-run.
-- ============================================================================

with covers(title, author, cover_url) as (
  values
    ('הרגלים אטומיים',                       'James Clear',    '/book-covers/atomic-habits.jpg'),
    ('כוחו של הרגע הזה',                     'Eckhart Tolle',  '/book-covers/power-of-now.jpg'),
    ('שבעת ההרגלים של אנשים אפקטיביים',    'Stephen Covey',  '/book-covers/seven-habits.jpg'),
    ('כוחו של ההרגל',                         'Charles Duhigg', '/book-covers/power-of-habit.jpg'),
    ('מיינדסט',                                'Carol Dweck',    '/book-covers/mindset.jpg'),
    ('המועדון של חמש בבוקר',                'Robin Sharma',   '/book-covers/five-am-club.jpg'),
    ('עבודה עמוקה',                            'Cal Newport',    '/book-covers/deep-work.jpg'),
    ('האדם מחפש משמעות',                    'Viktor Frankl',  '/book-covers/mans-search-for-meaning.jpg'),
    ('האגו הוא האויב',                         'Ryan Holiday',   '/book-covers/ego-is-the-enemy.jpg'),
    ('איך לרכוש ידידים ולהשפיע על אנשים', 'Dale Carnegie',  '/book-covers/how-to-win-friends.jpg')
)
update public.course_books b
set cover_url = c.cover_url
from covers c
where b.title = c.title
  and coalesce(b.author, '') = coalesce(c.author, '')
  and (b.cover_url is null or b.cover_url like '%openlibrary.org%');
