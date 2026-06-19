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
// Week note: weeks run SUNDAY→Saturday (the Israeli week). A week is
// identified by the date of its Sunday ('YYYY-MM-DD'). A week BELONGS to every
// calendar month its 7-day span OVERLAPS — so a boundary week (e.g. 31.5–6.6)
// appears at the END of one month and the START of the next, and is shared
// between them. This means the current week is always "open" under the current
// month even before its Sunday rolls into that month.
// ============================================================================

export type VisionScope = 'yearly' | 'monthly' | 'weekly' | 'daily';

// ─── Building keys from a Date ──────────────────────────────────────────────

export function getYearKey(date: Date): string {
  return String(date.getFullYear());
}

export function getMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Week key = the date of the week's Sunday: 'YYYY-MM-DD' (e.g. "2026-06-07"). */
export function getWeekKey(date: Date): string {
  return isoDate(weekStart(date));
}

/** Day key = the calendar date: 'YYYY-MM-DD' (e.g. "2026-06-18"). Same SHAPE as
 *  a week key, but a (user, scope, period_key) row never collides because the
 *  scope differs — readers that key by period_key alone must filter by scope. */
export function getDayKey(date: Date): string {
  return isoDate(date);
}

export function getPeriodKey(scope: VisionScope, date: Date): string {
  switch (scope) {
    case 'yearly':
      return getYearKey(date);
    case 'monthly':
      return getMonthKey(date);
    case 'weekly':
      return getWeekKey(date);
    case 'daily':
      return getDayKey(date);
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
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
      // Defensive: a malformed / legacy week key (e.g. an old ISO "2026-W23")
      // must NEVER throw mid-render — that would blank the screen. Fall back
      // to the current week's Sunday and warn instead.
      if (!m) {
        console.warn(`[period] bad week key "${key}" — using current week`);
        return weekStart(new Date());
      }
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    case 'daily': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
      if (!m) {
        console.warn(`[period] bad day key "${key}" — using today`);
        const t = new Date();
        return new Date(t.getFullYear(), t.getMonth(), t.getDate());
      }
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
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
    case 'daily': {
      const next = new Date(start);
      next.setDate(next.getDate() + delta);
      return getDayKey(next);
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
  const start = parsePeriodStart(scope, key).getTime();
  if (scope === 'weekly') {
    // Weekly visions can be written a week ahead: the current week AND the NEXT
    // week are open; only weeks beyond next-week stay locked. (Daily / monthly /
    // yearly keep the strict "hasn't started yet" rule.)
    const nextWeekStart = weekStart(now);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    return start > nextWeekStart.getTime();
  }
  return start > now.getTime();
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

// Hebrew weekday names — getDay(): Sun=0 … Sat=6 (the Israeli week starts Sun).
const HEB_WEEKDAYS = [
  'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת',
];
const HEB_WEEKDAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

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
    case 'daily':
      return `יום ${HEB_WEEKDAYS[start.getDay()]} · ${start.getDate()} ${HEB_MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  }
}

// ─── Compact tab labels ─────────────────────────────────────────────────────
// Tab title is fixed per scope; the subtitle is short enough to fit beneath
// the title on a phone-width tab (≈110px).

export const SCOPE_TITLES: Record<VisionScope, string> = {
  yearly: 'חזון שנתי',
  monthly: 'חודשי',
  weekly: 'שבועי',
  daily: 'יומי',
};

/**
 * Subtitle for the per-scope tab.
 *
 * Rules per scope (concrete, not relative — the user explicitly preferred
 * a concrete reference over "שבוע שעבר" / "לפני חודשיים" phrasing):
 *   yearly   → just the year number, e.g. "2026". Past/future years use a
 *              relative phrase ("שנה שעברה", "לפני שנתיים", …) because the
 *              year IS the identifier and showing the same value as the
 *              title would be redundant.
 *   monthly  → the Hebrew month name ("מאי", "אפריל", …) regardless of
 *              past / current / future.
 *   weekly   → "שבוע N של [month]", where N is the week's position within
 *              the parent month. Requires `parentKey` (the monthly tab's
 *              current key); falls back to a date-range when missing.
 */
export function formatScopeSubtitle(
  scope: VisionScope,
  key: string,
  now: Date,
  parentKey: string | null = null,
): string {
  const start = parsePeriodStart(scope, key);

  if (scope === 'daily') {
    return `יום ${HEB_WEEKDAYS[start.getDay()]}`;
  }

  if (scope === 'monthly') {
    return HEB_MONTHS[start.getMonth()];
  }

  if (scope === 'weekly') {
    if (parentKey) {
      const n = weekOfMonth(key, parentKey);
      const monthName =
        HEB_MONTHS[parsePeriodStart('monthly', parentKey).getMonth()];
      return `שבוע ${n} של ${monthName}`;
    }
    // Defensive fallback — should be unreachable in practice because the
    // Vision screen always supplies the parent (monthly) key for weekly.
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    if (start.getMonth() === end.getMonth()) {
      return `${start.getDate()}–${end.getDate()} ${HEB_MONTHS_SHORT[start.getMonth()]}`;
    }
    return `${start.getDate()} ${HEB_MONTHS_SHORT[start.getMonth()]} – ${end.getDate()} ${HEB_MONTHS_SHORT[end.getMonth()]}`;
  }

  // scope === 'yearly'
  const todayKey = getPeriodKey('yearly', now);
  if (key === todayKey) return key;
  const diff = periodDiff('yearly', key, todayKey);
  if (diff === -1) return 'שנה שעברה';
  if (diff === 1) return 'שנה הבאה';
  if (diff === -2) return 'לפני שנתיים';
  if (diff === 2) return 'בעוד שנתיים';
  if (diff < 0) return `לפני ${-diff} שנים`;
  return `בעוד ${diff} שנים`;
}

/**
 * Concise label for the hierarchy breadcrumb ("2026 ‹ מאי ‹ שבוע 3"):
 *   yearly  → the year number ("2026")
 *   monthly → the Hebrew month name ("מאי")
 *   weekly  → "שבוע N" (no "של [month]" — the month crumb already shows it)
 */
export function formatScopeCrumb(
  scope: VisionScope,
  key: string,
  parentKey: string | null,
): string {
  if (scope === 'yearly') return key;
  if (scope === 'monthly') {
    return HEB_MONTHS[parsePeriodStart('monthly', key).getMonth()];
  }
  if (scope === 'daily') {
    const d = parsePeriodStart('daily', key);
    return `${HEB_WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
  }
  // weekly
  if (parentKey) return `שבוע ${weekOfMonth(key, parentKey)}`;
  return 'שבוע';
}

/**
 * Position of `weekKey` within the parent `monthKey`, 1-indexed.
 *
 * The first week is the one containing the 1st of the month (which may
 * actually start in the previous month — ISO weeks straddle month
 * boundaries). Subsequent weeks are sequential Mondays.
 *
 * Result is `Math.max(1, …)` as a defensive cap; in practice cascade
 * clamping ensures the supplied week is always within the month.
 */
function weekOfMonth(weekKey: string, monthKey: string): number {
  const monthStart = parsePeriodStart('monthly', monthKey);
  const firstSunday = firstWeekStartOfMonth(
    monthStart.getFullYear(),
    monthStart.getMonth(),
  );
  const targetSunday = parsePeriodStart('weekly', weekKey);
  const diffWeeks = Math.round(
    (targetSunday.getTime() - firstSunday.getTime()) /
      (1000 * 60 * 60 * 24 * 7),
  );
  return Math.max(1, diffWeeks + 1);
}

// ─── Hierarchical bounds (yearly → monthly → weekly) ────────────────────────
// The three scopes form a containment hierarchy: monthly tabs are scoped to
// the year shown on the yearly tab, and weekly tabs are scoped to the month
// shown on the monthly tab. The helpers below answer two questions:
//   • isOutsideParent — disable the chevron when the next/prev period would
//     leave the parent's bounds.
//   • clampToParent  — when the parent changes, snap the child back into
//     bounds. Monthly preserves its month-of-year (May 2026 → May 2025).
//     Weekly falls back to the week containing the 1st of the new month
//     when it would otherwise leave the month entirely.

/** True when `key` lies entirely outside the period currently shown by the
 *  given parent (yearly for monthly, monthly for weekly). */
export function isOutsideParent(
  scope: VisionScope,
  key: string,
  parentScope: VisionScope | null,
  parentKey: string | null,
): boolean {
  if (!parentScope || !parentKey) return false;
  if (scope === 'monthly' && parentScope === 'yearly') {
    return parsePeriodStart('monthly', key).getFullYear() !== Number(parentKey);
  }
  if (scope === 'weekly' && parentScope === 'monthly') {
    // A week belongs to EVERY month it overlaps (Sun..Sat range), so "outside"
    // means the week's 7-day span doesn't touch the month at all.
    const weekStartD = parsePeriodStart('weekly', key);
    const weekEnd = new Date(weekStartD);
    weekEnd.setDate(weekStartD.getDate() + 6);
    const monthStart = parsePeriodStart('monthly', parentKey);
    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
    );
    return weekEnd < monthStart || weekStartD > monthEnd;
  }
  if (scope === 'daily' && parentScope === 'weekly') {
    // A day is outside its parent week when it's not within [Sun … Sat].
    const day = parsePeriodStart('daily', key);
    const wkStart = parsePeriodStart('weekly', parentKey);
    const wkEnd = new Date(wkStart);
    wkEnd.setDate(wkStart.getDate() + 6);
    return day < wkStart || day > wkEnd;
  }
  return false;
}

/** Move a monthly key into the given year, preserving the month-of-year. */
export function clampMonthlyToYear(
  monthlyKey: string,
  yearKey: string,
): string {
  const start = parsePeriodStart('monthly', monthlyKey);
  if (String(start.getFullYear()) === yearKey) return monthlyKey;
  const next = new Date(Number(yearKey), start.getMonth(), 1);
  return getPeriodKey('monthly', next);
}

/** If the weekly key still touches the given month, keep it. Otherwise jump
 *  to the week containing the 1st of that month. */
export function clampWeeklyToMonth(
  weeklyKey: string,
  monthlyKey: string,
): string {
  if (!isOutsideParent('weekly', weeklyKey, 'monthly', monthlyKey)) {
    return weeklyKey;
  }
  const monthStart = parsePeriodStart('monthly', monthlyKey);
  const firstSunday = firstWeekStartOfMonth(
    monthStart.getFullYear(),
    monthStart.getMonth(),
  );
  return getWeekKey(firstSunday);
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
  if (scope === 'daily') {
    // round to nearest whole day to absorb any DST hour shift
    const ms = aDate.getTime() - bDate.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }
  // weekly — round to nearest whole week to absorb any DST hour shift
  const ms = aDate.getTime() - bDate.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24 * 7));
}

