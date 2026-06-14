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
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, X, Check, GripVertical } from 'lucide-react';
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

function periodFor(item: SelItem, today: Date): PeriodInfo {
  if (item.scope === 'yearly') {
    const key = getYearKey(today);
    return { key, title: `חזון שנתי - ${key}` };
  }
  if (item.scope === 'monthly') {
    const key = getMonthKey(today);
    return { key, title: `חזון חודשי - ${formatPeriodLabel('monthly', key)}` };
  }
  const off = item.weekOffset ?? 1;
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7 * off);
  const key = getWeekKey(d);
  return { key, title: item.label, subtitle: weekRange(key) };
}

export function VisionReminisce({ userId, today, onClose }: Props) {
  const itemPeriods = useMemo(() => {
    const m = new Map<string, PeriodInfo>();
    for (const it of ITEMS) m.set(it.id, periodFor(it, today));
    return m;
  }, [today]);

  const allKeys = useMemo(
    () => Array.from(new Set([...itemPeriods.values()].map((p) => p.key))),
    [itemPeriods],
  );

  const [meta, setMeta] = useState<
    Map<string, { content: unknown; icon: string | null }>
  >(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    fetchVisionRowMeta(userId, allKeys)
      .then((rows) => {
        if (cancelled) return;
        const m = new Map<string, { content: unknown; icon: string | null }>();
        for (const r of rows) m.set(r.period_key, { content: r.content, icon: r.icon });
        setMeta(m);
      })
      .catch((err) => console.error('[vision] reminisce fetch failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, allKeys]);

  // Selected items in display order — drag-reorderable, persisted per-user.
  const [order, setOrder] = useState<string[]>(() => readSavedSel(userId));
  const loadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || loadedForRef.current === userId) return;
    loadedForRef.current = userId;
    setOrder(readSavedSel(userId));
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

  const activePeriod = activeId ? itemPeriods.get(activeId) : null;
  const activeMeta = activePeriod ? meta.get(activePeriod.key) : null;

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
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור מבט אחורה"
          title="סגור"
          className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg text-ink-300 hover:text-ink-100 hover:bg-surface-raised transition-colors"
        >
          <X size={17} />
        </button>
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
          {loading ? (
            <div className="py-12">
              <CompassLoader size="md" />
            </div>
          ) : order.length === 0 ? (
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
                  {order.map((id) => {
                    const item = ITEM_BY_ID.get(id);
                    if (!item) return null;
                    const p = itemPeriods.get(id);
                    if (!p) return null;
                    const m = meta.get(p.key);
                    return (
                      <SortableMemory
                        key={id}
                        id={id}
                        title={p.title}
                        subtitle={p.subtitle}
                        icon={m?.icon ?? null}
                        content={m?.content ?? null}
                        collapsed={dragging}
                      />
                    );
                  })}
                </div>
              </SortableContext>
              {/* A clean clone of the dragged card follows the cursor. */}
              <DragOverlay>
                {activeId && activePeriod ? (
                  <MemoryCardView
                    title={activePeriod.title}
                    subtitle={activePeriod.subtitle}
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

// Presentational card — shared by the in-list sortable item AND the drag
// overlay clone. `collapsed` clamps the body to a short, fading preview so a
// dragging list is easy to reorder.
function MemoryCardView({
  title,
  subtitle,
  icon,
  content,
  collapsed,
  overlay,
  dimmed,
  handleProps,
}: {
  title: string;
  subtitle?: string;
  icon: string | null;
  content: unknown;
  collapsed?: boolean;
  /** The floating drag clone (gets a stronger shadow + grabbing cursor). */
  overlay?: boolean;
  /** The original in-list item while it's the one being dragged. */
  dimmed?: boolean;
  /** Spread onto the grip button (sortable attributes + listeners). */
  handleProps?: Record<string, unknown>;
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
          <div className="flex items-center gap-1.5">
            {icon && <HabitIcon name={icon} size={16} className="shrink-0" />}
            <span className="text-[13px] font-bold text-ink-100 truncate">
              {title}
            </span>
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
      {empty ? (
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
  collapsed: boolean;
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
