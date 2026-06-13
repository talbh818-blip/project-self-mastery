// ============================================================================
// VisionDesktop — the wide, two-column Vision layout for big screens.
// ----------------------------------------------------------------------------
// Layout (RTL, physical right→left):
//
//   ┌──────────────────────────────┬─────────────────────────┐
//   │  CENTRE — wide writing page  │  RIGHT — navigation rail │
//   │  (Google-Docs style)         │  • מפת השנה / גלילה /     │
//   │   ┌── sticky toolbar ──┐     │    גרסאות קודמות          │
//   │   │ B i U  H  • ...     │     │  • the YEAR map: every   │
//   │   ├────────────────────┤     │    month + week, click to │
//   │   │ title · ‹ › · save │     │    open it in the editor  │
//   │   │  writing …          │     │                          │
//   └──────────────────────────────┴─────────────────────────┘
//
// The rail is YEARLY-ONLY: it always shows the whole year (no monthly/weekly
// view modes), opening on it by default — clicking any month or week inside the
// map opens that period in the centre editor. The three top controls are the
// year map, the free-scroll feed, and version history.
//
// The shared `ctl` controller owns which vision is open + its persistence; this
// layout only owns its own navigator chrome (feed on/off, the map's year).
// ============================================================================
import { useState } from 'react';
import {
  Lock,
  History,
  GalleryVertical,
  CalendarDays,
  Search,
  X,
} from 'lucide-react';
import { VisionEditorDesktop } from './VisionEditorDesktop';
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

