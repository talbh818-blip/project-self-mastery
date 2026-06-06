// ============================================================================
// VisionScrollFeed — the "free scroll" browse mode (board view only).
// ----------------------------------------------------------------------------
// A read-only vertical feed of every vision in hierarchical time order
// (year → month → its weeks → next month → …, newest at the bottom). Scroll
// up to walk back through time; the vision crossing the centre line is the
// "current" one, which the parent highlights on the year map. Tap any vision
// to open it for editing (the parent turns free-scroll off).
//
// Read-only by design: each card shows a plain-text preview (no live editor),
// so the feed stays fast even with a year+ of entries.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { CompassLoader } from '../../components/CompassLoader';
import { HabitIcon } from '../habits/HabitIcon';
import { fetchVisionRowMeta } from './queries';
import { visionPreviewText } from './content';
import { monthShort, type VisionScope } from './period';
import { buildVisionTimeline, type TimelineItem } from './visionTimeline';

type Meta = { content: unknown; icon: string | null };

type Props = {
  userId: string | null;
  today: Date;
  /** Period key to centre on when the feed opens. */
  initialKey: string;
  /** Open a vision for editing (turns free-scroll off in the parent). */
  onOpen: (scope: VisionScope, anchor: Date) => void;
  /** The vision currently crossing the centre line — drives the map highlight. */
  onCurrentChange: (item: TimelineItem) => void;
};

function itemTitle(item: TimelineItem): string {
  if (item.scope === 'yearly') return `חזון שנתי · ${item.anchor.getFullYear()}`;
  if (item.scope === 'monthly') {
    const yy = String(item.anchor.getFullYear()).slice(-2);
    return `חזון חודשי · ${monthShort(item.anchor.getMonth())} ${yy}`;
  }
  return `חזון שבועי · ${item.anchor.getDate()}.${item.anchor.getMonth() + 1}`;
}

export function VisionScrollFeed({
  userId,
  today,
  initialKey,
  onOpen,
  onCurrentChange,
}: Props) {
  const timeline = useMemo(() => buildVisionTimeline(today, 1), [today]);

  const allKeys = useMemo(() => timeline.map((t) => t.key), [timeline]);

  const [meta, setMeta] = useState<Map<string, Meta>>(new Map());
  const [loading, setLoading] = useState(true);
  const [currentKey, setCurrentKey] = useState<string>(initialKey);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    fetchVisionRowMeta(userId, allKeys)
      .then((rows) => {
        if (cancelled) return;
        const m = new Map<string, Meta>();
        for (const r of rows) m.set(r.period_key, { content: r.content, icon: r.icon });
        setMeta(m);
      })
      .catch((err) => console.error('[vision] feed fetch failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, allKeys]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Centre the feed on the period we came from (or the newest item) once.
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const target =
      itemRefs.current.get(initialKey) ??
      itemRefs.current.get(timeline[timeline.length - 1]?.key ?? '');
    if (!target) return;
    container.scrollTop =
      target.offsetTop - container.clientHeight / 2 + target.clientHeight / 2;
    scrolledRef.current = true;
  }, [initialKey, timeline, loading]);

  // Track the item crossing the centre line → current.
  const onCurrentRef = useRef(onCurrentChange);
  onCurrentRef.current = onCurrentChange;
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const key = (e.target as HTMLElement).dataset.key;
          if (!key) continue;
          setCurrentKey((prev) => (prev === key ? prev : key));
          const item = timeline.find((t) => t.key === key);
          if (item) onCurrentRef.current(item);
        }
      },
      { root: container, rootMargin: '-50% 0px -50% 0px', threshold: 0 },
    );
    for (const el of itemRefs.current.values()) obs.observe(el);
    return () => obs.disconnect();
  }, [timeline, loading]);

  if (loading) {
    return (
      <div className="py-10">
        <CompassLoader size="md" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      dir="rtl"
      className="h-[58vh] overflow-y-auto overscroll-contain rounded-2xl bg-surface-base/40 p-1.5 space-y-2"
    >
      {timeline.map((item) => {
        const m = meta.get(item.key);
        const preview = visionPreviewText(m?.content);
        const hasContent = preview.length > 0;
        const isCurrent = item.key === currentKey;
        return (
          <button
            key={item.key}
            type="button"
            data-key={item.key}
            ref={(el) => {
              if (el) itemRefs.current.set(item.key, el);
              else itemRefs.current.delete(item.key);
            }}
            onClick={() => onOpen(item.scope, item.anchor)}
            className={`
              w-full text-right rounded-2xl p-3 transition-colors
              ${
                isCurrent
                  ? 'bg-surface-card ring-2 ring-forest-600'
                  : 'bg-surface-card/70 hover:bg-surface-card'
              }
            `}
          >
            <div className="flex items-center gap-1.5 mb-1">
              {hasContent && (
                <span
                  aria-hidden
                  className="shrink-0 w-1.5 h-1.5 rounded-full bg-white ring-2 ring-white/15"
                />
              )}
              {m?.icon && (
                <HabitIcon name={m.icon} size={15} className="shrink-0" />
              )}
              <span className="text-[13px] font-bold text-ink-100 truncate">
                {itemTitle(item)}
              </span>
            </div>
            <p
              className={`text-[12px] leading-relaxed line-clamp-3 ${
                hasContent ? 'text-ink-300' : 'text-ink-500 italic'
              }`}
            >
              {hasContent ? preview : 'עוד לא נכתב — לחץ לכתיבה'}
            </p>
          </button>
        );
      })}
    </div>
  );
}
