// ============================================================================
// Scoring engine V2 — the "monthly pie" system. Pure functions, no I/O.
// ============================================================================
// Lives ALONGSIDE scoring.ts (v1):
//   * v1 keeps scoring every day BEFORE the epoch (frozen rules, frozen
//     "today"), and still drives all cell visuals + streak display.
//   * v2 scores every day FROM the epoch onward.
//   * Displayed score = frozen-v1 + v2 (+ admin score_adjustment, added by
//     callers exactly as before).
//
// The system, in one breath:
//   Every calendar month a user has a "pie" of up to PIE (3,000) points,
//   which buys up to 10 trees (TREE_PRICES, sum = 3,000). How much of the
//   pie is reachable depends on how many habits are active that day:
//   1 habit → 30%, 2 → 60%, 3+ → 100% (split equally among the habits).
//   90% of the pie is earned by marking habits; 10% is reserved for streak
//   bonuses, so a perfect month (every mark + unbroken streak) = exactly
//   the full pie.
//
//   Each habit-day has a base value:
//     dayValue = PIE × BASE_FACTOR × multiplier(count) / (count × daysInMonth)
//   For a daily habit that's the worth of the day; the day's marks split it
//   by SLOT WEIGHTS (the closing mark is worth the most). For weekly/monthly
//   habits the period's days pool together and the quota marks split the
//   pool the same way — the days NOT marked cost nothing while the period
//   is open.
//
//   Marking late decays the mark: same day 100%, next day 50%, 2-3 days
//   late 20%, from the 4th day the date is LOCKED (cannot be marked).
//   Earnings are SNAPSHOTTED at tap time into habit_logs.earned_points, so
//   nothing about a mark's value ever changes retroactively.
//
//   When a period locks (its last day is LOCK_AFTER_DAYS old), every
//   unfilled quota slot costs MISS_PENALTY (70%) of that slot's value.
//
//   Streak bonuses (daily-frequency habits only), per calendar month:
//   a completed-days run of ≥7 → slice/45, ≥14 → slice/30, and completing
//   every available day of the month → slice/18 (together exactly 1/9 of
//   the habit's monthly base slice → the reserved 10% of the pie).
//
// KEEP IN SYNC with the SQL port in supabase/migrations/0036 (engine v2
// functions) — both must produce identical numbers.
// ============================================================================

import type { Habit, HabitLog, SlotAssignment } from './types';
import {
  computeUserStats as computeUserStatsV1,
  type UserStats as UserStatsV1,
} from './scoring';
import { toDateString } from './week';

// ----------------------------------------------------------------------------
// Constants — the whole economy is tuned here.
// ----------------------------------------------------------------------------

/** First day scored by V2. Everything before is frozen V1 territory. */
export const SCORING_V2_EPOCH = '2026-06-13';

/** Full monthly pie at 100% potential = 10 trees. */
export const MONTHLY_PIE = 3000;

/** Share of the pie earned by marks; the rest (10%) is the streak-bonus
 *  reserve, so marks + full streaks = exactly the full pie. */
export const BASE_FACTOR = 0.9;

/** Habit-count → share of the pie that is reachable. */
export function potentialMultiplier(activeHabitCount: number): number {
  if (activeHabitCount <= 0) return 0;
  if (activeHabitCount === 1) return 0.3;
  if (activeHabitCount === 2) return 0.6;
  return 1.0;
}

/** Price of the Nth tree planted within a calendar month (0-based).
 *  Sum = 3,000 = the full pie. Resets every month; max 10 trees/month. */
export const TREE_PRICES = [200, 300, 250, 400, 350, 450, 300, 250, 200, 300] as const;
export const MAX_TREES_PER_MONTH = TREE_PRICES.length;

/** Marking-delay decay: index = whole days between the marked date and the
 *  day the tap happens. 0 = same day. From LOCK_AFTER_DAYS on, the date is
 *  locked and cannot be marked at all. */
