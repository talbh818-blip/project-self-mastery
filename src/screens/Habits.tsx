import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BarChart3,
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
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
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
import { TreeCard, YoungTree } from '../features/tree/TreeCard';
import { Emoji } from '../components/Emoji';

type ViewMode = 'week' | 'month' | 'data';
// Data dashboard time range. Drives every KPI / chart in the data view.
type DataRange = '7d' | '30d' | '365d';

const DATA_RANGE_DAYS: Record<DataRange, number> = {
  '7d': 7,
  '30d': 30,
  '365d': 365,
};
const DATA_RANGE_LABEL: Record<DataRange, string> = {
  '7d': 'השבוע',
  '30d': 'החודש',
  '365d': 'השנה',
};

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
  const [dataRange, setDataRange] = useState<DataRange>('30d');

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
      {/* Digital tree — score drives growth; watered on every V */}
      <TreeCard
        totalScore={totalScore}
        userId={user?.id ?? ''}
        scoreAnim={scoreAnim}
      />

      {/* Action row: + הרגל | view toggle | archive | period nav.
          In RTL the DOM order maps right→left, so the + button is rightmost
          and the nav box flexes to fill the leftmost space. */}
      <div className="mb-4 flex items-stretch gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => nextEmptySlot && setPickerSlot(nextEmptySlot)}
          disabled={!nextEmptySlot}
          className="rounded-2xl border border-surface-border bg-surface-card px-3 sm:px-4 py-2 flex items-center gap-1.5 sm:gap-2 text-ink-100 hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="הוסף הרגל"
        >
          <span className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center shrink-0">
            <Plus size={14} strokeWidth={3} />
          </span>
          <span className="text-base font-medium">הרגל</span>
        </button>

        {/* View toggle (icons evoke the layout: rows for week, grid for month) */}
        <div className="flex items-center bg-surface-card border border-surface-border rounded-2xl p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('week')}
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-colors ${
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
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-colors ${
              viewMode === 'month'
                ? 'bg-forest-700 text-cream-50'
                : 'text-ink-300 hover:text-ink-100'
            }`}
            aria-label="תצוגה חודשית"
            title="חודשי"
          >
            <LayoutGrid size={18} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('data')}
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-colors ${
              viewMode === 'data'
                ? 'bg-forest-700 text-cream-50'
                : 'text-ink-300 hover:text-ink-100'
            }`}
            aria-label="תצוגת נתונים"
            title="נתונים"
          >
            <BarChart3 size={18} strokeWidth={1.9} />
          </button>
        </div>

        {viewMode === 'week' && (
          <NavBar
            onPrev={() => setWeekAnchor(addWeeks(weekAnchor, -1))}
            onNext={() => canGoNextWeek && setWeekAnchor(addWeeks(weekAnchor, 1))}
            canNext={canGoNextWeek}
            mainLabel={relativeWeekLabel(weekAnchor, today)}
            subLabel={formatRangeShort(weekRange)}
            prevAriaLabel="שבוע קודם"
            nextAriaLabel="שבוע הבא"
          />
        )}
        {viewMode === 'month' && (
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
        {viewMode === 'data' && (() => {
          // Reuse the NavBar shape (chevrons + centered label) so the toolbar
          // height stays stable across modes. Right arrow widens the range,
          // left arrow narrows it. Disabled at the endpoints.
          const order: DataRange[] = ['7d', '30d', '365d'];
          const idx = order.indexOf(dataRange);
          const canWiden = idx < order.length - 1;
          const canNarrow = idx > 0;
          return (
            <NavBar
              onPrev={() => canWiden && setDataRange(order[idx + 1])}
              onNext={() => canNarrow && setDataRange(order[idx - 1])}
              canPrev={canWiden}
              canNext={canNarrow}
              mainLabel={DATA_RANGE_LABEL[dataRange]}
              subLabel={`${DATA_RANGE_DAYS[dataRange]} ימים אחרונים`}
              prevAriaLabel="טווח רחב יותר"
              nextAriaLabel="טווח צר יותר"
            />
          );
        })()}
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
          onOpenArchive={() => setArchiveOpen(true)}
          onArchiveHabit={data.archiveHabit}
        />
      )}
      {data.status === 'ready' && viewMode === 'data' && (
        <DataView
          slots={todaySlots}
          stats={data.stats}
          range={dataRange}
          today={today}
          userId={user?.id ?? ''}
          onShowDetail={setDetailHabit}
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
  canPrev = true,
  canNext,
  mainLabel,
  subLabel,
  prevAriaLabel,
  nextAriaLabel,
}: {
  onPrev: () => void;
  onNext: () => void;
  canPrev?: boolean;
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
        onClick={() => canPrev && onPrev()}
        disabled={!canPrev}
        className="p-1.5 text-ink-300 hover:text-ink-100 disabled:opacity-30 disabled:cursor-not-allowed"
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
  onOpenArchive,
  onArchiveHabit,
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
  onOpenArchive: () => void;
  onArchiveHabit: (habitId: string) => Promise<void>;
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
      <SortableHabitList
        slots={sortedSlots}
        onReorder={onReorder}
        onArchive={onArchiveHabit}
        archiveZone={
          // Day-labels header — lives INSIDE the DndContext so the
          // ArchiveDropZone droppable registers correctly.
          {/* Outer layout uses CSS Grid (not flex) so the icon column and
              the 7-day column align identically across the day-headers row
              and every habit row below, no matter what RTL/flex quirks the
              browser applies. */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2 px-2 sm:px-3 mb-2.5">
            <ArchiveDropZone onClick={onOpenArchive} />
            <div
              className="grid gap-1 sm:gap-2"
              style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
            >
              {days.map((d, i) => (
                <DayHeader key={i} day={d} isToday={isSameDay(d, today)} />
              ))}
            </div>
          </div>
        }
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

// Droppable id used by the archive-on-drag flow. Anything dropped onto a
// dnd-kit droppable with this id is treated as an archive request.
const ARCHIVE_DROP_ID = 'archive-zone';

// Custom collision detection: prefer the archive zone whenever the user's
// pointer/finger is actually over it. Otherwise fall back to closestCenter
// (the dnd-kit default for vertical sortable lists).
//
// Why: `closestCenter` measures from the dragged ITEM's center, so a tall
// habit row only "collides" with the small archive icon when its center
// has been dragged all the way past it — basically requiring the user to
// pull the whole row up to the top of the screen. `pointerWithin` is what
// matches user intuition ("my finger is on the icon → it's selected") but
// it returns nothing once the pointer leaves any droppable, which would
// break the reorder behavior between rows. We use `pointerWithin` only as
// a priority filter for the archive zone, and let `closestCenter` handle
// the row-to-row reorder logic everywhere else.
const hybridCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const archiveHit = pointerHits.find((c) => c.id === ARCHIVE_DROP_ID);
  if (archiveHit) return [archiveHit];
  return closestCenter(args);
};

// ----------------------------------------------------------------------------
// ArchiveDropZone — the archive icon button, but ALSO a dnd-kit droppable.
// Clicking it opens the ArchiveSheet (browse archived habits); dragging a
// habit onto it archives the habit. While a drag hovers over it, the icon
// turns red so the user sees the drop target light up.
// ----------------------------------------------------------------------------
function ArchiveDropZone({ onClick }: { onClick: () => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: ARCHIVE_DROP_ID });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={`w-10 sm:w-12 shrink-0 self-center flex items-center justify-center transition-all ${
        isOver
          ? 'text-red-400 scale-125'
          : 'text-ink-500 hover:text-ink-300'
      }`}
      aria-label="ארכיון הרגלים"
      title="ארכיון — גרור הרגל לכאן כדי לארכב"
    >
      <Archive size={16} strokeWidth={1.7} />
    </button>
  );
}

