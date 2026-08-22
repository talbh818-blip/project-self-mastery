// ============================================================================
// VisionReminisce — the desktop "look back" panel (read-only).
// ----------------------------------------------------------------------------
// A quiet, journal-like column to the LEFT of the writing page (toggled by the
// eye in the rail). The user CHECKS which past visions to view (multi-select),
// and can DRAG the chosen visions into any order (Trello-style):
//   ☑ חזון שנתי · ☑ חזון חודשי · ☑ שבוע שעבר
//        └ checking שבוע שעבר reveals (subdued) לפני 2 / 3 / 4 שבועות
// The selection + order is remembered per-user. Everything is READ-ONLY and
// rendered with real formatting via VisionReadOnly.
//
// Each card also PAGES through earlier periods of its own scope: chevrons in
// the header step older (ChevronRight, before the icon) / newer (ChevronLeft,
// disabled at the current period). The step is per-card and ephemeral (not
// persisted). Content for a paged-to period is fetched on demand and cached in
// `meta`, so paging back and forth is instant after the first visit.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  X,
  Check,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CompassLoader } from '../../components/CompassLoader';
import { HabitIcon } from '../habits/HabitIcon';
import { fetchVisionRowMeta } from './queries';
import { isVisionContentEmpty } from './content';
import { VisionReadOnly } from './VisionReadOnly';
import {
  formatPeriodLabel,
  getMonthKey,
  getWeekKey,
  getYearKey,
  parsePeriodStart,
  type VisionScope,
} from './period';

type Props = {
  userId: string | null;
  today: Date;
  onClose: () => void;
};

type SelItem = {
  id: string;
  label: string;
  scope: VisionScope;
  /** weekly: how many weeks back from now (1 = last week). */
  weekOffset?: number;
  /** A sub-option revealed only when "שבוע שעבר" (w1) is checked. */
  sub?: boolean;
};

const ITEMS: SelItem[] = [
  { id: 'yearly', label: 'חזון שנתי', scope: 'yearly' },
  { id: 'monthly', label: 'חזון חודשי', scope: 'monthly' },
  { id: 'w1', label: 'שבוע שעבר', scope: 'weekly', weekOffset: 1 },
  { id: 'w2', label: 'לפני 2 שבועות', scope: 'weekly', weekOffset: 2, sub: true },
  { id: 'w3', label: 'לפני 3 שבועות', scope: 'weekly', weekOffset: 3, sub: true },
  { id: 'w4', label: 'לפני 4 שבועות', scope: 'weekly', weekOffset: 4, sub: true },
];
const ITEM_BY_ID = new Map(ITEMS.map((it) => [it.id, it]));
const SUB_IDS = ['w2', 'w3', 'w4'];

// Selection + order is remembered per-user (the array IS the display order).
const SEL_LS_PREFIX = 'vision-reminisce-sel:';
// Whether the cards are manually minimized (compact) — remembered per-user.
const MIN_LS_PREFIX = 'vision-reminisce-min:';

function readSavedMin(userId: string | null): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(`${MIN_LS_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
}

function readSavedSel(userId: string | null): string[] {
  if (!userId) return ['monthly'];
  try {
    const raw = localStorage.getItem(`${SEL_LS_PREFIX}${userId}`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        let valid = arr.filter(
          (id): id is string => typeof id === 'string' && ITEM_BY_ID.has(id),
        );
        // Sub-weeks can't be shown without their parent "שבוע שעבר".
        if (!valid.includes('w1')) valid = valid.filter((id) => !SUB_IDS.includes(id));
        return valid;
      }
    }
  } catch {
    // ignore
  }
  return ['monthly'];
}

/** Compact numeric range for a week, e.g. "24.5 – 30.5" (no month name/year). */
function weekRange(key: string): string {
  const start = parsePeriodStart('weekly', key);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.getDate()}.${start.getMonth() + 1} – ${end.getDate()}.${end.getMonth() + 1}`;
}

type PeriodInfo = { key: string; title: string; subtitle?: string };

