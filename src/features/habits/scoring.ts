// ============================================================================
// Scoring engine — pure functions, no I/O.
// All thresholds live here so they can be tuned in one place.
// ============================================================================

import type { Habit, HabitLog, LogStatus, SlotAssignment } from './types';
import { toDateString } from './week';

export const POINTS_V = 5;
export const POINTS_X = -3;
export const AUTO_X_GRACE_DAYS = 2; // a blank day becomes auto_x once (today - D) >= 2

export type StreakThreshold = { days: number; bonus: number };
export const STREAK_THRESHOLDS: readonly StreakThreshold[] = [
  { days: 7, bonus: 20 },
  { days: 14, bonus: 40 },
  { days: 30, bonus: 100 },
] as const;

// "Effective" status — like LogStatus but also includes 'blank' (no entry yet).
export type EffectiveStatus = LogStatus | 'blank';

// ----------------------------------------------------------------------------
// Date helpers (pure)
// ----------------------------------------------------------------------------
function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateFromString(s: string): Date {
  // s is YYYY-MM-DD — construct local midnight.
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
}

// ----------------------------------------------------------------------------
// Resolve effective status for a single day, given the user's logs.
// Past blank days beyond grace become virtual auto_x.
// Today is never auto_x — user can still act on it.
// ----------------------------------------------------------------------------
export function effectiveStatus(
  date: Date,
  today: Date,
  logsByDate: Map<string, LogStatus>,
): EffectiveStatus {
  const key = toDateString(date);
  const explicit = logsByDate.get(key);
  if (explicit) return explicit;
  const diff = daysBetween(midnight(date), midnight(today));
  if (diff >= AUTO_X_GRACE_DAYS) return 'auto_x';
  return 'blank';
}

// ----------------------------------------------------------------------------
// Score a single status (no streak bonus — see scoreHabit for full).
// ----------------------------------------------------------------------------
export function pointsForStatus(s: EffectiveStatus): number {
  if (s === 'V') return POINTS_V;
  if (s === 'X' || s === 'auto_x') return POINTS_X;
  return 0; // blank
}

// ----------------------------------------------------------------------------
// Get the list of dates a habit was actively assigned, up to and including today.
// Multiple assignments may exist for the same habit if it was swapped in/out.
// Future days are excluded (no scoring for the future).
// ----------------------------------------------------------------------------
export function activeDatesForHabit(
  habitId: string,
  assignments: SlotAssignment[],
  today: Date,
): Date[] {
  const todayMid = midnight(today);
  const seen = new Set<string>();
  const out: Date[] = [];
  for (const a of assignments) {
    if (a.habit_id !== habitId) continue;
    const start = dateFromString(a.start_date);
    // end_date is exclusive in our model; if null, treat as "ongoing through today".
    const endExclusive = a.end_date ? dateFromString(a.end_date) : addDays(todayMid, 1);
    for (let d = start; d < endExclusive && d <= todayMid; d = addDays(d, 1)) {
      const key = toDateString(d);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(new Date(d));
    }
  }
  out.sort((a, b) => a.getTime() - b.getTime());
  return out;
}

// ----------------------------------------------------------------------------
// Score a habit: walk through its active dates in order, accumulating base
// points + streak bonuses. Streaks count consecutive Vs only; any non-V resets.
// Each streak threshold (7/14/30) is awarded at most once per habit lifetime.
// ----------------------------------------------------------------------------
export type HabitScoreResult = {
  habitId: string;
  basePoints: number;
  bonusPoints: number;
  totalPoints: number;
  // Map<dateStr, EffectiveStatus> for every date that either has a log or
  // falls inside an active assignment window. Logged dates win; assignment-
  // only dates can become auto_x after the grace period.
  effectiveByDate: Map<string, EffectiveStatus>;
  // Map<dateStr, number> — only populated for dates the user logged a
  // quantitative amount on. Used by the cell renderer in week / month views.
  amountByDate: Map<string, number>;
  // Bonus thresholds earned, with the date earned.
  bonusesEarned: { threshold: StreakThreshold; earnedOn: string }[];
  currentStreak: number;
  longestStreak: number;
  // Total V days for this habit over its lifetime.
  vCount: number;
};