// ─── Sunday-week internals ───────────────────────────────────────────────────

/** Local-date 'YYYY-MM-DD'. */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The Sunday on or before `date` (local midnight). getDay(): Sun=0..Sat=6. */
function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/** Start (Sunday) of the first week that OVERLAPS the month — i.e. the week
 *  CONTAINING the 1st. It may begin in the previous month (that boundary week
 *  is shared between the two months). */
export function firstWeekStartOfMonth(year: number, month: number): Date {
  return weekStart(new Date(year, month, 1));
}

// ============================================================================
// Anchor-based navigation (single coherent position in the year→month→week
// pyramid). The Vision screen holds ONE anchor Date + a zoom level; every
// label and period key is derived from that anchor, so the breadcrumb is
// always internally consistent even when stepping crosses a month/year edge.
// ============================================================================

/** Move the anchor by `delta` units of the given level (years/months/weeks). */
export function addAnchor(
  level: VisionScope,
  anchor: Date,
  delta: number,
): Date {
  const d = new Date(anchor);
  if (level === 'yearly') d.setFullYear(d.getFullYear() + delta);
  else if (level === 'monthly') d.setMonth(d.getMonth() + delta);
  else if (level === 'daily') d.setDate(d.getDate() + delta);
  else d.setDate(d.getDate() + delta * 7);
  return d;
}

