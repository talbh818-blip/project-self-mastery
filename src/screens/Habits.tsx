import { useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useWeekView } from '../features/habits/useWeekView';
import {
  addWeeks,
  formatRangeShort,
  getWeekRange,
  hebrewDayShort,
  isFuture,
  isSameDay,
  relativeWeekLabel,
  toDateString,
} from '../features/habits/week';
import {
  SLOT_INDEXES,
  type LogStatus,
  type SlotIndex,
  type SlotView,
} from '../features/habits/types';
import { HabitIcon } from '../features/habits/HabitIcon';
import { HabitPickerSheet } from '../features/habits/HabitPickerSheet';
import { nextMarkInCycle, setHabitLog } from '../features/habits/mutations';
import { useUserStats } from '../features/habits/useUserStats';
import { scoreForRange, type UserStats } from '../features/habits/scoring';

export function Habits() {
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const tomorrow = useMemo(() => {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return t;
  }, [today]);
  const maxWeekStart = useMemo(() => getWeekRange(tomorrow).start, [tomorrow]);

  const [anchor, setAnchor] = useState<Date>(today);
  const range = useMemo(() => getWeekRange(anchor), [anchor]);

  const canGoNext =
    toDateString(getWeekRange(addWeeks(anchor, 1)).start) <= toDateString(maxWeekStart);

  const [refreshKey, setRefreshKey] = useState(0);
  const week = useWeekView(user?.id ?? null, range, refreshKey);
  const userStats = useUserStats(user?.id ?? null, refreshKey);

  const [pickerSlot, setPickerSlot] = useState<SlotIndex | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const handleCellClick = async (
    habitId: string,
    date: string,
    current: LogStatus | undefined,
  ) => {
    if (!user) return;
    const next = nextMarkInCycle(current);
    try {
      await setHabitLog({ userId: user.id, habitId, date, newStatus: next });
      setMutationError(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה בשמירה';
      setMutationError(msg);
    }
  };

  const totalScore = userStats.status === 'ready' ? userStats.stats.totalScore : 0;

  const nextEmptySlot: SlotIndex | null = useMemo(() => {
    if (week.status !== 'ready') return null;
    for (const i of SLOT_INDEXES) {
      const slot = week.slots.find((s) => s.slot_index === i);
      if (!slot?.habit) return i;
    }
    return null;
  }, [week]);

  return (
    <section className="text-ink-100">
      {/* TOTAL SCORE */}
      <div className="mb-3 rounded-2xl border border-surface-border bg-surface-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl leading-none">🔥</span>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-500">
              TOTAL SCORE
            </div>
            <div className="text-2xl font-bold text-ink-100 leading-none mt-1">
              {totalScore}
            </div>
          </div>
        </div>
      </div>

      {/* Week nav + add habit */}
      <div className="mb-4 flex items-stretch gap-2">
        <div className="flex-1 rounded-2xl border border-surface-border bg-surface-card flex items-center justify-between px-1 py-1.5">
          <button
            type="button"
            onClick={() => setAnchor(addWeeks(anchor, -1))}
            className="p-1.5 text-ink-300 hover:text-ink-100"
            aria-label="שבוע קודם"
          >
            <ChevronRight size={18} />
          </button>
          <div className="text-center leading-tight">
            <div className="text-sm font-semibold">
              {relativeWeekLabel(anchor, today)}
            </div>
            <div className="text-[10px] text-ink-300 mt-0.5">
              {formatRangeShort(range)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => canGoNext && setAnchor(addWeeks(anchor, 1))}
            disabled={!canGoNext}
            className="p-1.5 text-ink-300 hover:text-ink-100 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="שבוע הבא"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => nextEmptySlot && setPickerSlot(nextEmptySlot)}
          disabled={!nextEmptySlot}
          className="rounded-2xl border border-surface-border bg-surface-card px-3 flex items-center gap-1 text-ink-100 hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="הוסף הרגל"
        >
          <Plus size={16} strokeWidth={2} />
          <span className="text-sm font-medium">הרגל</span>
        </button>
      </div>

      {/* Habits */}
      {week.status === 'error' && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 text-red-400 text-sm px-4 py-3">
          שגיאה: {week.error}
        </div>
      )}

      {week.status === 'loading' && (
        <div className="text-sm text-ink-300 py-8 text-center">טוען…</div>
      )}

      {week.status === 'ready' && (
        <HabitsList
          slots={week.slots}
          days={range.days}
          today={today}
          rangeStart={range.start}
          rangeEnd={range.end}
          stats={userStats.status === 'ready' ? userStats.stats : null}
          onPickSlot={(s) => setPickerSlot(s)}
          onMarkCell={handleCellClick}
        />
      )}

      {mutationError && (
        <div className="mt-3 rounded-xl border border-red-800/50 bg-red-950/30 text-red-400 text-sm px-4 py-2">
          {mutationError}
        </div>
      )}

      {user && (
        <HabitPickerSheet
          open={pickerSlot !== null}
          slotIndex={pickerSlot}
          userId={user.id}
          onClose={() => setPickerSlot(null)}
          onAssigned={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </section>
  );
}

function HabitsList({
  slots,
  days,
  today,
  rangeStart,
  rangeEnd,
  stats,
  onPickSlot,
  onMarkCell,
}: {
  slots: SlotView[];
  days: Date[];
  today: Date;
  rangeStart: Date;
  rangeEnd: Date;
  stats: UserStats | null;
  onPickSlot: (slot: SlotIndex) => void;
  onMarkCell: (habitId: string, date: string, current: LogStatus | undefined) => void;
}) {
  const effectiveFor = (habitId: string, dateStr: string): LogStatus | undefined => {
    const r = stats?.byHabit.get(habitId);
    if (!r) return undefined;
    const s = r.effectiveByDate.get(dateStr);
    if (s === 'blank' || s === undefined) return undefined;
    return s;
  };
  const weekScoreFor = (habitId: string): number => {
    const r = stats?.byHabit.get(habitId);
    if (!r) return 0;
    return scoreForRange(r, rangeStart, rangeEnd);
  };

  const filledSlots = SLOT_INDEXES.map((i) =>
    slots.find((s) => s.slot_index === i),
  ).filter((s): s is SlotView => !!s?.habit);

  if (filledSlots.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-surface-border bg-surface-card/40 px-4 py-10 text-center text-ink-300 text-sm">
        עוד אין הרגלים. לחץ על "+ הרגל" למעלה כדי להתחיל.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Day labels header */}
      <div className="grid grid-cols-[1fr_repeat(7,32px)] gap-1 px-3">
        <div></div>
        {days.map((d, i) => (
          <DayHeader key={i} day={d} isToday={isSameDay(d, today)} />
        ))}
      </div>

      {/* Habit rows */}
      {filledSlots.map((slot) => (
        <HabitRow
          key={slot.slot_index}
          slot={slot}
          days={days}
          today={today}
          score={weekScoreFor(slot.habit!.id)}
          effectiveFor={(date) => effectiveFor(slot.habit!.id, date)}
          onPickSlot={() => onPickSlot(slot.slot_index)}
          onMarkCell={onMarkCell}
        />
      ))}
    </div>
  );
}

function DayHeader({ day, isToday }: { day: Date; isToday: boolean }) {
  return (
    <div
      className={`flex flex-col items-center leading-none py-1 ${
        isToday ? 'text-ink-100 font-bold' : 'text-ink-500'
      }`}
    >
      <span className="text-[10px]">{hebrewDayShort(day)}</span>
      <span className="text-[9px] mt-0.5 opacity-70">{day.getDate()}</span>
    </div>
  );
}

function HabitRow({
  slot,
  days,
  today,
  score,
  effectiveFor,
  onPickSlot,
  onMarkCell,
}: {
  slot: SlotView;
  days: Date[];
  today: Date;
  score: number;
  effectiveFor: (dateStr: string) => LogStatus | undefined;
  onPickSlot: () => void;
  onMarkCell: (habitId: string, date: string, current: LogStatus | undefined) => void;
}) {
  const habit = slot.habit!;
  const iconBg =
    habit.type === 'positive' ? 'bg-forest-500/15' : 'bg-red-500/15';
  const scoreColor =
    score > 0 ? 'text-forest-500' : score < 0 ? 'text-red-500' : 'text-ink-500';
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card grid grid-cols-[1fr_repeat(7,32px)] gap-1 items-center px-3 py-2.5">
      <button
        type="button"
        onClick={onPickSlot}
        className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity text-right"
        aria-label="ערוך הרגל"
      >
        <span
          className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}
        >
          <HabitIcon name={habit.icon} size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink-100 truncate">
            {habit.name}
          </div>
          <div className={`text-[10px] leading-tight ${scoreColor}`}>
            {score > 0 ? `+${score}` : score}
          </div>
        </div>
      </button>

      {days.map((d, i) => {
        const isToday = isSameDay(d, today);
        const future = isFuture(d, today);
        const dateStr = toDateString(d);
        const effective = effectiveFor(dateStr);
        const mark = effective ?? slot.marks[dateStr];
        return (
          <DayCell
            key={i}
            mark={mark}
            isToday={isToday}
            disabled={future}
            onClick={() => onMarkCell(habit.id, dateStr, mark)}
          />
        );
      })}
    </div>
  );
}

