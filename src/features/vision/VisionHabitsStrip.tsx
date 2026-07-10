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
//   • Weekly is a "this week so far" gauge — only ELAPSED days count, so a
//     perfect week so far reads ~100%. Monthly / yearly measure "how much of
//     the WHOLE period have you filled?": the expected total spans the FULL
//     period (period-start → period-END), so days still AHEAD, days before the
//     habit existed, and unassigned gaps all count as unfilled (expected, not
//     done). That bounds the value by how far into the month/year you are — you
//     can't be 62% "through" June on the 13th — and keeps a freshly-started
//     habit LOW at the month/year scale.
//   • Each bucket "expects" min(target, days-in-bucket) marks (effective quota).
//   • "done" = Σ min(V-days-in-bucket, expected); ratio = done / Σ expected.
//     So a 3×/week habit that hit its 3 every week reads ~100% at every scope.
//   • 'blank' days (today / within grace / quantitative partials) are NEUTRAL —
//     skipped from both done and expected, matching how the habit cells treat
//     them, so an unfinished today never drags the number down.
//
// VISIBILITY — every habit ASSIGNED to a slot in the window shows, even one not
// yet marked: a brand-new week before any tick reads 0% (an EMPTY ring), it does
// NOT vanish. Only a habit whose assignment began AFTER the window is hidden (it
// didn't exist in a past period we're looking back at — keyed on habitStartDate).
//
// RANGE TOGGLE — a two-line label to the LEFT of the rings ("השבוע" / "הזה",
// etc.) flips the rings between the OPEN-PERIOD metric above and a TRAILING
// window ending today ("7 / 30 / 365 ימים אחרונים"). In the trailing mode the
// same done/expected math runs over [today-(N-1) … today] anchored to today (not
// the open period), so it reads "how am I doing lately?". Whatever the user
// picks becomes the persistent default (see useRangeMode).
//
// The per-day verdict is the ENGINE's `effectiveByDate` ('V' only counts a
// genuinely-complete day — a quantitative partial logged as 'V' does not), so
// the strip agrees with the cells and the data dashboard.
//
// Self-contained: it loads its own habit data via useHabitData. The vision
// editor persists across cached period steps, so this fetch happens once and
// only refetches on a cold remount.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  /** 'bottom' (default) = the full-size strip below the writing (mobile).
   *  'inline' = compact rings for the desktop document header (no divider,
   *  smaller, start-aligned). */
  variant?: 'bottom' | 'inline';
};

/** [start, end] (local midnight) of the period a (scope, key) names. */
function periodBounds(scope: VisionScope, key: string): { start: Date; end: Date } {
  const start = parsePeriodStart(scope, key);
  if (scope === 'daily') {
    return { start, end: start };
  }
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
 * scope widens. Always returns a number in [0, 1]: a habit that's assigned but
 * not yet marked (e.g. a brand-new week before any tick) reads 0 — an EMPTY
 * ring — rather than vanishing. WHETHER a habit shows at all is decided by the
 * caller (it hides habits not yet assigned in the window). See the file header.
 */
function successRatio(
  habit: Habit,
  eff: HabitScoreResult['effectiveByDate'] | undefined,
  windowStart: Date,
  windowEnd: Date,
): number {
  if (!eff) return 0;
  const target = Math.max(1, habit.frequency_target);
  const cap = habit.frequency_period === 'daily' ? 1 : target;
  // bucketKey → { v: completed days, days: counted (non-neutral) days }
  const buckets = new Map<string, { v: number; days: number }>();

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
      if (st === 'V') b.v += 1;
      buckets.set(key, b);
    }
    d.setDate(d.getDate() + 1);
  }

  let done = 0;
  let expected = 0;
  for (const b of buckets.values()) {
    const exp = Math.min(cap, b.days);
    done += Math.min(b.v, exp);
    expected += exp;
  }
  // No expected days yet (a fresh week where the only elapsed day is today,
  // still neutral) → 0%, an empty ring, not a hidden habit.
  return expected > 0 ? done / expected : 0;
}

