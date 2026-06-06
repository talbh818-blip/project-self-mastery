// ============================================================================
// Vision screen — yearly / monthly / weekly journaling.
// ----------------------------------------------------------------------------
// Navigation is a single coherent position in the year→month→week pyramid:
// one `anchor` Date + a zoom `level`. The VisionNav header renders a
// breadcrumb (tap a parent level to zoom OUT) and a period stepper
// (swipe / arrows to move within the level). Everything below derives from
// (level, anchor), so the breadcrumb is always internally consistent — even
// when stepping a week crosses a month/year boundary.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { VisionEditor } from '../features/vision/VisionEditor';
import { VisionLayers } from '../features/vision/VisionLayers';
import { VisionViewBar, type VisionView } from '../features/vision/VisionViewBar';
import { VisionYearMap } from '../features/vision/VisionYearMap';
import { VisionScrollFeed } from '../features/vision/VisionScrollFeed';
import { VisionIconPicker } from '../features/vision/VisionIconPicker';
import { VisionHistorySheet } from '../features/vision/VisionHistorySheet';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useVisionEntry } from '../features/vision/useVisionEntry';
import { fetchVisionRowMeta } from '../features/vision/queries';
import { updateVisionEntryIcon } from '../features/vision/mutations';
import { isVisionContentEmpty } from '../features/vision/content';
import { useAuth } from '../hooks/useAuth';
import { CompassLoader } from '../components/CompassLoader';
import {
  addAnchor,
  getPeriodKey,
  getWeekKey,
  isFuturePeriod,
  monthShort,
  parsePeriodStart,
  type VisionScope,
} from '../features/vision/period';

type ScopeIcons = Partial<Record<VisionScope, string | null>>;
type ScopeFlags = Partial<Record<VisionScope, boolean>>;

// Nesting depth — drives the editor's zoom direction on level switches.
const SCOPE_DEPTH: Record<VisionScope, number> = {
  yearly: 0,
  monthly: 1,
  weekly: 2,
};

const PLACEHOLDERS: Record<VisionScope, string> = {
  yearly: 'מה החזון שלך לשנה הזו? מה הכי חשוב לך להשיג?',
  monthly: 'איך אתה רוצה שהחודש הזה ייראה?',
  weekly: 'מה המיקוד שלך לשבוע הזה?',
};

// Per-user remembered view. The map ("board") is the default for a brand-new
// user; once someone switches, their choice sticks (per user, per device).
const VIEW_LS_PREFIX = 'vision-view:';

function readSavedView(userId: string | null): VisionView {
  if (!userId) return 'board';
  try {
    const saved = localStorage.getItem(`${VIEW_LS_PREFIX}${userId}`);
    if (saved === 'layers' || saved === 'board' || saved === 'feed') return saved;
  } catch {
    // ignore — fall through to default
  }
  return 'board';
}

