// ============================================================================
// VisionMonthlyOverview — the "חודשי" dropdown view.
// ----------------------------------------------------------------------------
// Three tap-to-edit preview cards (same language as the free-scroll feed):
//   • the current YEAR's vision on top,
//   • this month,
//   • last month.
// Tapping a card opens that vision in the editor below (onOpen → goToPeriod).
// Read-only previews keep the view light; editing happens below.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { CompassLoader } from '../../components/CompassLoader';
import { HabitIcon } from '../habits/HabitIcon';
import { fetchVisionRowMeta } from './queries';
import { visionPreviewText } from './content';
import { addAnchor, getPeriodKey, monthShort, type VisionScope } from './period';

type Props = {
  userId: string | null;
  today: Date;
  /** The period open in the editor below — gets a green ring here. */
  selectedLevel: VisionScope;
  selectedKey: string;
  /** Open a vision for editing in the editor below (stays in this view). */
  onOpen: (scope: VisionScope, anchor: Date) => void;
};

type Card = {
  scope: VisionScope;
  anchor: Date;
  key: string;
  title: string;
};

export function VisionMonthlyOverview({
  userId,
  today,
  selectedLevel,
  selectedKey,
  onOpen,
}: Props) {
  const cards = useMemo<Card[]>(() => {
    const yearAnchor = new Date(today.getFullYear(), 0, 1);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const prevMonth = addAnchor('monthly', thisMonth, -1);
    const yy = (d: Date) => String(d.getFullYear()).slice(-2);
    return [
      {
        scope: 'yearly',
        anchor: yearAnchor,
        key: getPeriodKey('yearly', yearAnchor),
        title: `חזון שנתי · ${today.getFullYear()}`,
      },
      {
        scope: 'monthly',
        anchor: thisMonth,
        key: getPeriodKey('monthly', thisMonth),
        title: `חזון חודשי · ${monthShort(thisMonth.getMonth())} ${yy(thisMonth)}`,
      },
      {
        scope: 'monthly',
        anchor: prevMonth,
        key: getPeriodKey('monthly', prevMonth),
        title: `חזון חודשי · ${monthShort(prevMonth.getMonth())} ${yy(prevMonth)}`,
      },
    ];
  }, [today]);

  const keys = useMemo(() => cards.map((c) => c.key), [cards]);
  const [meta, setMeta] = useState<
    Map<string, { content: unknown; icon: string | null }>
  >(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    fetchVisionRowMeta(userId, keys)
      .then((rows) => {
        if (cancelled) return;
        const m = new Map<string, { content: unknown; icon: string | null }>();
        for (const r of rows) m.set(r.period_key, { content: r.content, icon: r.icon });
        setMeta(m);
      })
      .catch((err) => console.error('[vision] monthly overview fetch failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, keys]);

  if (loading) {
    return (
      <div className="py-10">
        <CompassLoader size="md" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-2">
      {cards.map((c) => {
        const m = meta.get(c.key);
        const text = visionPreviewText(m?.content, 240);
        const hasText = text.length > 0;
        const icon = m?.icon ?? null;
        const isSelected = selectedLevel === c.scope && selectedKey === c.key;
        const isYear = c.scope === 'yearly';
        const bg = isYear
          ? 'bg-forest-700/[0.16] hover:bg-forest-700/20'
          : 'bg-forest-700/[0.10] hover:bg-forest-700/[0.14]';
        return (
          <button
            key={`${c.scope}:${c.key}`}
            type="button"
            onClick={() => onOpen(c.scope, c.anchor)}
            className={`w-full text-right rounded-2xl p-3 transition-colors ${bg} ${
              isSelected ? 'ring-2 ring-forest-500' : ''
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              {hasText && (
                <span
                  aria-hidden
                  className="shrink-0 w-1.5 h-1.5 rounded-full bg-white ring-2 ring-white/15"
                />
              )}
              {icon && <HabitIcon name={icon} size={15} className="shrink-0" />}
              <span
                className={`${isYear ? 'text-sm' : 'text-[13px]'} font-bold text-ink-100 truncate`}
              >
                {c.title}
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
      })}
    </div>
  );
}
