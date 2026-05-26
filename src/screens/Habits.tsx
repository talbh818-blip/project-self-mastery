import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  Plus,
  Rows3,
} from 'lucide-react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { ArchiveSheet } from '../features/habits/ArchiveSheet';
import {
  nextAmountInCycle,
  nextMarkInCycle,
} from '../features/habits/mutations';
import { useHabitData } from '../features/habits/useHabitData';
import {
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
  const [archiveOpen, setArchiveOpen] = useState(false);
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

  // Detect score deltas to drive the pop/float animation. We hold the
  // animation key on a ref so the FIRST render after load doesn't trigger
  // an animation (we treat the initial value as "no change").
  const prevScoreRef = useRef<number | null>(null);
  const [scoreAnim, setScoreAnim] = useState<{ key: number; delta: number } | null>(null);
  useEffect(() => {
    const prev = prevScoreRef.current;
    prevScoreRef.current = totalScore;
    if (prev === null) return; // skip first time
    if (totalScore === prev) return;
    const delta = totalScore - prev;
    const key = Date.now();
    setScoreAnim({ key, delta });
    const ms = delta > 0 ? 1150 : 950;
    const t = setTimeout(() => {
      setScoreAnim((cur) => (cur && cur.key === key ? null : cur));
    }, ms);
    return () => clearTimeout(t);
  }, [totalScore]);

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
      {/* Score — compact card, content right-aligned */}
      <div className="mb-3 rounded-2xl border border-surface-border bg-surface-card px-4 py-2 relative">
        <div className="flex items-center justify-start gap-3">
          <span className="text-4xl leading-none" aria-hidden="true">🔥</span>
          <div className="text-right">
            <div className="text-[10px] tracking-wide text-ink-100">ניקוד כולל</div>
            <span
              key={scoreAnim?.delta && scoreAnim.delta > 0 ? scoreAnim.key : 'static'}
              className={`text-2xl font-bold text-ink-100 leading-none tabular-nums inline-block ${
                scoreAnim && scoreAnim.delta > 0 ? 'animate-score-pop' : ''
              }`}
            >
              {totalScore}
            </span>
          </div>
        </div>

        {/* Floating delta */}
        {scoreAnim && (
          <span
            key={`delta-${scoreAnim.key}`}
            aria-hidden="true"
            className={`pointer-events-none absolute right-16 bottom-1 font-bold text-base tabular-nums ${
              scoreAnim.delta > 0
                ? 'text-forest-500 animate-score-float'
                : 'text-red-400 animate-score-flash-down'
            }`}
          >
            {scoreAnim.delta > 0 ? `+${scoreAnim.delta}` : scoreAnim.delta}
          </span>
        )}
      </div>

      {/* Action row: + הרגל | view toggle | archive | period nav.
          In RTL the DOM order maps right→left, so the + button is rightmost
          and the nav box flexes to fill the leftmost space. */}
      <div className="mb-4 flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => nextEmptySlot && setPickerSlot(nextEmptySlot)}
          disabled={!nextEmptySlot}
          className="rounded-2xl border border-surface-border bg-surface-card px-4 py-2 flex items-center gap-2 text-ink-100 hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="הוסף הרגל"
        >
          <span className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center">
            <Plus size={14} strokeWidth={3} />
          </span>
          <span className="text-base font-medium">הרגל</span>
        </button>

        {/* Archive button — sits immediately to the left of + הרגל in RTL. */}
        <button
          type="button"
          onClick={() => setArchiveOpen(true)}
          className="w-11 rounded-2xl border border-surface-border bg-surface-card flex items-center justify-center text-ink-300 hover:text-ink-100 hover:bg-surface-raised transition-colors"
          aria-label="ארכיון הרגלים"
          title="ארכיון"
        >
          <Archive size={18} strokeWidth={1.9} />
        </button>

        {/* View toggle (icons evoke the layout: rows for week, grid for month) */}
        <div className="flex items-center bg-surface-card border border-surface-border rounded-2xl p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('week')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
              viewMode === 'week'
                ? 'bg-forest-700 text-cream-50'
                : 'text-ink-300 hover:text-ink-100'
            }`}
            aria-label="תצוגה שבועית"
            title="שבועי"
          >
            <Rows3 size={18} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('month')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
              viewMode === 'month'
                ? 'bg-forest-700 text-cream-50'
                : 'text-ink-300 hover:text-ink-100'
            }`}
            aria-label="תצוגה חודשית"
            title="חודשי"
          >
            <LayoutGrid size={18} strokeWidth={1.9} />
          </button>
        </div>

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
          stats={data.stats}
          onShowDetail={setDetailHabit}
          onMarkCell={handleCellClick}
          onReorder={data.reorderHabits}
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
          onReorder={data.reorderHabits}
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

      <ArchiveSheet
        open={archiveOpen}
        habits={data.habits.filter((h) => h.archived_at !== null)}
        onClose={() => setArchiveOpen(false)}
        onRestore={async (id) => {
          await data.restoreHabit(id);
        }}
        onDelete={async (id) => {
          await data.deleteHabitPermanently(id);
        }}
      />
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
  stats,
  onShowDetail,
  onMarkCell,
  onReorder,
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
  onReorder: (orderedHabitIds: string[]) => Promise<void>;
}) {
  const effectiveFor = (habitId: string, dateStr: string): LogStatus | undefined => {
    const r = stats?.byHabit.get(habitId);
    if (!r) return undefined;
    const s = r.effectiveByDate.get(dateStr);
    if (s === 'blank' || s === undefined) return undefined;
    return s;
  };

  const filledSlots = SLOT_INDEXES.map((i) =>
    slots.find((s) => s.slot_index === i),
  ).filter((s): s is SlotView => !!s?.habit);

  // Single list, sorted by user-controlled sort_order. Positive and negative
  // habits are mixed together — the user can interleave them however they
  // want by dragging.
  const sortedSlots = [...filledSlots].sort(
    (a, b) => (a.habit!.sort_order ?? 0) - (b.habit!.sort_order ?? 0),
  );

  if (filledSlots.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-surface-border bg-surface-card/40 px-4 py-10 text-center text-ink-300 text-sm">
        עוד אין הרגלים. לחץ על "+ הרגל" למעלה כדי להתחיל.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Day labels header. Mirrors each habit row exactly so the labels
          line up with the day cells. RTL: first flex child renders on the
          right, so the 40px icon spacer is first and the 7-cell grid is
          second — spacer lands right, cells land left. */}
      <div className="flex items-end gap-2 px-3">
        <div className="w-12 shrink-0" aria-hidden="true" />
        <div className="flex-1 grid grid-cols-7 gap-1.5">
          {days.map((d, i) => (
            <DayHeader key={i} day={d} isToday={isSameDay(d, today)} />
          ))}
        </div>
      </div>

      <SortableHabitList
        slots={sortedSlots}
        onReorder={onReorder}
        renderRow={(slot, dragHandleRef, dragListeners) => (
          <HabitRow
            slot={slot}
            days={days}
            today={today}
            effectiveFor={(date) => effectiveFor(slot.habit!.id, date)}
            currentStreak={stats?.byHabit.get(slot.habit!.id)?.currentStreak ?? 0}
            onShowDetail={() => onShowDetail(slot.habit!)}
            onMarkCell={onMarkCell}
            dragHandleRef={dragHandleRef}
            dragListeners={dragListeners}
          />
        )}
      />
    </div>
  );
}

