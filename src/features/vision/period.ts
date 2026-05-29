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
