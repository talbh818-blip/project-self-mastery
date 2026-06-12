// ============================================================================
// Vision guided-writing ("כתיבה מודרכת") — question catalog.
// ----------------------------------------------------------------------------
// Per-scope prompts for guided journaling. Picked at random (without repeats
// within a single entry) by VisionEditor when the user taps "+ כתיבה מודרכת".
//
// The catalog lives in the `vision_questions` table (migration 0035) so the
// app owner can manage it from the admin panel. The hardcoded lists below are
// the FALLBACK used until the fetch resolves (or if it fails) — they mirror
// the migration's seed.
//
// Question IDs are stable strings so old entries that reference a question
// keep working even if the catalog evolves; the human text is also snapshot
// onto the node at insertion time so historical entries are self-contained.
// ============================================================================
import { supabase } from '../../lib/supabase';
import type { VisionScope } from './period';

export type VisionQuestion = {
  id: string;
  text: string;
};

/** Full DB row — used by the admin panel. */
export type VisionQuestionRow = VisionQuestion & {
  scope: VisionScope;
  sort_order: number;
};

const FALLBACK_YEARLY: VisionQuestion[] = [
  { id: 'y-vision', text: 'מה החזון שלי לשנה הזו? מה הכי חשוב לי להשיג עד סופה?' },
  { id: 'y-person', text: 'איזה בן אדם אני רוצה להיות בסוף השנה הזו, שלא הייתי בתחילתה?' },
  { id: 'y-habits', text: 'אילו 3 הרגלים אם אבנה השנה — ישנו את החיים שלי?' },
  { id: 'y-stop', text: 'מה אני צריך להפסיק לעשות השנה? מה גוזל לי אנרגיה, זמן או שקט נפשי?' },
  { id: 'y-values', text: 'מה הערכים שאני רוצה שיובילו את ההחלטות שלי השנה?' },
  { id: 'y-fear', text: 'מאיזה פחד אני רוצה להשתחרר השנה?' },
  { id: 'y-relationships', text: 'אילו קשרים אני רוצה לטפח השנה — ואילו לשחרר?' },
  { id: 'y-health', text: 'איך אני רוצה להרגיש בגוף שלי בסוף השנה?' },
  { id: 'y-money', text: 'מה היחס שלי לכסף השנה? מה הייתי רוצה שיהיה אחרת?' },
  { id: 'y-celebrate', text: 'מה ארצה לחגוג בסוף השנה? מה יגרום לי להרגיש שגאה בעצמי?' },
];

const FALLBACK_MONTHLY: VisionQuestion[] = [
  { id: 'm-focus', text: 'מה המיקוד המרכזי שלי לחודש הזה? אם אעשה רק דבר אחד — מה זה יהיה?' },
  { id: 'm-progress', text: 'איך החודש הזה מקדם אותי לעבר החזון השנתי שלי?' },
  { id: 'm-last', text: 'מה למדתי על עצמי בחודש שעבר שאני רוצה לקחת איתי החודש?' },
  { id: 'm-energy', text: 'מה ייתן לי השראה ואנרגיה החודש? איפה כדאי לי להשקיע בעצמי?' },
  { id: 'm-drainers', text: 'מה גוזל לי אנרגיה החודש שאני יכול לצמצם או להפסיק?' },
  { id: 'm-people', text: 'עם מי אני רוצה לבלות יותר זמן החודש? עם מי פחות?' },
  { id: 'm-challenge', text: 'איזה אתגר אני רוצה לקחת על עצמי החודש כדי לצאת מאזור הנוחות?' },
  { id: 'm-skill', text: 'מה אני רוצה ללמוד החודש — אפילו קצת?' },
  { id: 'm-self-care', text: 'איך אדאג לעצמי החודש — גוף, נפש, רוח?' },
  { id: 'm-month-end', text: 'כשהחודש יסתיים, מה ארצה להגיד על עצמי?' },
];

