// ============================================================================
// VisionMobile — the phone-shaped Vision layout (the original design).
// ----------------------------------------------------------------------------
// This is the mobile surface, unchanged in feel: a top VisionViewBar (view
// dropdown + feed + history + collapse), a collapsible year-map / month-cards
// navigator, and the open vision's editor BELOW it with a bottom-fixed toolbar.
//
// It owns its OWN navigator chrome state (which view is showing, the map's year,
// the monthly window, the feed query, the collapse). The shared position +
// persistence (which vision is open, loading/saving, icons, history) comes from
// the `ctl` controller, so this layout and the desktop one can never drift on
// the data that matters.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { VisionEditor } from './VisionEditor';
import {
  VisionViewBar,
  type VisionView,
  type VisionLevelView,
} from './VisionViewBar';
import { VisionYearMap } from './VisionYearMap';
import { VisionWeekMap } from './VisionWeekMap';
import { VisionScrollFeed } from './VisionScrollFeed';
import { VisionIconPicker } from './VisionIconPicker';
import { VisionHistorySheet } from './VisionHistorySheet';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { CompassLoader } from '../../components/CompassLoader';
import {
  VISION_PLACEHOLDERS,
  type VisionController,
} from './useVisionController';
import { useJournalingEnabled } from './journalingFeature';
import {
  addAnchor,
  getPeriodKey,
  isFuturePeriod,
  parsePeriodStart,
  type VisionScope,
} from './period';

// Per-user remembered view. ONLY a level view (yearly/monthly/weekly) is ever
// remembered as the entry default — the free-scroll feed is deliberately NEVER
// persisted, so opening the app always lands on the user's last level view (or
// the yearly map for a brand-new user). Choice sticks per user, per device.
const VIEW_LS_PREFIX = 'vision-view:';

function readSavedLevelView(userId: string | null): VisionLevelView {
  if (!userId) return 'yearly';
  try {
    const saved = localStorage.getItem(`${VIEW_LS_PREFIX}${userId}`);
    // 'board' is the legacy key for what is now the yearly map.
    if (saved === 'board') return 'yearly';
    if (saved === 'yearly' || saved === 'monthly' || saved === 'weekly')
      return saved;
    // 'feed' (or anything unexpected) → fall through: feed is never a default.
  } catch {
    // ignore — fall through to default
  }
  return 'yearly';
}