export const DECAY_BY_DELAY = [1.0, 0.5, 0.2, 0.2] as const;
export const LOCK_AFTER_DAYS = 4; // date is locked when (today - date) >= 4

/** Penalty per unfilled quota slot once a period locks: 70% of the slot. */
export const MISS_PENALTY = 0.7;

/** Streak-bonus sizes as fractions of the habit's monthly base slice.
 *  1/45 + 1/30 + 1/18 = 1/9 of the base = exactly the reserved 10% of the
 *  pie, so a perfect month lands on the full pie to the point. */
export const BONUS_RUN_7 = 1 / 45;
export const BONUS_RUN_14 = 1 / 30;
export const BONUS_FULL_MONTH = 1 / 18;

// ----------------------------------------------------------------------------
// Date helpers (pure, string-based — calendar-local like week.ts)
// ----------------------------------------------------------------------------

function dateFromString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDaysStr(s: string, n: number): string {
  const d = dateFromString(s);
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

/** Whole days from `a` to `b` (positive when b is after a). */
export function daysBetweenStr(a: string, b: string): number {
  const ms = dateFromString(b).getTime() - dateFromString(a).getTime();
  return Math.round(ms / 86400000);
}

function daysInMonthOf(dateStr: string): number {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

function monthStartOf(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

function monthEndOf(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  return toDateString(new Date(y, m, 0));
}

/** Sunday that opens the week containing dateStr (the Israeli week). */
function weekStartOf(dateStr: string): string {
  const d = dateFromString(dateStr);
  d.setDate(d.getDate() - d.getDay());
  return toDateString(d);
}

export function isV2Date(dateStr: string): boolean {
  return dateStr >= SCORING_V2_EPOCH;
}

/** A V2-era date can no longer be marked once it's LOCK_AFTER_DAYS old.
 *  Pre-epoch dates stay markable under the old (v1) rules. */
export function isDateLockedV2(dateStr: string, today: Date): boolean {
  if (!isV2Date(dateStr)) return false;
  return daysBetweenStr(dateStr, toDateString(today)) >= LOCK_AFTER_DAYS;
}

/** Decay factor for marking `dateStr` on `today`. 0 = locked / too late. */
export function decayFactor(dateStr: string, today: Date): number {
  const delay = daysBetweenStr(dateStr, toDateString(today));
  if (delay <= 0) return 1.0; // same day (or an early mark on tomorrow)
  return DECAY_BY_DELAY[delay] ?? 0;
}

// ----------------------------------------------------------------------------
// Slot weights — how a period's value splits between its quota marks.
// The CLOSING mark is always worth the most, but its premium SHRINKS as the
// target grows (60% of a 2-target is sane; 60% of a 10-target is not):
//   target 2 → 60%, targets 3-5 → 40%, then −4% per extra slot down to a
//   20% floor at target 10+. The earlier marks split the remainder equally.
// ----------------------------------------------------------------------------
export function closerWeight(quota: number): number {
  const n = Math.max(1, Math.floor(quota));
  if (n <= 1) return 1;
  if (n === 2) return 0.6;
  if (n <= 5) return 0.4;
  return Math.max(0.2, 0.4 - 0.04 * (n - 5));
}

export function slotWeights(quota: number): number[] {
  const n = Math.max(1, Math.floor(quota));
  if (n === 1) return [1];
  const closer = closerWeight(n);
  const early = (1 - closer) / (n - 1);
  const w = new Array<number>(n).fill(early);
  w[n - 1] = closer;
  return w;
}

// ----------------------------------------------------------------------------
// Active-habit count per day — drives the pie split. Counted from assignment
// coverage (start_date inclusive, end_date exclusive), which is historical
// and immutable, so past day values are reproducible forever.
// ----------------------------------------------------------------------------
export function activeHabitCountOn(
  dateStr: string,
  assignments: SlotAssignment[],
): number {
  const seen = new Set<string>();
  for (const a of assignments) {
    if (a.start_date <= dateStr && (a.end_date === null || dateStr < a.end_date)) {
      seen.add(a.habit_id);
    }
  }
  return seen.size;
}

/** Is THIS habit active (assigned to a slot) on the given day? */
function habitActiveOn(
  habitId: string,
  dateStr: string,
  assignments: SlotAssignment[],
): boolean {
  for (const a of assignments) {
    if (
      a.habit_id === habitId &&
      a.start_date <= dateStr &&
      (a.end_date === null || dateStr < a.end_date)
    ) {
      return true;
    }
  }
  return false;
}

/** Base value of ONE habit's single day. 0 when no habit is active. */
export function habitDayValue(
  dateStr: string,
  assignments: SlotAssignment[],
): number {
  const count = activeHabitCountOn(dateStr, assignments);
  if (count === 0) return 0;
  return (
    (MONTHLY_PIE * BASE_FACTOR * potentialMultiplier(count)) /
    (count * daysInMonthOf(dateStr))
  );
}

// ----------------------------------------------------------------------------
// Periods — a habit's scoring unit. Daily habits: one date. Weekly habits:
// Sunday..Saturday. Monthly habits: the calendar month.
// ----------------------------------------------------------------------------
export type PeriodKind = 'daily' | 'weekly' | 'monthly';

export type Period = {
  kind: PeriodKind;
  start: string; // first date of the period
  end: string;   // last date of the period (inclusive)
  quota: number; // marks needed to fill the period
};

export function periodOf(habit: Habit, dateStr: string): Period {
  if (habit.frequency_period === 'weekly') {
    const start = weekStartOf(dateStr);
    return {
      kind: 'weekly',
      start,
      end: addDaysStr(start, 6),
      quota: Math.max(1, habit.frequency_target),
    };
  }
  if (habit.frequency_period === 'monthly') {
    return {
      kind: 'monthly',
      start: monthStartOf(dateStr),
      end: monthEndOf(dateStr),
      quota: Math.max(1, habit.frequency_target),
    };
  }
  return {
    kind: 'daily',
    start: dateStr,
    end: dateStr,
    quota: habit.is_quantitative ? Math.max(1, habit.quantitative_target ?? 1) : 1,
  };
}

/** The pooled value of a period for this habit = the sum of the habit's
 *  day-values over the period's days that are (a) in the V2 era and (b)
 *  days the habit was actually assigned. For a daily habit this is just
 *  the single day's value. */
export function periodValue(
  habit: Habit,
  period: Period,
  assignments: SlotAssignment[],
): number {
  let total = 0;
  for (let d = period.start; d <= period.end; d = addDaysStr(d, 1)) {
    if (!isV2Date(d)) continue;
    if (!habitActiveOn(habit.id, d, assignments)) continue;
    total += habitDayValue(d, assignments);
  }
  return total;
}

/** A period "locks" — and gets settled with penalties — once its last day
 *  is LOCK_AFTER_DAYS old (no further marking is possible inside it). */
export function periodLocked(period: Period, today: Date): boolean {
  return daysBetweenStr(period.end, toDateString(today)) >= LOCK_AFTER_DAYS;
}

// ----------------------------------------------------------------------------
// How many quota slots are already filled in a period, given the habit's
// logs. Daily counters fill `amount` slots on their single day; weekly and
// monthly habits fill one slot per V-marked day in the period.
// Marks made on PRE-epoch days of a straddling period still count toward
// the quota (so nobody is penalized over the cutover week), they just don't
// earn v2 points.
// ----------------------------------------------------------------------------
export function filledSlots(
  habit: Habit,
  period: Period,
  habitLogs: HabitLog[],
): number {
  if (period.kind === 'daily') {
    const log = habitLogs.find((l) => l.date === period.start && l.status === 'V');
    if (!log) return 0;
    if (habit.is_quantitative) return Math.min(period.quota, log.amount ?? 1);
    return 1;
  }
  let n = 0;
  for (const l of habitLogs) {
    if (l.status === 'V' && l.date >= period.start && l.date <= period.end) n++;
  }
  return Math.min(period.quota, n);
}

// ----------------------------------------------------------------------------
// Points earned by ONE tap, snapshotted at tap time → habit_logs.earned_points.
// `prevFilled` = quota slots already filled in the period before this tap.
// ----------------------------------------------------------------------------
export function tapEarnedPoints(params: {
  habit: Habit;
  dateStr: string; // the cell being marked
  prevFilled: number;
  assignments: SlotAssignment[];
  today: Date;
}): number {
  const { habit, dateStr, prevFilled, assignments, today } = params;
  if (!isV2Date(dateStr)) return 0; // v1 territory — old rules, no snapshot
  const period = periodOf(habit, dateStr);
  const weights = slotWeights(period.quota);
  if (prevFilled >= period.quota) return 0; // beyond quota — no extra points
  const value = periodValue(habit, period, assignments);
  return value * weights[prevFilled] * decayFactor(dateStr, today);
}

// ----------------------------------------------------------------------------
// Full V2 score for one habit: earned (from snapshots) − settlement
// penalties + streak bonuses.
// ----------------------------------------------------------------------------
export type HabitScoreV2 = {
  habitId: string;
  earned: number;    // Σ earned_points snapshots
  penalties: number; // ≥ 0, subtracted
  bonuses: number;   // ≥ 0, added
  total: number;     // earned − penalties + bonuses
};

export function scoreHabitV2(params: {
  habit: Habit;
  habitAssignments: SlotAssignment[]; // this habit's assignments only
  allAssignments: SlotAssignment[];   // ALL the user's assignments (for counts)
  habitLogs: HabitLog[];              // this habit's logs only
  today: Date;
}): HabitScoreV2 {
  const { habit, habitAssignments, allAssignments, habitLogs, today } = params;
  const todayStr = toDateString(today);

  // ---- earned: sum of tap-time snapshots on v2-era logs --------------------
  let earned = 0;
  for (const l of habitLogs) {
    if (l.date >= SCORING_V2_EPOCH && l.earned_points != null) {
      earned += l.earned_points;
    }
  }

  // ---- walk the habit's v2-era ACTIVE days, grouped into periods -----------
  // A day belongs to scoring when the habit was assigned on it. Periods are
  // derived from those days; each period is settled once it locks.
  const activeDays: string[] = [];
  for (const a of habitAssignments) {
    const from = a.start_date > SCORING_V2_EPOCH ? a.start_date : SCORING_V2_EPOCH;
    const toExcl = a.end_date === null || a.end_date > todayStr
      ? addDaysStr(todayStr, 1)
      : a.end_date;
    for (let d = from; d < toExcl; d = addDaysStr(d, 1)) activeDays.push(d);
  }
  const activeDaySet = new Set(activeDays);

  // Collect distinct periods that contain at least one active day.
  const periodsByKey = new Map<string, Period>();
  for (const d of activeDaySet) {
    const p = periodOf(habit, d);
    periodsByKey.set(p.start, p);
  }

  // ---- penalties: settle every locked period -------------------------------
  let penalties = 0;
  for (const p of periodsByKey.values()) {
    if (!periodLocked(p, today)) continue;
    const filled = filledSlots(habit, p, habitLogs);
    if (filled >= p.quota) continue;
    const value = periodValue(habit, p, allAssignments);
    const weights = slotWeights(p.quota);
    let missedWeight = 0;
    for (let i = filled; i < p.quota; i++) missedWeight += weights[i];
    penalties += MISS_PENALTY * value * missedWeight;
  }

  // ---- streak bonuses (daily-frequency habits only) ------------------------
  let bonuses = 0;
  if (habit.frequency_period === 'daily') {
    // Group the habit's active v2 days (up to today) by calendar month.
    const byMonth = new Map<string, string[]>();
    for (const d of Array.from(activeDaySet).sort()) {
      const k = monthKeyOf(d);
      const arr = byMonth.get(k) ?? [];
      arr.push(d);
      byMonth.set(k, arr);
    }
    const completed = (d: string): boolean => {
      const log = habitLogs.find((l) => l.date === d && l.status === 'V');
      if (!log) return false;
      if (!habit.is_quantitative) return true;
      const target = Math.max(1, log.target_at_log ?? habit.quantitative_target ?? 1);
      return log.amount == null || log.amount >= target;
    };
    for (const [monthKey, days] of byMonth) {
      // The habit's base slice of this month (its pooled day values).
      let slice = 0;
      for (const d of days) slice += habitDayValue(d, allAssignments);
      if (slice <= 0) continue;
      // Longest run of consecutive completed calendar days within the month.
      let run = 0;
      let maxRun = 0;
      let prev: string | null = null;
      let allDone = days.length > 0;
      for (const d of days) {
        const done = completed(d);
        if (!done) {
          // Today (and days still inside the marking window) shouldn't kill
          // the "perfect month" flag prematurely — only LOCKED unmet days do.
          if (daysBetweenStr(d, todayStr) >= LOCK_AFTER_DAYS) allDone = false;
          run = 0;
          prev = d;
          continue;
        }
        run = prev !== null && daysBetweenStr(prev, d) === 1 ? run + 1 : 1;
        if (run > maxRun) maxRun = run;
        prev = d;
      }
      if (maxRun >= 7) bonuses += slice * BONUS_RUN_7;
      if (maxRun >= 14) bonuses += slice * BONUS_RUN_14;
      // Full-month bonus: every active day of the month completed, and the
      // month is fully behind us (its last day has locked).
      const monthOver =
        daysBetweenStr(monthEndOf(`${monthKey}-01`), todayStr) >= LOCK_AFTER_DAYS;
      const coversWholeMonth = days.length > 0 && allDone && monthOver;
      if (coversWholeMonth && maxRun >= days.length) {
        bonuses += slice * BONUS_FULL_MONTH;
      }
    }
  }

  return {
    habitId: habit.id,
    earned,
    penalties,
    bonuses,
    total: earned - penalties + bonuses,
  };
}

// ----------------------------------------------------------------------------
// Aggregate V2 stats + the combined (frozen v1 + v2) score.
// ----------------------------------------------------------------------------
export type UserStatsV2 = {
  totalV2: number;
  byHabit: Map<string, HabitScoreV2>;
};

export function computeUserStatsV2(params: {
  habits: Habit[];
  assignments: SlotAssignment[];
  logs: HabitLog[];
  today: Date;
}): UserStatsV2 {
  const { habits, assignments, logs, today } = params;
  const byHabit = new Map<string, HabitScoreV2>();
  let totalV2 = 0;
  for (const habit of habits) {
    const r = scoreHabitV2({
      habit,
      habitAssignments: assignments.filter((a) => a.habit_id === habit.id),
      allAssignments: assignments,
      habitLogs: logs.filter((l) => l.habit_id === habit.id),
      today,
    });
    byHabit.set(habit.id, r);
    totalV2 += r.total;
  }
  return { totalV2, byHabit };
}

/** V1 frozen at the epoch: only pre-epoch days, with "today" pinned to the
 *  epoch so the auto-miss grace logic never drifts. Late marks on pre-epoch
 *  days still earn old-style points — old days, old rules. */
export function computeFrozenV1(params: {
  habits: Habit[];
  assignments: SlotAssignment[];
  logs: HabitLog[];
}): UserStatsV1 {
  const { habits, assignments, logs } = params;
  const clippedAssignments = assignments
    .map((a) => ({
      ...a,
      end_date:
        a.end_date === null || a.end_date > SCORING_V2_EPOCH
          ? SCORING_V2_EPOCH
          : a.end_date,
    }))
    .filter((a) => a.start_date < a.end_date);
  return computeUserStatsV1({
    habits,
    assignments: clippedAssignments,
    logs: logs.filter((l) => l.date < SCORING_V2_EPOCH),
    today: dateFromString(SCORING_V2_EPOCH),
  });
}

export type CombinedStats = {
  /** frozen v1 + v2 — what every score display shows (callers still add
   *  profiles.score_adjustment on top, exactly like before). */
  totalScore: number;
  v1Total: number;
  v2: UserStatsV2;
  v1: UserStatsV1;
  /** per-habit combined points for the habit cards. */
  pointsByHabit: Map<string, number>;
  /** date → Σ earned_points snapshots of rows on that date (v2 era only).
   *  Feeds the dashboard trend graph; penalties/bonuses are settled per
   *  period, not per day, so they're intentionally not in this map. */
  v2EarnedByDate: Map<string, number>;
};

export function computeCombinedStats(params: {
  habits: Habit[];
  assignments: SlotAssignment[];
  logs: HabitLog[];
  today: Date;
}): CombinedStats {
  const v1 = computeFrozenV1(params);
  const v2 = computeUserStatsV2(params);
  const pointsByHabit = new Map<string, number>();
  for (const h of params.habits) {
    const a = v1.byHabit.get(h.id)?.totalPoints ?? 0;
    const b = v2.byHabit.get(h.id)?.total ?? 0;
    pointsByHabit.set(h.id, a + b);
  }
  const v2EarnedByDate = new Map<string, number>();
  for (const l of params.logs) {
    if (l.date >= SCORING_V2_EPOCH && l.earned_points != null) {
      v2EarnedByDate.set(
        l.date,
        (v2EarnedByDate.get(l.date) ?? 0) + l.earned_points,
      );
    }
  }
  return {
    totalScore: v1.totalScore + v2.totalV2,
    v1Total: v1.totalScore,
    v2,
    v1,
    pointsByHabit,
    v2EarnedByDate,
  };
}

// ----------------------------------------------------------------------------
// Tree economy v2 — monthly ladder with carryover bank.
// ----------------------------------------------------------------------------
export type TreePlanting = {
  id: string;
  user_id: string;
  planted_at: string; // ISO timestamp
  price: number;
};

export type TreeEconomy = {
  /** Spendable points right now (≥ 0 for display). */
  bank: number;
  /** Trees planted in the CURRENT calendar month. */
  plantedThisMonth: number;
  /** Price of the next tree this month, or null when the 10/month cap is hit. */
  nextPrice: number | null;
  /** bank / nextPrice clamped to [0,1]; 1 when plantable. 0 when capped. */
  progress: number;
};

export function computeTreeEconomy(params: {
  /** frozen v1 total (NOT including score_adjustment). */
  v1Total: number;
  /** v2 net total. */
  v2Total: number;
  /** admin score adjustment — spendable like any other points. */
  scoreAdjustment: number;
  /** profiles.cycle_score_floor — v1 points already consumed by old plantings. */
  cycleScoreFloor: number;
  plantings: TreePlanting[];
  today: Date;
}): TreeEconomy {
  const { v1Total, v2Total, scoreAdjustment, cycleScoreFloor, plantings, today } = params;
  // Opening bank = whatever v1 progress wasn't yet spent on old trees.
  const openingBank = Math.max(0, v1Total + scoreAdjustment - cycleScoreFloor);
  const spent = plantings.reduce((s, p) => s + p.price, 0);
  const bank = Math.max(0, openingBank + v2Total - spent);

  const monthKey = toDateString(today).slice(0, 7);
  const plantedThisMonth = plantings.filter(
    (p) => p.planted_at.slice(0, 7) === monthKey,
  ).length;
  const nextPrice =
    plantedThisMonth < MAX_TREES_PER_MONTH ? TREE_PRICES[plantedThisMonth] : null;
  const progress = nextPrice === null ? 0 : Math.min(1, bank / nextPrice);
  return { bank, plantedThisMonth, nextPrice, progress };
}

// ----------------------------------------------------------------------------
// Display rounding — values are fractional internally; every UI number goes
// through this so totals stay visually consistent.
// ----------------------------------------------------------------------------
export function displayPoints(n: number): number {
  return Math.round(n);
}
