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
import { visionParagraphs } from './content';
import {
  formatPeriodLabel,
  getMonthKey,
  getWeekKey,
  getYearKey,
  type VisionScope,
} from './period';

type Props = {
  userId: string | null;
  today: Date;
  onClose: () => void;
};

type Period = { scope: VisionScope; key: string };

const TABS: { scope: VisionScope; label: string }[] = [
  { scope: 'yearly', label: 'שנתי' },
  { scope: 'monthly', label: 'חודשי' },
  { scope: 'weekly', label: 'שבועי' },
];

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
      weekly.push({ scope: 'weekly', key: getWeekKey(d) });
    }
    return {
      weekly,
      monthly: [{ scope: 'monthly', key: getMonthKey(today) }],
      yearly: [{ scope: 'yearly', key: getYearKey(today) }],
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

      {/* Tabs — quick access to the year / month / recent weeks. */}
      <div dir="rtl" className="px-3 pb-3 shrink-0">
        <div className="flex items-center p-0.5 rounded-xl bg-surface-raised ring-1 ring-surface-border">
          {TABS.map((t) => {
            const active = tab === t.scope;
            return (
              <button
                key={t.scope}
                type="button"
                onClick={() => pickTab(t.scope)}
                aria-pressed={active}
                className={`
                  flex-1 h-8 rounded-lg text-[13px] font-semibold transition-colors
                  ${
                    active
                      ? 'bg-forest-700 text-on-accent shadow-sm'
                      : 'text-ink-300 hover:text-ink-100'
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
                  scope={p.scope}
                  periodKey={p.key}
                  icon={m?.icon ?? null}
                  lines={visionParagraphs(m?.content)}
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
  scope,
  periodKey,
  icon,
  lines,
}: {
  scope: VisionScope;
  periodKey: string;
  icon: string | null;
  lines: string[];
}) {
  const empty = lines.length === 0;
  // weekly cards lead with the week's Sunday date for quick orientation.
  const label = formatPeriodLabel(scope, periodKey);
  return (
    <article className="border-s-2 border-forest-700 rounded-xl bg-surface-card/70 p-3.5">
      <header className="flex items-center gap-1.5 mb-2">
        {icon && <HabitIcon name={icon} size={16} className="shrink-0" />}
        <span className="text-[13px] font-bold text-ink-100 truncate">
          {label}
        </span>
      </header>
      {empty ? (
        <p className="text-[13px] text-ink-500 italic">
          עוד לא נכתב חזון לתקופה זו.
        </p>
      ) : (
        <div className="space-y-1.5">
          {lines.map((line, i) => (
            <p
              key={i}
              className="text-[0.9rem] text-ink-100 leading-relaxed"
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </article>
  );
}