export function Vision() {
  const today = useMemo(() => new Date(), []);
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Single position in the pyramid: a zoom level + an anchor date. Fresh
  // loads land on the CURRENT WEEK — the most actionable horizon.
  const [level, setLevel] = useState<VisionScope>('weekly');
  const [anchor, setAnchor] = useState<Date>(today);

  // Top-bar state: whether the navigator drawer is expanded, and which view is
  // active. The map ("board") is the default view; each user's last choice is
  // remembered per-user in localStorage and wins on entry.
  const [layersOpen, setLayersOpen] = useState(true);
  const [view, setView] = useState<VisionView>(() => readSavedView(userId));
  // The year the MAP shows — decoupled from `anchor` so stepping years in the
  // map doesn't move the vision currently open in the editor below it.
  const [mapYear, setMapYear] = useState(() => today.getFullYear());

  // Once auth resolves, apply this user's saved view preference (the lazy
  // initializer above may have run before userId was known).
  const viewLoadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || viewLoadedForRef.current === userId) return;
    viewLoadedForRef.current = userId;
    setView(readSavedView(userId));
  }, [userId]);

  // Switch + remember the view. Entering the map lines it up with the open
  // period's year.
  const changeView = useCallback(
    (v: VisionView) => {
      if (v === 'board') setMapYear(anchor.getFullYear());
      setView(v);
      if (userId) {
        try {
          localStorage.setItem(`${VIEW_LS_PREFIX}${userId}`, v);
        } catch {
          // private-mode / quota — preference just won't persist.
        }
      }
    },
    [anchor, userId],
  );

  const periodKey = getPeriodKey(level, anchor);
  const locked = isFuturePeriod(level, periodKey);

  // The three period keys for the current anchor — one per row of the
  // layered navigator. Each row shows its own icon (persistently), so we
  // load all three at once whenever the anchor moves.
  const yearKey = getPeriodKey('yearly', anchor);
  const monthKey = getPeriodKey('monthly', anchor);
  const weekKey = getPeriodKey('weekly', anchor);

  const [icons, setIcons] = useState<ScopeIcons>({});
  // Which rows already have written content → drives the "written" check-mark.
  const [written, setWritten] = useState<ScopeFlags>({});

  // In-memory cache of row-meta keyed by `${scope}:${periodKey}`. Navigation
  // used to re-hit the DB on every step, so the icons + "written" dots
  // visibly trailed the (synchronous) period labels. We now seed instantly
  // from the cache and only round-trip for periods we haven't seen yet — so
  // stepping back and forth feels smooth.
  const metaCacheRef = useRef<
    Map<string, { icon: string | null; written: boolean }>
  >(new Map());

  useEffect(() => {
    if (!userId) return;
    const pairs: [VisionScope, string][] = [
      ['yearly', yearKey],
      ['monthly', monthKey],
      ['weekly', weekKey],
    ];

    // 1. Seed from cache so revisited periods render with no lag and no flash
    //    of the previous period's icons.
    const seedIcons: ScopeIcons = {};
    const seedWritten: ScopeFlags = {};
    let allCached = true;
    for (const [scope, key] of pairs) {
      const hit = metaCacheRef.current.get(`${scope}:${key}`);
      if (hit) {
        seedIcons[scope] = hit.icon;
        seedWritten[scope] = hit.written;
      } else {
        allCached = false;
      }
    }
    setIcons(seedIcons);
    setWritten(seedWritten);
    if (allCached) return; // fully served from cache — skip the round-trip

    // 2. Refresh from the DB, then cache every requested key (including the
    //    ones with no row, cached as empty, so they don't re-fetch later).
    let cancelled = false;
    fetchVisionRowMeta(userId, [yearKey, monthKey, weekKey])
      .then((rows) => {
        if (cancelled) return;
        const nextIcons: ScopeIcons = {};
        const nextWritten: ScopeFlags = {};
        for (const [scope] of pairs) {
          nextIcons[scope] = null;
          nextWritten[scope] = false;
        }
        for (const r of rows) {
          nextIcons[r.scope] = r.icon;
          nextWritten[r.scope] = !isVisionContentEmpty(r.content);
        }
        for (const [scope, key] of pairs) {
          metaCacheRef.current.set(`${scope}:${key}`, {
            icon: nextIcons[scope] ?? null,
            written: nextWritten[scope] ?? false,
          });
        }
        setIcons(nextIcons);
        setWritten(nextWritten);
      })
      .catch((err) => console.error('[vision] row-meta fetch failed', err));
    return () => {
      cancelled = true;
    };
  }, [userId, yearKey, monthKey, weekKey]);

  // Which level's icon picker is open (null = closed). Opened by tapping a
  // row's icon tile in VisionLayers — so any level's icon can be set, not
  // just the active one.
  const [iconPickerLevel, setIconPickerLevel] = useState<VisionScope | null>(
    null,
  );
  // Apply the picked icon to the level whose tile was tapped. Optimistic
  // local update so the tile changes instantly; persists in the background.
  const applyIcon = useCallback(
    (icon: string | null) => {
      const lvl = iconPickerLevel;
      if (!lvl) return;
      const key = getPeriodKey(lvl, anchor);
      setIcons((prev) => ({ ...prev, [lvl]: icon }));
      // Keep the cache in sync so leaving and returning shows the new icon.
      const prevMeta = metaCacheRef.current.get(`${lvl}:${key}`);
      metaCacheRef.current.set(`${lvl}:${key}`, {
        icon,
        written: prevMeta?.written ?? false,
      });
      if (!userId) return;
      void updateVisionEntryIcon(userId, lvl, key, icon).catch((err) =>
        console.error('[vision] icon save failed', err),
      );
    },
    [iconPickerLevel, userId, anchor],
  );

  // Editor zoom direction: deeper level (year→month→week) = zoom IN, broader
  // = zoom OUT. Compared to the previous level; ref updates after commit.
  const prevLevelRef = useRef<VisionScope>(level);
  const zoomDir: 'in' | 'out' =
    SCOPE_DEPTH[level] >= SCOPE_DEPTH[prevLevelRef.current] ? 'in' : 'out';
  useEffect(() => {
    prevLevelRef.current = level;
  }, [level]);

  const { entry, loading, status, contentVersion, scheduleSave, restore } =
    useVisionEntry(level, periodKey);

  // Version-history (restore) sheet.
  const [historyOpen, setHistoryOpen] = useState(false);

  // Live-track whether the ACTIVE entry has content as the user types, so the
  // check-mark appears/disappears instantly (not only after the debounced
  // save). Wraps scheduleSave — declared AFTER useVisionEntry so scheduleSave
  // is in scope.
  const handleEditorChange = useCallback(
    (json: unknown) => {
      const empty = isVisionContentEmpty(json);
      setWritten((prev) =>
        prev[level] === !empty ? prev : { ...prev, [level]: !empty },
      );
      // Mirror the live "written" state into the cache for this period.
      const prevMeta = metaCacheRef.current.get(`${level}:${periodKey}`);
      metaCacheRef.current.set(`${level}:${periodKey}`, {
        icon: prevMeta?.icon ?? null,
        written: !empty,
      });
      scheduleSave(json);
    },
    [level, periodKey, scheduleSave],
  );

  // The DateBar title (scope name + period range) + its quick period stepper.
  // Stepping the title also moves the MAP's year to match, so crossing a year
  // boundary (e.g. back into 2025) re-paints the board for that year.
  const visionTitle = formatVisionTitle(level, anchor);
  const stepPeriod = (delta: number) => {
    const next = addAnchor(level, anchor, delta);
    setAnchor(next);
    setMapYear(next.getFullYear());
  };
  const canStepNext = !isFuturePeriod(
    level,
    getPeriodKey(level, addAnchor(level, anchor, 1)),
  );

  // Activate a level at a given anchor — centre tap or side step.
  const pick = (targetLevel: VisionScope, targetAnchor: Date) => {
    setAnchor(targetAnchor);
    setLevel(targetLevel);
  };

  // "Jump to now" — always returns to the CURRENT WEEK (which inherently
  // lands on the current month + year too). One consistent "back to today"
  // action in both views. Disabled only when we're already there.
  const onCurrentWeek =
    level === 'weekly' && periodKey === getPeriodKey('weekly', today);
  const mapOnCurrentYear = view !== 'board' || mapYear === today.getFullYear();
  const jumpToNow = {
    label: 'השבוע',
    enabled: !(onCurrentWeek && mapOnCurrentYear),
    onJump: () => {
      setAnchor(today);
      setLevel('weekly');
      setMapYear(today.getFullYear());
    },
  };

  // Map-view navigation: tapping a period opens it in the editor BELOW the
  // map — the map view stays put.
  const goToPeriod = (targetLevel: VisionScope, targetAnchor: Date) => {
    setAnchor(targetAnchor);
    setLevel(targetLevel);
  };

  // Feed → tap a vision: jump to it and open the map view (so the editor +
  // map context show). Sync the map's year to the opened period.
  const openFromFeed = (targetLevel: VisionScope, targetAnchor: Date) => {
    setAnchor(targetAnchor);
    setLevel(targetLevel);
    setMapYear(targetAnchor.getFullYear());
    setView('board');
  };

  // The writing surface for the active period — shared by BOTH views (the map
  // shows it below the grid, the layered view below the navigator).
  const editorBlock = locked ? (
    <LockedNotice level={level} />
  ) : loading ? (
    <div className="vision-page py-10">
      <CompassLoader size="md" />
    </div>
  ) : (
    <VisionEditor
      // resetKey re-mounts the editor when the period changes — and when
      // contentVersion bumps (external/live content replaced what's shown),
      // so cross-device edits become visible.
      resetKey={`${level}:${periodKey}:${contentVersion}`}
      scope={level}
      zoomDir={zoomDir}
      initialContent={entry?.content ?? null}
      placeholder={PLACEHOLDERS[level]}
      saveStatus={status}
      title={visionTitle}
      onStepPeriod={stepPeriod}
      canStepNext={canStepNext}
      jumpToNow={jumpToNow}
      icon={icons[level] ?? null}
      onIconClick={() => setIconPickerLevel(level)}
      onOpenHistory={() => setHistoryOpen(true)}
      onChange={handleEditorChange}
    />
  );

  return (
    // -mt-3 tightens the gap with the global brand header.
    <section className="-mt-3 pb-3">
      <VisionViewBar
        layersOpen={layersOpen}
        onToggleLayers={() => setLayersOpen((v) => !v)}
        view={view}
        onViewChange={changeView}
      />

      {view === 'feed' ? (
        // Free-scroll feed — a view of its own (no navigator, no single
        // editor). Tapping a vision opens it in the map view.
        <VisionScrollFeed
          userId={userId}
          today={today}
          initialKey={periodKey}
          onOpen={openFromFeed}
        />
      ) : (
        <>
          {/* Active navigator (layer stack OR year map) — collapses as a
              drawer. The grid 0fr↔1fr trick animates real content height with
              no JS measuring; the inner wrapper clips during the fold. */}
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-in-out"
            style={{ gridTemplateRows: layersOpen ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden min-h-0">
              {view === 'board' ? (
                <VisionYearMap
                  userId={userId}
                  year={mapYear}
                  today={today}
                  selectedLevel={level}
                  selectedKey={periodKey}
                  onStepYear={(delta) => setMapYear((y) => y + delta)}
                  onPickYear={() => goToPeriod('yearly', new Date(mapYear, 0, 1))}
                  onPickMonth={(monthKey) =>
                    goToPeriod('monthly', parsePeriodStart('monthly', monthKey))
                  }
                  onPickWeek={(weekKey) =>
                    goToPeriod('weekly', parsePeriodStart('weekly', weekKey))
                  }
                />
              ) : (
                <VisionLayers
                  level={level}
                  anchor={anchor}
                  onPick={pick}
                  icons={icons}
                  written={written}
                />
              )}
            </div>
          </div>

          {/* The chosen vision, below the navigator. Wrapped in an error
              boundary so a transient editor remount crash self-heals instead
              of black-screening. */}
          <div className={view === 'board' ? 'mt-4' : ''}>
            <ErrorBoundary
              resetKeys={[level, periodKey, contentVersion]}
              pendingFallback={
                <div className="vision-page py-10">
                  <CompassLoader size="md" />
                </div>
              }
              fallback={(retry) => (
                <div className="vision-page text-center py-10">
                  <p className="text-ink-100 font-medium">משהו השתבש בטעינת החזון</p>
                  <button
                    type="button"
                    onClick={retry}
                    className="mt-3 inline-flex items-center h-9 px-4 rounded-lg bg-forest-700 text-cream-50 text-sm font-medium hover:bg-forest-600 transition-colors"
                  >
                    נסה שוב
                  </button>
                </div>
              )}
            >
              {editorBlock}
            </ErrorBoundary>
          </div>
        </>
      )}

      {/* Icon picker — opened from the DateBar's icon button (current level). */}
      <VisionIconPicker
        open={iconPickerLevel !== null}
        value={iconPickerLevel ? icons[iconPickerLevel] ?? null : null}
        onPick={applyIcon}
        onClose={() => setIconPickerLevel(null)}
      />

      {/* Version history — restore a previous version of the open vision. */}
      <VisionHistorySheet
        open={historyOpen}
        userId={userId}
        scope={level}
        periodKey={periodKey}
        onRestore={(content) => void restore(content)}
        onClose={() => setHistoryOpen(false)}
      />
    </section>
  );
}

/** The vision's display title: scope name + a compact period range, e.g.
 *  "חזון שבועי · 7–13.6.26", "חזון חודשי · יוני 2026", "חזון שנתי · 2026". */
function formatVisionTitle(level: VisionScope, anchor: Date): string {
  if (level === 'yearly') return `חזון שנתי · ${anchor.getFullYear()}`;
  if (level === 'monthly') {
    const yy = String(anchor.getFullYear()).slice(-2);
    return `חזון חודשי · ${monthShort(anchor.getMonth())} ${yy}`;
  }
  // weekly — short: just the Sunday that opens the week (day.month).
  const start = parsePeriodStart('weekly', getWeekKey(anchor));
  return `חזון שבועי · ${start.getDate()}.${start.getMonth() + 1}`;
}

function LockedNotice({ level }: { level: VisionScope }) {
  const noun =
    level === 'yearly' ? 'השנה' : level === 'monthly' ? 'החודש' : 'השבוע';
  return (
    <div className="vision-page text-center">
      <div className="py-8">
        <Lock size={28} className="text-ink-500 mx-auto mb-3" />
        <p className="text-ink-100 font-medium">{noun} עוד לא הגיע</p>
        <p className="text-ink-300 text-sm mt-1">
          אפשר לכתוב חזון רק לתקופה שכבר התחילה.
        </p>
      </div>
    </div>
  );
}
