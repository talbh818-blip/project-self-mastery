-- ============================================================================
-- Trim seeded catalog from 12 → 10 books (migration 0017)
-- ============================================================================
-- Migration 0016's first revision seeded 12 titles. The catalog was trimmed to
-- 10 canonical habit-focused titles per product direction (תזרים and
-- חשוב והתעשר were dropped — they are great books but the least directly
-- aligned with the app's "build habits / break addictions" framing).
--
-- This migration deletes those two rows from any production database that
-- already ran 0016 with the 12-title seed. Edition 0016 has been updated in
-- parallel so fresh setups now seed only 10.
--
-- Safe because:
--   • Match is by (title, author) — exact strings from the original seed.
--   • Only deletes books that have NO videos attached (defensive: an admin
--     might have started filling in videos for these). If videos exist the
--     row is left alone and the admin can decide what to do.
--   • on delete cascade on course_videos would handle attached videos if we
--     dropped the safety check; we keep the check anyway.
--
-- Idempotent — safe to re-run.
-- ============================================================================

delete from public.course_books b
where (
        (b.title = 'תזרים'        and coalesce(b.author, '') = 'Mihaly Csikszentmihalyi')
     or (b.title = 'חשוב והתעשר' and coalesce(b.author, '') = 'Napoleon Hill')
      )
  and not exists (
    select 1 from public.course_videos v where v.book_id = b.id
  );
