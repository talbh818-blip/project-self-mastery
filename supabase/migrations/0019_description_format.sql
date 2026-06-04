-- ============================================================================
-- Migration 0019 — description_format on habits
-- ============================================================================
-- The habit create/edit form lets the user pick HOW the description reads:
--   'text'      — a plain sentence (the legacy behaviour; default)
--   'bullets'   — a bulleted list (one item per line in `description`)
--   'numbers'   — a numbered list (one item per line)
--   'checklist' — a checkbox list (one item per line)
--
-- The list items themselves continue to live in the existing `description`
-- TEXT column as newline-separated lines; this column only records which
-- visual format to render them in. Existing rows default to 'text', so their
-- descriptions keep rendering exactly as before.
--
-- Applied to the live DB via the Supabase Management API; this file documents
-- it for fresh deployments.
-- ============================================================================

alter table public.habits
  add column if not exists description_format text not null default 'text'
    check (description_format in ('text', 'bullets', 'numbers', 'checklist'));