export function scoreHabit(params: {
  habit: Habit;
  habitAssignments: SlotAssignment[]; // already filtered to this habit
  habitLogs: HabitLog[]; // already filtered to this habit
  today: Date;
}): HabitScoreResult {
  const { habit, habitAssignments, habitLogs, today } = params;

  const logsByDate = new Map<string, LogStatus>();
  const amountsByDate = new Map<string, number>();
  // For quantitative (counting) habits, a day only "completes" — i.e. counts
  // as a V and earns points — once the logged amount reaches the per-day
  // target. A partial count is recorded for display (amountsByDate) but is
  // NOT treated as a completed day: it scores nothing and, on past days, the
  // grace/auto_x logic lapses it like any unmet day.
  const quantTarget =
    habit.is_quantitative ? Math.max(1, habit.quantitative_target ?? 1) : 0;
  for (const log of habitLogs) {
    if (log.amount !== null && log.amount !== undefined) {
      amountsByDate.set(log.date, log.amount);
    }
    if (habit.is_quantitative && log.status === 'V') {
      if ((log.amount ?? 0) >= quantTarget) {
        logsByDate.set(log.date, 'V');
      }
      // partial → intentionally left unlogged (no logsByDate entry)
    } else {
      logsByDate.set(log.date, log.status);
    }
  }

  // Union of assignment-active dates AND any dates the user actually logged.
  // Logged dates may fall outside the active assignment window (the user can
  // now mark V on past weeks even if the habit was created later), and those
  // marks must still drive the visualization and score.
  const assignmentDates = activeDatesForHabit(habit.id, habitAssignments, today);
  const assignmentDateStrs = new Set(assignmentDates.map(toDateString));
  const allDateStrs = new Set<string>(assignmentDateStrs);
  for (const log of habitLogs) allDateStrs.add(log.date);
  const sortedDates = Array.from(allDateStrs).sort();

  let basePoints = 0;
  let bonusPoints = 0;
  let streak = 0;
  let longestStreak = 0;
  let vCount = 0;
  const remainingThresholds = STREAK_THRESHOLDS.map((t) => ({ ...t, earned: false }));
  const bonusesEarned: HabitScoreResult['bonusesEarned'] = [];
  const effectiveByDate = new Map<string, EffectiveStatus>();

  for (const dStr of sortedDates) {
    let s: EffectiveStatus;
    const explicit = logsByDate.get(dStr);
    if (explicit) {
      s = explicit;
    } else if (assignmentDateStrs.has(dStr)) {
      // Within assignment window, no log → may become auto_x after grace.
      const d = dateFromString(dStr);
      s = effectiveStatus(d, today, logsByDate);
    } else {
      // Outside both assignment and logs — shouldn't happen given our union.
      s = 'blank';
    }
    effectiveByDate.set(dStr, s);
    basePoints += pointsForStatus(s);

    if (s === 'V') {
      vCount += 1;
      streak += 1;
      if (streak > longestStreak) longestStreak = streak;
      for (const t of remainingThresholds) {
        if (!t.earned && streak === t.days) {
          t.earned = true;
          bonusPoints += t.bonus;
          bonusesEarned.push({
            threshold: { days: t.days, bonus: t.bonus },
            earnedOn: dStr,
          });
        }
      }
    } else if (s === 'X' || s === 'auto_x') {
      streak = 0;
    }
    // 'blank' (today/grace) — leave streak unchanged.
  }

  return {
    habitId: habit.id,
    basePoints,
    bonusPoints,
    totalPoints: basePoints + bonusPoints,
    effectiveByDate,
    amountByDate: amountsByDate,
    bonusesEarned,
    currentStreak: streak,
    longestStreak,
    vCount,
  };
}

// ----------------------------------------------------------------------------
// Aggregate stats across all of a user's habits.
// ----------------------------------------------------------------------------
export type UserStats = {
  totalScore: number;
  byHabit: Map<string, HabitScoreResult>;
};

export function computeUserStats(params: {
  habits: Habit[];
  assignments: SlotAssignment[];
  logs: HabitLog[];
  today: Date;
}): UserStats {
  const { habits, assignments, logs, today } = params;
  const byHabit = new Map<string, HabitScoreResult>();
  let totalScore = 0;
  for (const habit of habits) {
    const result = scoreHabit({
      habit,
      habitAssignments: assignments.filter((a) => a.habit_id === habit.id),
      habitLogs: logs.filter((l) => l.habit_id === habit.id),
      today,
    });
    byHabit.set(habit.id, result);
    totalScore += result.totalPoints;
  }
  return { totalScore, byHabit };
}

// ----------------------------------------------------------------------------
// Score for a specific habit *within* a given date range (e.g. one week).
// Includes base points for days in range + any bonus crossings whose earnedOn
// falls within the range.
// ----------------------------------------------------------------------------
export function scoreForRange(
  result: HabitScoreResult,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  const startStr = toDateString(rangeStart);
  const endStr = toDateString(rangeEnd);
  let points = 0;
  for (const [dateStr, status] of result.effectiveByDate) {
    if (dateStr >= startStr && dateStr <= endStr) {
      points += pointsForStatus(status);
    }
  }
  for (const earned of result.bonusesEarned) {
    if (earned.earnedOn >= startStr && earned.earnedOn <= endStr) {
      points += earned.threshold.bonus;
    }
  }
  return points;
}
