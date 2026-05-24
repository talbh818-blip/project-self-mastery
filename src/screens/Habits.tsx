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
  // Furthest week the user is allowed to navigate to is the week containing "tomorrow".
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

  // refreshKey bumps when an assignment changes, forcing both queries to refetch.
  const [refreshKey, setRefreshKey] = useState(0);
  const week = useWeekView(user?.id ?? null, range, refreshKey);
  const userStats = useUserStats(user?.id ?? null, refreshKey);

  // Picker state — which slot is currently being edited.
  const [pickerSlot, setPickerSlot] = useState<SlotIndex | null>(null);

  // Mutation error (cell save). Shown as a toast under the table.
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

  return (
    <section className="text-ink-100">
      {/* TOTAL SCORE box */}
      <div className="mb-4 rounded-2xl border border-surface-border bg-surface-card px-4 py-3 flex items-center justify-between">
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

      {/* Week nav */}
      <header className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setAnchor(addWeeks(anchor, -1))}
          className="p-2 -mr-2 text-ink-300 hover:text-ink-100"
          aria-label="שבוע קודם"
        >
          <ChevronRight size={20} />
        </button>
        <div className="text-center leading-tight">
          <div className="text-base font-semibold">
            {relativeWeekLabel(anchor, today)}
          </div>
          <div className="text-[11px] text-ink-300 mt-0.5">
            {formatRangeShort(range)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => canGoNext && setAnchor(addWeeks(anchor, 1))}
          disabled={!canGoNext}
          className="p-2 -ml-2 text-ink-300 hover:text-ink-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="שבוע הבא"
        >
          <ChevronLeft size={20} />
        </button>
      </header>

      {/* Habits list */}
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

  return (
    <div className="flex flex-col gap-2.5">
      {SLOT_INDEXES.map((s) => {
        const slot = slots.find((x) => x.slot_index === s);
        if (!slot?.habit) {
          return <EmptySlotRow key={s} onClick={() => onPickSlot(s)} />;
        }
        return (
          <HabitRow
            key={s}
            slot={slot}
            days={days}
            today={today}
            score={weekScoreFor(slot.habit.id)}
            effectiveFor={(date) => effectiveFor(slot.habit!.id, date)}
            onPickSlot={() => onPickSlot(s)}
            onMarkCell={onMarkCell}
          />
        );
      })}
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
  const scoreColor =
    score > 0 ? 'text-forest-500' : score < 0 ? 'text-red-500' : 'text-ink-500';
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card px-3 py-3">
      <div className="flex items-center justify-between mb-2.5">
        <button
          type="button"
          onClick={onPickSlot}
          className="flex items-center gap-2.5 min-w-0 hover:opacity-80 transition-opacity"
          aria-label="ערוך הרגל"
        >
          <span className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center shrink-0">
            <HabitIcon name={habit.icon} size={18} strokeWidth={1.8} />
          </span>
          <span className="text-sm font-medium text-ink-100 truncate">
            {habit.name}
          </span>
        </button>
        <span className={`text-sm font-semibold shrink-0 ms-2 ${scoreColor}`}>
          {score > 0 ? `+${score}` : score}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, idx) => {
          const isToday = isSameDay(d, today);
          const future = isFuture(d, today);
          const dateStr = toDateString(d);
          const effective = effectiveFor(dateStr);
          const mark = effective ?? slot.marks[dateStr];
          return (
            <DayCell
              key={idx}
              day={d}
              mark={mark}
              isToday={isToday}
              disabled={future}
              onClick={() => onMarkCell(habit.id, dateStr, mark)}
            />
          );
        })}
      </div>
    </div>
  );
}

function EmptySlotRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-dashed border-surface-border bg-surface-card/40 px-3 py-4 flex items-center justify-center gap-2 text-ink-300 hover:text-ink-100 hover:bg-surface-card/70 transition-colors"
      aria-label="בחר הרגל"
    >
      <Plus size={16} strokeWidth={1.8} />
      <span className="text-sm">הוסף הרגל</span>
    </button>
  );
}

function DayCell({
  day,
  mark,
  isToday,
  disabled,
  onClick,
}: {
  day: Date;
  mark: LogStatus | undefined;
  isToday: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const label = hebrewDayShort(day);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 ${
        disabled ? 'opacity-30 cursor-not-allowed' : ''
      }`}
      aria-label={`סמן ${label}`}
    >
      <span
        className={`text-[10px] ${
          isToday ? 'text-ink-100 font-bold' : 'text-ink-500'
        }`}
      >
        {label}
      </span>
      <span
        className={`w-full aspect-square rounded-md flex items-center justify-center transition-colors ${cellBg(
          mark,
          isToday,
        )} ${!disabled ? 'hover:brightness-110' : ''}`}
      >
        <MarkGlyph mark={mark} />
      </span>
    </button>
  );
}

function cellBg(mark: LogStatus | undefined, isToday: boolean): string {
  if (mark === 'V') return 'bg-forest-500/20 border border-forest-500/40';
  if (mark === 'X') return 'bg-red-500/15 border border-red-500/40';
  if (mark === 'auto_x') return 'bg-red-500/10 border border-red-500/30';
  return isToday
    ? 'bg-surface-raised border border-ink-300/30'
    : 'bg-surface-raised/60 border border-surface-border';
}

function MarkGlyph({ mark }: { mark: LogStatus | undefined }) {
  if (mark === 'V')
    return <span className="text-forest-500 font-bold text-base leading-none">✓</span>;
  if (mark === 'X')
    return <span className="text-red-500 font-bold text-base leading-none">✕</span>;
  if (mark === 'auto_x')
    return <span className="text-red-400 font-bold text-base leading-none">✕</span>;
  return <span className="text-ink-500/40 text-xs leading-none">–</span>;
}
