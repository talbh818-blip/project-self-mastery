// ============================================================================
// VisionScrollFeed — the "free scroll" view (a top-level view of its own).
// ----------------------------------------------------------------------------
// A read-only vertical feed of every vision in hierarchical time order
// (year → month → its weeks → next month → …, newest at the bottom). A search
// box at the top filters to visions containing a word. Tap a vision to open
// it for editing. Read-only by design (plain-text previews, no live editors)
// so the feed stays fast across a year+ of entries.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { CompassLoader } from '../../components/CompassLoader';
import { HabitIcon } from '../habits/HabitIcon';
import { fetchVisionRowMeta } from './queries';
import { visionPreviewText } from './content';
import { monthShort, type VisionScope } from './period';
import { buildVisionTimeline, type TimelineItem } from './visionTimeline';

type Props = {
  userId: string | null;
  today: Date;
  /** Period key to centre on when the feed opens. */
  initialKey: string;
  /** Search query — lifted to the view bar above the feed. */
  query: string;
  /** Open a vision for editing. */
  onOpen: (scope: VisionScope, anchor: Date) => void;
};

function itemTitle(item: TimelineItem): string {
  if (item.scope === 'yearly') return `חזון שנתי · ${item.anchor.getFullYear()}`;
  if (item.scope === 'monthly') {
    const yy = String(item.anchor.getFullYear()).slice(-2);
    return `חזון חודשי · ${monthShort(item.anchor.getMonth())} ${yy}`;
  }
  return `חזון שבועי · ${item.anchor.getDate()}.${item.anchor.getMonth() + 1}`;
}

export function VisionScrollFeed({ userId, today, initialKey, query, onOpen }: Props) {
  const timeline = useMemo(() => buildVisionTimeline(today, 1), [today]);
  const allKeys = useMemo(() => timeline.map((t) => t.key), [timeline]);

  const [meta, setMeta] = useState<Map<string, { content: unknown; icon: string | null }>>(
    new Map(),
  );
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
      .catch((err) => console.error('[vision] feed fetch failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, allKeys]);

  // Pre-compute each item's title + full text (for search) + icon.
  const entries = useMemo(
    () =>
      timeline.map((item) => {
        const m = meta.get(item.key);
        return {
          item,
          icon: m?.icon ?? null,
          title: itemTitle(item),
          text: visionPreviewText(m?.content, 100000), // full text for search
        };
      }),
    [timeline, meta],
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return entries;
    return entries.filter(
      (e) => e.text.toLowerCase().includes(q) || e.title.toLowerCase().includes(q),
    );
  }, [entries, q]);

  // Centre the feed on the period we came from (or the newest item) once —
  // only in the unfiltered list.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current || loading || q) return;
    const container = containerRef.current;
    if (!container) return;
    const target =
      itemRefs.current.get(initialKey) ??
      itemRefs.current.get(timeline[timeline.length - 1]?.key ?? '');
    if (!target) return;
    container.scrollTop =
      target.offsetTop - container.clientHeight / 2 + target.clientHeight / 2;
    scrolledRef.current = true;
  }, [initialKey, timeline, loading, q]);

  return (
    <div dir="rtl" className="mt-1">
      {loading ? (
        <div className="py-10">
          <CompassLoader size="md" />
        </div>
      ) : (
        // dir=ltr puts the scrollbar on the RIGHT; the inner list flips back to
        // rtl. The custom-styled bar comes from `.vision-feed-scroll`.
        <div
          ref={containerRef}
          dir="ltr"
          className="vision-feed-scroll h-[calc(100dvh-132px)] min-h-[40vh] overflow-y-auto overscroll-contain rounded-2xl bg-surface-base/40 p-1.5"
        >
          <div dir="rtl" className="space-y-2">
            {filtered.length === 0 ? (
              <p className="text-center text-ink-300 text-sm py-10">
                {q ? 'לא נמצאו חזונות עם המילה הזו' : 'אין עדיין חזונות'}
              </p>
            ) : (
              filtered.map(({ item, icon, title, text }) => {
                const hasText = text.length > 0;
                // Subtle level cue: month/year cards get a faint forest tint
                // (year a touch stronger + larger title); weeks stay neutral.
                const bg =
                  item.scope === 'yearly'
                    ? 'bg-forest-700/[0.16] hover:bg-forest-700/20'
                    : item.scope === 'monthly'
                      ? 'bg-forest-700/[0.10] hover:bg-forest-700/[0.14]'
                      : 'bg-surface-card/70 hover:bg-surface-card';
                const titleSize =
                  item.scope === 'yearly' ? 'text-sm' : 'text-[13px]';
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
                    className={`w-full text-right rounded-2xl p-3 transition-colors ${bg}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {hasText && (
                        <span
                          aria-hidden
                          className="shrink-0 w-1.5 h-1.5 rounded-full bg-white ring-2 ring-white/15"
                        />
                      )}
                      {icon && <HabitIcon name={icon} size={15} className="shrink-0" />}
                      <span className={`${titleSize} font-bold text-ink-100 truncate`}>
                        {title}
                      </span>
                    </div>
                    <p
                      className={`text-[12px] leading-relaxed line-clamp-3 ${
                        hasText ? 'text-ink-300' : 'text-ink-500 italic'
                      }`}
                    >
                      {hasText ? text : 'עוד לא נכתב — לחץ לכתיבה'}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
