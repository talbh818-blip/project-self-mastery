-- ============================================================================
-- Vision guided-writing questions (migration 0035)
-- ============================================================================
-- The guided-writing ("כתיבה מודרכת") prompts used to live as a hardcoded
-- catalog in src/features/vision/questions.ts. The app owner wants to manage
-- them (add / edit / delete, per scope) from the admin panel, so they move
-- into a table.
--
-- Notes:
--   • id is TEXT (not uuid) so the seed can keep the legacy ids ('y-vision',
--     'w-last-week', …). Old entries snapshot both the id and the question
--     text onto the Tiptap node, so they keep rendering even if a question
--     is later edited or deleted — but keeping the ids stable preserves the
--     "no repeats within an entry" dedup across old and new questions.
--   • Read for any authenticated user (questions are app content, not user
--     data); insert / update / delete for admins only — same model as the
--     course catalog (migration 0016).
--
-- Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.vision_questions (
  id          text primary key default (gen_random_uuid()::text),
  scope       text not null check (scope in ('yearly', 'monthly', 'weekly')),
  text        text not null,
  -- Lower = earlier in the admin list. Has no effect on the random pick.
  sort_order  int  not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists vision_questions_scope_sort_idx
  on public.vision_questions (scope, sort_order, created_at);

alter table public.vision_questions enable row level security;

-- updated_at trigger -------------------------------------------------------
create or replace function public.touch_vision_question_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vision_questions_touch_updated_at on public.vision_questions;
create trigger vision_questions_touch_updated_at
  before update on public.vision_questions
  for each row
  execute function public.touch_vision_question_updated_at();

-- RLS ------------------------------------------------------------------------
drop policy if exists "vision questions read"          on public.vision_questions;
drop policy if exists "vision questions admin insert"  on public.vision_questions;
drop policy if exists "vision questions admin update"  on public.vision_questions;
drop policy if exists "vision questions admin delete"  on public.vision_questions;

create policy "vision questions read"
  on public.vision_questions for select
  to authenticated
  using (true);

create policy "vision questions admin insert"
  on public.vision_questions for insert
  to authenticated
  with check (public.is_admin());

create policy "vision questions admin update"
  on public.vision_questions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "vision questions admin delete"
  on public.vision_questions for delete
  to authenticated
  using (public.is_admin());

grant select, insert, update, delete on public.vision_questions to authenticated;

-- Seed — the catalog that shipped hardcoded in the app -----------------------
insert into public.vision_questions (id, scope, text, sort_order)
values
  -- yearly
  ('y-vision',        'yearly',  'מה החזון שלי לשנה הזו? מה הכי חשוב לי להשיג עד סופה?',                       10),
  ('y-person',        'yearly',  'איזה בן אדם אני רוצה להיות בסוף השנה הזו, שלא הייתי בתחילתה?',               20),
  ('y-habits',        'yearly',  'אילו 3 הרגלים אם אבנה השנה — ישנו את החיים שלי?',                             30),
  ('y-stop',          'yearly',  'מה אני צריך להפסיק לעשות השנה? מה גוזל לי אנרגיה, זמן או שקט נפשי?',         40),
  ('y-values',        'yearly',  'מה הערכים שאני רוצה שיובילו את ההחלטות שלי השנה?',                            50),
  ('y-fear',          'yearly',  'מאיזה פחד אני רוצה להשתחרר השנה?',                                             60),
  ('y-relationships', 'yearly',  'אילו קשרים אני רוצה לטפח השנה — ואילו לשחרר?',                                70),
  ('y-health',        'yearly',  'איך אני רוצה להרגיש בגוף שלי בסוף השנה?',                                      80),
  ('y-money',         'yearly',  'מה היחס שלי לכסף השנה? מה הייתי רוצה שיהיה אחרת?',                            90),
  ('y-celebrate',     'yearly',  'מה ארצה לחגוג בסוף השנה? מה יגרום לי להרגיש שגאה בעצמי?',                    100),
  -- monthly
  ('m-focus',         'monthly', 'מה המיקוד המרכזי שלי לחודש הזה? אם אעשה רק דבר אחד — מה זה יהיה?',           10),
  ('m-progress',      'monthly', 'איך החודש הזה מקדם אותי לעבר החזון השנתי שלי?',                               20),
  ('m-last',          'monthly', 'מה למדתי על עצמי בחודש שעבר שאני רוצה לקחת איתי החודש?',                     30),
  ('m-energy',        'monthly', 'מה ייתן לי השראה ואנרגיה החודש? איפה כדאי לי להשקיע בעצמי?',                 40),
  ('m-drainers',      'monthly', 'מה גוזל לי אנרגיה החודש שאני יכול לצמצם או להפסיק?',                          50),
  ('m-people',        'monthly', 'עם מי אני רוצה לבלות יותר זמן החודש? עם מי פחות?',                            60),
  ('m-challenge',     'monthly', 'איזה אתגר אני רוצה לקחת על עצמי החודש כדי לצאת מאזור הנוחות?',               70),
  ('m-skill',         'monthly', 'מה אני רוצה ללמוד החודש — אפילו קצת?',                                         80),
  ('m-self-care',     'monthly', 'איך אדאג לעצמי החודש — גוף, נפש, רוח?',                                        90),
  ('m-month-end',     'monthly', 'כשהחודש יסתיים, מה ארצה להגיד על עצמי?',                                      100),
  -- weekly
  ('w-week-focus',    'weekly',  'מה הדבר הכי חשוב שצריך לקרות השבוע?',                                          10),
  ('w-last-week',     'weekly',  'מה עבד טוב בשבוע שעבר, ומה אני רוצה להמשיך?',                                 20),
  ('w-last-fail',     'weekly',  'איפה נפלתי בשבוע שעבר, ומה אעשה אחרת השבוע?',                                 30),
  ('w-priorities',    'weekly',  'מה 3 הדברים שאני חייב לסיים השבוע?',                                           40),
  ('w-energy',        'weekly',  'איך אני מרגיש כרגע — בגוף ובראש? מה צריך השבוע כדי להרגיש טוב יותר?',        50),
  ('w-people',        'weekly',  'עם מי אני רוצה לדבר השבוע, ומה אני רוצה להגיד?',                              60),
  ('w-time',          'weekly',  'איפה הזמן שלי הולך בלי שאני שם לב — ואיך אגן עליו השבוע?',                   70),
  ('w-self',          'weekly',  'מה אני יכול לעשות השבוע שירגיש לי כמו תשורה לעצמי?',                          80),
  ('w-fear',          'weekly',  'מה אני דוחה כי הוא לא נעים — ושצריך לקרות השבוע?',                            90),
  ('w-grateful',      'weekly',  'על מה אני אסיר תודה השבוע, גם אם זה דבר קטן?',                                100)
on conflict (id) do nothing;