export function VisionDesktop({ ctl }: { ctl: VisionController }) {
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

  // Rail chrome — independent of the mobile layout. Only two surfaces exist:
  // the year map (default) and the free-scroll feed.
  const [feedActive, setFeedActive] = useState(false);
  const [feedQuery, setFeedQuery] = useState('');
  const [mapYear, setMapYear] = useState(() => today.getFullYear());

  // Open the year map (the default surface), lined up with the open year.
  const showYearMap = () => {
    setFeedActive(false);
    setMapYear(anchor.getFullYear());
  };

  // Editor period stepper (prev/next within the open level) — also nudges the
  // map's year so a year-crossing step repaints the rail.
  const stepPeriod = (delta: number) => {
    const next = addAnchor(level, anchor, delta);
    setAnchor(next);
    setMapYear(next.getFullYear());
  };

  const onCurrentWeek =
    level === 'weekly' && periodKey === getPeriodKey('weekly', today);
  const jumpToNow = {
    label: 'השבוע',
    enabled: !onCurrentWeek,
    onJump: () => {
      setAnchor(today);
      setLevel('weekly');
      setMapYear(today.getFullYear());
    },
  };

  // Rail click → open the period in the centre editor (rail stays put).
  const goToPeriod = (targetLevel: VisionScope, targetAnchor: Date) =>
    ctlGoToPeriod(targetLevel, targetAnchor);

  // Feed → tap a vision: open it and return the rail to the year map.
  const openFromFeed = (targetLevel: VisionScope, targetAnchor: Date) => {
    setAnchor(targetAnchor);
    setLevel(targetLevel);
    setMapYear(targetAnchor.getFullYear());
    setFeedActive(false);
  };

  const centre = locked ? (
    <LockedNotice level={level} />
  ) : loading || !periodReady ? (
    <div className="vision-page-desktop py-16">
      <CompassLoader size="md" />
    </div>
  ) : (
    <VisionEditorDesktop
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
    <section dir="rtl" className="-mt-1">
      {/* RTL flex row: rail (right) · centre writing column · balancer (left).
          The balancer is an empty spacer the SAME width as the rail, so the
          centre column is centred in the WHOLE viewport — not just in the space
          left of the rail. */}
      <div className="flex items-start">
        {/* ── RIGHT RAIL — first child = rightmost in RTL, flush to the edge ── */}
        <aside className="vision-desktop-rail shrink-0 w-[440px] sticky top-3 self-start">
          {/* Top controls — icon-only, clustered at the top-RIGHT (RTL start):
              year-map view · free-scroll view · version history. */}
          <div className="flex items-center gap-2 mb-3">
            <div className="inline-flex items-center p-1 rounded-xl bg-surface-raised ring-1 ring-surface-border">
              <RailViewButton
                active={!feedActive}
                onClick={showYearMap}
                icon={<CalendarDays size={20} />}
                label="מפת השנה"
              />
              <RailViewButton
                active={feedActive}
                onClick={() => setFeedActive(true)}
                icon={<GalleryVertical size={20} />}
                label="גלילה חופשית"
              />
            </div>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              aria-label="גרסאות קודמות"
              title="גרסאות קודמות"
              className="
                shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-xl
                bg-surface-raised ring-1 ring-surface-border
                text-ink-300 hover:text-ink-100 hover:ring-ink-300 transition-all
              "
            >
              <History size={20} />
            </button>
          </div>

          {/* The rail's body. Background is the PAGE base (darker than the
              month cards) so each month's surface-card reads as its own
              container — exactly like the mobile year map. */}
          <div className="vision-desktop-rail-body rounded-2xl bg-surface-base ring-1 ring-surface-border p-3 overflow-y-auto vision-feed-scroll">
            {feedActive ? (
              <div className="relative">
                <Search
                  size={15}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-300 pointer-events-none"
                />
                <input
                  type="text"
                  value={feedQuery}
                  onChange={(e) => setFeedQuery(e.target.value)}
                  placeholder="חיפוש מילה בחזונות…"
                  className="
                    w-full h-9 rounded-xl bg-surface-raised text-ink-100 text-sm
                    pr-9 pl-9 ring-1 ring-surface-border focus:ring-forest-600
                    outline-none transition placeholder:text-ink-500
                  "
                />
                {feedQuery && (
                  <button
                    type="button"
                    onClick={() => setFeedQuery('')}
                    aria-label="נקה חיפוש"
                    className="absolute top-1/2 left-2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-md text-ink-300 hover:text-ink-100 hover:bg-surface-raised"
                  >
                    <X size={15} />
                  </button>
                )}
                <p className="mt-2 text-[12px] text-ink-300 leading-relaxed">
                  הגלילה החופשית מוצגת במרכז. בחר חזון כדי לפתוח אותו.
                </p>
              </div>
            ) : (
              <VisionYearMap
                userId={userId}
                year={mapYear}
                today={today}
                selectedLevel={level}
                selectedKey={periodKey}
                fillHeight
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
        </aside>

        {/* ── CENTRE — the wide writing page (or the free-scroll feed),
            centred in the viewport via the balancer below ── */}
        <div className="flex-1 min-w-0 px-4">
          {feedActive ? (
            <div className="max-w-[820px] mx-auto">
              <VisionScrollFeed
                userId={userId}
                today={today}
                initialKey={periodKey}
                query={feedQuery}
                onOpen={openFromFeed}
              />
            </div>
          ) : (
            <ErrorBoundary
              resetKeys={[level, periodKey, contentVersion]}
              pendingFallback={
                <div className="vision-page-desktop py-16">
                  <CompassLoader size="md" />
                </div>
              }
              fallback={(retry) => (
                <div className="vision-page-desktop text-center py-16">
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
              {centre}
            </ErrorBoundary>
          )}
        </div>

        {/* ── LEFT BALANCER — empty, same width as the rail, so the centre
            column lands dead-centre in the viewport ── */}
        <div aria-hidden className="shrink-0 w-[440px]" />
      </div>

      <VisionIconPicker
        open={iconPickerLevel !== null}
        value={iconPickerLevel ? icons[iconPickerLevel] ?? null : null}
        onPick={applyIcon}
        onClose={() => setIconPickerLevel(null)}
      />

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

/** One option in the rail's view control — ICON-ONLY (year map / free scroll). */
function RailViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`
        inline-flex items-center justify-center h-10 w-11 rounded-lg
        transition-colors
        ${
          active
            ? 'bg-forest-700 text-on-accent shadow-sm'
            : 'text-ink-300 hover:text-ink-100'
        }
      `}
    >
      {icon}
    </button>
  );
}

function LockedNotice({ level }: { level: VisionScope }) {
  const noun =
    level === 'yearly' ? 'השנה' : level === 'monthly' ? 'החודש' : 'השבוע';
  return (
    <div className="vision-page-desktop text-center">
      <div className="py-16">
        <Lock size={28} className="text-ink-500 mx-auto mb-3" />
        <p className="text-ink-100 font-medium">{noun} עוד לא הגיע</p>
        <p className="text-ink-300 text-sm mt-1">
          אפשר לכתוב חזון רק לתקופה שכבר התחילה.
        </p>
      </div>
    </div>
  );
}
