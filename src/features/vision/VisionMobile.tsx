// ============================================================================
// VisionMobile — the phone-shaped Vision layout (the original design).
// ----------------------------------------------------------------------------
// This is the mobile surface: a top VisionViewBar (a yearly ⇄ feed toggle +
// history + collapse), a collapsible year-map navigator, and the open vision's
// editor BELOW it with a bottom-fixed toolbar. The yearly map is the only
// granularity — it already shows every month — so the monthly view was retired.
//
// It owns its OWN navigator chrome state (feed on/off, the map's year, the feed
// query, the collapse). The shared position + persistence (which vision is open,
// loading/saving, icons, history) comes from the `ctl` controller, so this
// layout and the desktop one can never drift on the data that matters.
// ============================================================================
import { useCallback, useState } from 'react';
import { Lock } from 'lucide-react';
import { VisionEditor } from './VisionEditor';
import { VisionViewBar, type VisionView } from './VisionViewBar';
import { VisionYearMap } from './VisionYearMap';
import { VisionScrollFeed } from './VisionScrollFeed';
import { VisionIconPicker } from './VisionIconPicker';
import { VisionHistorySheet } from './VisionHistorySheet';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { CompassLoader } from '../../components/CompassLoader';
import {
  VISION_PLACEHOLDERS,
  type VisionController,
} from './useVisionController';
import {
  addAnchor,
  getPeriodKey,
  parsePeriodStart,
  type VisionScope,
} from './period';

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

  // Top-bar state: whether the navigator drawer is expanded, and whether the
  // free-scroll feed is active. The ONLY level view on mobile is the yearly map
  // (it already shows every month at a glance), so there's no granularity to
  // pick or persist — the view is simply yearly ⇄ feed.
  const [layersOpen, setLayersOpen] = useState(true);
  const [feedActive, setFeedActive] = useState(false);
  const view: VisionView = feedActive ? 'feed' : 'yearly';
  const [feedQuery, setFeedQuery] = useState('');
  // The year the MAP shows — decoupled from `anchor` so stepping years in the
  // map doesn't move the vision currently open in the editor below it.
  const [mapYear, setMapYear] = useState(() => today.getFullYear());

  // Return to the yearly map from the feed; re-centre it on the open vision's
  // year.
  const pickYearly = useCallback(() => {
    setFeedActive(false);
    setMapYear(anchor.getFullYear());
  }, [anchor]);

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
    },
  };

  // Map-view navigation: tapping a period opens it in the editor BELOW the
  // map — the map view stays put.
  const goToPeriod = (targetLevel: VisionScope, targetAnchor: Date) =>
    ctlGoToPeriod(targetLevel, targetAnchor);

  // Feed → tap a vision: jump to it and land back on the yearly map.
  const openFromFeed = (targetLevel: VisionScope, targetAnchor: Date) => {
    setAnchor(targetAnchor);
    setLevel(targetLevel);
    setMapYear(targetAnchor.getFullYear());
    setFeedActive(false);
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
        onPickYearly={pickYearly}
        onPickFeed={pickFeed}
        onOpenHistory={() => setHistoryOpen(true)}
        searchQuery={feedQuery}
        onSearchChange={setFeedQuery}
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
          {/* The navigator — the yearly map — collapses as a drawer via the
              grid 0fr↔1fr trick (no JS measuring). */}
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-in-out"
            style={{ gridTemplateRows: layersOpen ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden min-h-0">
              <VisionYearMap
                userId={userId}
                year={mapYear}
                today={today}
                selectedLevel={level}
                selectedKey={periodKey}
                scrollable
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
