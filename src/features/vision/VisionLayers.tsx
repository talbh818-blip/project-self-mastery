// ============================================================================
// VisionLayers — stacked layered navigator for the vision pyramid.
// ----------------------------------------------------------------------------
// Three thin rows, always visible, one per zoom level — all sharing the same
// [ prev ‹ | centre | › next ] shape:
//
//   שנתי:   [{year-1} ›]   חזון שנתי {year}      [‹ {year+1}]
//   חודשי:  [{prevMonth} ›] חזון חודשי · {month} [‹ {nextMonth}]
//   שבועי:  [שבוע {p} ›]   חזון שבועי · שבוע {n}  [‹ שבוע {q}]
//
// • Tapping a row's centre makes that level active (its vision opens in the
//   editor) — the primary action.
// • Side pills + green chevrons step the period (keep tapping to go back);
//   future periods are disabled.
// • The ACTIVE level's centre is the accent green. Centre labels fade in
//   (ease-in-out) on navigation.
//
// The "jump to current period" control ("השבוע" / "החודש" / "השנה") lives in
// the editor's DateBar row, not here.
// ============================================================================
import { ChevronRight, ChevronLeft } from 'lucide-react';
import {
  addAnchor,
  getMonthKey,
  getPeriodKey,
  getWeekKey,
  isFuturePeriod,
  monthName,
  weekOfMonthOf,
  type VisionScope,
} from './period';

type Props = {
  level: VisionScope;
  anchor: Date;
  /** Activate a level at a given anchor (centre tap or side step). */
  onPick: (level: VisionScope, anchor: Date) => void;
};

export function VisionLayers({ level, anchor, onPick }: Props) {
  const year = anchor.getFullYear();

  const prevYear = addAnchor('yearly', anchor, -1);
  const nextYear = addAnchor('yearly', anchor, 1);
  const nextYearFuture = isFuturePeriod('yearly', getPeriodKey('yearly', nextYear));

  const prevMonth = addAnchor('monthly', anchor, -1);
  const nextMonth = addAnchor('monthly', anchor, 1);
  const nextMonthFuture = isFuturePeriod(
    'monthly',
    getPeriodKey('monthly', nextMonth),
  );

  const prevWeek = addAnchor('weekly', anchor, -1);
  const nextWeek = addAnchor('weekly', anchor, 1);
  const nextWeekFuture = isFuturePeriod('weekly', getPeriodKey('weekly', nextWeek));

  return (
    <div className="space-y-1.5" dir="rtl">
      {/* ─── Yearly ─── */}
      <LayerRow active={level === 'yearly'}>
        <SidePill
          dir="prev"
          label={String(prevYear.getFullYear())}
          onClick={() => onPick('yearly', prevYear)}
        />
        <Centre
          active={level === 'yearly'}
          animKey={`y-${year}`}
          onClick={() => onPick('yearly', anchor)}
        >
          חזון שנתי {year}
        </Centre>
        <SidePill
          dir="next"
          label={String(nextYear.getFullYear())}
          disabled={nextYearFuture}
          onClick={() => onPick('yearly', nextYear)}
        />
      </LayerRow>

      {/* ─── Monthly ─── */}
      <LayerRow active={level === 'monthly'}>
        <SidePill
          dir="prev"
          label={monthName(prevMonth)}
          onClick={() => onPick('monthly', prevMonth)}
        />
        <Centre
          active={level === 'monthly'}
          animKey={`m-${getMonthKey(anchor)}`}
          onClick={() => onPick('monthly', anchor)}
        >
          חזון חודשי · {monthName(anchor)}
        </Centre>
        <SidePill
          dir="next"
          label={monthName(nextMonth)}
          disabled={nextMonthFuture}
          onClick={() => onPick('monthly', nextMonth)}
        />
      </LayerRow>

      {/* ─── Weekly ─── */}
      <LayerRow active={level === 'weekly'}>
        <SidePill
          dir="prev"
          label={`שבוע ${weekOfMonthOf(prevWeek)}`}
          onClick={() => onPick('weekly', prevWeek)}
        />
        <Centre
          active={level === 'weekly'}
          animKey={`w-${getWeekKey(anchor)}`}
          onClick={() => onPick('weekly', anchor)}
        >
          חזון שבועי · שבוע {weekOfMonthOf(anchor)}
        </Centre>
        <SidePill
          dir="next"
          label={`שבוע ${weekOfMonthOf(nextWeek)}`}
          disabled={nextWeekFuture}
          onClick={() => onPick('weekly', nextWeek)}
        />
      </LayerRow>
    </div>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────

function LayerRow({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-stretch gap-1.5 h-10 rounded-2xl p-1 transition-colors ${
        active ? 'bg-forest-700/[0.06]' : ''
      }`}
    >
      {children}
    </div>
  );
}

function Centre({
  active,
  animKey,
  onClick,
  children,
}: {
  active: boolean;
  animKey: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-0 rounded-xl text-sm font-semibold transition-colors ${
        active
          ? 'bg-forest-700/20 text-forest-500 ring-1 ring-forest-700'
          : 'bg-surface-card text-ink-100 hover:bg-surface-raised'
      }`}
    >
      {/* keyed so the label re-mounts (soft fade) when the period changes */}
      <span key={animKey} className="vision-label-anim block truncate px-2">
        {children}
      </span>
    </button>
  );
}

function SidePill({
  dir,
  label,
  disabled = false,
  onClick,
}: {
  dir: 'prev' | 'next';
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const Chevron = dir === 'prev' ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'prev' ? `הקודם: ${label}` : `הבא: ${label}`}
      className="shrink-0 inline-flex items-center gap-0.5 px-2 rounded-xl bg-surface-raised text-ink-300 hover:text-ink-100 text-[12px] disabled:opacity-25 transition-colors"
    >
      {dir === 'prev' ? (
        <>
          <Chevron size={14} className="text-forest-500 shrink-0" />
          <span>{label}</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          <Chevron size={14} className="text-forest-500 shrink-0" />
        </>
      )}
    </button>
  );
}
