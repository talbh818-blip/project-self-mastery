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
      {/* Header */}
      <header className="mb-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setAnchor(addWeeks(anchor, -1))}
            className="p-2 -mr-2 text-ink-300 hover:text-ink-100"
            aria-label="שבוע קודם"
          >
            <ChevronRight size={22} />
          </button>
          <div className="text-center leading-tight">
            <div className="text-lg font-semibold">
              {relativeWeekLabel(anchor, today)}
            </div>
            <div className="text-xs text-ink-300 mt-0.5">
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
            <ChevronLeft size={22} />
          </button>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-500">
              TOTAL SCORE
            </div>
            <div className="text-4xl font-bold text-ink-100 leading-none mt-1">
              {totalScore}
            </div>
          </div>
        </div>
      </header>

      {/* Table */}
      {week.status === 'error' && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 text-red-400 text-sm px-4 py-3">
          שגיאה: {week.error}
        </div>
      )}

      {week.status === 'loading' && (
        <div className="text-sm text-ink-300 py-8 text-center">טוען…</div>
      )}

      {week.status === 'ready' && (
        <WeekTable
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

function WeekTable({
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
  // For each slot, prefer the "effective" status from scoring (which includes
  // virtual auto_x for past blank days). Fall back to raw marks if stats not loaded.
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
    <div className="rounded-2xl border border-surface-border bg-surface-card overflow-hidden shadow-sm">
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="bg-surface-raised/40">
            <th className="w-12 py-2 text-center font-normal text-ink-500 text-[11px]">
              יום
            </th>
            {SLOT_INDEXES.map((s) => {
              const slot = slots.find((x) => x.slot_index === s);
              return (
                <th
                  key={s}
                  className="py-2 px-1 font-normal align-bottom"
                >
                  <SlotHeader slot={slot} onClick={() => onPickSlot(s)} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {days.map((d, idx) => {
            const isToday = isSameDay(d, today);
            const future = isFuture(d, today);
            return (
              <tr
                key={idx}
                className={`border-t border-surface-border/50 ${
                  isToday ? 'bg-surface-raised/30' : ''
                }`}
              >
                <td className="text-center py-3 text-ink-300">
                  <div className="flex flex-col items-center leading-tight">
                    <span
                      className={`text-[13px] ${
                        isToday ? 'font-bold text-ink-100' : ''
                      }`}
                    >
                      {hebrewDayShort(d)}
                    </span>
                    <span className="text-[10px] text-ink-500">
                      {d.getDate()}
                    </span>
                  </div>
                </td>
                {SLOT_INDEXES.map((s) => {
                  const slot = slots.find((x) => x.slot_index === s);
                  const dateStr = toDateString(d);
                  // Use effective (scoring) status when available so virtual
                  // auto_x renders properly; fall back to raw mark otherwise.
                  const effective = slot?.habit
                    ? effectiveFor(slot.habit.id, dateStr)
                    : undefined;
                  const mark = effective ?? slot?.marks[dateStr];
                  const clickable = !future && !!slot?.habit;
                  return (
                    <td
                      key={s}
                      className={`text-center py-1 align-middle ${
                        future ? 'opacity-30' : ''
                      }`}
                    >
                      {clickable ? (
                        <button
                          type="button"
                          onClick={() =>
                            slot?.habit &&
                            onMarkCell(slot.habit.id, dateStr, mark)
                          }
                          className="w-9 h-9 rounded-lg hover:bg-surface-raised transition-colors flex items-center justify-center mx-auto"
                          aria-label="סמן יום"
                        >
                          <MarkCell mark={mark} hasHabit={true} />
                        </button>
                      ) : (
                        <span className="inline-flex w-9 h-9 items-center justify-center">
                          <MarkCell mark={mark} hasHabit={!!slot?.habit} />
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* Per-habit weekly score */}
          <tr className="border-t-2 border-surface-border bg-surface-raised/30">
            <td className="text-center py-2 text-[10px] text-ink-500 uppercase tracking-wider">
              נקודות
            </td>
            {SLOT_INDEXES.map((s) => {
              const slot = slots.find((x) => x.slot_index === s);
              const score = slot?.habit ? weekScoreFor(slot.habit.id) : null;
              return (
                <td key={s} className="text-center py-2 text-sm font-medium">
                  {score === null ? (
                    <span className="text-ink-500/50">—</span>
                  ) : (
                    <span
                      className={
                        score > 0
                          ? 'text-forest-500'
                          : score < 0
                          ? 'text-red-500'
                          : 'text-ink-500'
                      }
                    >
                      {score > 0 ? `+${score}` : score}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SlotHeader({
  slot,
  onClick,
}: {
  slot: SlotView | undefined;
  onClick: () => void;
}) {
  if (!slot?.habit) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full flex flex-col items-center gap-1 text-ink-300/50 hover:text-ink-100 transition-colors"
        aria-label="בחר הרגל"
      >
        <span className="w-9 h-9 rounded-full border border-dashed border-ink-300/30 flex items-center justify-center">
          <Plus size={16} strokeWidth={1.7} />
        </span>
        <span className="text-[10px]">סלוט</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex flex-col items-center gap-1 text-ink-100 hover:opacity-80 transition-opacity"
    >
      <span className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center">
        <HabitIcon name={slot.habit.icon} size={18} strokeWidth={1.8} />
      </span>
      <span className="text-[10px] truncate max-w-[64px]" title={slot.habit.name}>
        {slot.habit.name}
      </span>
    </button>
  );
}

function MarkCell({
  mark,
  hasHabit,
}: {
  mark: 'V' | 'X' | 'auto_x' | undefined;
  hasHabit: boolean;
}) {
  if (!hasHabit) return <span className="text-ink-500/50">·</span>;
  if (mark === 'V')
    return <span className="text-forest-500 font-bold text-lg leading-none">✓</span>;
  if (mark === 'X' || mark === 'auto_x')
    return (
      <span
        className={`font-bold text-lg leading-none ${
          mark === 'auto_x' ? 'text-red-400' : 'text-red-500'
        }`}
      >
        ✕
      </span>
    );
  return <span className="text-ink-500/50 text-base">–</span>;
}
