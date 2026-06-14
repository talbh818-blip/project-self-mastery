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

  const handleDragEnd = (e: DragEndEvent) => {
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

      {/* Checkbox picker — choose what to view (multi-select). */}
      <div dir="rtl" className="px-3 pb-2.5 shrink-0 border-b border-surface-border">
        <CheckRow checked={checked.has('yearly')} label="חזון שנתי" onToggle={() => toggle('yearly')} />
        <CheckRow checked={checked.has('monthly')} label="חזון חודשי" onToggle={() => toggle('monthly')} />
        <CheckRow checked={checked.has('w1')} label="שבוע שעבר" onToggle={() => toggle('w1')} />
        {w1Checked && (
          <div className="vision-subweeks">
            <CheckRow sub checked={checked.has('w2')} label="לפני 2 שבועות" onToggle={() => toggle('w2')} />
            <CheckRow sub checked={checked.has('w3')} label="לפני 3 שבועות" onToggle={() => toggle('w3')} />
            <CheckRow sub checked={checked.has('w4')} label="לפני 4 שבועות" onToggle={() => toggle('w4')} />
          </div>
        )}
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
              onDragEnd={handleDragEnd}
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
                      />
                    );
                  })}
                </div>
              </SortableContext>
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
      className={`flex items-center gap-2.5 w-full text-right rounded-lg py-1.5 transition-colors hover:bg-surface-raised/50 ${
        sub ? 'ps-7 pe-2' : 'px-2'
      }`}
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

function SortableMemory({
  id,
  title,
  subtitle,
  icon,
  content,
}: {
  id: string;
  title: string;
  subtitle?: string;
  icon: string | null;
  content: unknown;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const empty = isVisionContentEmpty(content);
  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`border-s-2 border-forest-700 rounded-xl bg-surface-card/70 p-3.5 ${
        isDragging ? 'relative z-10 opacity-90 shadow-xl ring-1 ring-forest-600' : ''
      }`}
    >
      <header className="mb-2 flex items-start gap-2">
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
        {/* Drag handle (Trello-style reorder). */}
        <button
          type="button"
          aria-label="גרור לסידור מחדש"
          title="גרור לסידור"
          {...attributes}
          {...listeners}
          style={{ touchAction: 'none' }}
          className="shrink-0 -me-1 cursor-grab active:cursor-grabbing text-ink-500 hover:text-ink-300 transition-colors"
        >
          <GripVertical size={16} />
        </button>
      </header>
      {empty ? (
        <p className="text-[13px] text-ink-500 italic">
          עוד לא נכתב חזון לתקופה זו.
        </p>
      ) : (
        <VisionReadOnly content={content} />
      )}
    </article>
  );
}
