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
import { Lock, Hammer } from 'lucide-react';
import { VisionEditor } from '../features/vision/VisionEditor';
import {
  VisionViewBar,
  type VisionView,
  type VisionLevelView,
} from '../features/vision/VisionViewBar';
import { VisionYearMap } from '../features/vision/VisionYearMap';
import { VisionScrollFeed } from '../features/vision/VisionScrollFeed';
import { VisionIconPicker } from '../features/vision/VisionIconPicker';
import { VisionHistorySheet } from '../features/vision/VisionHistorySheet';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useVisionEntry } from '../features/vision/useVisionEntry';
import { fetchVisionRowMeta } from '../features/vision/queries';
import { updateVisionEntryIcon } from '../features/vision/mutations';
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

// Per-user remembered view. The yearly map is the default for a brand-new
// user; once someone switches, their choice sticks (per user, per device).
const VIEW_LS_PREFIX = 'vision-view:';

function readSavedView(userId: string | null): VisionView {
  if (!userId) return 'yearly';
  try {
    const saved = localStorage.getItem(`${VIEW_LS_PREFIX}${userId}`);
    // 'board' is the legacy key for what is now the yearly map.
    if (saved === 'board') return 'yearly';
    if (
      saved === 'yearly' ||
      saved === 'monthly' ||
      saved === 'weekly' ||
      saved === 'feed'
    )
      return saved;
  } catch {
    // ignore — fall through to default
  }
  return 'yearly';
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
  // active. The view is modelled as two independent pieces so the Google-
  // Calendar-style dropdown (a LEVEL view: yearly/monthly/weekly) and the
  // SEPARATE free-scroll button don't fight over one slot:
  //   • levelView — which granularity the dropdown last picked (also its label
  //     while the feed is open),
  //   • feedActive — whether the free-scroll feed is the active surface.
  // `view` is the resolved active surface. Each user's last choice is
  // remembered per-user in localStorage and wins on entry.
  const [layersOpen, setLayersOpen] = useState(true);
  const initialView = useMemo(() => readSavedView(userId), [userId]);
  const [levelView, setLevelView] = useState<VisionLevelView>(
    initialView === 'feed' ? 'yearly' : initialView,
  );
  const [feedActive, setFeedActive] = useState(initialView === 'feed');
  const view: VisionView = feedActive ? 'feed' : levelView;
  // Feed-view search query — lifted here so the search box can live in the top
  // view-bar row (left of the toggles) instead of inside the feed.
  const [feedQuery, setFeedQuery] = useState('');
  // The year the MAP shows — decoupled from `anchor` so stepping years in the
  // map doesn't move the vision currently open in the editor below it.
  const [mapYear, setMapYear] = useState(() => today.getFullYear());
  // The "חודשי" view's window: the LATER of the two months it shows (the pair
  // is [monthlyAnchor−1, monthlyAnchor]). Stepped by the flanking arrows;
  // independent of the editor's open period below.
  const [monthlyAnchor, setMonthlyAnchor] = useState<Date>(today);

  const persistView = useCallback(
    (v: VisionView) => {
      if (!userId) return;
      try {
        localStorage.setItem(`${VIEW_LS_PREFIX}${userId}`, v);
      } catch {
        // private-mode / quota — preference just won't persist.
      }
    },
    [userId],
  );

  // Once auth resolves, apply this user's saved view preference (the lazy
  // initializer above may have run before userId was known).
  const viewLoadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || viewLoadedForRef.current === userId) return;
    viewLoadedForRef.current = userId;
    const v = readSavedView(userId);
    if (v === 'feed') {
      setFeedActive(true);
    } else {
      setFeedActive(false);
      setLevelView(v);
    }
  }, [userId]);

  // Pick a level view from the dropdown. Entering the yearly map lines it up
  // with the open period's year.
  const pickLevelView = useCallback(
    (v: VisionLevelView) => {
      setLevelView(v);
      setFeedActive(false);
      // Yearly: line the map up with the open period's year. Monthly: open on
      // the current pair (this month + last), header on the current year.
      if (v === 'yearly') setMapYear(anchor.getFullYear());
      else if (v === 'monthly') {
        setMonthlyAnchor(today);
        setMapYear(today.getFullYear());
      }
      persistView(v);
    },
    [anchor, today, persistView],
  );

  // Step the "חודשי" window a month back/forward; keep the year header (mapYear)
  // in sync with the window's later month.
  const stepMonthlyWindow = useCallback(
    (delta: number) => {
      const next = new Date(
        monthlyAnchor.getFullYear(),
        monthlyAnchor.getMonth() + delta,
        1,
      );
      setMonthlyAnchor(next);
      setMapYear(next.getFullYear());
    },
    [monthlyAnchor],
  );
  // Forward is allowed only while the next window's later month isn't future.
  const monthlyCanStepNext = !isFuturePeriod(
    'monthly',
    getPeriodKey('monthly', addAnchor('monthly', monthlyAnchor, 1)),
  );

  // Switch to the (separate) free-scroll feed.
  const pickFeed = useCallback(() => {
    setFeedActive(true);
    persistView('feed');
  }, [persistView]);

  const periodKey = getPeriodKey(level, anchor);
  const locked = isFuturePeriod(level, periodKey);

  // The three period keys for the current anchor — one per row of the
  // layered navigator. Each row shows its own icon (persistently), so we
  // load all three at once whenever the anchor moves.
  const yearKey = getPeriodKey('yearly', anchor);
  const monthKey = getPeriodKey('monthly', anchor);
  const weekKey = getPeriodKey('weekly', anchor);

  const [icons, setIcons] = useState<ScopeIcons>({});

  // In-memory cache of each period's icon, keyed by `${scope}:${periodKey}`.
  // Navigation used to re-hit the DB on every step, so the active level's icon
  // visibly trailed the (synchronous) period labels. We seed instantly from
  // the cache and only round-trip for periods we haven't seen yet.
  const metaCacheRef = useRef<Map<string, string | null>>(new Map());

  useEffect(() => {
    if (!userId) return;
    const pairs: [VisionScope, string][] = [
      ['yearly', yearKey],
      ['monthly', monthKey],
      ['weekly', weekKey],
    ];

    // 1. Seed icons from cache so revisited periods render with no lag and no
    //    flash of the previous period's icon.
    const seedIcons: ScopeIcons = {};
    let allCached = true;
    for (const [scope, key] of pairs) {
      const cacheKey = `${scope}:${key}`;
      if (metaCacheRef.current.has(cacheKey)) {
        seedIcons[scope] = metaCacheRef.current.get(cacheKey) ?? null;
      } else {
        allCached = false;
      }
    }
    setIcons(seedIcons);
    if (allCached) return; // fully served from cache — skip the round-trip

    // 2. Refresh from the DB, then cache every requested key (including the
    //    ones with no row, cached as null, so they don't re-fetch later).
    let cancelled = false;
    fetchVisionRowMeta(userId, [yearKey, monthKey, weekKey])
      .then((rows) => {
        if (cancelled) return;
        const nextIcons: ScopeIcons = {};
        for (const [scope] of pairs) nextIcons[scope] = null;
        for (const r of rows) nextIcons[r.scope] = r.icon;
        for (const [scope, key] of pairs) {
          metaCacheRef.current.set(`${scope}:${key}`, nextIcons[scope] ?? null);
        }
        setIcons(nextIcons);
      })
      .catch((err) => console.error('[vision] row-meta fetch failed', err));
    return () => {
      cancelled = true;
    };
  }, [userId, yearKey, monthKey, weekKey]);

  // Which level's icon picker is open (null = closed). Opened from the
  // editor's DateBar icon button for the active level.
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
      metaCacheRef.current.set(`${lvl}:${key}`, icon);
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

  // Persist edits (debounced inside useVisionEntry).
  const handleEditorChange = useCallback(
    (json: unknown) => scheduleSave(json),
    [scheduleSave],
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

  // "Jump to now" — always returns to the CURRENT WEEK (which inherently
  // lands on the current month + year too). One consistent "back to today"
  // action in both views. Disabled only when we're already there.
  const onCurrentWeek =
    level === 'weekly' && periodKey === getPeriodKey('weekly', today);
  const mapOnCurrentYear = view !== 'yearly' || mapYear === today.getFullYear();
  const jumpToNow = {
    label: 'השבוע',
    enabled: !(onCurrentWeek && mapOnCurrentYear),
    onJump: () => {
      setAnchor(today);
      setLevel('weekly');
      setMapYear(today.getFullYear());
      setMonthlyAnchor(today);
    },
  };

  // Map-view navigation: tapping a period opens it in the editor BELOW the
  // map — the map view stays put.
  const goToPeriod = (targetLevel: VisionScope, targetAnchor: Date) => {
    setAnchor(targetAnchor);
    setLevel(targetLevel);
  };

  // Feed → tap a vision: jump to it and land on the yearly map (so the editor
  // + map context show). Sync the map's year to the opened period.
  const openFromFeed = (targetLevel: VisionScope, targetAnchor: Date) => {
    setAnchor(targetAnchor);
    setLevel(targetLevel);
    setMapYear(targetAnchor.getFullYear());
    setFeedActive(false);
    setLevelView('yearly');
    persistView('yearly');
  };

  // The writing surface for the active period — shown below the year-map grid.
  //
  // CRITICAL: only mount the editor once `entry` actually belongs to the
  // CURRENT (level, periodKey). When you jump periods — especially from the
  // free-scroll feed — `entry` lags one render behind (useVisionEntry updates
  // in an effect), so for a frame it still holds the PREVIOUS period's
  // content. Mounting then would show (and could save) the old period's text
  // under the new period's key — the data-loss bug where tapping a month in
  // the feed overwrote it with the last week's text. Guard against it.
  const periodReady =
    entry === null ||
    (entry.scope === level && entry.period_key === periodKey);
  const editorBlock = locked ? (
    <LockedNotice level={level} />
  ) : loading || !periodReady ? (
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
        levelView={levelView}
        onPickLevelView={pickLevelView}
        onPickFeed={pickFeed}
        onOpenHistory={() => setHistoryOpen(true)}
        searchQuery={feedQuery}
        onSearchChange={setFeedQuery}
      />

      {view === 'feed' ? (
        // Free-scroll feed — a view of its own (no navigator, no single
        // editor). Tapping a vision opens it in the yearly map view.
        <VisionScrollFeed
          userId={userId}
          today={today}
          initialKey={periodKey}
          query={feedQuery}
          onOpen={openFromFeed}
        />
      ) : view === 'weekly' ? (
        // Weekly view — coming soon (placeholder until the dedicated layout
        // lands). No navigator, no editor.
        <WeeklyComingSoon />
      ) : (
        <>
          {/* The navigator (yearly map / monthly cards) — collapses as a
              drawer. The grid 0fr↔1fr trick animates real content height with
              no JS measuring; the inner wrapper clips during the fold. */}
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-in-out"
            style={{ gridTemplateRows: layersOpen ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden min-h-0">
              {/* Same map component for both level views: the yearly view
                  scrolls the whole year; the monthly view shows just this
                  month + last month (recentMonths) under the year header. */}
              <VisionYearMap
                userId={userId}
                year={mapYear}
                today={today}
                selectedLevel={level}
                selectedKey={periodKey}
                scrollable={view === 'yearly'}
                recentMonths={view === 'monthly'}
                monthAnchor={monthlyAnchor}
                onStepMonths={stepMonthlyWindow}
                canStepMonthsNext={monthlyCanStepNext}
                onStepYear={(delta) => setMapYear((y) => y + delta)}
                onPickYear={() => goToPeriod('yearly', new Date(mapYear, 0, 1))}
                onPickMonth={(monthKey) =>
                  goToPeriod('monthly', parsePeriodStart('monthly', monthKey))
                }
                onPickWeek={(weekKey) =>
                  goToPeriod('weekly', parsePeriodStart('weekly', weekKey))
                }
              />
            </div>
          </div>

          {/* The chosen vision, below the navigator. Wrapped in an error
              boundary so a transient editor remount crash self-heals instead
              of black-screening. */}
          <div className="mt-4">
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

/** Placeholder for the weekly view until its dedicated layout ships. */
function WeeklyComingSoon() {
  return (
    <div className="vision-page text-center">
      <div className="py-12">
        <Hammer size={26} className="text-forest-500 mx-auto mb-3" />
        <p className="text-ink-100 font-semibold">התצוגה השבועית בדרך</p>
        <p className="text-ink-300 text-sm mt-1">תכף יוצאת — בקרוב כאן.</p>
      </div>
    </div>
  );
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
