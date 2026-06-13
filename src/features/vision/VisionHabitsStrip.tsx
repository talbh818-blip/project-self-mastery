// ============================================================================
// VisionHabitsStrip — a minimal "how are my habits going this period" row.
// ----------------------------------------------------------------------------
// Sits under the guided-writing button in the vision editor. For the period
// currently open in the editor (week / month / year), it shows one small
// colored RING per active habit, filled by that habit's success level for the
// period, with the habit's icon in the middle.
//
// SUCCESS METRIC — goal-relative, the same spirit as the Habits screen:
//   • Days are grouped into the habit's frequency buckets (day / week / month).
//   • Each active bucket "expects" min(target, active-days-in-bucket) marks
//     (the effective quota — a partial bucket can't demand more than its days).
//   • "done" = Σ min(V-days-in-bucket, expected); ratio = done / Σ expected.
//   So a 3×/week habit done 3× reads 100% (not 3/7), and a daily habit reads
//   simply V-days / tracked-days. Clamped to [0, 1].
//
// The habit verdict per day is the ENGINE's `effectiveByDate` ('V' only counts
// a genuinely-complete day — a quantitative partial logged as 'V' does not), so
// the strip agrees with the cells and the data dashboard.
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
 * Goal-relative success of a habit over [windowStart, windowEnd] (inclusive,
 * already clamped to ≤ today). Returns null when the habit had no active day
 * in the window. See the file header for the exact metric.
 */
function successRatio(
  habit: Habit,
  habitStart: string | null,
  eff: HabitScoreResult['effectiveByDate'] | undefined,
  windowStart: Date,
  windowEnd: Date,
): number | null {
  const target = Math.max(1, habit.frequency_target);
  const cap = habit.frequency_period === 'daily' ? 1 : target;
  // bucketKey → { v: completed days, days: active days in the bucket }
  const buckets = new Map<string, { v: number; days: number }>();

  const d = new Date(windowStart);
  while (d <= windowEnd) {
    const ds = toDateString(d);
    if (!habitStart || ds >= habitStart) {
      const key =
        habit.frequency_period === 'daily'
          ? ds
          : habit.frequency_period === 'weekly'
            ? toDateString(startOfWeek(d))
            : `${d.getFullYear()}-${d.getMonth()}`;
      const b = buckets.get(key) ?? { v: 0, days: 0 };
      b.days += 1;
      if (eff?.get(ds) === 'V') b.v += 1;
      buckets.set(key, b);
    }
    d.setDate(d.getDate() + 1);
  }

  if (buckets.size === 0) return null;
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
      const ratio = successRatio(habit, slot.habitStartDate, eff, start, windowEnd);
      if (ratio === null) continue;
      out.push({ habit, ratio });
    }
    out.sort((a, b) => (a.habit.sort_order ?? 0) - (b.habit.sort_order ?? 0));
    return out;
    // slotsForRange + stats are memoized in useHabitData; today is stable.
  }, [status, stats, slotsForRange, scope, periodKey, today]);

  if (items.length === 0) return null;

  // Owns its own header row: the bottom divider + spacing live here so that a
  // user with no habits gets no empty strip (the component returns null above).
  // Scrolls horizontally (no visible scrollbar) when the rings overflow.
  return (
    <div
      dir="rtl"
      className="overflow-x-auto vision-habits-scroll pb-2.5 mb-3 border-b border-surface-border"
    >
      <div className="flex items-center gap-2.5 w-max">
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