export function VisionMobile({ ctl }: { ctl: VisionController }) {
  const {
    today,
    userId,
    level,
    setLevel,
    anchor,
    setAnchor,
    goToPeriod: ctlGoToPeriod,
    periodKey,
    locked,
    entry,
    loading,
    status,
    contentVersion,
    restore,
    handleEditorChange,
    periodReady,
    icons,
    iconPickerLevel,
    setIconPickerLevel,
    applyIcon,
    historyOpen,
    setHistoryOpen,
    zoomDir,
    visionTitle,
    canStepNext,
  } = ctl;

  // Top-bar state: whether the navigator drawer is expanded, and which view is
  // active (a LEVEL view dropdown + a SEPARATE free-scroll button).
  const [layersOpen, setLayersOpen] = useState(true);
  const [levelView, setLevelView] = useState<VisionLevelView>(() =>
    readSavedLevelView(userId),
  );
  const [feedActive, setFeedActive] = useState(false);
  // The daily-journaling ("יומי") view is opt-in. When it's locked, a remembered
  // 'weekly' preference falls back to the yearly map so the view is never shown.
  const journalingOn = useJournalingEnabled();
  const safeLevelView: VisionLevelView =
    !journalingOn && levelView === 'weekly' ? 'yearly' : levelView;
  const view: VisionView = feedActive ? 'feed' : safeLevelView;
  const [feedQuery, setFeedQuery] = useState('');
  // The year the MAP shows — decoupled from `anchor` so stepping years in the
  // map doesn't move the vision currently open in the editor below it.
  const [mapYear, setMapYear] = useState(() => today.getFullYear());
  // The "חודשי" view's window: the LATER of the two months it shows.
  const [monthlyAnchor, setMonthlyAnchor] = useState<Date>(today);

  // Only level views are persisted (never the feed).
  const persistLevelView = useCallback(
    (v: VisionLevelView) => {
      if (!userId) return;
      try {
        localStorage.setItem(`${VIEW_LS_PREFIX}${userId}`, v);
      } catch {
        // private-mode / quota — preference just won't persist.
      }
    },
    [userId],
  );

  // Once auth resolves, apply this user's saved level-view default.
  const viewLoadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || viewLoadedForRef.current === userId) return;
    viewLoadedForRef.current = userId;
    setLevelView(readSavedLevelView(userId));
    setFeedActive(false);
  }, [userId]);

  // Pick a level view from the dropdown.
  const pickLevelView = useCallback(
    (v: VisionLevelView) => {
      setLevelView(v);
      setFeedActive(false);
      if (v === 'yearly') setMapYear(anchor.getFullYear());
      else if (v === 'monthly' || v === 'weekly') {
        // Both the monthly cards and the weekly day-grid are anchored to a
        // single reference month — land on the current one when switching in.
        setMonthlyAnchor(today);
        setMapYear(today.getFullYear());
      }
      persistLevelView(v);
    },
    [anchor, today, persistLevelView],
  );

  // Step the "חודשי" window a month back/forward; keep the year header in sync.
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
  const monthlyCanStepNext = !isFuturePeriod(
    'monthly',
    getPeriodKey('monthly', addAnchor('monthly', monthlyAnchor, 1)),
  );

  const pickFeed = useCallback(() => {
    setFeedActive(true);
  }, []);

  // The DateBar title stepper also moves the MAP's year to match.
  const stepPeriod = (delta: number) => {
    const next = addAnchor(level, anchor, delta);
    setAnchor(next);
    setMapYear(next.getFullYear());
  };

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
  const goToPeriod = (targetLevel: VisionScope, targetAnchor: Date) =>
    ctlGoToPeriod(targetLevel, targetAnchor);

  // Feed → tap a vision: jump to it and land on the yearly map.
  const openFromFeed = (targetLevel: VisionScope, targetAnchor: Date) => {
    setAnchor(targetAnchor);
    setLevel(targetLevel);
    setMapYear(targetAnchor.getFullYear());
    setFeedActive(false);
    setLevelView('yearly');
  };

  const editorBlock = locked ? (
    <LockedNotice level={level} />
  ) : loading || !periodReady ? (
    <div className="vision-page py-10">
      <CompassLoader size="md" />
    </div>
  ) : (
    <VisionEditor
      resetKey={`${level}:${periodKey}:${contentVersion}`}
      scope={level}
      zoomDir={zoomDir}
      initialContent={entry?.content ?? null}
      placeholder={VISION_PLACEHOLDERS[level]}
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
    // -mt-3 tightens the gap with the top of the content area.
    <section className="-mt-3 pb-3">
      <VisionViewBar
        layersOpen={layersOpen}
        onToggleLayers={() => setLayersOpen((v) => !v)}
        view={view}
        levelView={safeLevelView}
        onPickLevelView={pickLevelView}
        onPickFeed={pickFeed}
        onOpenHistory={() => setHistoryOpen(true)}
        searchQuery={feedQuery}
        onSearchChange={setFeedQuery}
        dailyEnabled={journalingOn}
      />

      {view === 'feed' ? (
        <VisionScrollFeed
          userId={userId}
          today={today}
          initialKey={periodKey}
          query={feedQuery}
          onOpen={openFromFeed}
        />
      ) : (
        <>
          {/* The navigator — yearly map / monthly cards / weekly day-grid —
              collapses as a drawer via the grid 0fr↔1fr trick (no JS measuring). */}
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-in-out"
            style={{ gridTemplateRows: layersOpen ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden min-h-0">
              {view === 'weekly' ? (
                <VisionWeekMap
                  userId={userId}
                  today={today}
                  monthAnchor={monthlyAnchor}
                  onStepMonth={stepMonthlyWindow}
                  canStepMonthNext={monthlyCanStepNext}
                  selectedLevel={level}
                  selectedKey={periodKey}
                  onPickYear={(yearKey) =>
                    goToPeriod('yearly', parsePeriodStart('yearly', yearKey))
                  }
                  onPickMonth={(monthKey) =>
                    goToPeriod('monthly', parsePeriodStart('monthly', monthKey))
                  }
                  onPickWeek={(weekKey) =>
                    goToPeriod('weekly', parsePeriodStart('weekly', weekKey))
                  }
                  onPickDay={(dayKey) =>
                    goToPeriod('daily', parsePeriodStart('daily', dayKey))
                  }
                />
              ) : (
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
              )}
            </div>
          </div>

          {/* The chosen vision, below the navigator. */}
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
                    className="mt-3 inline-flex items-center h-9 px-4 rounded-lg bg-forest-700 text-on-accent text-sm font-medium hover:bg-forest-600 transition-colors"
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

function LockedNotice({ level }: { level: VisionScope }) {
  const noun =
    level === 'yearly'
      ? 'השנה'
      : level === 'monthly'
        ? 'החודש'
        : level === 'daily'
          ? 'היום'
          : 'השבוע';
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