// Type aliases for the drag-handle render-prop threaded through SortableRow →
// SortableHabitList → HabitRow / MonthHabitRow.
type DragHandleRef = (el: HTMLElement | null) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DragHandleListeners = Record<string, any> | undefined;

// ----------------------------------------------------------------------------
// SortableHabitList — single SortableContext for all habits regardless of
// type. Long-press on the icon tile starts a drag; the rest of the row
// allows free vertical scrolling.
// ----------------------------------------------------------------------------
function SortableHabitList({
  slots,
  onReorder,
  renderRow,
}: {
  slots: SlotView[];
  onReorder: (orderedHabitIds: string[]) => Promise<void>;
  renderRow: (slot: SlotView, dragHandleRef: DragHandleRef, dragListeners: DragHandleListeners) => React.ReactNode;
}) {
  // Explicit Mouse + Touch sensors so drag works on both desktop and mobile.
  // The unified PointerSensor often misses touch activation on iOS Safari /
  // some Android browsers because the page's scroll handler eats the event
  // before the delay elapses. TouchSensor handles touch directly and pairs
  // nicely with `touch-action: none` on each draggable row.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      // Long-press to start drag on mobile. Wider tolerance because finger
      // touches naturally wobble a few px.
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = slots.findIndex((s) => s.habit!.id === active.id);
    const newIndex = slots.findIndex((s) => s.habit!.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(slots, oldIndex, newIndex);
    onReorder(reordered.map((s) => s.habit!.id)).catch(() => {
      /* error surfaces via mutationError in parent on next interaction */
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={slots.map((s) => s.habit!.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2.5">
          {slots.map((slot) => (
            <SortableRow key={slot.habit!.id} id={slot.habit!.id}>
              {(dragHandleRef, dragListeners) => renderRow(slot, dragHandleRef, dragListeners)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// Wraps a habit row with dnd-kit sortable bindings.
// Uses a render-prop so the drag handle (setActivatorNodeRef + listeners) can
// be forwarded to just the icon tile — keeping the rest of the row free for
// native touch scrolling.
function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (dragHandleRef: DragHandleRef, dragListeners: DragHandleListeners) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 'auto',
    // Allow free vertical scroll on the row. Only the icon tile (the actual
    // drag handle) will have touchAction:'none' to let dnd-kit intercept.
    touchAction: 'auto',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children(setActivatorNodeRef, listeners)}
    </div>
  );
}

function DayHeader({ day, isToday }: { day: Date; isToday: boolean }) {
  // Day label on top, date on bottom. Compact single-letter Hebrew letter
  // (א׳, ב׳, …) for normal days; the literal word "היום" replaces the letter
  // on today so it pops out at a glance.
  const label = isToday ? 'היום' : hebrewDayShort(day);
  if (isToday) {
    return (
      <div className="flex flex-col items-center justify-center leading-none py-1 rounded-md bg-ink-100/15 border border-ink-100/50 text-ink-100 font-bold">
        <span className="text-[10px]">{label}</span>
        <span className="text-[9px] mt-0.5">{day.getDate()}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center leading-none py-1 text-ink-300">
      <span className="text-[10px]">{label}</span>
      <span className="text-[9px] mt-0.5 opacity-90">{day.getDate()}</span>
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
  effectiveFor,
  currentStreak,
  onShowDetail,
  onMarkCell,
  dragHandleRef,
  dragListeners,
}: {
  slot: SlotView;
  days: Date[];
  today: Date;
  effectiveFor: (dateStr: string) => LogStatus | undefined;
  currentStreak: number;
  onShowDetail: () => void;
  onMarkCell: (
    habit: Habit,
    date: string,
    currentMark: LogStatus | undefined,
    currentAmount: number | null | undefined,
  ) => void;
  dragHandleRef?: DragHandleRef;
  dragListeners?: DragHandleListeners;
}) {
  const habit = slot.habit!;
  // Subtle color-tinted tile, icon always white for clean contrast.
  const iconTileStyle: React.CSSProperties = {
    backgroundColor: hexWithAlpha(habit.color, 0.12),
    color: 'white',
  };

  const weeklyCompletions = days.reduce((acc, d) => {
    const dateStr = toDateString(d);
    const m = effectiveFor(dateStr) ?? slot.marks[dateStr];
    return m === 'V' ? acc + 1 : acc;
  }, 0);
  const isWeekly = habit.frequency_period === 'weekly';

  return (
    <div className="relative rounded-2xl border border-surface-border bg-surface-card px-3 py-2.5">
      {/* Top row: icon (right in RTL) + 7 cells (left). Same baseline. */}
      <div className="flex items-center gap-2">
        {/* Icon tile — this is the DRAG HANDLE.
            ref + listeners restrict drag activation to this element so the
            rest of the row is free for native touch scrolling.
            touchAction:'none' lets dnd-kit intercept the long-press here. */}
        <button
          ref={dragHandleRef}
          type="button"
          onClick={onShowDetail}
          className="relative w-12 h-12 rounded-xl flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
          style={{ ...iconTileStyle, touchAction: 'none' }}
          aria-label="פרטי הרגל"
          {...dragListeners}
        >
          <HabitIcon name={habit.icon} size={26} strokeWidth={1.8} />
          {/* Difficulty dot — bottom-left corner of the tile */}
          <span
            className={`absolute bottom-1 left-1 w-1 h-1 rounded-full ${
              habit.difficulty === 'easy'
                ? 'bg-green-400'
                : habit.difficulty === 'medium'
                ? 'bg-yellow-400'
                : 'bg-red-500'
            }`}
          />
        </button>

        <div className="flex-1 grid grid-cols-7 gap-1.5">
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
      </div>

      {/* Bottom: habit name + type pill + weekly progress on a single line.
          The name truncates with ellipsis instead of wrapping. Type pill and
          progress stay shrink-0 so they're never cut. */}
      <button
        type="button"
        onClick={onShowDetail}
        className="mt-2 w-full flex items-center gap-1.5 min-w-0 text-right hover:opacity-80 transition-opacity"
        aria-label="פרטי הרגל"
      >
        <span className="text-sm font-medium text-ink-100 truncate min-w-0">
          {habit.name}
        </span>
        {/* Type pill */}
        <span
          className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${
            habit.type === 'positive'
              ? 'border-forest-500/60 text-forest-400'
              : 'border-red-500/60 text-red-400'
          }`}
        >
          {habit.type === 'positive' ? 'הרגל' : 'התמכרות'}
        </span>
        {/* Weekly frequency progress */}
        {isWeekly && (
          <span className="text-[10px] text-ink-100 shrink-0">
            · {weeklyCompletions}/{habit.frequency_target} השבוע
          </span>
        )}
        {/* Current streak — only when active */}
        {currentStreak > 0 && (
          <span className="shrink-0 text-[10px] text-amber-400">
            · 🔥 {currentStreak}
          </span>
        )}
      </button>
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

  // V (or any positive quantitative amount) → solid block of the habit's
  // color. Everything else (blank, X, auto_x) → muted empty tile. No glyphs.
  let style: React.CSSProperties;
  let content: React.ReactNode = null;
  if (isQuant && amount && amount > 0) {
    const reached = amount >= target;
    style = {
      backgroundColor: reached
        ? habit.color
        : hexWithAlpha(habit.color, 0.6),
    };
    content = (
      <span
        className={`text-[11px] leading-none text-cream-50 ${
          reached ? 'font-bold' : 'font-medium'
        }`}
      >
        {amount}
      </span>
    );
  } else if (mark === 'V') {
    // Full habit color — the screenshot's "filled square" look.
    style = { backgroundColor: habit.color };
  } else {
    // blank / X / auto_x — empty tile. Past blanks score as auto_x.
    style = isToday
      ? {
          backgroundColor: 'rgba(122,160,134,0.18)',
          border: '1px solid rgba(122,160,134,0.45)',
        }
      : {
          backgroundColor: hexWithAlpha(habit.color, 0.15),
        };
    // Past days (not today, not future) that were never marked get a
    // centered horizontal dash — signals the day was missed.
    if (!disabled && !isToday) {
      content = (
        <span
          style={{
            display: 'block',
            width: '55%',
            height: '2px',
            backgroundColor: 'rgba(255,255,255,0.5)',
            borderRadius: '1px',
          }}
        />
      );
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full aspect-square rounded-md flex items-center justify-center transition-colors ${
        disabled ? 'opacity-50 cursor-default' : 'hover:brightness-110'
      }`}
      style={style}
      aria-label="סמן יום"
    >
      {content}
    </button>
  );
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
  onReorder,
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
  onReorder: (orderedHabitIds: string[]) => Promise<void>;
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

  // Same sorting rules as week view — a single list ordered by sort_order.
  const sortedSlots = [...filledSlots].sort(
    (a, b) => (a.habit!.sort_order ?? 0) - (b.habit!.sort_order ?? 0),
  );

  if (filledSlots.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-surface-border bg-surface-card/40 px-4 py-10 text-center text-ink-300 text-sm">
        עוד אין הרגלים. לחץ על "+ הרגל" למעלה כדי להתחיל.
      </div>
    );
  }

  return (
    <SortableHabitList
      slots={sortedSlots}
      onReorder={onReorder}
      renderRow={(slot, dragHandleRef, dragListeners) => (
        <MonthHabitRow
          slot={slot}
          days={days}
          today={today}
          habitStats={stats?.byHabit.get(slot.habit!.id) ?? null}
          onShowDetail={() => onShowDetail(slot.habit!)}
          onMarkCell={onMarkCell}
          dragHandleRef={dragHandleRef}
          dragListeners={dragListeners}
        />
      )}
    />
  );
}

function MonthHabitRow({
  slot,
  days,
  today,
  habitStats,
  onShowDetail,
  onMarkCell,
  dragHandleRef,
  dragListeners,
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
  dragHandleRef?: DragHandleRef;
  dragListeners?: DragHandleListeners;
}) {
  const habit = slot.habit!;
  const iconTileStyle: React.CSSProperties = {
    backgroundColor: hexWithAlpha(habit.color, 0.12),
    color: 'white',
  };

  // Count Vs in the visible month.
  const monthCompletions = days.reduce((acc, d) => {
    const dateStr = toDateString(d);
    const s = habitStats?.effectiveByDate.get(dateStr);
    return s === 'V' ? acc + 1 : acc;
  }, 0);

  // Pull the same stat indicators the week view shows so the two layouts
  // feel like the same habit "card" in different orientations.
  const currentStreak = habitStats?.currentStreak ?? 0;

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card px-3 py-2.5">
      {/* Header: icon tile (drag handle) + name/info (detail tap) side by side */}
      <div className="flex items-center gap-2.5 mb-2">
        {/* Icon tile — DRAG HANDLE. touchAction:'none' lets dnd-kit intercept
            the long-press; a quick tap still fires onClick → opens detail. */}
        <button
          ref={dragHandleRef}
          type="button"
          onClick={onShowDetail}
          className="relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
          style={{ ...iconTileStyle, touchAction: 'none' }}
          aria-label="פרטי הרגל"
          {...dragListeners}
        >
          <HabitIcon name={habit.icon} size={24} strokeWidth={1.8} />
          {/* Difficulty dot — same position as the week view (bottom-left
              of the tile) */}
          <span
            className={`absolute bottom-1 left-1 w-1 h-1 rounded-full ${
              habit.difficulty === 'easy'
                ? 'bg-green-400'
                : habit.difficulty === 'medium'
                ? 'bg-yellow-400'
                : 'bg-red-500'
            }`}
          />
        </button>

        {/* Name + stats — tappable for detail, no drag */}
        <button
          type="button"
          onClick={onShowDetail}
          className="flex-1 min-w-0 text-right hover:opacity-80 transition-opacity"
          aria-label="פרטי הרגל"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium text-ink-100 truncate min-w-0">
              {habit.name}
            </span>
            {/* Type pill — matches the week view */}
            <span
              className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${
                habit.type === 'positive'
                  ? 'border-forest-500/60 text-forest-400'
                  : 'border-red-500/60 text-red-400'
              }`}
            >
              {habit.type === 'positive' ? 'הרגל' : 'התמכרות'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-ink-100 mt-0.5">
            <span>{monthCompletions}/{days.length} ימים</span>
            {/* Current streak — only when active, same look as the week view */}
            {currentStreak > 0 && (
              <span className="text-amber-400">· 🔥 {currentStreak}</span>
            )}
          </div>
        </button>
      </div>

      {/* Heatmap strip: small solid dots that span the full row width, RTL.
          No weekday alignment, no date labels — just color intensity, like
          HabitKit. 11 columns fit a full month in ≤3 rows. */}
      <div className="mt-1 grid grid-cols-11 gap-1" dir="rtl">
        {days.map((d, i) => {
          const future = isFuture(d, today);
          const isToday = isSameDay(d, today);
          const dateStr = toDateString(d);
          const sFromStats = habitStats?.effectiveByDate.get(dateStr);
          const mark: LogStatus | undefined =
            sFromStats && sFromStats !== 'blank' ? sFromStats : undefined;
          const amount = habitStats?.amountByDate.get(dateStr) ?? null;
          return (
            <MonthCell
              key={i}
              habit={habit}
              date={d}
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
  date,
  mark,
  amount,
  isToday,
  future,
  onClick,
}: {
  habit: Habit;
  date: Date;
  mark: LogStatus | undefined;
  amount: number | null;
  isToday: boolean;
  future: boolean;
  onClick: () => void;
}) {
  // Solid colored cell when marked, faint habit-color tint when empty.
  // X / auto_x render the same as a blank cell — past blanks already score
  // as auto_x, so the user doesn't need a visible "X" treatment.
  let bg = hexWithAlpha(habit.color, 0.08);
  if (habit.is_quantitative && amount && amount > 0) {
    const target = habit.quantitative_target ?? 10;
    const intensity = Math.min(1, amount / target);
    // Range 0.4–1.0 so even partial days read as a clear colored cell.
    bg =
      intensity >= 1
        ? habit.color
        : hexWithAlpha(habit.color, 0.4 + intensity * 0.55);
  } else if (mark === 'V') {
    bg = habit.color;
  }

  const border = isToday
    ? '1px solid rgba(212,232,218,0.6)'
    : '1px solid transparent';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={future}
      className={`aspect-square rounded-[4px] transition-opacity ${
        future ? 'opacity-25 cursor-default' : 'hover:brightness-110'
      }`}
      style={{ backgroundColor: bg, border }}
      aria-label={`יום ${date.getDate()}`}
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