// ─── Range mode (this period vs. trailing window) ───────────────────────────
// The strip can measure either the OPEN calendar period ("this week / month /
// year") or a TRAILING window ending today ("last 7 / 30 / 365 days"). A tap on
// the label to the left of the rings flips between the two, and that choice
// becomes the new DEFAULT for THAT SCOPE — weekly / monthly / yearly each keep
// their own view independently. It sticks across remounts, period / tab
// switches, and page reloads, so the user never has to re-pick it.
//
// Two layers back it up:
//   • localStorage  — survives reloads / new sessions (the cross-session store).
//   • a module-level SESSION cache — the source of truth while the app is open,
//     so the choice holds instantly with no flicker on remount, and keeps
//     working even if a private-mode browser refuses the localStorage write.
type RangeMode = 'period' | 'rolling';

const RANGE_MODE_LS = 'vision-rings-range:';

// The choice is remembered PER SCOPE: weekly / monthly / yearly each keep their
// own view, so picking "7 ימים אחרונים" for the week doesn't touch what the
// month or year show. Session cache (scope → mode) is the in-app source of
// truth; localStorage backs it across sessions. Reset on reload / user change.
const sessionRangeByScope = new Map<VisionScope, RangeMode>();
let sessionRangeUser: string | null | undefined;

function rangeLsKey(userId: string | null, scope: VisionScope) {
  return `${RANGE_MODE_LS}${userId ?? '_'}:${scope}`;
}

// 'daily' journaling entries DO show the strip — one ring per habit, filled by
// that single day's status (done = full, not done = 0% empty ring). A single day
// has no meaningful "trailing window", so the daily strip is locked to period
// mode and hides the range toggle (see rangeMode + the toggle guard below).
const ROLLING_DAYS: Record<VisionScope, number> = {
  weekly: 7,
  monthly: 30,
  yearly: 365,
  daily: 1,
};
// Each label is two lines (primary / secondary) so it stacks vertically and
// stays narrow — keeps the strip compact. The lines render right-aligned.
const PERIOD_LABEL: Record<VisionScope, [string, string]> = {
  weekly: ['השבוע', 'הזה'],
  monthly: ['החודש', 'הזה'],
  yearly: ['השנה', 'הזאת'],
  daily: ['היום', 'הזה'],
};
const ROLLING_LABEL: Record<VisionScope, [string, string]> = {
  weekly: ['7 ימים', 'אחרונים'],
  monthly: ['30 ימים', 'אחרונים'],
  yearly: ['365 ימים', 'אחרונים'],
  daily: ['היום', ''],
};

/** Drop the session cache when the signed-in user changes (so user B never
 *  inherits user A's in-memory choices). */
function syncRangeUser(userId: string | null) {
  if (sessionRangeUser !== userId) {
    sessionRangeByScope.clear();
    sessionRangeUser = userId;
  }
}

/** The current default for (`userId`, `scope`) — session cache if present,
 *  otherwise (re)seeded from localStorage. */
function readRangeMode(userId: string | null, scope: VisionScope): RangeMode {
  syncRangeUser(userId);
  const cached = sessionRangeByScope.get(scope);
  if (cached) return cached;
  let mode: RangeMode = 'period';
  try {
    if (localStorage.getItem(rangeLsKey(userId, scope)) === 'rolling') {
      mode = 'rolling';
    }
  } catch {
    // storage unavailable → fall back to the default
  }
  sessionRangeByScope.set(scope, mode);
  return mode;
}

/** Make `next` the new default for (`userId`, `scope`) — session cache first
 *  (always succeeds), then localStorage for the next session (best-effort). */
