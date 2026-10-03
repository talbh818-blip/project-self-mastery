// ============================================================================
// VisionReminisce — the desktop "look back" panel (read-only).
// ----------------------------------------------------------------------------
// A quiet, journal-like column to the LEFT of the writing page (toggled by the
// eye in the rail). At the top are THREE tab buttons — חזון שנתי · חזון חודשי ·
// חזון שבועי — and exactly ONE is active at a time. The active scope's visions
// are listed top-to-bottom, NEWEST first (the current period at the top, older
// periods below). Periods the user never wrote are still shown, as an empty
// card ("עוד לא נכתב חזון לתקופה זו"), so the timeline has no holes. Everything
// is READ-ONLY and rendered with real formatting via VisionReadOnly.
//
// The chosen tab is remembered per-user. There is no paging and no drag — the
// whole range (first-written … current, gaps filled) is always on screen.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, X, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { CompassLoader } from '../../components/CompassLoader';
import { HabitIcon } from '../habits/HabitIcon';
import { fetchVisionEntriesForScope } from './queries';
import { isVisionContentEmpty } from './content';
import { VisionReadOnly } from './VisionReadOnly';
import {
  addPeriod,
  formatPeriodLabel,
  getPeriodKey,
  parsePeriodStart,
  type VisionScope,
} from './period';

type Props = {
  userId: string | null;
  today: Date;
  onClose: () => void;
};

type ScopeTab = { scope: VisionScope; label: string };

// The three tabs, in display order (RTL → first one is rightmost).
const TABS: ScopeTab[] = [
  { scope: 'yearly', label: 'חזון שנתי' },
  { scope: 'monthly', label: 'חזון חודשי' },
  { scope: 'weekly', label: 'חזון שבועי' },
];
const SCOPE_IDS: VisionScope[] = TABS.map((t) => t.scope);

// Which tab is active — remembered per-user.
const SCOPE_LS_PREFIX = 'vision-reminisce-scope:';
// Whether the cards are manually minimized (compact) — remembered per-user.
const MIN_LS_PREFIX = 'vision-reminisce-min:';

// A hard cap on how many periods we ever walk back, so a malformed/legacy key
// can never spin the builder into an endless loop.
const MAX_PERIODS = 600;

