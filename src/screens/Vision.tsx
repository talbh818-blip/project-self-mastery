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
import { useMemo, useState, type MouseEvent } from 'react';
import { ChevronRight, ChevronLeft, Lock } from 'lucide-react';
import { VisionEditor } from '../features/vision/VisionEditor';
import { useVisionEntry } from '../features/vision/useVisionEntry';
import {
  SCOPE_TITLES,
  addPeriod,
  clampMonthlyToYear,
  clampWeeklyToMonth,
  formatScopeSubtitle,
  getPeriodKey,
  isFuturePeriod,
  isOutsideParent,
  type VisionScope,
} from '../features/vision/period';

const TAB_ORDER: VisionScope[] = ['yearly', 'monthly', 'weekly'];

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
    <section className="-mt-3 pb-6 space-y-3">
      <div
        role="tablist"
        aria-label="רמת חזון"
        dir="rtl"
        // h-12 matches the Habits screen's action-row height so the visual
        // language carries across screens.
        className="flex items-stretch gap-1.5 h-12"
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

      {/* Body */}
      {locked ? (
        <LockedNotice scope={scope} />
      ) : loading ? (
        <p className="text-ink-300 text-sm pt-6 text-center">טוען…</p>
      ) : (
        <VisionEditor
          // resetKey forces the editor to re-mount when the period changes,
          // so it loads the right initial document.
          resetKey={`${scope}:${periodKey}`}
          scope={scope}
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
      className={`flex-1 min-w-0 flex items-stretch rounded-2xl border transition-colors ${
        active
          ? 'bg-forest-700 text-cream-50 border-forest-700'
          : 'bg-surface-card text-ink-300 border-surface-border'
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
          className="shrink-0 w-6 flex items-center justify-center text-cream-50/85 hover:text-cream-50 disabled:opacity-25"
        >
          <ChevronRight size={16} />
        </button>
      ) : null}

      {/* Centre — title + subtitle, vertically centred. */}
      <button
        type="button"
        onClick={onCentreClick}
        className="flex-1 min-w-0 flex flex-col items-center justify-center px-0.5 leading-tight"
        title={active && !isCurrent ? 'חזרה לתקופה הנוכחית' : undefined}
      >
        <span
          className={`text-sm font-semibold ${active ? '' : 'text-ink-100'}`}
          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}
        >
          {SCOPE_TITLES[scope]}
        </span>
        <span
          className={`text-[10px] mt-0.5 ${active ? 'text-cream-50/80' : 'text-ink-300'}`}
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
          className="shrink-0 w-6 flex items-center justify-center text-cream-50/85 hover:text-cream-50 disabled:opacity-25"
        >
          <ChevronLeft size={16} />
        </button>
      ) : null}
    </div>
  );
}

function LockedNotice({ scope }: { scope: VisionScope }) {
  const noun =
    scope === 'yearly' ? 'השנה' : scope === 'monthly' ? 'החודש' : 'השבוע';
  return (
    <div className="bg-surface-card rounded-2xl p-8 text-center mt-4">
      <Lock size={28} className="text-ink-500 mx-auto mb-3" />
      <p className="text-ink-100 font-medium">{noun} עוד לא הגיע</p>
      <p className="text-ink-300 text-sm mt-1">
        אפשר לכתוב חזון רק לתקופה שכבר התחילה.
      </p>
    </div>
  );
}