/** How many periods back a card starts on: weekly begins at its week-offset,
 *  yearly/monthly at the current period (0). */
function baseStepBack(item: SelItem): number {
  return item.scope === 'weekly' ? item.weekOffset ?? 1 : 0;
}

/** A weekly card's title shifts as it pages: "השבוע" / "שבוע שעבר" / "לפני N…". */
function weeklyLabel(stepBack: number): string {
  if (stepBack <= 0) return 'השבוע';
  if (stepBack === 1) return 'שבוע שעבר';
  return `לפני ${stepBack} שבועות`;
}

/** The period a card shows at `stepBack` periods before now (0 = current). */
function periodAt(item: SelItem, today: Date, stepBack: number): PeriodInfo {
  if (item.scope === 'yearly') {
    const key = getYearKey(new Date(today.getFullYear() - stepBack, 0, 1));
    return { key, title: `חזון שנתי - ${key}` };
  }
  if (item.scope === 'monthly') {
    const key = getMonthKey(new Date(today.getFullYear(), today.getMonth() - stepBack, 1));
    return { key, title: `חזון חודשי - ${formatPeriodLabel('monthly', key)}` };
  }
  const d = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 7 * stepBack,
  );
  const key = getWeekKey(d);
  return { key, title: weeklyLabel(stepBack), subtitle: weekRange(key) };
}

type CardMeta = { content: unknown; icon: string | null };

