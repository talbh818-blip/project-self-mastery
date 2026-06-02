// ============================================================================
// Vision screen — yearly / monthly / weekly journaling.
// ----------------------------------------------------------------------------
// One row of three EQUAL-WIDTH tabs. Each tab carries its scope title (large)
// + a per-period subtitle (small). Chevrons are revealed ONLY on the active
// tab — inactive tabs stay clean and minimal so the eye is drawn to where
// the user is currently navigating.
//
// HIERARCHY: monthly is scoped to the year shown on the yearly tab; weekly
// is scoped to the month shown on the monthly tab. The chevron buttons are
// disabled at the edges. When the user navigates a PARENT scope to a new
// period, children CASCADE-CLAMP into bounds (monthly preserves its
// month-of-year, weekly snaps to the first week of the new month).
// ============================================================================
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { ChevronRight, ChevronLeft, Lock } from 'lucide-react';
import { VisionEditor } from '../features/vision/VisionEditor';
import { useVisionEntry } from '../features/vision/useVisionEntry';
import { CompassLoader } from '../components/CompassLoader';
import {
  SCOPE_TITLES,
  addPeriod,
  clampMonthlyToYear,
  clampWeeklyToMonth,
  formatScopeCrumb,
  formatScopeSubtitle,
  getPeriodKey,
  isFuturePeriod,
  isOutsideParent,
  type VisionScope,
} from '../features/vision/period';

const TAB_ORDER: VisionScope[] = ['yearly', 'monthly', 'weekly'];

// Nesting depth — drives the zoom direction on scope switches.
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

type PeriodMap = Record<VisionScope, string>;

export function Vision() {
  const [scope, setScope] = useState<VisionScope>('yearly');

  // Per-scope period key. Each tab remembers where the user was so switching
  // back doesn't snap to "now" and lose their place.
  const today = useMemo(() => new Date(), []);
  const [periodByScope, setPeriodByScope] = useState<PeriodMap>(() => ({
    yearly: getPeriodKey('yearly', today),
    monthly: getPeriodKey('monthly', today),
    weekly: getPeriodKey('weekly', today),
  }));

  const periodKey = periodByScope[scope];
  const locked = isFuturePeriod(scope, periodKey);

  // Direction of the scope-switch zoom: deeper level (year→month→week) =
  // zoom IN, broader = zoom OUT. Computed by comparing to the previous
  // scope; the ref updates after commit so the next render is accurate.
  const prevScopeRef = useRef<VisionScope>(scope);
  const zoomDir: 'in' | 'out' =
    SCOPE_DEPTH[scope] >= SCOPE_DEPTH[prevScopeRef.current] ? 'in' : 'out';
  useEffect(() => {
    prevScopeRef.current = scope;
  }, [scope]);

  const { entry, loading, status, scheduleSave, setDocumentDate } =
    useVisionEntry(scope, periodKey);

  // Default the DateBar to today when there's no entry yet. The first save
  // (or first date pick) will persist this through the upsert path.
  const todayIso = useMemo(() => toIsoDate(today), [today]);
  const documentDate = entry?.document_date ?? todayIso;

  // Cascade-clamping setter: when the user moves a parent scope, child
  // scopes follow so they don't end up "stuck" in an out-of-bounds period.
  // Monthly preserves month-of-year; weekly snaps to first week of new month.
  const setPeriod = (target: VisionScope, nextKey: string) => {
    setPeriodByScope((prev) => {
      const next: PeriodMap = { ...prev, [target]: nextKey };
      if (target === 'yearly') {
        next.monthly = clampMonthlyToYear(prev.monthly, nextKey);
        next.weekly = clampWeeklyToMonth(prev.weekly, next.monthly);
      } else if (target === 'monthly') {
        next.weekly = clampWeeklyToMonth(prev.weekly, nextKey);
      }
      return next;
    });
  };

  const gotoIn = (target: VisionScope, delta: number) =>
    setPeriod(target, addPeriod(target, periodByScope[target], delta));

  const jumpToNowIn = (target: VisionScope) =>
    setPeriod(target, getPeriodKey(target, today));

  return (
    // -mt-3 tightens the gap with the global brand header (Layout's pt-5
    // makes the page feel like it floats too far from the compass title).
    // No space-y here: the tabs sit FLUSH on top of the writing card so the
    // active tab can merge into it (connected folder-tab look).
    <section className="-mt-3 pb-6">
      {/* Hierarchy breadcrumb — shows where the current view sits in the
          zoom path (year ‹ month ‹ week). Each crumb jumps to that scope. */}
      <Breadcrumb
        periods={periodByScope}
        scope={scope}
        onJump={setScope}
      />

      {/* Folder tabs riding on the card. items-end so the shorter inactive
          tabs recede; the active tab is full-height + card-coloured so it
          flows seamlessly into the card below. */}
      <div
        role="tablist"
        aria-label="רמת חזון"
        dir="rtl"
        className="flex items-end gap-1 px-2"
      >
        {TAB_ORDER.map((s) => (
          <ScopeTab
            key={s}
            scope={s}
            active={scope === s}
            periodKey={periodByScope[s]}
            today={today}
            parentScope={parentScopeFor(s)}
            parentKey={parentKeyFor(s, periodByScope)}
            onActivate={() => setScope(s)}
            onPrev={() => gotoIn(s, -1)}
            onNext={() => gotoIn(s, 1)}
            onJumpToNow={() => jumpToNowIn(s)}
          />
        ))}
      </div>

      {/* Body — always a flat-top card so it connects to the tabs above. */}
      {locked ? (
        <LockedNotice scope={scope} />
      ) : loading ? (
        <div className="vision-page py-10">
          <CompassLoader size="md" />
        </div>
      ) : (
        <VisionEditor
          // resetKey forces the editor to re-mount when the period changes,
          // so it loads the right initial document.
          resetKey={`${scope}:${periodKey}`}
          scope={scope}
          zoomDir={zoomDir}
          initialContent={entry?.content ?? null}
          placeholder={PLACEHOLDERS[scope]}
          saveStatus={status}
          documentDate={documentDate}
          onDateChange={(iso) => void setDocumentDate(iso)}
          onChange={scheduleSave}
        />
      )}
    </section>
  );
}

