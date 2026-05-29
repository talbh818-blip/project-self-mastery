// ============================================================================
// Period keys for vision entries.
// ----------------------------------------------------------------------------
// Each vision entry is identified by (scope, period_key). This module is the
// single source of truth for:
//   • canonical key shape per scope (yearly = "YYYY", monthly = "YYYY-MM",
//     weekly = "YYYY-Www" using ISO week numbering)
//   • parsing keys back into Date anchors (start of period, in local time)
//   • walking forward/backward between periods
//   • the future-guard (can the user write to this period yet?)
//   • Hebrew display labels
//
// ISO week note: ISO 8601 weeks start on Monday, and the year a week belongs
// to is the year containing that week's Thursday. So '2026-W01' may begin in
// late Dec 2025. We follow ISO consistently so week keys never collide.
// ============================================================================

export type VisionScope = 'yearly' | 'monthly' | 'weekly';

// ─── Building keys from a Date ──────────────────────────────────────────────

export function getYearKey(date: Date): string {
  return String(date.getFullYear());
}

export function getMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** ISO-week key: YYYY-Www (e.g. "2026-W22"). */
export function getWeekKey(date: Date): string {
  const { year, week } = isoWeekParts(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function getPeriodKey(scope: VisionScope, date: Date): string {
  switch (scope) {
    case 'yearly':
      return getYearKey(date);
    case 'monthly':
      return getMonthKey(date);
    case 'weekly':
      return getWeekKey(date);
  }
}

// ─── Parsing keys to a Date (start of period, local time) ───────────────────

export function parsePeriodStart(scope: VisionScope, key: string): Date {
  switch (scope) {
    case 'yearly': {
      const y = Number(key);
      return new Date(y, 0, 1);
    }
    case 'monthly': {
      const [ys, ms] = key.split('-');
      return new Date(Number(ys), Number(ms) - 1, 1);
    }
    case 'weekly': {
      const m = /^(\d{4})-W(\d{2})$/.exec(key);
      if (!m) throw new Error(`Invalid week key: ${key}`);
      return isoWeekStart(Number(m[1]), Number(m[2]));
    }
  }
}

// ─── Walking ────────────────────────────────────────────────────────────────

export function addPeriod(
  scope: VisionScope,
  key: string,
  delta: number,
): string {
  const start = parsePeriodStart(scope, key);
  switch (scope) {
    case 'yearly':
      return getYearKey(new Date(start.getFullYear() + delta, 0, 1));
    case 'monthly':
      return getMonthKey(
        new Date(start.getFullYear(), start.getMonth() + delta, 1),
      );
    case 'weekly': {
      const next = new Date(start);
      next.setDate(next.getDate() + delta * 7);
      return getWeekKey(next);
    }
  }
}

// ─── Future-guard ───────────────────────────────────────────────────────────
// A period is "writable" once it has started (now >= period start).
// Future periods are read-only / locked.

export function isFuturePeriod(
  scope: VisionScope,
  key: string,
  now: Date = new Date(),
): boolean {
  return parsePeriodStart(scope, key).getTime() > now.getTime();
}

// ─── Hebrew display labels ──────────────────────────────────────────────────

const HEB_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

const HEB_MONTHS_SHORT = [
  'ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני',
  'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳',
];

export function formatPeriodLabel(scope: VisionScope, key: string): string {
  const start = parsePeriodStart(scope, key);
  switch (scope) {
    case 'yearly':
      return `שנת ${key}`;
    case 'monthly':
      return `${HEB_MONTHS[start.getMonth()]} ${start.getFullYear()}`;
    case 'weekly': {
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const sameMonth = start.getMonth() === end.getMonth();
      const startStr = `${start.getDate()} ${HEB_MONTHS[start.getMonth()]}`;
      const endStr = sameMonth
        ? `${end.getDate()} ${HEB_MONTHS[end.getMonth()]}`
        : `${end.getDate()} ${HEB_MONTHS[end.getMonth()]}`;
      return `${startStr} – ${endStr} ${end.getFullYear()}`;
    }
  }
}

// ─── Compact tab labels ─────────────────────────────────────────────────────
// Tab title is fixed per scope; the subtitle is short enough to fit beneath
// the title on a phone-width tab (≈110px).

export const SCOPE_TITLES: Record<VisionScope, string> = {
  yearly: 'חזון שנתי',
  monthly: 'חודשי',
  weekly: 'שבועי',
};

/**
 * Subtitle for the per-scope tab. Current period shows a concrete identifier
 * (year / month name / day range); past periods use a relative phrase
 * ("שנה שעברה", "לפני שנתיים", "שבוע שעבר", "לפני שבועיים", …).
 */
export function formatScopeSubtitle(
  scope: VisionScope,
  key: string,
  now: Date,
): string {
  const todayKey = getPeriodKey(scope, now);
  if (key === todayKey) {
    // CURRENT period — concrete label
    const start = parsePeriodStart(scope, key);
    if (scope === 'yearly') return `שנת ${key}`;
    if (scope === 'monthly') return HEB_MONTHS[start.getMonth()];
    // weekly → day-range "25–31 מאי" (or "30 אפר׳ – 6 מאי" across month boundary)
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    if (start.getMonth() === end.getMonth()) {
      return `${start.getDate()}–${end.getDate()} ${HEB_MONTHS_SHORT[start.getMonth()]}`;
    }
    return `${start.getDate()} ${HEB_MONTHS_SHORT[start.getMonth()]} – ${end.getDate()} ${HEB_MONTHS_SHORT[end.getMonth()]}`;
  }

  // PAST or FUTURE — relative phrase. Diff is computed in the scope's units.
  const diff = periodDiff(scope, key, todayKey);

  if (scope === 'yearly') {
    if (diff === -1) return 'שנה שעברה';
    if (diff === 1) return 'שנה הבאה';
    if (diff === -2) return 'לפני שנתיים';
    if (diff === 2) return 'בעוד שנתיים';
    if (diff < 0) return `לפני ${-diff} שנים`;
    return `בעוד ${diff} שנים`;
  }

  if (scope === 'monthly') {
    if (diff === -1) return 'חודש שעבר';
    if (diff === 1) return 'חודש הבא';
    if (diff === -2) return 'לפני חודשיים';
    if (diff === 2) return 'בעוד חודשיים';
    if (diff < 0) return `לפני ${-diff} חודשים`;
    return `בעוד ${diff} חודשים`;
  }

  // weekly
  if (diff === -1) return 'שבוע שעבר';
  if (diff === 1) return 'שבוע הבא';
  if (diff === -2) return 'לפני שבועיים';
  if (diff === 2) return 'בעוד שבועיים';
  if (diff < 0) return `לפני ${-diff} שבועות`;
  return `בעוד ${diff} שבועות`;
}

/**
 * Signed difference in scope-units between two period keys (a - b).
 *   yearly:  years
 *   monthly: months
 *   weekly:  weeks (computed from start-of-week timestamps)
 */
function periodDiff(scope: VisionScope, a: string, b: string): number {
  const aDate = parsePeriodStart(scope, a);
  const bDate = parsePeriodStart(scope, b);
  if (scope === 'yearly') {
    return aDate.getFullYear() - bDate.getFullYear();
  }
  if (scope === 'monthly') {
    return (
      (aDate.getFullYear() - bDate.getFullYear()) * 12 +
      (aDate.getMonth() - bDate.getMonth())
    );
  }
  // weekly — round to nearest whole week to absorb any DST hour shift
  const ms = aDate.getTime() - bDate.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24 * 7));
}

// ─── ISO-week internals ─────────────────────────────────────────────────────

function isoWeekParts(date: Date): { year: number; week: number } {
  // Copy to UTC midnight to avoid DST drift.
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  // ISO weekday: Mon=1..Sun=7. JS getUTCDay: Sun=0..Sat=6.
  const dayNum = d.getUTCDay() || 7;
  // Thursday of the current ISO week determines the week-year.
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const year = d.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week =
    Math.floor((d.getTime() - jan1.getTime()) / 86400000 / 7) + 1;
  return { year, week };
}

/** Returns the local-time Date for Monday of the given ISO week. */
function isoWeekStart(weekYear: number, week: number): Date {
  // Thursday of week 1 of weekYear is always between Jan 1 and Jan 7.
  const jan4 = new Date(weekYear, 0, 4);
  const jan4Dow = jan4.getDay() || 7; // ISO weekday
  // Monday of week 1
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - (jan4Dow - 1));
  // Monday of target week
  const target = new Date(week1Monday);
  target.setDate(week1Monday.getDate() + (week - 1) * 7);
  return target;
}
