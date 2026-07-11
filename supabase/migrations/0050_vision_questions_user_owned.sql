-- ============================================================================
-- Vision guided-writing questions — user-owned model (migration 0050)
-- ============================================================================
-- The guided-writing ("כתיבה מודרכת") questions move to a FULL-CONTROL model:
-- each user gets their OWN copy of the default questions (seeded on first open
-- of the "השאלות שלי" sheet) and can freely edit / delete / add them. There is
-- no longer a "רק השאלות שלי" toggle — the user's list simply IS their list.
--
-- Two changes here:
--   1. Widen the scope CHECK on the question tables to allow 'daily' (the
--      "כתיבה יומית / Journaling" layer — see migration 0046 for vision_entries).
--      Without this, a user can't save a daily guided-writing question.
--   2. Add profiles.vision_questions_seeded — a one-shot flag marking that the
--      user's personal question list has been seeded from the defaults. Once
--      true, questionsForScope() draws ONLY from the user's own list, so an
--      admin editing the shared defaults no longer affects existing users
--      (it only changes the seed for NEW users).
--
-- Idempotent — safe to re-run. The inline CHECKs (migrations 0035 / 0038) are
-- auto-named <table>_scope_check by Postgres; we drop them (if present) and
-- re-add the widened version under the same canonical name.
-- ============================================================================

-- 1a. Admin catalog (vision_questions) — widen scope.
alter table public.vision_questions
  drop constraint if exists vision_questions_scope_check;
alter table public.vision_questions
  add constraint vision_questions_scope_check
  check (scope in ('yearly', 'monthly', 'weekly', 'daily'));

-- 1b. Per-user questions (vision_user_questions) — widen scope.
alter table public.vision_user_questions
  drop constraint if exists vision_user_questions_scope_check;
alter table public.vision_user_questions
  add constraint vision_user_questions_scope_check
  check (scope in ('yearly', 'monthly', 'weekly', 'daily'));

-- 2. One-shot "seeded from defaults" flag.
alter table public.profiles
  add column if not exists vision_questions_seeded boolean not null default false;
