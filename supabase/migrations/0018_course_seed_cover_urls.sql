-- ============================================================================
-- Backfill cover URLs for the seeded books (migration 0018)
-- ============================================================================
-- Migration 0016 originally seeded the catalog with cover_url = NULL, expecting
-- the admin to fill covers in later. Per product direction we want covers
-- visible immediately so the carousel looks populated. This migration sets
-- cover_url to a stable Open Library URL keyed by the English-edition ISBN
-- for each of the 10 seeded books.
--
-- Safety:
--   • Match by exact (title, author) — the original seed values.
--   • Only updates rows where cover_url is currently NULL. If an admin already
--     uploaded a custom cover via the dashboard, this migration won't overwrite
--     it.
--   • If Open Library doesn't have a cover for a given ISBN, the URL will load
--     a broken image and the app's <img onError> handler falls back to the
--     "בקרוב" placeholder. The data stays sane either way.
--
-- 0016 has been updated in parallel to include the same URLs in the INSERT, so
-- a fresh setup gets covers in one step.
--
-- Idempotent — safe to re-run.
-- ============================================================================

with covers(title, author, cover_url) as (
  values
    ('הרגלים אטומיים',                       'James Clear',    'https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg'),
    ('כוחו של הרגע הזה',                     'Eckhart Tolle',  'https://covers.openlibrary.org/b/isbn/9781577314806-L.jpg'),
    ('שבעת ההרגלים של אנשים אפקטיביים',    'Stephen Covey',  'https://covers.openlibrary.org/b/isbn/9780743269513-L.jpg'),
    ('כוחו של ההרגל',                         'Charles Duhigg', 'https://covers.openlibrary.org/b/isbn/9780812981605-L.jpg'),
    ('מיינדסט',                                'Carol Dweck',    'https://covers.openlibrary.org/b/isbn/9780345472328-L.jpg'),
    ('המועדון של חמש בבוקר',                'Robin Sharma',   'https://covers.openlibrary.org/b/isbn/9781443456623-L.jpg'),
    ('עבודה עמוקה',                            'Cal Newport',    'https://covers.openlibrary.org/b/isbn/9781455586691-L.jpg'),
    ('האדם מחפש משמעות',                    'Viktor Frankl',  'https://covers.openlibrary.org/b/isbn/9780807014295-L.jpg'),
    ('האגו הוא האויב',                         'Ryan Holiday',   'https://covers.openlibrary.org/b/isbn/9781591847816-L.jpg'),
    ('איך לרכוש ידידים ולהשפיע על אנשים', 'Dale Carnegie',  'https://covers.openlibrary.org/b/isbn/9780671027032-L.jpg')
)
update public.course_books b
set cover_url = c.cover_url
from covers c
where b.title = c.title
  and coalesce(b.author, '') = coalesce(c.author, '')
  and b.cover_url is null;
