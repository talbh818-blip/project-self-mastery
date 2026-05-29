// ============================================================================
// Vision Assist — static question catalog.
// ----------------------------------------------------------------------------
// Per-scope prompts for guided journaling. Picked at random (without repeats
// within a single entry) by VisionEditor when the user clicks "+ שאלה" or
// when Assist mode first activates on an empty entry.
//
// Question IDs are stable strings so old entries that reference a question
// keep working even if the catalog evolves; the human text is also snapshot
// onto the node at insertion time so historical entries are self-contained.
// ============================================================================
import type { VisionScope } from './period';

export type VisionQuestion = {
  id: string;
  text: string;
};

const YEARLY: VisionQuestion[] = [
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

const MONTHLY: VisionQuestion[] = [
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

const WEEKLY: VisionQuestion[] = [
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

const BY_SCOPE: Record<VisionScope, VisionQuestion[]> = {
  yearly: YEARLY,
  monthly: MONTHLY,
  weekly: WEEKLY,
};

export function questionsForScope(scope: VisionScope): VisionQuestion[] {
  return BY_SCOPE[scope];
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
  const all = BY_SCOPE[scope];
  const fresh = all.filter((q) => !usedIds.has(q.id));
  const pool = fresh.length > 0 ? fresh : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** How many starter questions to auto-inject when Assist first turns on. */
export const STARTER_QUESTION_COUNT = 3;
