// ============================================================================
// VisionDesktop — the wide, two-column Vision layout for big screens.
// ----------------------------------------------------------------------------
// Layout (RTL, physical right→left):
//
//   ┌──────────────────────────────┬─────────────────────────┐
//   │  CENTRE — wide writing page  │  RIGHT — navigation rail │
//   │  (Google-Docs style)         │  header (mirrors mobile):│
//   │   ┌── sticky toolbar ──┐     │   [שנתי·חודשי·שבועי][feed]│
//   │   │ B i U  H  • ...     │     │              [hist][▾]   │
//   │   ├────────────────────┤     │  body: year map / month  │
//   │   │ title · ‹ › · save │     │   cards / weekly soon /   │
//   │   │  writing …          │     │   feed search             │
//   └──────────────────────────────┴─────────────────────────┘
//
// The rail header echoes the mobile VisionViewBar: a view switcher (שנתי /
// חודשי / שבועי) + a free-scroll button on the RIGHT, and version-history + a
// collapse chevron on the LEFT. The chevron folds the whole navigator away.
// Clicking any month/week inside the map opens that period in the centre editor.
//
// The shared `ctl` controller owns which vision is open + its persistence; this
// layout only owns its own navigator chrome (view, feed, the map year, the
// monthly window, the collapse state).
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Lock,
  Hammer,
  History,
  GalleryVertical,
  ChevronDown,
  Eye,
  Search,
  X,
} from 'lucide-react';
import { VisionEditorDesktop } from './VisionEditorDesktop';
import { VisionReminisce } from './VisionReminisce';
import { VisionYearMap } from './VisionYearMap';
import { VisionScrollFeed } from './VisionScrollFeed';
import { VisionIconPicker } from './VisionIconPicker';
import { VisionHistorySheet } from './VisionHistorySheet';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { CompassLoader } from '../../components/CompassLoader';
import type { VisionView, VisionLevelView } from './VisionViewBar';
import {
  VISION_PLACEHOLDERS,
  type VisionController,
} from './useVisionController';
import {
  addAnchor,
  getPeriodKey,
  isFuturePeriod,
  parsePeriodStart,
  type VisionScope,
} from './period';

// The level views, right→left in RTL (broad → fine), matching the user's order.
const LEVEL_OPTIONS: { value: VisionLevelView; label: string }[] = [
  { value: 'yearly', label: 'שנתי' },
  { value: 'monthly', label: 'חודשי' },
  { value: 'weekly', label: 'שבועי' },
];

// The desktop's last-chosen LEVEL view is remembered per-user so reopening the
// app lands on it (שנתי / חודשי / שבועי). The free-scroll feed is deliberately
// NEVER persisted — it's never an entry default. A SEPARATE key from mobile's
// `vision-view:` keeps the two layouts' preferences independent.
const DESKTOP_VIEW_LS_PREFIX = 'vision-view-desktop:';

