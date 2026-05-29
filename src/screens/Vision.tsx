// ============================================================================
// Vision screen — yearly / monthly / weekly journaling.
// ----------------------------------------------------------------------------
// Three tabs at the top switch between scopes. Inside each scope, the user
// navigates between periods with arrow buttons (and can jump back to "now").
// Future periods are locked (nothing to reflect on yet). The editor inside
// is Tiptap; every keystroke auto-saves through `useVisionEntry`.
// ============================================================================
import { useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, Lock, CheckCircle2 } from 'lucide-react';
import { VisionEditor } from '../features/vision/VisionEditor';
import { useVisionEntry, type SaveStatus } from '../features/vision/useVisionEntry';
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
  const isCurrentPeriod = periodKey === getPeriodKey(scope, today);

  const { entry, loading, status, scheduleSave } = useVisionEntry(
    scope,
    periodKey,
  );

  const goto = (delta: number) =>
    setPeriodByScope((prev) => ({
      ...prev,
      [scope]: addPeriod(scope, prev[scope], delta),
    }));

  const jumpToNow = () =>
    setPeriodByScope((prev) => ({
      ...prev,
      [scope]: getPeriodKey(scope, today),
    }));

  return (
    <section className="pt-1 pb-6 space-y-3">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-ink-100">חזון</h1>
        <SaveBadge status={status} />
      </header>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="רמת חזון"
        className="flex bg-surface-card rounded-2xl p-1 gap-1"
      >
        {TABS.map((t) => (
          <button
            key={t.scope}
            role="tab"
            aria-selected={scope === t.scope}
            onClick={() => setScope(t.scope)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              scope === t.scope
                ? 'bg-forest-700 text-cream-50'
                : 'text-ink-300 hover:text-ink-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Period navigator.
          RTL convention (Hebrew calendars / Google Hebrew etc.):
            • RIGHT side = previous period (older)  → chevron points right (►)
            • LEFT  side = next     period (newer)  → chevron points left  (◄)
          With `dir="rtl"` on the parent + default flex order, the DOM's
          first child renders on the right and the last child on the left,
          so we place "previous" first and "next" last. */}
      <div
        dir="rtl"
        className="flex items-center justify-between bg-surface-card rounded-2xl px-2 py-1.5"
      >
        <button
          type="button"
          onClick={() => goto(-1)}
          aria-label="התקופה הקודמת"
          className="w-9 h-9 flex items-center justify-center rounded-xl text-ink-300 hover:bg-surface-raised hover:text-ink-100 transition-colors"
        >
          <ChevronRight size={18} />
        </button>

        <button
          type="button"
          onClick={jumpToNow}
          disabled={isCurrentPeriod}
          className="flex-1 mx-1 px-3 py-1.5 text-sm text-ink-100 font-medium rounded-xl hover:bg-surface-raised disabled:hover:bg-transparent transition-colors text-center"
          aria-label="חזרה לתקופה הנוכחית"
          title={isCurrentPeriod ? '' : 'חזרה לתקופה הנוכחית'}
        >
          {formatPeriodLabel(scope, periodKey)}
          {!isCurrentPeriod && (
            <span className="text-ink-500 text-xs mr-2">↺</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => goto(1)}
          disabled={isFuturePeriod(scope, addPeriod(scope, periodKey, 1))}
          aria-label="התקופה הבאה"
          className="w-9 h-9 flex items-center justify-center rounded-xl text-ink-300 hover:bg-surface-raised hover:text-ink-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
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
          onChange={scheduleSave}
        />
      )}
    </section>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  const text = (() => {
    switch (status) {
      case 'pending':
      case 'saving':
        return 'שומר…';
      case 'saved':
        return 'נשמר';
      case 'error':
        return 'שגיאה בשמירה';
    }
  })();
  const color =
    status === 'error'
      ? 'text-red-400'
      : status === 'saved'
        ? 'text-forest-500'
        : 'text-ink-300';
  return (
    <span className={`text-xs ${color} flex items-center gap-1`}>
      {status === 'saved' && <CheckCircle2 size={12} />}
      {text}
    </span>
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