/** Hebrew month name for a date, e.g. "מאי". */
export function monthName(date: Date): string {
  return HEB_MONTHS[date.getMonth()];
}

/** Short Hebrew month name by 0-indexed month, e.g. monthShort(4) === "מאי". */
export function monthShort(monthIndex: number): string {
  return HEB_MONTHS_SHORT[monthIndex];
}

/** Short Hebrew weekday letter by getDay() index (Sun=0): "א׳"…"ש׳". */
export function weekdayShort(dayIndex: number): string {
  return HEB_WEEKDAYS_SHORT[dayIndex];
}

/** Full Hebrew weekday name by getDay() index (Sun=0): "ראשון"…"שבת". */
export function weekdayName(dayIndex: number): string {
  return HEB_WEEKDAYS[dayIndex];
}

/** 1-indexed position of the anchor's ISO week within the anchor's calendar
 *  month (week containing the 1st = week 1). */
export function weekOfMonthOf(anchor: Date): number {
  return weekOfMonth(getWeekKey(anchor), getMonthKey(anchor));
}

/** How many weeks OVERLAP the anchor's month — from the week containing the
 *  1st through the week containing the last day (4–6; boundary weeks shared). */
export function weeksInMonthOf(anchor: Date): number {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const monthEnd = new Date(year, month + 1, 0);
  let count = 0;
  const d = firstWeekStartOfMonth(year, month);
  while (d <= monthEnd) {
    count++;
    d.setDate(d.getDate() + 7);
  }
  return count;
}