function writeRangeMode(next: RangeMode, userId: string | null, scope: VisionScope) {
  syncRangeUser(userId);
  sessionRangeByScope.set(scope, next);
  try {
    localStorage.setItem(rangeLsKey(userId, scope), next);
  } catch {
    // ignore quota / private-mode failures — the session cache still holds it
  }
}

/** Per-user, PER-SCOPE toggle between the calendar-period and trailing-window
 *  measurement. Whatever the user picks for a scope becomes that scope's
 *  persistent default (see header). */
function useRangeMode(userId: string | null, scope: VisionScope) {
  const [mode, setMode] = useState<RangeMode>(() => readRangeMode(userId, scope));
  // Re-sync when the user lands (auth can resolve after first mount) or the
  // scope changes (each scope has its own remembered choice).
  useEffect(() => {
    setMode(readRangeMode(userId, scope));
  }, [userId, scope]);
  const toggle = useCallback(() => {
    setMode((prev) => {
      const next: RangeMode = prev === 'period' ? 'rolling' : 'period';
      writeRangeMode(next, userId, scope);
      return next;
    });
  }, [userId, scope]);
  return { mode, toggle };
}

type Item = { habit: Habit; ratio: number };

export function VisionHabitsStrip({
  userId,
  scope,
  periodKey,
  variant = 'bottom',
}: Props) {
  const data = useHabitData(userId);
  const { status, stats, slotsForRange } = data;
  const { mode, toggle } = useRangeMode(userId, scope);
  // A single day has no meaningful "last N days" window — the daily strip always
  // measures THAT day (period mode); its range toggle is hidden below.
  const rangeMode: RangeMode = scope === 'daily' ? 'period' : mode;

  const today = useMemo(() => new Date(), []);

  const items = useMemo<Item[]>(() => {
    if (status !== 'ready') return [];
    const { start: periodStart, end: periodEnd } = periodBounds(scope, periodKey);
    // Never summarise a period that hasn't begun (future / locked) — in EITHER
    // mode — so the strip (and its toggle) stay hidden there.
    if (periodStart > today) return [];

    // Two windows: which habits to show (sel*) and what the rings MEASURE
    // (win*). They differ by mode.
    let selStart: Date;
    let selEnd: Date;
    let winStart: Date;
    let winEnd: Date;

    if (rangeMode === 'rolling') {
      // Trailing window ending today — "last N days" (N = 7 / 30 / 365).
      // Anchored to today regardless of which period is open: that's exactly
      // what the "X ימים אחרונים" label promises.
      const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const start = new Date(t0);
      start.setDate(t0.getDate() - (ROLLING_DAYS[scope] - 1));
      selStart = start;
      selEnd = today;
      winStart = start;
      winEnd = today;
    } else {
      // "This week / month / year." Last ELAPSED day of the period (future
      // days haven't happened). Weekly = "this week so far" → elapsed only.
      // Monthly / yearly = "% of the whole period filled" → the FULL period
      // (future days count as unfilled). V's only ever land on elapsed days, so
      // done is unaffected.
      const todayEnd = periodEnd < today ? periodEnd : today;
      selStart = periodStart;
      selEnd = todayEnd;
      winStart = periodStart;
      winEnd = scope === 'weekly' ? todayEnd : periodEnd;
    }

    // slotsForRange returns the CURRENTLY-assigned habit per slot. Show every
    // assigned habit — even one not yet marked this period (it reads 0%, an
    // empty ring) — but hide a habit whose assignment only began AFTER this
    // window (it didn't exist in a past period we're looking back at).
    const slots = slotsForRange({ start: selStart, end: selEnd });
    const selEndStr = toDateString(selEnd);
    const out: Item[] = [];
    for (const slot of slots) {
      const habit = slot.habit;
      if (!habit) continue;
      if (slot.habitStartDate && slot.habitStartDate > selEndStr) continue;
      const eff = stats?.byHabit.get(habit.id)?.effectiveByDate;
      const ratio = successRatio(habit, eff, winStart, winEnd);
      out.push({ habit, ratio });
    }
    out.sort((a, b) => (a.habit.sort_order ?? 0) - (b.habit.sort_order ?? 0));
    return out;
    // slotsForRange + stats are memoized in useHabitData; today is stable.
  }, [status, stats, slotsForRange, scope, periodKey, today, rangeMode]);

  if (items.length === 0) return null;

  const inline = variant === 'inline';
  const showToggle = scope !== 'daily';
  const label = rangeMode === 'rolling' ? ROLLING_LABEL[scope] : PERIOD_LABEL[scope];

  // 'bottom' sits below the writing (mobile) with its own top divider + spacing
  // and centred 46px rings. 'inline' is the desktop header cluster — label +
  // rings packed together, flush-LEFT in the (wide) header column. They scroll
  // horizontally on overflow rather than spilling onto the title. In both, the
  // range-toggle label sits to the LEFT of the rings (last child of the RTL row).
  return (
    <div
      dir="rtl"
      className={inline ? 'min-w-0' : 'pt-3 mt-3 border-t border-surface-border'}
    >
      <div
        className={`flex items-center ${
          inline ? 'gap-2 min-w-0' : 'gap-3 justify-center'
        }`}
      >
        {/* The rings — scroll horizontally (scrollbar hidden) when there are
            more than fit. min-w-0 lets the wrapper shrink so overflow scrolls
            instead of pushing the label off / overrunning the title. */}
        <div className="overflow-x-auto vision-habits-scroll min-w-0">
          <div
            className={`flex items-center min-w-max ${
              inline ? 'gap-2' : 'gap-3'
            }`}
          >
            {items.map((it) => (
              <SuccessRing
                key={it.habit.id}
                habit={it.habit}
                ratio={it.ratio}
                size={inline ? 32 : 46}
                iconSize={inline ? 16 : 22}
              />
            ))}
          </div>
        </div>

        {/* Range toggle — to the LEFT of the rings, two compact lines, the
            Hebrew text RIGHT-aligned. Tap flips "this period" ⇄ "last N days".
            Both states are stacked in ONE grid cell so the button is always as
            wide as the WIDER of the two — the rings never shift when the text
            swaps; only the active state is shown. */}
        {showToggle && (
        <button
          type="button"
          onClick={toggle}
          title="החלפת טווח המדידה"
          aria-label={`טווח המדידה: ${label[0]} ${label[1]} — לחצו להחלפה`}
          className={`shrink-0 grid text-right leading-[1.12] font-semibold
            text-ink-300 hover:text-ink-100 transition-colors ${
              inline ? 'text-[11px]' : 'text-[12px]'
            }`}
        >
          {[PERIOD_LABEL[scope], ROLLING_LABEL[scope]].map((pair, i) => {
            const active = (i === 0) === (mode === 'period');
            return (
              <span
                key={i}
                aria-hidden={!active}
                className="col-start-1 row-start-1 whitespace-nowrap"
                style={{ visibility: active ? 'visible' : 'hidden' }}
              >
                <span className="block">{pair[0]}</span>
                <span className="block">{pair[1]}</span>
              </span>
            );
          })}
        </button>
        )}
      </div>
    </div>
  );
}

function SuccessRing({
  habit,
  ratio,
  size = 46,
  iconSize = 22,
}: {
  habit: Habit;
  ratio: number;
  size?: number;
  iconSize?: number;
}) {
  const SIZE = size;
  const STROKE = size >= 40 ? 4 : 3;
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
            // Full dash, animate the OFFSET so the arc grows/shrinks smoothly
            // when the value changes (e.g. toggling "this period" ⇄ "last N
            // days" fills or empties the ring).
            strokeDasharray={C}
            strokeDashoffset={C - filled}
            style={{ transition: 'stroke-dashoffset 650ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </g>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-ink-100">
        <HabitIcon name={habit.icon} size={iconSize} strokeWidth={1.9} />
      </span>
    </div>
  );
}