function parentScopeFor(scope: VisionScope): VisionScope | null {
  if (scope === 'monthly') return 'yearly';
  if (scope === 'weekly') return 'monthly';
  return null;
}
function parentKeyFor(
  scope: VisionScope,
  periods: PeriodMap,
): string | null {
  const parent = parentScopeFor(scope);
  return parent ? periods[parent] : null;
}

/** Local-date ISO ('YYYY-MM-DD') — sidesteps timezone drift from `toISOString()`. */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({
  periods,
  scope,
  onJump,
}: {
  periods: PeriodMap;
  scope: VisionScope;
  onJump: (s: VisionScope) => void;
}) {
  const crumbs: { s: VisionScope; label: string }[] = [
    { s: 'yearly', label: formatScopeCrumb('yearly', periods.yearly, null) },
    {
      s: 'monthly',
      label: formatScopeCrumb('monthly', periods.monthly, periods.yearly),
    },
    {
      s: 'weekly',
      label: formatScopeCrumb('weekly', periods.weekly, periods.monthly),
    },
  ];
  return (
    <div
      dir="rtl"
      aria-label="מסלול חזון"
      className="flex items-center gap-1 px-2 mb-1.5 text-[12px] min-w-0"
    >
      {crumbs.map((c, i) => (
        <Fragment key={c.s}>
          {i > 0 && (
            <ChevronLeft size={12} className="text-ink-500 shrink-0" aria-hidden />
          )}
          <button
            type="button"
            onClick={() => onJump(c.s)}
            aria-current={c.s === scope ? 'true' : undefined}
            className={`truncate transition-colors ${
              c.s === scope
                ? 'text-forest-500 font-semibold'
                : 'text-ink-500 hover:text-ink-300'
            }`}
          >
            {c.label}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

// ─── Tab ────────────────────────────────────────────────────────────────────

type ScopeTabProps = {
  scope: VisionScope;
  active: boolean;
  periodKey: string;
  today: Date;
  parentScope: VisionScope | null;
  parentKey: string | null;
  onActivate: () => void;
  onPrev: () => void;
  onNext: () => void;
  onJumpToNow: () => void;
};

function ScopeTab({
  scope,
  active,
  periodKey,
  today,
  parentScope,
  parentKey,
  onActivate,
  onPrev,
  onNext,
  onJumpToNow,
}: ScopeTabProps) {
  const isCurrent = periodKey === getPeriodKey(scope, today);
  const prevKey = addPeriod(scope, periodKey, -1);
  const nextKey = addPeriod(scope, periodKey, 1);
  const prevDisabled = isOutsideParent(scope, prevKey, parentScope, parentKey);
  const nextDisabled =
    isFuturePeriod(scope, nextKey) ||
    isOutsideParent(scope, nextKey, parentScope, parentKey);

  // Centre label tap: when inactive, switching activates this tab. When
  // active and the user has scrolled away from "now", snap back. When
  // active and already on "now", do nothing.
  const onCentreClick = () => {
    if (!active) onActivate();
    else if (!isCurrent) onJumpToNow();
  };

  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      role="tab"
      aria-selected={active}
      // Folder tab. ACTIVE: same colour as the card below + a thin forest
      // top-accent for "selected", full height, merges into the card (no
      // bottom border / no gap). INACTIVE: a darker recessed chip.
      className={`flex-1 min-w-0 flex items-center rounded-t-xl transition-colors ${
        active
          ? 'bg-surface-card text-ink-100 h-14 border-t-2 border-forest-700'
          : 'bg-surface-raised text-ink-300 h-11 hover:text-ink-100'
      }`}
    >
      {/* Right chevron — moves to PREVIOUS period. Visible only on the
          active tab. In RTL DOM order the first child renders rightmost. */}
      {active ? (
        <button
          type="button"
          onClick={stop(onPrev)}
          disabled={prevDisabled}
          aria-label={`${SCOPE_TITLES[scope]} — קודם`}
          className="shrink-0 w-5 flex items-center justify-center text-ink-300 hover:text-ink-100 disabled:opacity-25"
        >
          <ChevronRight size={15} />
        </button>
      ) : null}

      {/* Centre — title + subtitle, vertically centred. */}
      <button
        type="button"
        onClick={onCentreClick}
        className="flex-1 min-w-0 flex flex-col items-center justify-center px-0.5 leading-tight"
        title={active && !isCurrent ? 'חזרה לתקופה הנוכחית' : undefined}
      >
        {/* Title + subtitle inherit the tab's text colour (ink-100 active,
            ink-300 inactive); subtitle is one step more muted. */}
        <span
          className="text-sm font-semibold"
          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}
        >
          {SCOPE_TITLES[scope]}
        </span>
        <span
          className={`text-[10px] mt-0.5 ${active ? 'text-ink-300' : 'text-ink-500'}`}
          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}
        >
          {formatScopeSubtitle(scope, periodKey, today, parentKey)}
        </span>
      </button>

      {/* Left chevron — moves to NEXT period. Visible only on the active
          tab. Disabled when the next period would be future OR outside
          the parent scope's current period. */}
      {active ? (
        <button
          type="button"
          onClick={stop(onNext)}
          disabled={nextDisabled}
          aria-label={`${SCOPE_TITLES[scope]} — הבא`}
          className="shrink-0 w-5 flex items-center justify-center text-ink-300 hover:text-ink-100 disabled:opacity-25"
        >
          <ChevronLeft size={15} />
        </button>
      ) : null}
    </div>
  );
}

function LockedNotice({ scope }: { scope: VisionScope }) {
  const noun =
    scope === 'yearly' ? 'השנה' : scope === 'monthly' ? 'החודש' : 'השבוע';
  return (
    // .vision-page → flat top so it connects to the tabs like the editor.
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
