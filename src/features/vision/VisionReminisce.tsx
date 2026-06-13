// ============================================================================
// VisionReminisce — the desktop "look back" panel (read-only).
// ----------------------------------------------------------------------------
// A quiet, journal-like column to the LEFT of the writing page (toggled by the
// eye in the rail). Quick, READ-ONLY access to the visions around your current
// horizon, via three tabs:
//   • שבועי  — the 4 most recent past weeks (last week … 4 weeks ago)
//   • חודשי  — this month's vision            (DEFAULT)
//   • שנתי   — this year's vision
// The chosen tab is remembered per-user (so שנתי becomes your default once you
// pick it). Nothing here is editable — it renders flattened, paragraph-keeping
// text in a comfortable white, large size for easy re-reading.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, X } from 'lucide-react';
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

type Period = {
  scope: VisionScope;
  key: string;
  /** Main heading for the card. */
  title: string;
  /** Smaller line under the title (e.g. the week's date range). */
  subtitle?: string;
};

const TABS: { scope: VisionScope; label: string }[] = [
  { scope: 'yearly', label: 'שנתי' },
  { scope: 'monthly', label: 'חודשי' },
  { scope: 'weekly', label: 'שבועי' },
];

// Relative heading for each of the 4 recent weeks (last week … 4 weeks ago).
const WEEK_REL = ['שבוע שעבר', 'לפני שבועיים', 'לפני 3 שבועות', 'לפני 4 שבועות'];

/** Compact numeric date range for a week, e.g. "24.5 – 30.5" (no month name /
 *  year). Crossing a month reads naturally, e.g. "31.5 – 6.6". */
function weekRange(key: string): string {
  const start = parsePeriodStart('weekly', key);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.getDate()}.${start.getMonth() + 1} – ${end.getDate()}.${end.getMonth() + 1}`;
}

// The chosen tab is remembered per-user; חודשי is the first-time default.
const TAB_LS_PREFIX = 'vision-reminisce-tab:';

function readSavedTab(userId: string | null): VisionScope {
  if (!userId) return 'monthly';
  try {
    const v = localStorage.getItem(`${TAB_LS_PREFIX}${userId}`);
    if (v === 'yearly' || v === 'monthly' || v === 'weekly') return v;
  } catch {
    // ignore
  }
  return 'monthly';
}

export function VisionReminisce({ userId, today, onClose }: Props) {
  // The periods each tab shows, anchored to NOW. weekly = the 4 weeks BEFORE
  // this one (last week … 4 weeks ago); monthly/yearly = the current ones.
  const periodsByScope = useMemo<Record<VisionScope, Period[]>>(() => {
    const weekly: Period[] = [];
    for (let i = 1; i <= 4; i++) {
      const d = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 7 * i,
      );
      const key = getWeekKey(d);
      weekly.push({
        scope: 'weekly',
        key,
        title: WEEK_REL[i - 1],
        subtitle: weekRange(key),
      });
    }
    const monthKey = getMonthKey(today);
    const yearKey = getYearKey(today);
    return {
      weekly,
      monthly: [
        {
          scope: 'monthly',
          key: monthKey,
          title: `חזון חודשי - ${formatPeriodLabel('monthly', monthKey)}`,
        },
      ],
      yearly: [
        { scope: 'yearly', key: yearKey, title: `חזון שנתי - ${yearKey}` },
      ],
    };
  }, [today]);

  const allKeys = useMemo(
    () =>
      Array.from(
        new Set(
          Object.values(periodsByScope)
            .flat()
            .map((p) => p.key),
        ),
      ),
    [periodsByScope],
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

  // The selected tab — restored from the saved default, persisted on change.
  const [tab, setTab] = useState<VisionScope>(() => readSavedTab(userId));
  const loadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || loadedForRef.current === userId) return;
    loadedForRef.current = userId;
    setTab(readSavedTab(userId));
  }, [userId]);

  const pickTab = useCallback(
    (scope: VisionScope) => {
      setTab(scope);
      if (!userId) return;
      try {
        localStorage.setItem(`${TAB_LS_PREFIX}${userId}`, scope);
      } catch {
        // private-mode / quota — preference just won't persist.
      }
    },
    [userId],
  );

  const shown = periodsByScope[tab];
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => t.scope === tab),
  );

  return (
    <div className="flex flex-col max-h-[calc(100vh-6.5rem)] rounded-2xl bg-surface-base ring-1 ring-surface-border overflow-hidden">
      {/* Header — soft title, white eye, close on the left (RTL). */}
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

      {/* Tabs — a glowing sliding-pill toggle: the green pill GLIDES (with a
          little spring) to the choice, the active label brightens + bolds. */}
      <div dir="rtl" className="px-3 pb-3 shrink-0">
        <div className="relative flex items-center p-1 rounded-2xl bg-surface-raised ring-1 ring-surface-border">
          {/* the gliding, glowing pill */}
          <div
            aria-hidden
            className="absolute top-1 bottom-1 right-1 rounded-xl bg-gradient-to-b from-forest-500 to-forest-700 ring-1 ring-forest-400/50 shadow-[0_3px_14px_-2px_rgba(86,170,112,0.55)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.45,0.5,1)]"
            style={{
              width: 'calc((100% - 0.5rem) / 3)',
              transform: `translateX(${activeIndex * -100}%)`,
            }}
          />
          {TABS.map((t) => {
            const active = tab === t.scope;
            return (
              <button
                key={t.scope}
                type="button"
                onClick={() => pickTab(t.scope)}
                aria-pressed={active}
                className={`
                  relative z-10 flex-1 h-9 rounded-xl text-[13px] transition-all duration-200
                  ${
                    active
                      ? 'text-on-accent font-extrabold scale-[1.04] drop-shadow-sm'
                      : 'text-ink-300 font-semibold hover:text-ink-100'
                  }
                `}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scroll body — the chosen tab's vision(s), read-only. */}
      <div
        dir="ltr"
        className="flex-1 min-h-0 vision-feed-scroll overflow-y-auto overscroll-contain px-3 pb-3"
      >
        <div dir="rtl" className="space-y-2.5">
          {loading ? (
            <div className="py-12">
              <CompassLoader size="md" />
            </div>
          ) : (
            shown.map((p) => {
              const m = meta.get(p.key);
              return (
                <MemoryCard
                  key={`${p.scope}:${p.key}`}
                  title={p.title}
                  subtitle={p.subtitle}
                  icon={m?.icon ?? null}
                  content={m?.content ?? null}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function MemoryCard({
  title,
  subtitle,
  icon,
  content,
}: {
  title: string;
  subtitle?: string;
  icon: string | null;
  content: unknown;
}) {
  const empty = isVisionContentEmpty(content);
  return (
    <article className="border-s-2 border-forest-700 rounded-xl bg-surface-card/70 p-3.5">
      <header className="mb-2">
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
