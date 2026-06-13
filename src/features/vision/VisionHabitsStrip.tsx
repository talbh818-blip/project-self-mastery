// ============================================================================
// VisionHabitsStrip — a minimal "how are my habits going this period" row.
// ----------------------------------------------------------------------------
// Sits under the guided-writing button in the vision editor. For the period
// currently open in the editor (week / month / year), it shows one small
// colored RING per active habit, filled by that habit's success level for the
// period, with the habit's icon in the middle.
//
// SUCCESS METRIC — completion of the WHOLE open period (not "since you
// started"). The ring answers "how much of THIS week / month / year have I
// filled in?", so the SAME habit reads ~100% on a strong week but only a few
// percent on the year (most of the year is still unlived/unfilled).
//   • Every day from period-start → today is bucketed by the habit's frequency
//     (day / week / month). Days BEFORE the habit existed, or in an unassigned
//     gap, still count toward the period's "expected" total (they're unfilled)
//     but do NOT count as completed — that's what keeps a freshly-started habit
//     LOW at the month/year scale.
//   • Each bucket "expects" min(target, days-in-bucket) marks (effective quota).
//   • "done" = Σ min(V-days-in-bucket, expected); ratio = done / Σ expected.
//     So a 3×/week habit that hit its 3 every week reads ~100% at every scope.
//   • 'blank' days (today / within grace / quantitative partials) are NEUTRAL —
//     skipped from both done and expected, matching how the habit cells treat
//     them, so an unfinished today never drags the number down.
//
// The per-day verdict is the ENGINE's `effectiveByDate` ('V' only counts a
// genuinely-complete day — a quantitative partial logged as 'V' does not), so
// the strip agrees with the cells and the data dashboard. A habit with no real
// activity in the period (e.g. it didn't exist yet for a past year) is hidden.
//
// Self-contained: it loads its own habit data via useHabitData. The vision
// editor persists across cached period steps, so this fetch happens once and
// only refetches on a cold remount.
// ============================================================================
import { useMemo } from 'react';
import { useHabitData } from '../habits/useHabitData';
import { HabitIcon } from '../habits/HabitIcon';
import type { Habit } from '../habits/types';
import type { HabitScoreResult } from '../habits/scoring';
import { startOfWeek, toDateString } from '../habits/week';
import { parsePeriodStart, type VisionScope } from './period';

type Props = {
  userId: string | null;
  /** The scope open in the editor — drives the period the strip summarises. */
  scope: VisionScope;
  /** The open period's key (e.g. "2026-06-07" / "2026-06" / "2026"). */
  periodKey: string;
};

/** [start, end] (local midnight) of the period a (scope, key) names. */
function periodBounds(scope: VisionScope, key: string): { start: Date; end: Date } {
  const start = parsePeriodStart(scope, key);
  if (scope === 'weekly') {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end };
  }
  if (scope === 'monthly') {
    return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, 0) };
  }
  // yearly
  return { start, end: new Date(start.getFullYear(), 11, 31) };
}

/**
 * Completion of the open period for a habit, over [windowStart, windowEnd]
 * (inclusive, windowEnd already clamped to ≤ today). Measures the WHOLE period
 * — un-lived / un-done days count as unfilled — so the value shrinks as the
 * scope widens. Returns null when the habit had no real activity in the period
 * (so it's hidden rather than shown at 0% for a period it didn't exist in).
 * See the file header for the exact metric.
 */
