import { useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import {
  addMonths,
  addWeeks,
  formatMonthLong,
  formatRangeShort,
  getMonthRange,
  getWeekRange,
  hebrewDayShort,
  isFuture,
  isSameDay,
  relativeMonthLabel,
  relativeWeekLabel,
  toDateString,
} from '../features/habits/week';
import {
  SLOT_INDEXES,
  type Habit,
  type LogStatus,
  type SlotIndex,
  type SlotView,
} from '../features/habits/types';
import { HabitIcon } from '../features/habits/HabitIcon';
import { HabitPickerSheet } from '../features/habits/HabitPickerSheet';
import { HabitDetailSheet } from '../features/habits/HabitDetailSheet';
import {
  nextAmountInCycle,
  nextMarkInCycle,
} from '../features/habits/mutations';
import { useHabitData } from '../features/habits/useHabitData';
import {
  scoreForRange,
  type HabitScoreResult,
  type UserStats,
} from '../features/habits/scoring';

type ViewMode = 'week' | 'month';

export function Habits() {
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const tomorrow = useMemo(() => {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return t;
  }, [today]);
  const maxWeekStart = useMemo(() => getWeekRange(tomorrow).start, [tomorrow]);

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [weekAnchor, setWeekAnchor] = useState<Date>(today);
  const [monthAnchor, setMonthAnchor] = useState<Date>(today);

  const weekRange = useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);
  const monthRange = useMemo(() => getMonthRange(monthAnchor), [monthAnchor]);

  const canGoNextWeek =
    toDateString(getWeekRange(addWeeks(weekAnchor, 1)).start) <= toDateString(maxWeekStart);
  const canGoNextMonth =
    monthAnchor.getFullYear() * 12 + monthAnchor.getMonth() <
    today.getFullYear() * 12 + today.getMonth();

  // Single source of truth for the user's habit data. Mutations are optimistic
  // — UI updates immediately and persists in the background. No refetching.
  const data = useHabitData(user?.id ?? null);

  // Derive slots for the visible week and for today (used by + button +
  // monthly heatmap which always shows the user's CURRENT habits).
  const weekSlots = useMemo(
    () => data.slotsForRange(weekRange),
    [data, weekRange],
  );
  const todayWeekRange = useMemo(() => getWeekRange(today), [today]);
  const todaySlots = useMemo(
    () => data.slotsForRange(todayWeekRange),
    [data, todayWeekRange],
  );

  const [pickerSlot, setPickerSlot] = useState<SlotIndex | null>(null);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [detailHabit, setDetailHabit] = useState<Habit | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const handleCellClick = async (
    habit: Habit,
    date: string,
    currentMark: LogStatus | undefined,
    currentAmount: number | null | undefined,
  ) => {
    if (!user) return;
    try {
      if (habit.is_quantitative) {
        const target = habit.quantitative_target ?? 10;
        const nextAmount = nextAmountInCycle(currentAmount, target);
        await data.setLog({
          habitId: habit.id,
          date,
          status: nextAmount === null ? null : 'V',
          amount: nextAmount,
        });
      } else {
        const next = nextMarkInCycle(currentMark);
        await data.setLog({
          habitId: habit.id,
          date,
          status: next,
          amount: null,
        });
      }
      setMutationError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה בשמירה';
      setMutationError(msg);
    }
  };

  const totalScore = data.stats?.totalScore ?? 0;

  const nextEmptySlot: SlotIndex | null = useMemo(() => {
    if (data.status !== 'ready') return null;
    for (const i of SLOT_INDEXES) {
      const slot = todaySlots.find((s) => s.slot_index === i);
      if (!slot?.habit) return i;
    }
    return null;
  }, [data.status, todaySlots]);

  return (
    <section className="text-ink-100">
      {/* Score */}
      <div className="mb-3 rounded-2xl border border-surface-border bg-surface-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl leading-none">🔥</span>
          <div>
            <div className="text-[11px] tracking-wide text-ink-500">
              ניקוד כולל
            </div>
            <div className="text-2xl font-bold text-ink-100 leading-none mt-1">
              {totalScore}
            </div>
          </div>
        </div>
        {/* View mode toggle */}
        <div className="flex gap-1 bg-surface-raised rounded-full p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('week')}
            className={`px-3 py-1 rounded-full text-[11px] transition-colors ${
              viewMode === 'week'
                ? 'bg-forest-700 text-cream-50'
                : 'text-ink-300 hover:text-ink-100'
            }`}
          >
            שבועי
          </button>
          <button
            type="button"
            onClick={() => setViewMode('month')}
            className={`px-3 py-1 rounded-full text-[11px] transition-colors ${
              viewMode === 'month'
                ? 'bg-forest-700 text-cream-50'
                : 'text-ink-300 hover:text-ink-100'
            }`}
          >
            חודשי
          </button>
        </div>
      </div>

      {/* Add habit + range nav */}
      <div className="mb-4 flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => nextEmptySlot && setPickerSlot(nextEmptySlot)}
          disabled={!nextEmptySlot}
          className="min-w-[110px] rounded-2xl border border-surface-border bg-surface-card px-4 flex items-center justify-center gap-1.5 text-ink-100 hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="הוסף הרגל"
        >
          <Plus size={16} strokeWidth={2} />
          <span className="text-sm font-medium">הרגל</span>
        </button>
        {viewMode === 'week' ? (
          <NavBar
            onPrev={() => setWeekAnchor(addWeeks(weekAnchor, -1))}
            onNext={() => canGoNextWeek && setWeekAnchor(addWeeks(weekAnchor, 1))}
            canNext={canGoNextWeek}
            mainLabel={relativeWeekLabel(weekAnchor, today)}
            subLabel={formatRangeShort(weekRange)}
            prevAriaLabel="שבוע קודם"
            nextAriaLabel="שבוע הבא"
          />
        ) : (
          <NavBar
            onPrev={() => setMonthAnchor(addMonths(monthAnchor, -1))}
            onNext={() =>
              canGoNextMonth && setMonthAnchor(addMonths(monthAnchor, 1))
            }
            canNext={canGoNextMonth}
            mainLabel={relativeMonthLabel(monthAnchor, today)}
            subLabel={formatMonthLong(monthAnchor)}
            prevAriaLabel="חודש קודם"
            nextAriaLabel="חודש הבא"
          />
        )}
      </div>

      {/* Body */}
      {data.status === 'error' && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 text-red-400 text-sm px-4 py-3">
          שגיאה: {data.error}
        </div>
      )}
      {data.status === 'loading' && (
        <div className="text-sm text-ink-300 py-8 text-center">טוען…</div>
      )}
      {data.status === 'ready' && viewMode === 'week' && (
        <HabitsList
          slots={weekSlots}
          days={weekRange.days}
          today={today}
          rangeStart={weekRange.start}
          rangeEnd={weekRange.end}
          stats={data.stats}
          onShowDetail={setDetailHabit}
          onMarkCell={handleCellClick}
        />
      )}
      {data.status === 'ready' && viewMode === 'month' && (
        <MonthHeatmap
          slots={todaySlots}
          days={monthRange.days}
          today={today}
          stats={data.stats}
          onShowDetail={setDetailHabit}
          onMarkCell={handleCellClick}
          loading={false}
          error={null}
        />
      )}

      {mutationError && (
        <div className="mt-3 rounded-xl border border-red-800/50 bg-red-950/30 text-red-400 text-sm px-4 py-2">
          {mutationError}
        </div>
      )}

      {user && (
        <HabitPickerSheet
          open={pickerSlot !== null || editingHabit !== null}
          slotIndex={pickerSlot}
          editingHabit={editingHabit}
          onClose={() => {
            setPickerSlot(null);
            setEditingHabit(null);
          }}
          onSubmit={async (input) => {
            if (editingHabit) {
              await data.updateHabit({ habitId: editingHabit.id, input });
            } else if (pickerSlot !== null) {
              await data.createHabit({ slotIndex: pickerSlot, input });
            }
          }}
        />
      )}

      {user && (
        <HabitDetailSheet
          open={detailHabit !== null}
          habit={detailHabit}
          stats={
            detailHabit && data.stats
              ? data.stats.byHabit.get(detailHabit.id) ?? null
              : null
          }
          onClose={() => setDetailHabit(null)}
          onEdit={() => {
            if (!detailHabit) return;
            const h = detailHabit;
            setDetailHabit(null);
            setEditingHabit(h);
          }}
          onArchive={async () => {
            if (!detailHabit) return;
            await data.archiveHabit(detailHabit.id);
          }}
        />
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// NavBar — generic left/right nav with a label, used for week and month views.
// ----------------------------------------------------------------------------
function NavBar({
  onPrev,
  onNext,
  canNext,
  mainLabel,
  subLabel,
  prevAriaLabel,
  nextAriaLabel,
}: {
  onPrev: () => void;
  onNext: () => void;
  canNext: boolean;
  mainLabel: string;
  subLabel: string;
  prevAriaLabel: string;
  nextAriaLabel: string;
}) {
  return (
    <div className="flex-1 rounded-2xl border border-surface-border bg-surface-card flex items-center justify-between px-1 py-1.5">
      <button
        type="button"
        onClick={onPrev}
        className="p-1.5 text-ink-300 hover:text-ink-100"
        aria-label={prevAriaLabel}
      >
        <ChevronRight size={18} />
      </button>
      <div className="text-center leading-tight">
        <div className="text-sm font-semibold">{mainLabel}</div>
        <div className="text-[10px] text-ink-300 mt-0.5">{subLabel}</div>
      </div>
      <button
        type="button"
        onClick={() => canNext && onNext()}
        disabled={!canNext}
        className="p-1.5 text-ink-300 hover:text-ink-100 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label={nextAriaLabel}
      >
        <ChevronLeft size={18} />
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// HabitsList — header row of day labels + one row per filled slot. (Week view)
// ----------------------------------------------------------------------------
function HabitsList({
  slots,
  days,
  today,
  rangeStart,
  rangeEnd,
  stats,
  onShowDetail,
  onMarkCell,
}: {
  slots: SlotView[];
  days: Date[];
  today: Date;
  rangeStart: Date;
  rangeEnd: Date;
  stats: UserStats | null;
  onShowDetail: (habit: Habit) => void;
  onMarkCell: (
    habit: Habit,
    date: string,
    currentMark: LogStatus | undefined,
    currentAmount: number | null | undefined,
  ) => void;
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
          onShowDetail={() => onShowDetail(slot.habit!)}
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

// ----------------------------------------------------------------------------
// HabitRow — one habit (week view). Tinted green when weekly target hit.
// ----------------------------------------------------------------------------
function HabitRow({
  slot,
  days,
  today,
  score,
  effectiveFor,
  onShowDetail,
  onMarkCell,
}: {
  slot: SlotView;
  days: Date[];
  today: Date;
  score: number;
  effectiveFor: (dateStr: string) => LogStatus | undefined;
  onShowDetail: () => void;
  onMarkCell: (
    habit: Habit,
    date: string,
    currentMark: LogStatus | undefined,
    currentAmount: number | null | undefined,
  ) => void;
}) {
  const habit = slot.habit!;
  const iconBg =
    habit.type === 'positive' ? 'bg-forest-500/15' : 'bg-red-500/15';
  const scoreColor =
    score > 0 ? 'text-forest-500' : score < 0 ? 'text-red-500' : 'text-ink-500';

  const weeklyCompletions = days.reduce((acc, d) => {
    const dateStr = toDateString(d);
    const m = effectiveFor(dateStr) ?? slot.marks[dateStr];
    return m === 'V' ? acc + 1 : acc;
  }, 0);
  const isWeekly = habit.frequency_period === 'weekly';
  const weekGoalHit = isWeekly && weeklyCompletions >= habit.frequency_target;

  const rowClasses = weekGoalHit
    ? 'bg-forest-500/10 border-forest-500/30'
    : 'bg-surface-card border-surface-border';

  return (
    <div
      className={`rounded-2xl border grid grid-cols-[1fr_repeat(7,32px)] gap-1 items-center px-3 py-2.5 transition-colors ${rowClasses}`}
    >
      <button
        type="button"
        onClick={onShowDetail}
        className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity text-right"
        aria-label="פרטי הרגל"
      >
        <span
          className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}
          style={{ color: habit.color }}
        >
          <HabitIcon name={habit.icon} size={20} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink-100 truncate">
            {habit.name}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] leading-tight">
            <span className={scoreColor}>
              {score > 0 ? `+${score}` : score}
            </span>
            {isWeekly && (
              <span
                className={`text-[10px] ${
                  weekGoalHit ? 'text-forest-500' : 'text-ink-500'
                }`}
              >
                · {weeklyCompletions}/{habit.frequency_target} השבוע
              </span>
            )}
          </div>
        </div>
      </button>

      {days.map((d, i) => {
        const isToday = isSameDay(d, today);
        const future = isFuture(d, today);
        const dateStr = toDateString(d);
        const effective = effectiveFor(dateStr);
        const mark = effective ?? slot.marks[dateStr];
        const amount = slot.amounts[dateStr] ?? null;
        return (
          <DayCell
            key={i}
            habit={habit}
            mark={mark}
            amount={amount}
            isToday={isToday}
            disabled={future}
            onClick={() => onMarkCell(habit, dateStr, mark, amount)}
          />
        );
      })}
    </div>
  );
}

function DayCell({
  habit,
  mark,
  amount,
  isToday,
  disabled,
  onClick,
}: {
  habit: Habit;
  mark: LogStatus | undefined;
  amount: number | null;
  isToday: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const isQuant = habit.is_quantitative;
  const target = habit.quantitative_target ?? 0;

  let style: React.CSSProperties | undefined;
  let extraClass = '';
  if (isQuant && amount && amount > 0) {
    const reached = amount >= target;
    style = {
      backgroundColor: hexWithAlpha(habit.color, reached ? 0.35 : 0.18),
      borderColor: hexWithAlpha(habit.color, reached ? 0.7 : 0.4),
      color: habit.color,
    };
    extraClass = 'border';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full aspect-square rounded-md flex items-center justify-center transition-colors ${
        isQuant && amount && amount > 0
          ? extraClass
          : binaryCellBg(mark, isToday)
      } ${disabled ? 'opacity-30 cursor-not-allowed' : 'hover:brightness-110'}`}
      style={style}
      aria-label="סמן יום"
    >
      {isQuant && amount && amount > 0 ? (
        <span
          className={`text-[11px] leading-none ${
            amount >= target ? 'font-bold' : 'font-medium'
          }`}
        >
          {amount}
        </span>
      ) : (
        <MarkGlyph mark={mark} />
      )}
    </button>
  );
}

function binaryCellBg(mark: LogStatus | undefined, isToday: boolean): string {
  if (mark === 'V') return 'bg-forest-500/25 border border-forest-500/50';
  if (mark === 'X') return 'bg-red-500/20 border border-red-500/50';
  if (mark === 'auto_x') return 'bg-red-500/10 border border-red-500/30';
  return isToday
    ? 'bg-ink-300/20 border border-ink-300/50'
    : 'bg-ink-300/10 border border-ink-300/25';
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

// ----------------------------------------------------------------------------
// MonthHeatmap — month view. One compact strip of cells per active habit.
// Cells are 8px squares colored by status / amount.
// ----------------------------------------------------------------------------
function MonthHeatmap({
  slots,
  days,
  today,
  stats,
  onShowDetail,
  onMarkCell,
  loading,
  error,
}: {
  slots: SlotView[];
  days: Date[];
  today: Date;
  stats: UserStats | null;
  onShowDetail: (habit: Habit) => void;
  onMarkCell: (
    habit: Habit,
    date: string,
    currentMark: LogStatus | undefined,
    currentAmount: number | null | undefined,
  ) => void;
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-800/50 bg-red-950/30 text-red-400 text-sm px-4 py-3">
        שגיאה: {error}
      </div>
    );
  }
  if (loading) {
    return <div className="text-sm text-ink-300 py-8 text-center">טוען…</div>;
  }
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
      {filledSlots.map((slot) => (
        <MonthHabitRow
          key={slot.slot_index}
          slot={slot}
          days={days}
          today={today}
          habitStats={stats?.byHabit.get(slot.habit!.id) ?? null}
          onShowDetail={() => onShowDetail(slot.habit!)}
          onMarkCell={onMarkCell}
        />
      ))}
    </div>
  );
}

function MonthHabitRow({
  slot,
  days,
  today,
  habitStats,
  onShowDetail,
  onMarkCell,
}: {
  slot: SlotView;
  days: Date[];
  today: Date;
  habitStats: HabitScoreResult | null;
  onShowDetail: () => void;
  onMarkCell: (
    habit: Habit,
    date: string,
    currentMark: LogStatus | undefined,
    currentAmount: number | null | undefined,
  ) => void;
}) {
  const habit = slot.habit!;
  const iconBg =
    habit.type === 'positive' ? 'bg-forest-500/15' : 'bg-red-500/15';

  // Count Vs in the visible month.
  const monthCompletions = days.reduce((acc, d) => {
    const dateStr = toDateString(d);
    const s = habitStats?.effectiveByDate.get(dateStr);
    return s === 'V' ? acc + 1 : acc;
  }, 0);

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card px-3 py-2.5">
      <button
        type="button"
        onClick={onShowDetail}
        className="w-full flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity text-right mb-2"
        aria-label="פרטי הרגל"
      >
        <span
          className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}
          style={{ color: habit.color }}
        >
          <HabitIcon name={habit.icon} size={20} strokeWidth={1.8} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink-100 truncate">
            {habit.name}
          </div>
          <div className="text-[10px] text-ink-500">
            {monthCompletions}/{days.length} ימים
          </div>
        </div>
      </button>

      <div
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map((d, i) => {
          const future = isFuture(d, today);
          const isToday = isSameDay(d, today);
          const dateStr = toDateString(d);
          const sFromStats = habitStats?.effectiveByDate.get(dateStr);
          const mark: LogStatus | undefined =
            sFromStats && sFromStats !== 'blank' ? sFromStats : undefined;
          const amount = slot.amounts[dateStr] ?? null;
          return (
            <MonthCell
              key={i}
              habit={habit}
              mark={mark}
              amount={amount}
              isToday={isToday}
              future={future}
              onClick={() =>
                !future && onMarkCell(habit, dateStr, mark, amount)
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function MonthCell({
  habit,
  mark,
  amount,
  isToday,
  future,
  onClick,
}: {
  habit: Habit;
  mark: LogStatus | undefined;
  amount: number | null;
  isToday: boolean;
  future: boolean;
  onClick: () => void;
}) {
  let bg = 'rgba(255,255,255,0.04)';
  let border = isToday ? 'rgba(212,232,218,0.4)' : 'transparent';
  if (habit.is_quantitative && amount && amount > 0) {
    const target = habit.quantitative_target ?? 10;
    const intensity = Math.min(1, amount / target);
    bg = hexWithAlpha(habit.color, 0.25 + intensity * 0.6);
  } else if (mark === 'V') {
    bg = hexWithAlpha(habit.color, 0.85);
  } else if (mark === 'X') {
    bg = 'rgba(239,68,68,0.55)';
  } else if (mark === 'auto_x') {
    bg = 'rgba(239,68,68,0.25)';
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={future}
      className={`aspect-square rounded-[2px] transition-opacity ${
        future ? 'opacity-25 cursor-not-allowed' : 'hover:brightness-125'
      }`}
      style={{
        backgroundColor: bg,
        border: `1px solid ${border}`,
      }}
      aria-label="יום"
    />
  );
}

// Mix a hex color with an alpha to produce an `rgba(...)` string usable by
// inline styles. Accepts "#rrggbb"; ignores any other format.
function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