export function VisionReminisce({ userId, today, onClose }: Props) {
  // Selected items in display order — drag-reorderable, persisted per-user.
  const [order, setOrder] = useState<string[]>(() => readSavedSel(userId));
  // Manual "minimize" toggle — collapses every card to a compact preview.
  const [minimized, setMinimized] = useState<boolean>(() => readSavedMin(userId));
  // Per-card paging position (periods back from now). Missing → the card's base.
  const [stepBackById, setStepBackById] = useState<Record<string, number>>({});

  const getStepBack = useCallback(
    (id: string): number => {
      if (id in stepBackById) return stepBackById[id];
      const item = ITEM_BY_ID.get(id);
      return item ? baseStepBack(item) : 0;
    },
    [stepBackById],
  );

  const stepOlder = useCallback((id: string) => {
    setStepBackById((prev) => {
      const item = ITEM_BY_ID.get(id);
      const cur = id in prev ? prev[id] : item ? baseStepBack(item) : 0;
      return { ...prev, [id]: cur + 1 };
    });
  }, []);

  const stepNewer = useCallback((id: string) => {
    setStepBackById((prev) => {
      const item = ITEM_BY_ID.get(id);
      const cur = id in prev ? prev[id] : item ? baseStepBack(item) : 0;
      return { ...prev, [id]: Math.max(0, cur - 1) };
    });
  }, []);

  // Each rendered card's current period (derived from its step-back).
  const renderList = useMemo(
    () =>
      order
        .map((id) => {
          const item = ITEM_BY_ID.get(id);
          if (!item) return null;
          const stepBack = getStepBack(id);
          return { id, item, stepBack, period: periodAt(item, today, stepBack) };
        })
        .filter(
          (x): x is { id: string; item: SelItem; stepBack: number; period: PeriodInfo } =>
            x !== null,
        ),
    [order, getStepBack, today],
  );

  // Content cache keyed by period_key. A key mapped to {content:null} means
  // "fetched, but no entry exists" — so we render the empty state, not a loader.
  const [meta, setMeta] = useState<Map<string, CardMeta>>(new Map());
  // Keys already fetched or in-flight, so paging never refetches a cached period.
  const fetchedRef = useRef<Set<string>>(new Set());

  // A fresh user resets the cache.
  useEffect(() => {
    fetchedRef.current = new Set();
    setMeta(new Map());
  }, [userId]);

  const neededKeys = useMemo(
    () => Array.from(new Set(renderList.map((r) => r.period.key))),
    [renderList],
  );

  // Fetch only the keys we haven't seen yet, and merge into the cache. Keys
  // that come back with no row are cached as empty so we don't refetch them.
  useEffect(() => {
    if (!userId) return;
    const toFetch = neededKeys.filter((k) => !fetchedRef.current.has(k));
    if (toFetch.length === 0) return;
    for (const k of toFetch) fetchedRef.current.add(k);
    let cancelled = false;
    fetchVisionRowMeta(userId, toFetch)
      .then((rows) => {
        if (cancelled) return;
        setMeta((prev) => {
          const next = new Map(prev);
          for (const r of rows) next.set(r.period_key, { content: r.content, icon: r.icon });
          for (const k of toFetch) if (!next.has(k)) next.set(k, { content: null, icon: null });
          return next;
        });
      })
      .catch((err) => {
        console.error('[vision] reminisce fetch failed', err);
        // Allow a retry on the next render.
        if (!cancelled) for (const k of toFetch) fetchedRef.current.delete(k);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, neededKeys]);

  const loadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || loadedForRef.current === userId) return;
    loadedForRef.current = userId;
    setOrder(readSavedSel(userId));
    setMinimized(readSavedMin(userId));
    setStepBackById({});
  }, [userId]);

  const toggleMinimized = useCallback(() => {
    setMinimized((prev) => {
      const next = !prev;
      if (userId) {
        try {
          localStorage.setItem(`${MIN_LS_PREFIX}${userId}`, next ? '1' : '0');
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, [userId]);

  const persist = useCallback(
    (next: string[]) => {
      if (!userId) return;
      try {
        localStorage.setItem(`${SEL_LS_PREFIX}${userId}`, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [userId],
  );

  const checked = useMemo(() => new Set(order), [order]);
  const w1Checked = checked.has('w1');

  const toggle = useCallback(
    (id: string) => {
      setOrder((prev) => {
        let next: string[];
        if (prev.includes(id)) {
          next = prev.filter((x) => x !== id);
          if (id === 'w1') next = next.filter((x) => !SUB_IDS.includes(x));
        } else {
          next = [...prev, id];
        }
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  // Which card is mid-drag (null = none). While dragging, ALL cards collapse to
  // a short preview so reordering long visions is easy, and the dragged one is
  // shown via a DragOverlay clone (clean motion, no stretched original).
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragging = activeId !== null;

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      persist(next);
      return next;
    });
  };

  const activeEntry = activeId ? renderList.find((r) => r.id === activeId) : null;
  const activeMeta = activeEntry ? meta.get(activeEntry.period.key) : null;

  return (
    <div className="flex flex-col max-h-[calc(100vh-6.5rem)] rounded-2xl bg-surface-base ring-1 ring-surface-border overflow-hidden">
      {/* Header */}
      <div
        dir="rtl"
        className="flex items-center justify-between gap-2 px-4 pt-3 pb-2.5 shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Eye size={18} className="text-ink-100 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ink-100 leading-tight">מבט אחורה</h2>
            <p className="text-[11px] text-ink-300 leading-tight truncate">
              מה שכבר כתבת - רק לקריאה
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={toggleMinimized}
            aria-pressed={minimized}
            aria-label={minimized ? 'הרחב חזונות' : 'מזער חזונות'}
            title={minimized ? 'הרחב חזונות' : 'מזער חזונות'}
            className={`inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
              minimized
                ? 'bg-forest-700/25 text-ink-100 ring-1 ring-forest-700'
                : 'text-ink-300 hover:text-ink-100 hover:bg-surface-raised'
            }`}
          >
            {minimized ? <ChevronsUpDown size={17} /> : <ChevronsDownUp size={17} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור מבט אחורה"
            title="סגור"
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-ink-300 hover:text-ink-100 hover:bg-surface-raised transition-colors"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* Checkbox picker — choose what to view (multi-select). Laid out
          HORIZONTALLY: the three mains in one row, the sub-weeks in a row
          below (only when "שבוע שעבר" is checked). */}
      <div dir="rtl" className="px-3 pb-2.5 shrink-0 border-b border-surface-border space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <CheckRow checked={checked.has('yearly')} label="חזון שנתי" onToggle={() => toggle('yearly')} />
          <CheckRow checked={checked.has('monthly')} label="חזון חודשי" onToggle={() => toggle('monthly')} />
          <CheckRow checked={checked.has('w1')} label="שבוע שעבר" onToggle={() => toggle('w1')} />
        </div>
        {/* Sub-weeks slide open like a drawer (grid 0fr↔1fr animates the real
            height; the inner wrapper clips during the fold). */}
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-in-out"
          style={{ gridTemplateRows: w1Checked ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden min-h-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
              <CheckRow sub checked={checked.has('w2')} label="לפני 2 שבועות" onToggle={() => toggle('w2')} />
              <CheckRow sub checked={checked.has('w3')} label="לפני 3 שבועות" onToggle={() => toggle('w3')} />
              <CheckRow sub checked={checked.has('w4')} label="לפני 4 שבועות" onToggle={() => toggle('w4')} />
            </div>
          </div>
        </div>
      </div>

      {/* Body: the chosen visions, drag to reorder. */}
      <div
        dir="ltr"
        className="flex-1 min-h-0 vision-feed-scroll overflow-y-auto overscroll-contain p-3"
      >
        <div dir="rtl">
          {order.length === 0 ? (
            <div className="text-center py-14 px-4">
              <Eye size={24} className="text-ink-500 mx-auto mb-3" />
              <p className="text-ink-300 text-[12px] leading-relaxed">
                סמן למעלה מה תרצה לראות.
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveId(null)}
            >
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                <div className="space-y-2.5">
                  {renderList.map(({ id, stepBack, period }) => {
                    const m = meta.get(period.key);
                    return (
                      <SortableMemory
                        key={id}
                        id={id}
                        title={period.title}
                        subtitle={period.subtitle}
                        icon={m?.icon ?? null}
                        content={m?.content ?? null}
                        loading={m === undefined}
                        collapsed={dragging || minimized}
                        onOlder={() => stepOlder(id)}
                        onNewer={() => stepNewer(id)}
                        canNewer={stepBack > 0}
                      />
                    );
                  })}
                </div>
              </SortableContext>
              {/* A clean clone of the dragged card follows the cursor. */}
              <DragOverlay>
                {activeId && activeEntry ? (
                  <MemoryCardView
                    title={activeEntry.period.title}
                    subtitle={activeEntry.period.subtitle}
                    icon={activeMeta?.icon ?? null}
                    content={activeMeta?.content ?? null}
                    collapsed
                    overlay
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckRow({
  checked,
  label,
  onToggle,
  sub,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
  sub?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="inline-flex items-center gap-1.5 rounded-lg py-1 px-1.5 transition-colors hover:bg-surface-raised/50"
    >
      <span
        className={`shrink-0 inline-flex items-center justify-center rounded-[5px] border transition-colors ${
          sub ? 'h-4 w-4' : 'h-[18px] w-[18px]'
        } ${
          checked
            ? 'bg-forest-700 border-forest-700 text-on-accent'
            : 'border-surface-border text-transparent'
        }`}
      >
        <Check size={sub ? 11 : 12} strokeWidth={3.5} />
      </span>
      <span
        className={`text-[13px] ${
          sub
            ? checked
              ? 'text-ink-300 font-semibold'
              : 'text-ink-500 font-medium'
            : checked
              ? 'text-ink-100 font-semibold'
              : 'text-ink-300 font-medium'
        }`}
      >
        {label}
      </span>
    </button>
  );
}

/** One paging chevron. older → ChevronRight (physical right, before the icon);
 *  newer → ChevronLeft (physical left, disabled at the current period). Matches
 *  the DateBar stepper convention. */
function StepArrow({
  dir,
  disabled,
  onClick,
}: {
  dir: 'older' | 'newer';
  disabled?: boolean;
  onClick: () => void;
}) {
  const Chevron = dir === 'older' ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      aria-label={dir === 'older' ? 'חזון קודם' : 'חזון הבא'}
      title={dir === 'older' ? 'קודם' : 'הבא'}
      disabled={disabled}
      // Stop the click from bubbling into the card (drag / selection).
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-md text-ink-300 hover:text-forest-700 hover:bg-surface-raised transition-colors disabled:opacity-30 disabled:pointer-events-none"
    >
      <Chevron size={15} />
    </button>
  );
}

// Presentational card — shared by the in-list sortable item AND the drag
// overlay clone. `collapsed` clamps the body to a short, fading preview so a
// dragging list is easy to reorder. When step handlers are provided, the header
// shows paging chevrons flanking the title.
function MemoryCardView({
  title,
  subtitle,
  icon,
  content,
  loading,
  collapsed,
  overlay,
  dimmed,
  handleProps,
  onOlder,
  onNewer,
  canNewer,
}: {
  title: string;
  subtitle?: string;
  icon: string | null;
  content: unknown;
  /** Content for this period hasn't been fetched yet → inline loader. */
  loading?: boolean;
  collapsed?: boolean;
  /** The floating drag clone (gets a stronger shadow + grabbing cursor). */
  overlay?: boolean;
  /** The original in-list item while it's the one being dragged. */
  dimmed?: boolean;
  /** Spread onto the grip button (sortable attributes + listeners). */
  handleProps?: Record<string, unknown>;
  /** Page to an older / newer period of this card's scope. */
  onOlder?: () => void;
  onNewer?: () => void;
  /** Whether a newer period exists (false at the current period). */
  canNewer?: boolean;
}) {
  const empty = isVisionContentEmpty(content);
  return (
    <article
      className={`border-s-2 border-forest-700 rounded-xl bg-surface-card/70 p-3.5 ${
        overlay ? 'shadow-2xl ring-1 ring-forest-600 cursor-grabbing' : ''
      } ${dimmed ? 'opacity-40' : ''}`}
    >
      <header className="mb-2 flex items-start gap-2">
        {/* Drag handle (Trello-style reorder) — on the RIGHT (RTL start). */}
        <button
          type="button"
          aria-label="גרור לסידור מחדש"
          title="גרור לסידור"
          {...handleProps}
          style={{ touchAction: 'none' }}
          className="shrink-0 -ms-1 mt-0.5 cursor-grab active:cursor-grabbing text-ink-500 hover:text-ink-300 transition-colors"
        >
          <GripVertical size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            {/* Older (ChevronRight) sits BEFORE the icon, on the right. */}
            {onOlder && <StepArrow dir="older" onClick={onOlder} />}
            {icon && <HabitIcon name={icon} size={16} className="shrink-0" />}
            <span className="min-w-0 flex-1 text-[13px] font-bold text-ink-100 truncate">
              {title}
            </span>
            {/* Newer (ChevronLeft) on the left; disabled at the current period. */}
            {onNewer && <StepArrow dir="newer" disabled={!canNewer} onClick={onNewer} />}
          </div>
          {subtitle && (
            <div
              dir="ltr"
              className="text-[11px] text-ink-300 mt-0.5"
              style={{ textAlign: 'right' }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </header>
      {loading ? (
        <div className="py-4 flex justify-center">
          <CompassLoader size="sm" />
        </div>
      ) : empty ? (
        <p className="text-[13px] text-ink-500 italic">
          עוד לא נכתב חזון לתקופה זו.
        </p>
      ) : collapsed ? (
        <div
          className="max-h-[5rem] overflow-hidden"
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, #000 55%, transparent)',
            maskImage: 'linear-gradient(to bottom, #000 55%, transparent)',
          }}
        >
          <VisionReadOnly content={content} />
        </div>
      ) : (
        <VisionReadOnly content={content} />
      )}
    </article>
  );
}

function SortableMemory({
  id,
  collapsed,
  ...view
}: {
  id: string;
  title: string;
  subtitle?: string;
  icon: string | null;
  content: unknown;
  loading?: boolean;
  collapsed: boolean;
  onOlder?: () => void;
  onNewer?: () => void;
  canNewer?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <MemoryCardView
        {...view}
        collapsed={collapsed}
        dimmed={isDragging}
        handleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}