function successRatio(
  habit: Habit,
  eff: HabitScoreResult['effectiveByDate'] | undefined,
  windowStart: Date,
  windowEnd: Date,
): number | null {
  if (!eff) return null;
  const target = Math.max(1, habit.frequency_target);
  const cap = habit.frequency_period === 'daily' ? 1 : target;
  // bucketKey → { v: completed days, days: counted (non-neutral) days }
  const buckets = new Map<string, { v: number; days: number }>();
  // Did the habit genuinely exist / get judged at all in this window? Only a
  // real verdict (V / X / auto_x) counts — undefined days (pre-existence / gap)
  // do not, so a period the habit never lived in stays hidden.
  let active = false;

  const d = new Date(windowStart);
  while (d <= windowEnd) {
    const ds = toDateString(d);
    const st = eff.get(ds);
    // 'blank' = today / within grace / quantitative partial → neutral: skip
    // entirely (neither expected nor done), matching the habit cells.
    if (st !== 'blank') {
      const key =
        habit.frequency_period === 'daily'
          ? ds
          : habit.frequency_period === 'weekly'
            ? toDateString(startOfWeek(d))
            : `${d.getFullYear()}-${d.getMonth()}`;
      const b = buckets.get(key) ?? { v: 0, days: 0 };
      b.days += 1; // counts toward "expected" even when undefined (unfilled)
      if (st === 'V') {
        b.v += 1;
        active = true;
      } else if (st === 'X' || st === 'auto_x') {
        active = true;
      }
      buckets.set(key, b);
    }
    d.setDate(d.getDate() + 1);
  }

  if (!active) return null; // habit didn't exist in this period → hide it
  let done = 0;
  let expected = 0;
  for (const b of buckets.values()) {
    const exp = Math.min(cap, b.days);
    done += Math.min(b.v, exp);
    expected += exp;
  }
  return expected > 0 ? done / expected : null;
}

type Item = { habit: Habit; ratio: number };

export function VisionHabitsStrip({ userId, scope, periodKey }: Props) {
  const data = useHabitData(userId);
  const { status, stats, slotsForRange } = data;

  const today = useMemo(() => new Date(), []);

  const items = useMemo<Item[]>(() => {
    if (status !== 'ready') return [];
    const { start, end } = periodBounds(scope, periodKey);
    // Never count days that haven't happened yet.
    const windowEnd = end < today ? end : today;
    if (start > windowEnd) return [];

    const slots = slotsForRange({ start, end: windowEnd });
    const out: Item[] = [];
    for (const slot of slots) {
      const habit = slot.habit;
      if (!habit) continue;
      const eff = stats?.byHabit.get(habit.id)?.effectiveByDate;
      const ratio = successRatio(habit, eff, start, windowEnd);
      if (ratio === null) continue;
      out.push({ habit, ratio });
    }
    out.sort((a, b) => (a.habit.sort_order ?? 0) - (b.habit.sort_order ?? 0));
    return out;
    // slotsForRange + stats are memoized in useHabitData; today is stable.
  }, [status, stats, slotsForRange, scope, periodKey, today]);

  if (items.length === 0) return null;

  // Sits at the BOTTOM of the vision (below the writing). The TOP divider +
  // spacing live here so a user with no habits gets no empty strip (the
  // component returns null above). Scrolls horizontally (no visible scrollbar)
  // when the rings overflow.
  return (
    <div
      dir="rtl"
      className="overflow-x-auto vision-habits-scroll pt-3 mt-3 border-t border-surface-border"
    >
      <div className="flex items-center justify-center gap-2.5 min-w-max">
        {items.map((it) => (
          <SuccessRing key={it.habit.id} habit={it.habit} ratio={it.ratio} />
        ))}
      </div>
    </div>
  );
}

function SuccessRing({ habit, ratio }: { habit: Habit; ratio: number }) {
  const SIZE = 38;
  const STROKE = 3.5;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = clamped * C;
  const pct = Math.round(clamped * 100);

  return (
    <div
      className="relative shrink-0"
      style={{ width: SIZE, height: SIZE }}
      title={`${habit.name} · ${pct}%`}
      aria-label={`${habit.name}: ${pct}% הצלחה`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="block">
        {/* rotate so the ring fills from 12 o'clock clockwise */}
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="var(--color-surface-border)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={habit.color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${C - filled}`}
          />
        </g>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-ink-100">
        <HabitIcon name={habit.icon} size={17} strokeWidth={1.9} />
      </span>
    </div>
  );
}