// ----------------------------------------------------------------------------
// SortableHabitList — single SortableContext for all habits regardless of
// type. Only the icon tile is the drag activator (long-press it to start a
// drag); the rest of the row stays free for native vertical scrolling on
// mobile, so the user can swipe anywhere on the list to scroll the page.
//
// Optional drag-to-archive: when `onArchive` is provided and the user drops
// a habit on the ARCHIVE_DROP_ID droppable, the habit is archived instead
// of reordered. Pass an `archiveZone` slot (e.g., the day-headers row that
// contains <ArchiveDropZone />) to make sure the droppable lives INSIDE
// the same DndContext as the rows.
// ----------------------------------------------------------------------------
function SortableHabitList({
  slots,
  onReorder,
  onArchive,
  archiveZone,
  renderRow,
}: {
  slots: SlotView[];
  onReorder: (orderedHabitIds: string[]) => Promise<void>;
  onArchive?: (habitId: string) => Promise<void>;
  archiveZone?: React.ReactNode;
  renderRow: (
    slot: SlotView,
    dragHandleRef: DragHandleRef,
    dragListeners: DragHandleListeners,
  ) => React.ReactNode;
}) {
  // Explicit Mouse + Touch sensors so drag works on both desktop and mobile.
  // The unified PointerSensor often misses touch activation on iOS Safari /
  // some Android browsers because the page's scroll handler eats the event
  // before the delay elapses. TouchSensor handles touch directly and pairs
  // nicely with `touch-action: none` on the icon tile (the activator).
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
    if (!over) return;
    // Drop on the archive zone → archive (skip reorder).
    if (onArchive && over.id === ARCHIVE_DROP_ID) {
      onArchive(String(active.id)).catch(() => {
        /* error surfaces via mutationError in parent on next interaction */
      });
      return;
    }
    if (active.id === over.id) return;
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
      collisionDetection={hybridCollision}
      onDragEnd={handleDragEnd}
    >
      {/* Rendered inside DndContext so any <useDroppable> in here (e.g.,
          the ArchiveDropZone) is registered against the same context the
          sortable rows belong to. */}
      {archiveZone}
      <SortableContext
        items={slots.map((s) => s.habit!.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2.5">
          {slots.map((slot) => (
            <SortableRow key={slot.habit!.id} id={slot.habit!.id}>
              {(dragHandleRef, dragListeners) =>
                renderRow(slot, dragHandleRef, dragListeners)
              }
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
//
// When this row is the one being dragged AND it currently hovers over the
// archive drop zone, an absolutely-positioned red overlay is rendered on
// top of the row — signaling "release to archive."
function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (
    dragHandleRef: DragHandleRef,
    dragListeners: DragHandleListeners,
  ) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    over,
  } = useSortable({ id });
  const isOverArchive = isDragging && over?.id === ARCHIVE_DROP_ID;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Slight extra opacity drop when over archive so the dragged row reads
    // as "tagged for removal" on top of the red overlay.
    opacity: isDragging ? (isOverArchive ? 0.85 : 0.6) : 1,
    zIndex: isDragging ? 10 : 'auto',
    // Free up the row for native vertical scrolling on mobile. Only the icon
    // tile (the actual drag handle, child) gets `touchAction: 'none'` so
    // dnd-kit can intercept the long-press there.
    touchAction: 'auto',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} className="relative">
      {children(setActivatorNodeRef, listeners)}
      {isOverArchive && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-red-500 bg-red-500/30"
        />
      )}
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
    <div className="relative rounded-2xl border border-surface-border bg-surface-card px-2 sm:px-3 py-2.5">
      {/* Top row: icon tile (its own block) + cells grid (separate block).
          CSS Grid (not flex) so the icon column + 7-day grid stay locked to
          the same column geometry as the day-headers row above. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
        {/* Icon tile — DRAG HANDLE. A quick tap opens the detail sheet; a
            long-press (250ms) starts a drag. `touchAction:'none'` is what
            lets dnd-kit's TouchSensor intercept the long-press here, while
            the rest of the row keeps `touchAction:'auto'` so the page is
            still freely scrollable on mobile. */}
        <button
          ref={dragHandleRef}
          type="button"
          onClick={onShowDetail}
          className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
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

        <div className="grid gap-1 sm:gap-2" style={{gridTemplateColumns: 'repeat(7, minmax(0, 1fr))'}}>
          {(() => {
            // Pre-compute per-cell info in chronological order (days[0] =
            // earliest, days[6] = latest) so each cell knows how deep it sits
            // in a consecutive-blank streak since the habit was created.
            //   -1 = day is before the habit's start_date → render as blank
            //    0 = not in a streak (has a log, or is future)
            //   1..N = Nth day in the current blank streak
            const habitStart = slot.habitStartDate;
            // Days BEFORE the habit's start_date — including when the
            // entire visible week predates the habit — render as plain
            // neutral cells (no streak, no dash) but are STILL CLICKABLE
            // so the user can backfill marks. DayCell handles the visual
            // when it sees streakDepth === -1.
            let streakCount = 0;
            const cellInfos = days.map((d) => {
              const dateStr = toDateString(d);
              const future = isFuture(d, today);
              const effective = effectiveFor(dateStr);
              const mark = effective ?? slot.marks[dateStr];

              if (habitStart && dateStr < habitStart) {
                streakCount = 0;
                return { dateStr, future, mark, streakDepth: -1 };
              }
              if (future) {
                streakCount = 0;
                return { dateStr, future, mark, streakDepth: 0 };
              }
              if (mark === 'V' || mark === 'X') {
                // V = success, X = explicit failure — both reset the streak.
                streakCount = 0;
                return { dateStr, future, mark, streakDepth: 0 };
              }
              // Blank (undefined) OR auto_x (virtual, not stored in DB) =
              // missed day → streak grows and cell turns progressively red.
              streakCount++;
              return { dateStr, future, mark, streakDepth: streakCount };
            });

            return cellInfos.map(({ dateStr, future, mark, streakDepth }, i) => {
              const isToday = isSameDay(days[i], today);
              const amount = slot.amounts[dateStr] ?? null;
              return (
                <DayCell
                  key={i}
                  habit={habit}
                  mark={mark}
                  amount={amount}
                  isToday={isToday}
                  disabled={future}
                  streakDepth={streakDepth}
                  onClick={() => onMarkCell(habit, dateStr, mark, amount)}
                />
              );
            });
          })()}
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
        {/* Current streak — only when ≥ 3 (1-2 days is not a streak) */}
        {currentStreak >= 3 && (
          <span className="shrink-0 text-[10px] text-amber-400 inline-flex items-center gap-0.5">
            · <Emoji emoji="🔥" size={11} /> {currentStreak}
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
  streakDepth,
  onClick,
}: {
  habit: Habit;
  mark: LogStatus | undefined;
  amount: number | null;
  isToday: boolean;
  disabled: boolean;
  /** -1 = before habit creation (render completely empty)
   *   0 = not in a missed streak
   *  1+ = Nth consecutive blank day → progressively redder background */
  streakDepth: number;
  onClick: () => void;
}) {
  const isQuant = habit.is_quantitative;
  const target = habit.quantitative_target ?? 0;

  // Days before the habit's start_date: render as a regular muted blank
  // tile (same tint as a fresh post-start day), but with NO red streak
  // tint and NO horizontal dash — the habit didn't exist yet, so it
  // wasn't "missed." Still clickable so the user can backfill if they
  // want to record they did the habit before officially starting it.
  const isPreStart = streakDepth === -1;

  // Red overlay for consecutive blank days. Day 1 = barely visible;
  // day 5+ = clearly red. Interpolates linearly across 5 steps.
  // Pre-start days are explicitly excluded — they never go red.
  const RED_OPACITIES = [0, 0.08, 0.17, 0.27, 0.38, 0.50] as const;
  const redOpacity = isPreStart
    ? 0
    : streakDepth >= 5
      ? RED_OPACITIES[5]
      : RED_OPACITIES[streakDepth] ?? 0;

  // V (or any positive quantitative amount) → solid block of the habit's
  // color. Everything else (blank, X, auto_x) → muted empty tile.
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
          // Red tint overlaid on the usual muted habit color for missed streaks.
          backgroundColor:
            redOpacity > 0
              ? `rgba(220,38,38,${redOpacity})`
              : hexWithAlpha(habit.color, 0.15),
        };
    // Past blank days (not today, not future, not before creation) get a
    // centered horizontal dash — signals the day was missed. Pre-start
    // days skip this entirely — there was no habit to miss yet.
    if (!disabled && !isToday && !isPreStart && streakDepth >= 0) {
      content = (
        <span
          style={{
            display: 'block',
            width: '55%',
            height: '2px',
            backgroundColor: redOpacity > 0
              ? `rgba(255,160,160,${0.5 + redOpacity * 0.8})`
              : 'rgba(255,255,255,0.5)',
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
    <div className="rounded-2xl border border-surface-border bg-surface-card px-2 sm:px-3 py-2.5">
      {/* Header: icon tile (drag handle) + name/info (detail tap) side by side */}
      <div className="flex items-center gap-2 sm:gap-2.5 mb-2">
        {/* Icon tile — DRAG HANDLE. `touchAction:'none'` lets dnd-kit
            intercept the long-press; a quick tap still fires onClick →
            opens detail. The rest of the row keeps `touchAction:'auto'`
            so the page is freely scrollable on mobile. */}
        <button
          ref={dragHandleRef}
          type="button"
          onClick={onShowDetail}
          className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
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
            {/* Current streak — only when ≥ 3 (1-2 days is not a streak) */}
            {currentStreak >= 3 && (
              <span className="text-amber-400 inline-flex items-center gap-0.5">
                · <Emoji emoji="🔥" size={11} /> {currentStreak}
              </span>
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

// ============================================================================
// DataView — dashboard of the user's habit metrics across a time range.
// ============================================================================
function DataView({
  slots,
  stats,
  range,
  today,
  userId,
  onShowDetail,
}: {
  slots: SlotView[];
  stats: UserStats | null;
  range: DataRange;
  today: Date;
  userId: string;
  onShowDetail: (habit: Habit) => void;
}) {
  // Mirror TreeCard's localStorage key so the dashboard reads the same count
  // (kept simple — the tree card already owns the write path).
  const treesPlanted = (() => {
    try {
      return Number(
        localStorage.getItem(`trees-planted-${userId || 'anon'}`) ?? 0,
      );
    } catch {
      return 0;
    }
  })();
  const rangeDays = DATA_RANGE_DAYS[range];
  const rangeStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - rangeDays + 1);
    return d;
  }, [today, rangeDays]);
  const rangeStartStr = toDateString(rangeStart);
  const todayStr = toDateString(today);

  const habits = slots.map((s) => s.habit).filter((h): h is Habit => !!h);
  const orderedHabits = [...habits].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const activeIds = new Set(habits.map((h) => h.id));
  const activeStats = Array.from(stats?.byHabit.values() ?? []).filter((h) =>
    activeIds.has(h.habitId),
  );

  // ---- Range-filtered metrics ------------------------------------------------
  // For every metric we ignore dates outside [rangeStart, today].
  let totalVInRange = 0;
  const dailyDelta = new Map<string, number>(); // date → score change today
  const dailyVCount = new Map<string, number>(); // date → # of V across habits
  const weekdayVCount = new Array<number>(7).fill(0); // Sun..Sat
  const startDateByHabit = new Map<string, string>(); // earliest active date per habit
  const vCountInRangeByHabit = new Map<string, number>();

  for (const h of activeStats) {
    let firstDate: string | null = null;
    for (const [dateStr, status] of h.effectiveByDate) {
      if (firstDate === null || dateStr < firstDate) firstDate = dateStr;
      if (dateStr < rangeStartStr || dateStr > todayStr) continue;
      // Base points for the day
      let pts = 0;
      if (status === 'V') pts = 5;
      else if (status === 'X' || status === 'auto_x') pts = -3;
      // Bonuses earned on this date
      const bonus = h.bonusesEarned.find((b) => b.earnedOn === dateStr);
      if (bonus) pts += bonus.threshold.bonus;
      dailyDelta.set(dateStr, (dailyDelta.get(dateStr) ?? 0) + pts);
      if (status === 'V') {
        totalVInRange += 1;
        dailyVCount.set(dateStr, (dailyVCount.get(dateStr) ?? 0) + 1);
        const d = dateFromStr(dateStr);
        weekdayVCount[d.getDay()] += 1;
        vCountInRangeByHabit.set(
          h.habitId,
          (vCountInRangeByHabit.get(h.habitId) ?? 0) + 1,
        );
      }
    }
    if (firstDate) startDateByHabit.set(h.habitId, firstDate);
  }

  // Cumulative score series for the line chart — one point per day in range.
  const dates: Date[] = [];
  for (let i = 0; i < rangeDays; i++) {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  let runningTotal = 0;
  const cumulativePoints = dates.map((d) => {
    runningTotal += dailyDelta.get(toDateString(d)) ?? 0;
    return { date: d, value: runningTotal };
  });

  // Perfect days — every active habit got a V (only counted if user has >0).
  let perfectDays = 0;
  if (habits.length > 0) {
    for (const count of dailyVCount.values()) {
      if (count >= habits.length) perfectDays += 1;
    }
  }

  // Days since the user first marked anything.
  const earliestStart = Array.from(startDateByHabit.values()).sort()[0];
  const daysSinceStart = earliestStart
    ? Math.max(1, daysBetweenDateStr(earliestStart, todayStr) + 1)
    : 0;

  const bestStreak = activeStats.reduce(
    (m, h) => Math.max(m, h.longestStreak),
    0,
  );

  if (habits.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-surface-border bg-surface-card/40 px-4 py-10 text-center text-ink-300 text-sm">
        עוד אין הרגלים. לחץ על "+ הרגל" למעלה כדי להתחיל.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* KPI row — four cards. RTL: first DOM child is rightmost. Order:
          1) במסע כבר      (rightmost) — uses the app's compass logo
          2) ימים מושלמים            — ✨ emoji
          3) הרצף הכי ארוך           — 🔥 emoji
          4) עצים שנשתלו  (leftmost) — mature-tree illustration */}
      <div className="grid grid-cols-4 gap-2">
        <KpiCard
          icon={
            <img
              src="/logo.png?v=3"
              alt=""
              className="w-7 h-7 object-contain"
            />
          }
          label="במסע כבר"
          value={daysSinceStart}
          suffix={daysSinceStart === 1 ? 'יום' : 'ימים'}
        />
        <KpiCard
          icon={<Emoji emoji="✨" size={28} />}
          label="ימים מושלמים"
          value={perfectDays}
        />
        <KpiCard
          icon={<Emoji emoji="🔥" size={28} />}
          label="הרצף הכי ארוך"
          value={bestStreak}
          suffix={bestStreak === 1 ? 'יום' : 'ימים'}
        />
        <KpiCard
          icon={
            <span className="w-8 h-8 block">
              <YoungTree />
            </span>
          }
          label="עצים שנשתלו"
          value={treesPlanted}
        />
      </div>

      {/* Cumulative score over the range */}
      <CumulativeScoreChart points={cumulativePoints} />

      {/* Day-of-week pattern */}
      <WeekdayBars counts={weekdayVCount} />

      {/* Per-habit grid — 3 columns, each card with key habit metrics */}
      <div>
        <h3 className="text-[11px] uppercase tracking-wider text-ink-100 mb-2 px-1">
          לפי הרגל
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {orderedHabits.map((habit) => (
            <HabitDataCard
              key={habit.id}
              habit={habit}
              stats={stats?.byHabit.get(habit.id) ?? null}
              vCountInRange={vCountInRangeByHabit.get(habit.id) ?? 0}
              startDate={startDateByHabit.get(habit.id) ?? null}
              today={today}
              rangeDays={rangeDays}
              onClick={() => onShowDetail(habit)}
            />
          ))}
        </div>
      </div>

      {/* Yearly heatmap — last 365 days regardless of selected range */}
      <YearlyHeatmap activeStats={activeStats} today={today} habitCount={habits.length} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dateFromStr(s: string): Date {
  // Parse YYYY-MM-DD as local midnight (avoids TZ drift).
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetweenDateStr(a: string, b: string): number {
  const da = dateFromStr(a).getTime();
  const db = dateFromStr(b).getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

function formatStartDate(dateStr: string): string {
  const d = dateFromStr(dateStr);
  return `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(-2)}`;
}

// ---------------------------------------------------------------------------
// CumulativeScoreChart — SVG line of running score over the visible range.
// ---------------------------------------------------------------------------
function CumulativeScoreChart({
  points,
}: {
  points: { date: Date; value: number }[];
}) {
  if (points.length === 0) return null;
  const min = Math.min(0, ...points.map((p) => p.value));
  const max = Math.max(0, ...points.map((p) => p.value));
  const W = 320;
  const H = 80;
  const padX = 4;
  const padY = 8;
  const xStep = (W - padX * 2) / Math.max(1, points.length - 1);
  const yScale = (v: number) => {
    if (max === min) return H / 2;
    return padY + (1 - (v - min) / (max - min)) * (H - padY * 2);
  };

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${padX + i * xStep} ${yScale(p.value)}`)
    .join(' ');
  const areaPath =
    `M ${padX} ${H - padY} ` +
    points
      .map((p, i) => `L ${padX + i * xStep} ${yScale(p.value)}`)
      .join(' ') +
    ` L ${padX + (points.length - 1) * xStep} ${H - padY} Z`;

  const last = points[points.length - 1].value;
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card p-3">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[11px] uppercase tracking-wider text-ink-100">
          נקודות מצטברות
        </h3>
        <div className="text-sm font-bold text-ink-100 tabular-nums">
          {last > 0 ? `+${last}` : last}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-20"
      >
        <defs>
          <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-forest-500)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-forest-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#scoreFill)" />
        <path
          d={path}
          fill="none"
          stroke="var(--color-forest-500)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeekdayBars — 7 bars showing V count per day-of-week within the range.
// ---------------------------------------------------------------------------
function WeekdayBars({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  const labels = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  // RTL: render Sun → Sat in the natural order, but the container uses
  // dir="rtl" so they flow right-to-left visually.
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card p-3">
      <h3 className="text-[11px] uppercase tracking-wider text-ink-100 mb-2">
        ימים מוצלחים לפי יום בשבוע
      </h3>
      <div className="grid grid-cols-7 gap-1.5 items-end h-24" dir="rtl">
        {counts.map((c, i) => {
          const h = Math.round((c / max) * 100);
          return (
            <div key={i} className="flex flex-col items-center gap-1 h-full">
              <div className="text-[10px] text-ink-300 tabular-nums leading-none">
                {c}
              </div>
              <div className="flex-1 w-full flex items-end">
                <div
                  className="w-full bg-forest-500/70 rounded-md"
                  style={{ height: `${h}%`, minHeight: c > 0 ? 6 : 2 }}
                />
              </div>
              <div className="text-[10px] text-ink-500 leading-none">
                {labels[i]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HabitDataCard — one habit's mini dashboard card (3 per row).
// ---------------------------------------------------------------------------
function HabitDataCard({
  habit,
  stats,
  vCountInRange,
  startDate,
  today,
  rangeDays,
  onClick,
}: {
  habit: Habit;
  stats: HabitScoreResult | null;
  vCountInRange: number;
  startDate: string | null;
  today: Date;
  rangeDays: number;
  onClick: () => void;
}) {
  const iconTileStyle: React.CSSProperties = {
    backgroundColor: hexWithAlpha(habit.color, 0.18),
    color: 'white',
  };
  // Effective denominator: habit can't have a higher rate than days it was
  // actually being tracked. Cap by both the range length and days-since-start.
  const todayStr = toDateString(today);
  const daysSinceHabitStart = startDate
    ? Math.max(1, daysBetweenDateStr(startDate, todayStr) + 1)
    : rangeDays;
  const effectiveDays = Math.min(rangeDays, daysSinceHabitStart);
  const successRate = effectiveDays > 0
    ? Math.round((vCountInRange / effectiveDays) * 100)
    : 0;
  const totalPoints = stats?.totalPoints ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-surface-border bg-surface-card p-2.5 flex flex-col items-center text-center gap-1.5 hover:bg-surface-raised transition-colors min-w-0"
    >
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={iconTileStyle}
      >
        <HabitIcon name={habit.icon} size={20} strokeWidth={1.8} />
      </span>
      <div className="text-[11px] font-medium text-ink-100 truncate w-full leading-tight">
        {habit.name}
      </div>
      <div className="text-base font-bold leading-none text-ink-100">
        <span className="tabular-nums">{successRate}%</span>
        <span className="text-[10px] font-normal text-ink-300 mr-1">הצלחה</span>
      </div>
      <div
        className={`text-[10px] font-medium tabular-nums leading-none ${
          totalPoints > 0
            ? 'text-forest-500'
            : totalPoints < 0
            ? 'text-red-400'
            : 'text-ink-300'
        }`}
      >
        {totalPoints > 0 ? `+${totalPoints}` : totalPoints} נק׳
      </div>
      {startDate && (
        <div className="text-[9px] text-ink-500 leading-none">
          מ-{formatStartDate(startDate)}
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// YearlyHeatmap — last 365 days, 7 rows (days of week) × ~53 columns (weeks).
// Color intensity by total V count across all active habits on that date.
// ---------------------------------------------------------------------------
function YearlyHeatmap({
  activeStats,
  today,
  habitCount,
}: {
  activeStats: HabitScoreResult[];
  today: Date;
  habitCount: number;
}) {
  // Build V counts per date from all habits.
  const vByDate = new Map<string, number>();
  for (const h of activeStats) {
    for (const [date, status] of h.effectiveByDate) {
      if (status === 'V') vByDate.set(date, (vByDate.get(date) ?? 0) + 1);
    }
  }

  // 365 days back from today (today included → 365 cells total). We start
  // from the Sunday at or before (today - 364) so weeks are aligned columns.
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  start.setDate(start.getDate() - start.getDay()); // back to Sunday

  const totalDays = Math.ceil(
    (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  ) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);

  // Color intensity buckets: 0, 1, 2-3, 4+ habits done that day.
  const colorFor = (count: number): string => {
    if (count <= 0) return 'rgba(122,160,134,0.08)';
    const max = Math.max(1, habitCount);
    const ratio = Math.min(1, count / max);
    return `rgba(85,181,112,${0.25 + ratio * 0.6})`;
  };

  const cells: { date: Date; weekIdx: number; dow: number; count: number }[] = [];
  const d = new Date(start);
  for (let i = 0; i < totalWeeks * 7; i++) {
    if (d > today) break;
    cells.push({
      date: new Date(d),
      weekIdx: Math.floor(i / 7),
      dow: d.getDay(),
      count: vByDate.get(toDateString(d)) ?? 0,
    });
    d.setDate(d.getDate() + 1);
  }

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card p-3">
      <h3 className="text-[11px] uppercase tracking-wider text-ink-100 mb-2">
        365 ימים אחרונים
      </h3>
      <div
        className="overflow-x-auto themed-scroll"
        style={{ direction: 'ltr' }}
      >
        <div
          className="grid gap-[2px]"
          style={{
            gridTemplateColumns: `repeat(${totalWeeks}, minmax(0, 1fr))`,
            gridAutoFlow: 'column',
            gridTemplateRows: 'repeat(7, 1fr)',
            minWidth: totalWeeks * 6,
          }}
        >
          {cells.map((c, i) => (
            <div
              key={i}
              className="aspect-square rounded-[2px]"
              style={{
                backgroundColor: colorFor(c.count),
                gridColumnStart: c.weekIdx + 1,
                gridRowStart: c.dow + 1,
              }}
              title={`${toDateString(c.date)} · ${c.count} הרגלים`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
}) {
  // Fixed-height rows force every card's label and value to land on the
  // same vertical baseline regardless of which glyph the icon happens to
  // be (an emoji 🔥/✨ rendered at text-2xl can be a few px taller than
  // an <img> at h-7, which used to push the label down on some cards).
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card px-3 py-3">
      <div className="flex flex-col items-center text-center gap-1.5">
        <span
          className="h-9 flex items-center justify-center text-ink-100 leading-none"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="text-[10px] tracking-wide text-ink-300 leading-tight min-h-[1em] whitespace-nowrap">
          {label}
        </div>
        <div className="text-lg font-bold text-ink-100 leading-none">
          <span className="tabular-nums">{value}</span>
          {suffix && (
            <span className="text-[10px] font-normal text-ink-300 mr-1">
              {suffix}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

