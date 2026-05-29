// ============================================================================
// Vision screen — yearly / monthly / weekly journaling.
// ----------------------------------------------------------------------------
// One row of three EQUAL-WIDTH tabs. Each tab carries:
//   • its scope title       ("חזון שנתי" / "חודשי" / "שבועי")
//   • its current period as a subtitle ("שנת 2026" / "מאי" / "25–31 מאי")
//   • a right and left chevron so the user can scrub through periods WITHOUT
//     having to activate that tab first — the inactive tab's subtitle
//     updates in place when its chevrons are tapped.
//   • Tapping the centre (label) of an inactive tab activates it.
//   • Tapping the centre of the active tab snaps back to "now".
//
// The editor below auto-saves; the save indicator rides inside the editor's
// fixed bottom toolbar (not here).
// ============================================================================
import { useMemo, useState, type MouseEvent } from 'react';
import { ChevronRight, ChevronLeft, Lock } from 'lucide-react';
import { VisionEditor } from '../features/vision/VisionEditor';
import { useVisionEntry } from '../features/vision/useVisionEntry';
import {
  SCOPE_TITLES,
  addPeriod,
  formatScopeSubtitle,
  getPeriodKey,
  isFuturePeriod,
  type VisionScope,
} from '../features/vision/period';

const TAB_ORDER: VisionScope[] = ['yearly', 'monthly', 'weekly'];

const PLACEHOLDERS: Record<VisionScope, string> = {
  yearly: 'מה החזון שלך לשנה הזו? מה הכי חשוב לך להשיג?',
  monthly: 'איך אתה רוצה שהחודש הזה ייראה?',
  weekly: 'מה המיקוד שלך לשבוע הזה?',
};

export function Vision() {
  const [scope, setScope] = useState<VisionScope>('yearly');

  // Per-scope period key. Each tab remembers where the user was so switching
  // back doesn't snap to "now" and lose their place.
  const today = useMemo(() => new Date(), []);
  const [periodByScope, setPeriodByScope] = useState<
    Record<VisionScope, string>
  >(() => ({
    yearly: getPeriodKey('yearly', today),
    monthly: getPeriodKey('monthly', today),
    weekly: getPeriodKey('weekly', today),
  }));

  const periodKey = periodByScope[scope];
  const locked = isFuturePeriod(scope, periodKey);

  const { entry, loading, status, scheduleSave } = useVisionEntry(
    scope,
    periodKey,
  );

  const gotoIn = (target: VisionScope, delta: number) =>
    setPeriodByScope((prev) => ({
      ...prev,
      [target]: addPeriod(target, prev[target], delta),
    }));

  const jumpToNowIn = (target: VisionScope) =>
    setPeriodByScope((prev) => ({
      ...prev,
      [target]: getPeriodKey(target, today),
    }));

  return (
    // -mt-3 tightens the gap with the global brand header (Layout's pt-5
    // makes the page feel like it floats too far from the compass title).
    <section className="-mt-3 pb-6 space-y-3">
      <div
        role="tablist"
        aria-label="רמת חזון"
        dir="rtl"
        // h-14 + items-stretch: every tab is the same height regardless
        // of how long its subtitle happens to be.
        className="flex items-stretch gap-1.5 h-14"
      >
        {TAB_ORDER.map((s) => (
          <ScopeTab
            key={s}
            scope={s}
            active={scope === s}
            periodKey={periodByScope[s]}
            today={today}
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
          onChange={scheduleSave}
        />
      )}
    </section>
  );
}

// ─── Tab ────────────────────────────────────────────────────────────────────

type ScopeTabProps = {
  scope: VisionScope;
  active: boolean;
  periodKey: string;
  today: Date;
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
  onActivate,
  onPrev,
  onNext,
  onJumpToNow,
}: ScopeTabProps) {
  const isCurrent = periodKey === getPeriodKey(scope, today);
  const nextIsFuture = isFuturePeriod(scope, addPeriod(scope, periodKey, 1));

  // Centre label tap: when inactive, switching activates this tab. When
  // active and the user has scrolled away from "now", snap back. When
  // active and already on "now", do nothing (the button stays clickable
  // but has no visible effect).
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
      {/* Right chevron — moves to PREVIOUS period.
          In RTL DOM order, the first child renders on the right. */}
      <button
        type="button"
        onClick={stop(onPrev)}
        aria-label={`${SCOPE_TITLES[scope]} — קודם`}
        className={`shrink-0 w-7 flex items-center justify-center transition-opacity ${
          active
            ? 'text-cream-50/85 hover:text-cream-50'
            : 'text-ink-500 hover:text-ink-100'
        }`}
      >
        <ChevronRight size={14} />
      </button>

      {/* Centre — title + subtitle, vertically centred. */}
      <button
        type="button"
        onClick={onCentreClick}
        className="flex-1 min-w-0 flex flex-col items-center justify-center px-0.5 leading-tight"
        title={active && !isCurrent ? 'חזרה לתקופה הנוכחית' : undefined}
      >
        <span
          className={`text-[11px] font-semibold ${active ? '' : 'text-ink-100'}`}
          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}
        >
          {SCOPE_TITLES[scope]}
        </span>
        <span
          className={`text-[10px] mt-0.5 ${active ? 'text-cream-50/80' : 'text-ink-300'}`}
          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}
        >
          {formatScopeSubtitle(scope, periodKey, today)}
        </span>
      </button>

      {/* Left chevron — moves to NEXT period (disabled when next is future). */}
      <button
        type="button"
        onClick={stop(onNext)}
        disabled={nextIsFuture}
        aria-label={`${SCOPE_TITLES[scope]} — הבא`}
        className={`shrink-0 w-7 flex items-center justify-center transition-opacity disabled:opacity-25 ${
          active
            ? 'text-cream-50/85 hover:text-cream-50'
            : 'text-ink-500 hover:text-ink-100'
        }`}
      >
        <ChevronLeft size={14} />
      </button>
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