function readSavedMin(userId: string | null): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(`${MIN_LS_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
}

function readSavedScope(userId: string | null): VisionScope {
  if (!userId) return 'yearly';
  try {
    const raw = localStorage.getItem(`${SCOPE_LS_PREFIX}${userId}`);
    if (raw && (SCOPE_IDS as string[]).includes(raw)) return raw as VisionScope;
  } catch {
    // ignore
  }
  return 'yearly';
}

type CardMeta = { content: unknown; icon: string | null };

export function VisionReminisce({ userId, today, onClose }: Props) {
  // The active tab (single-select), persisted per-user.
  const [scope, setScope] = useState<VisionScope>(() => readSavedScope(userId));
  // Manual "minimize" toggle — collapses every written card to a short preview.
  const [minimized, setMinimized] = useState<boolean>(() => readSavedMin(userId));
  // The active scope's rows, keyed by period_key. null while loading.
  const [entries, setEntries] = useState<Map<string, CardMeta> | null>(null);

  // Drop a late response from a previous user / scope.
  const reqRef = useRef(0);

  // Re-sync persisted prefs when the user changes.
  const loadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || loadedForRef.current === userId) return;
    loadedForRef.current = userId;
    setScope(readSavedScope(userId));
    setMinimized(readSavedMin(userId));
  }, [userId]);

  // Fetch every row of the active scope whenever the user or scope changes.
  useEffect(() => {
    if (!userId) {
      setEntries(new Map());
      return;
    }
    const req = ++reqRef.current;
    setEntries(null); // show the loader
    fetchVisionEntriesForScope(userId, scope)
      .then((rows) => {
        if (reqRef.current !== req) return;
        const map = new Map<string, CardMeta>();
        for (const r of rows) {
          map.set(r.period_key, { content: r.content, icon: r.icon });
        }
        setEntries(map);
      })
      .catch((err) => {
        console.error('[vision] reminisce scope fetch failed', err);
        if (reqRef.current !== req) return;
        setEntries(new Map()); // resolve to an empty timeline, never hang
      });
  }, [userId, scope]);

  const selectScope = useCallback(
    (next: VisionScope) => {
      setScope(next);
      if (userId) {
        try {
          localStorage.setItem(`${SCOPE_LS_PREFIX}${userId}`, next);
        } catch {
          // ignore
        }
      }
    },
    [userId],
  );

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

  // The ordered list of periods to show: from the latest period that has a
  // written vision (or now, whichever is later) down to the earliest written
  // one (or now, whichever is earlier) — NEWEST first. Gaps are kept so an
  // unwritten period still gets an empty card.
  const periodKeys = useMemo(() => {
    const currentKey = getPeriodKey(scope, today);
    const startAt = (k: string) => parsePeriodStart(scope, k).getTime();

    let minT = startAt(currentKey);
    let maxKey = currentKey;
    let maxT = minT;
    if (entries) {
      for (const k of entries.keys()) {
        const t = startAt(k);
        if (t < minT) minT = t;
        if (t > maxT) {
          maxT = t;
          maxKey = k;
        }
      }
    }

    const out: string[] = [];
    let k = maxKey;
    for (let i = 0; i < MAX_PERIODS; i++) {
      out.push(k);
      if (startAt(k) <= minT) break;
      k = addPeriod(scope, k, -1);
    }
    return out;
  }, [scope, today, entries]);

  const loading = entries === null;

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

      {/* Tab picker — choose a scope (single-select). The active scope's whole
          timeline is listed below, newest first. */}
      <div
        dir="rtl"
        className="px-3 pb-2.5 shrink-0 border-b border-surface-border"
      >
        <div className="flex items-center gap-1.5">
          {TABS.map((t) => {
            const active = t.scope === scope;
            return (
              <button
                key={t.scope}
                type="button"
                onClick={() => selectScope(t.scope)}
                aria-pressed={active}
                className={`flex-1 rounded-lg py-1.5 px-2 text-[13px] font-semibold transition-colors ${
                  active
                    ? 'bg-forest-700 text-on-accent'
                    : 'bg-surface-raised/50 text-ink-300 hover:text-ink-100 hover:bg-surface-raised'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body: the chosen scope's visions, newest → oldest. */}
      <div
        dir="ltr"
        className="flex-1 min-h-0 vision-feed-scroll overflow-y-auto overscroll-contain p-3"
      >
        <div dir="rtl">
          {loading ? (
            <div className="py-14 flex justify-center">
              <CompassLoader size="sm" />
            </div>
          ) : (
            <div className="space-y-2.5">
              {periodKeys.map((key) => {
                const m = entries?.get(key);
                return (
                  <MemoryCardView
                    key={key}
                    title={formatPeriodLabel(scope, key)}
                    icon={m?.icon ?? null}
                    content={m?.content ?? null}
                    collapsed={minimized}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Presentational card. `collapsed` clamps a written body to a short, fading
// preview. An unwritten period shows a quiet empty line.
function MemoryCardView({
  title,
  icon,
  content,
  collapsed,
}: {
  title: string;
  icon: string | null;
  content: unknown;
  collapsed?: boolean;
}) {
  const empty = isVisionContentEmpty(content);
  return (
    <article className="border-s-2 border-forest-700 rounded-xl bg-surface-card/70 p-3.5">
      <header className="mb-2 flex items-center gap-1.5">
        {icon && <HabitIcon name={icon} size={16} className="shrink-0" />}
        <span className="min-w-0 text-[13px] font-bold text-ink-100 truncate">
          {title}
        </span>
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
