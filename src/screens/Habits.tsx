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
import { SLOT_INDEXES, type SlotView } from '../features/habits/types';
import { HabitIcon } from '../features/habits/HabitIcon';

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

  const week = useWeekView(user?.id ?? null, range);

  // TODO(scoring): wire up real TOTAL SCORE once logs/scoring are implemented.
  const totalScorePlaceholder = 0;

  return (
    <section className="text-forest-700">
      {/* Header */}
      <header className="mb-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setAnchor(addWeeks(anchor, -1))}
            className="p-2 -mr-2 text-forest-700/70 hover:text-forest-700"
            aria-label="שבוע קודם"
          >
            <ChevronRight size={22} />
          </button>
          <div className="text-center leading-tight">
            <div className="text-lg font-semibold">
              {relativeWeekLabel(anchor, today)}
            </div>
            <div className="text-xs text-forest-700/60 mt-0.5">
              {formatRangeShort(range)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => canGoNext && setAnchor(addWeeks(anchor, 1))}
            disabled={!canGoNext}
            className="p-2 -ml-2 text-forest-700/70 hover:text-forest-700 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="שבוע הבא"
          >
            <ChevronLeft size={22} />
          </button>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-forest-700/50">
              TOTAL SCORE
            </div>
            <div className="text-4xl font-bold text-forest-700 leading-none mt-1">
              {totalScorePlaceholder}
            </div>
          </div>
        </div>
      </header>

      {/* Table */}
      {week.status === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 text-red-700 text-sm px-4 py-3">
          שגיאה: {week.error}
        </div>
      )}

      {week.status === 'loading' && (
        <div className="text-sm text-forest-700/50 py-8 text-center">טוען…</div>
      )}

      {week.status === 'ready' && (
        <WeekTable slots={week.slots} days={range.days} today={today} />
      )}
    </section>
  );
}

function WeekTable({
  slots,
  days,
  today,
}: {
  slots: SlotView[];
  days: Date[];
  today: Date;
}) {
  return (
    <div className="rounded-2xl border border-forest-100 bg-white overflow-hidden shadow-sm">
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="bg-forest-50/60">
            <th className="w-12 py-2 text-center font-normal text-forest-700/50 text-[11px]">
              יום
            </th>
            {SLOT_INDEXES.map((s) => {
              const slot = slots.find((x) => x.slot_index === s);
              return (
                <th
                  key={s}
                  className="py-2 px-1 font-normal align-bottom"
                >
                  <SlotHeader slot={slot} />
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
                className={`border-t border-forest-100/70 ${
                  isToday ? 'bg-forest-50/40' : ''
                }`}
              >
                <td className="text-center py-3 text-forest-700/70">
                  <div className="flex flex-col items-center leading-tight">
                    <span
                      className={`text-[13px] ${
                        isToday ? 'font-bold text-forest-700' : ''
                      }`}
                    >
                      {hebrewDayShort(d)}
                    </span>
                    <span className="text-[10px] text-forest-700/50">
                      {d.getDate()}
                    </span>
                  </div>
                </td>
                {SLOT_INDEXES.map((s) => {
                  const slot = slots.find((x) => x.slot_index === s);
                  const mark = slot?.marks[toDateString(d)];
                  return (
                    <td
                      key={s}
                      className={`text-center py-3 align-middle ${
                        future ? 'opacity-30' : ''
                      }`}
                    >
                      <MarkCell mark={mark} hasHabit={!!slot?.habit} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* Per-habit score row (placeholder until scoring is wired) */}
          <tr className="border-t-2 border-forest-100 bg-forest-50/40">
            <td className="text-center py-2 text-[10px] text-forest-700/50 uppercase tracking-wider">
              נקודות
            </td>
            {SLOT_INDEXES.map((s) => (
              <td key={s} className="text-center py-2 text-sm text-forest-700/70">
                —
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SlotHeader({ slot }: { slot: SlotView | undefined }) {
  if (!slot?.habit) {
    return (
      <button
        type="button"
        className="w-full flex flex-col items-center gap-1 text-forest-700/40 hover:text-forest-700 transition-colors"
        aria-label="בחר הרגל"
        // TODO(habit-picker): open picker
      >
        <span className="w-9 h-9 rounded-full border border-dashed border-forest-700/30 flex items-center justify-center">
          <Plus size={16} strokeWidth={1.7} />
        </span>
        <span className="text-[10px]">סלוט</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="w-full flex flex-col items-center gap-1 text-forest-700"
      // TODO(habit-picker): open picker to swap habit
    >
      <span className="w-9 h-9 rounded-full bg-forest-50 flex items-center justify-center">
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
  if (!hasHabit) return <span className="text-forest-700/20">·</span>;
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
  return <span className="text-forest-700/30 text-base">–</span>;
}
