// ============================================================================
// Vision screen — yearly / monthly / weekly journaling.
// ----------------------------------------------------------------------------
// Single control strip at the top: three tabs (שנתי / חודשי / שבועי) where
// the active tab expands to show its current period label flanked by left
// and right chevrons that navigate within that scope. Inactive tabs collapse
// to just the scope name. Clicking an inactive tab activates it (and keeps
// whatever period was last viewed there).
//
// The editor below auto-saves; the save indicator is rendered inside the
// editor's fixed bottom toolbar (not here).
// ============================================================================
import { useMemo, useState, type MouseEvent } from 'react';
import { ChevronRight, ChevronLeft, Lock } from 'lucide-react';
import { VisionEditor } from '../features/vision/VisionEditor';
import { useVisionEntry } from '../features/vision/useVisionEntry';
import {
  addPeriod,
  formatPeriodLabel,
  getPeriodKey,
  isFuturePeriod,
  type VisionScope,
} from '../features/vision/period';

const TABS: { scope: VisionScope; label: string }[] = [
  { scope: 'yearly', label: 'שנתי' },
  { scope: 'monthly', label: 'חודשי' },
  { scope: 'weekly', label: 'שבועי' },
];

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
        className="flex bg-surface-card rounded-2xl p-1 gap-1"
      >
        {TABS.map((t) => (
          <ScopeTab
            key={t.scope}
            scope={t.scope}
            label={t.label}
            active={scope === t.scope}
            periodKey={periodByScope[t.scope]}
            today={today}
            onActivate={() => setScope(t.scope)}
            onPrev={() => gotoIn(t.scope, -1)}
            onNext={() => gotoIn(t.scope, 1)}
            onJumpToNow={() => jumpToNowIn(t.scope)}
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
  label: string;
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
  label,
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

  // Inactive: a single button that activates the tab on tap.
  if (!active) {
    return (
      <button
        type="button"
        role="tab"
        aria-selected={false}
        onClick={onActivate}
        className="flex-1 py-2 rounded-xl text-sm font-medium text-ink-300 hover:text-ink-100 transition-colors min-w-0"
      >
        {label}
      </button>
    );
  }

  // Active: chevron–label–chevron triplet. Chevrons stopPropagation so the
  // outer container can't accidentally swallow them, and the centre label
  // jumps back to "now" when the user has drifted from the current period.
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      role="tab"
      aria-selected
      // flex-[2] gives the active tab roughly twice the width of an
      // inactive sibling so the period label fits without truncation.
      className="flex-[2] flex items-center bg-forest-700 text-cream-50 rounded-xl min-w-0"
    >
      <button
        type="button"
        onClick={stop(onPrev)}
        aria-label="התקופה הקודמת"
        className="shrink-0 w-8 h-8 flex items-center justify-center text-cream-50/90 hover:text-cream-50"
      >
        <ChevronRight size={16} />
      </button>

      <button
        type="button"
        onClick={stop(onJumpToNow)}
        disabled={isCurrent}
        title={isCurrent ? '' : 'חזרה לתקופה הנוכחית'}
        className="flex-1 min-w-0 truncate text-center text-sm font-medium py-1.5 px-1"
      >
        {formatPeriodLabel(scope, periodKey)}
        {!isCurrent && (
          <span className="text-cream-50/60 text-xs mr-1">↺</span>
        )}
      </button>

      <button
        type="button"
        onClick={stop(onNext)}
        disabled={nextIsFuture}
        aria-label="התקופה הבאה"
        className="shrink-0 w-8 h-8 flex items-center justify-center text-cream-50/90 hover:text-cream-50 disabled:opacity-30"
      >
        <ChevronLeft size={16} />
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
