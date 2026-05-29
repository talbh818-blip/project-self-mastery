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
  const firstWeekStart = parsePeriodStart(
    'weekly',
    getPeriodKey('weekly', monthStart),
  );
  const targetStart = parsePeriodStart('weekly', weekKey);
  const diffWeeks = Math.round(
    (targetStart.getTime() - firstWeekStart.getTime()) /
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
    const weekStart = parsePeriodStart('weekly', key);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const monthStart = parsePeriodStart('monthly', parentKey);
    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
    );
    return weekEnd < monthStart || weekStart > monthEnd;
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
  return getPeriodKey('weekly', monthStart);
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