function DayCell({
  mark,
  isToday,
  disabled,
  onClick,
}: {
  mark: LogStatus | undefined;
  isToday: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full aspect-square rounded-md flex items-center justify-center transition-colors ${cellBg(
        mark,
        isToday,
      )} ${disabled ? 'opacity-30 cursor-not-allowed' : 'hover:brightness-110'}`}
      aria-label="סמן יום"
    >
      <MarkGlyph mark={mark} />
    </button>
  );
}

function cellBg(mark: LogStatus | undefined, isToday: boolean): string {
  if (mark === 'V') return 'bg-forest-500/25 border border-forest-500/50';
  if (mark === 'X') return 'bg-red-500/20 border border-red-500/50';
  if (mark === 'auto_x') return 'bg-red-500/10 border border-red-500/30';
  return isToday
    ? 'bg-surface-raised border border-ink-300/40'
    : 'bg-surface-raised/60 border border-surface-border';
}

function MarkGlyph({ mark }: { mark: LogStatus | undefined }) {
  if (mark === 'V')
    return <span className="text-forest-500 font-bold text-sm leading-none">✓</span>;
  if (mark === 'X')
    return <span className="text-red-500 font-bold text-sm leading-none">✕</span>;
  if (mark === 'auto_x')
    return <span className="text-red-400 font-bold text-sm leading-none">✕</span>;
  return <span className="text-ink-500/40 text-xs leading-none">·</span>;
}