function readSavedDesktopLevelView(userId: string | null): VisionLevelView {
  if (!userId) return 'yearly';
  try {
    const saved = localStorage.getItem(`${DESKTOP_VIEW_LS_PREFIX}${userId}`);
    if (saved === 'yearly' || saved === 'monthly' || saved === 'weekly') {
      return saved;
    }
  } catch {
    // ignore — fall through to default
  }
  return 'yearly';
}

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

  // Rail chrome — independent of the mobile layout. The level view is restored
  // from the saved default; the feed always starts OFF (never restored).
  const [levelView, setLevelView] = useState<VisionLevelView>(() =>
    readSavedDesktopLevelView(userId),
  );
  const [feedActive, setFeedActive] = useState(false);
  const view: VisionView = feedActive ? 'feed' : levelView;
  const [feedQuery, setFeedQuery] = useState('');
  const [mapYear, setMapYear] = useState(() => today.getFullYear());
  const [monthlyAnchor, setMonthlyAnchor] = useState<Date>(today);
  // Whether the navigator body (map / months) is expanded.
  const [navOpen, setNavOpen] = useState(true);
  // Whether the read-only "look back" panel is showing on the LEFT.
  const [reminisceOpen, setReminisceOpen] = useState(false);

  // Persist only the LEVEL view (never the feed), per-user.
  const persistLevelView = useCallback(
    (v: VisionLevelView) => {
      if (!userId) return;
      try {
        localStorage.setItem(`${DESKTOP_VIEW_LS_PREFIX}${userId}`, v);
      } catch {
        // private-mode / quota — preference just won't persist.
      }
    },
    [userId],
  );

  // Once auth resolves, apply this user's saved level-view default (the lazy
  // initializer above may have run before userId was known). Feed stays off.
  const viewLoadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || viewLoadedForRef.current === userId) return;
    viewLoadedForRef.current = userId;
    setLevelView(readSavedDesktopLevelView(userId));
    setFeedActive(false);
  }, [userId]);

  const pickLevelView = (v: VisionLevelView) => {
    setLevelView(v);
    setFeedActive(false);
    if (v === 'yearly') setMapYear(anchor.getFullYear());
    else if (v === 'monthly') {
      setMonthlyAnchor(today);
      setMapYear(today.getFullYear());
    }
    persistLevelView(v);
  };

  // Step the "חודשי" window a month back/forward; keep the year header in sync.
  const stepMonthlyWindow = (delta: number) => {
    const next = new Date(
      monthlyAnchor.getFullYear(),
      monthlyAnchor.getMonth() + delta,
      1,
    );
    setMonthlyAnchor(next);
    setMapYear(next.getFullYear());
  };
  const monthlyCanStepNext = !isFuturePeriod(
    'monthly',
    getPeriodKey('monthly', addAnchor('monthly', monthlyAnchor, 1)),
  );

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
      setMonthlyAnchor(today);
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
    setLevelView('yearly');
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
          {/* Header — mirrors the mobile bar: views + feed on the RIGHT,
              history + collapse on the LEFT. */}
          <div className="flex items-center justify-between gap-2 mb-3">
            {/* RIGHT group (RTL start): level switch + free-scroll. */}
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center p-0.5 rounded-xl bg-surface-raised ring-1 ring-surface-border">
                {LEVEL_OPTIONS.map((opt) => {
                  const active = view === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => pickLevelView(opt.value)}
                      aria-pressed={active}
                      className={`
                        h-9 px-3 rounded-lg text-[13px] font-semibold transition-colors
                        ${
                          active
                            ? 'bg-forest-700 text-on-accent shadow-sm'
                            : 'text-ink-300 hover:text-ink-100'
                        }
                      `}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setFeedActive(true)}
                aria-pressed={view === 'feed'}
                aria-label="גלילה חופשית בין החזונות"
                title="גלילה חופשית בין החזונות"
                className={`
                  shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-xl
                  transition-colors
                  ${
                    view === 'feed'
                      ? 'bg-forest-700/25 text-ink-100 ring-1 ring-forest-700'
                      : 'bg-surface-raised text-ink-300 ring-1 ring-surface-border hover:text-ink-100'
                  }
                `}
              >
                <GalleryVertical size={20} />
              </button>
            </div>

            {/* LEFT group (RTL end): look-back (eye) · history · collapse.
                The eye is the rightmost of the three (right of history). */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setReminisceOpen((v) => !v)}
                aria-pressed={reminisceOpen}
                aria-label="מבט אחורה — חזונות קודמים לקריאה"
                title="מבט אחורה"
                className={`
                  shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-xl
                  ring-1 transition-all
                  ${
                    reminisceOpen
                      ? 'bg-forest-700/25 ring-forest-700 text-ink-100'
                      : 'bg-surface-raised ring-surface-border text-ink-300 hover:text-ink-100 hover:ring-ink-300'
                  }
                `}
              >
                <Eye size={20} />
              </button>
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
              <button
                type="button"
                onClick={() => setNavOpen((v) => !v)}
                aria-label={navOpen ? 'מזער ניווט' : 'פתח ניווט'}
                aria-expanded={navOpen}
                title={navOpen ? 'מזער ניווט' : 'פתח ניווט'}
                className="
                  shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-xl
                  bg-surface-raised ring-1 ring-surface-border
                  text-ink-300 hover:text-ink-100 hover:ring-ink-300 transition-all
                "
              >
                <ChevronDown
                  size={20}
                  className={`transition-transform duration-300 ease-in-out ${
                    navOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Collapsible navigator body — the grid 0fr↔1fr trick folds it away
              with no JS measuring; the inner wrapper clips during the fold. */}
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-in-out"
            style={{ gridTemplateRows: navOpen ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden min-h-0">
              {/* Background is the PAGE base (darker than the month cards) so
                  each month's surface-card reads as its own container — exactly
                  like the mobile year map. */}
              <div className="vision-desktop-rail-body rounded-2xl bg-surface-base ring-1 ring-surface-border p-3 overflow-y-auto vision-feed-scroll">
                {view === 'feed' ? (
                  <div>
                    {/* The icon/clear button are positioned against THIS wrapper
                        (input height only) — the helper text below is a sibling,
                        so top-1/2 lands on the input, not the whole block. */}
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
                    </div>
                    <p className="mt-2 text-[12px] text-ink-300 leading-relaxed">
                      הגלילה החופשית מוצגת במרכז. בחר חזון כדי לפתוח אותו.
                    </p>
                  </div>
                ) : view === 'weekly' ? (
                  <div className="text-center py-10">
                    <Hammer size={22} className="text-forest-500 mx-auto mb-2.5" />
                    <p className="text-ink-100 font-semibold text-sm">
                      התצוגה השבועית בדרך
                    </p>
                    <p className="text-ink-300 text-[12px] mt-1">בקרוב כאן.</p>
                  </div>
                ) : (
                  <VisionYearMap
                    userId={userId}
                    year={mapYear}
                    today={today}
                    selectedLevel={level}
                    selectedKey={periodKey}
                    fillHeight={view === 'yearly'}
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
          </div>
        </aside>

        {/* ── CENTRE — the wide writing page (or the free-scroll feed),
            centred in the viewport via the balancer below ── */}
        <div className="flex-1 min-w-0 px-4">
          {view === 'feed' ? (
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

        {/* ── LEFT COLUMN — same width as the rail so the centre stays dead-
            centre. Empty balancer by default; the read-only "look back" panel
            fills it when the eye is toggled on. ── */}
        {reminisceOpen ? (
          <aside className="shrink-0 w-[440px] sticky top-3 self-start">
            <VisionReminisce
              userId={userId}
              today={today}
              onClose={() => setReminisceOpen(false)}
            />
          </aside>
        ) : (
          <div aria-hidden className="shrink-0 w-[440px]" />
        )}
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