const FALLBACK_WEEKLY: VisionQuestion[] = [
  { id: 'w-week-focus', text: 'מה הדבר הכי חשוב שצריך לקרות השבוע?' },
  { id: 'w-last-week', text: 'מה עבד טוב בשבוע שעבר, ומה אני רוצה להמשיך?' },
  { id: 'w-last-fail', text: 'איפה נפלתי בשבוע שעבר, ומה אעשה אחרת השבוע?' },
  { id: 'w-priorities', text: 'מה 3 הדברים שאני חייב לסיים השבוע?' },
  { id: 'w-energy', text: 'איך אני מרגיש כרגע — בגוף ובראש? מה צריך השבוע כדי להרגיש טוב יותר?' },
  { id: 'w-people', text: 'עם מי אני רוצה לדבר השבוע, ומה אני רוצה להגיד?' },
  { id: 'w-time', text: 'איפה הזמן שלי הולך בלי שאני שם לב — ואיך אגן עליו השבוע?' },
  { id: 'w-self', text: 'מה אני יכול לעשות השבוע שירגיש לי כמו תשורה לעצמי?' },
  { id: 'w-fear', text: 'מה אני דוחה כי הוא לא נעים — ושצריך לקרות השבוע?' },
  { id: 'w-grateful', text: 'על מה אני אסיר תודה השבוע, גם אם זה דבר קטן?' },
];

const FALLBACKS: Record<VisionScope, VisionQuestion[]> = {
  yearly: FALLBACK_YEARLY,
  monthly: FALLBACK_MONTHLY,
  weekly: FALLBACK_WEEKLY,
};

// ─── Live catalog ────────────────────────────────────────────────────────────
// Starts as the fallback; replaced per-scope once the DB rows arrive. The
// pick functions stay synchronous (they run inside click handlers / Tiptap
// commands), so the editor kicks off the load on mount and by tap-time the
// catalog is fresh. A scope whose fetch comes back empty keeps its fallback —
// an admin emptying a scope by mistake shouldn't kill guided writing.
let catalog: Record<VisionScope, VisionQuestion[]> = { ...FALLBACKS };
let loadPromise: Promise<void> | null = null;

export function ensureQuestionsLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const { data, error } = await supabase
        .from('vision_questions')
        .select('id, scope, text, sort_order')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      const next: Record<VisionScope, VisionQuestion[]> = {
        yearly: [],
        monthly: [],
        weekly: [],
      };
      for (const row of (data ?? []) as VisionQuestionRow[]) {
        if (row.scope in next) next[row.scope].push({ id: row.id, text: row.text });
      }
      catalog = {
        yearly: next.yearly.length > 0 ? next.yearly : FALLBACKS.yearly,
        monthly: next.monthly.length > 0 ? next.monthly : FALLBACKS.monthly,
        weekly: next.weekly.length > 0 ? next.weekly : FALLBACKS.weekly,
      };
    })().catch((e) => {
      // Keep the fallback catalog; allow a later call to retry.
      console.error('[vision] failed to load question catalog', e);
      loadPromise = null;
    });
  }
  return loadPromise;
}

/** Drop the cached catalog so the next ensure() refetches (after admin edits). */
export function invalidateQuestionCache(): void {
  loadPromise = null;
}

export function questionsForScope(scope: VisionScope): VisionQuestion[] {
  return catalog[scope];
}

/**
 * Pick one question for the given scope that hasn't been used yet (avoid
 * repeats), preferring random order. If every catalog question is already
 * used, falls back to a fresh random pick (lets the user re-add questions
 * deliberately).
 */
export function pickQuestion(
  scope: VisionScope,
  usedIds: ReadonlySet<string>,
): VisionQuestion {
  const all = catalog[scope];
  const fresh = all.filter((q) => !usedIds.has(q.id));
  const pool = fresh.length > 0 ? fresh : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Admin CRUD ──────────────────────────────────────────────────────────────
// RLS (migration 0035) restricts writes to is_admin(); reads are open to any
// authenticated user. Mutations use `.select().maybeSingle()` so a silent RLS
// denial surfaces as data: null rather than a false success.

export async function fetchVisionQuestionsAdmin(): Promise<VisionQuestionRow[]> {
  const { data, error } = await supabase
    .from('vision_questions')
    .select('id, scope, text, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as VisionQuestionRow[];
}

export async function createVisionQuestion(
  scope: VisionScope,
  text: string,
  sortOrder: number,
): Promise<VisionQuestionRow> {
  const { data, error } = await supabase
    .from('vision_questions')
    .insert({ scope, text, sort_order: sortOrder })
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('ההוספה נדחתה (אין הרשאת אדמין?)');
  invalidateQuestionCache();
  return data as VisionQuestionRow;
}

export async function updateVisionQuestion(
  id: string,
  text: string,
): Promise<VisionQuestionRow> {
  const { data, error } = await supabase
    .from('vision_questions')
    .update({ text })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('העדכון נדחה (אין הרשאת אדמין?)');
  invalidateQuestionCache();
  return data as VisionQuestionRow;
}

export async function deleteVisionQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('vision_questions').delete().eq('id', id);
  if (error) throw error;
  invalidateQuestionCache();
}
