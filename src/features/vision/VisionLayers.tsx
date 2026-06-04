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
import { HabitIcon } from '../habits/HabitIcon';
import {
  addAnchor,
  getMonthKey,
  getPeriodKey,
  getWeekKey,
  isFuturePeriod,
  monthName,
  monthShort,
  weekOfMonthOf,
  type VisionScope,
} from './period';

type Props = {
  level: VisionScope;
  anchor: Date;
  /** Activate a level at a given anchor (centre tap or side step). */
  onPick: (level: VisionScope, anchor: Date) => void;
  /** Per-level icon (Lucide name or emoji char) shown next to each title. */
  icons?: Partial<Record<VisionScope, string | null>>;
};

export function VisionLayers({ level, anchor, onPick, icons }: Props) {
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
          icon={icons?.yearly ?? null}
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

      {/* ─── Monthly ─── (side pills use SHORT month names to fit w-16) */}
      <LayerRow active={level === 'monthly'}>
        <SidePill
          dir="prev"
          label={monthShort(prevMonth.getMonth())}
          onClick={() => onPick('monthly', prevMonth)}
        />
        <Centre
          active={level === 'monthly'}
          animKey={`m-${getMonthKey(anchor)}`}
          icon={icons?.monthly ?? null}
          onClick={() => onPick('monthly', anchor)}
        >
          חזון חודשי · {monthName(anchor)}
        </Centre>
        <SidePill
          dir="next"
          label={monthShort(nextMonth.getMonth())}
          disabled={nextMonthFuture}
          onClick={() => onPick('monthly', nextMonth)}
        />
      </LayerRow>

      {/* ─── Weekly ─── chevron-only side arrows: step a week each tap
          (keep tapping to go further back/forward). */}
      <LayerRow active={level === 'weekly'}>
        <SidePill dir="prev" onClick={() => onPick('weekly', prevWeek)} />
        <Centre
          active={level === 'weekly'}
          animKey={`w-${getWeekKey(anchor)}`}
          icon={icons?.weekly ?? null}
          onClick={() => onPick('weekly', anchor)}
        >
          חזון שבועי · שבוע {weekOfMonthOf(anchor)}
        </Centre>
        <SidePill
          dir="next"
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
  icon,
  onClick,
  children,
}: {
  active: boolean;
  animKey: string;
  icon?: string | null;
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
      {/* keyed so the label re-mounts (soft fade) when the period changes.
          The chosen icon sits at the START (right edge in RTL), next to the
          title text. */}
      <span
        key={animKey}
        className="vision-label-anim flex items-center justify-center gap-1.5 min-w-0 px-2"
      >
        {icon && (
          <HabitIcon name={icon} size={16} className="shrink-0 text-current" />
        )}
        <span className="truncate">{children}</span>
      </span>
    </button>
  );
}

// Fixed-width (w-16) so all three layers' centre buttons line up exactly.
// `label` optional: when omitted (weekly) the pill is a chevron-only arrow.
function SidePill({
  dir,
  label,
  disabled = false,
  onClick,
}: {
  dir: 'prev' | 'next';
  label?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const Chevron = dir === 'prev' ? ChevronRight : ChevronLeft;
  const a11y =
    dir === 'prev'
      ? label
        ? `הקודם: ${label}`
        : 'התקופה הקודמת'
      : label
        ? `הבא: ${label}`
        : 'התקופה הבאה';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={a11y}
      className="w-16 shrink-0 inline-flex items-center justify-center gap-0.5 rounded-xl bg-surface-raised text-ink-300 hover:text-ink-100 text-[12px] disabled:opacity-25 transition-colors"
    >
      {dir === 'prev' ? (
        <>
          <Chevron size={14} className="text-forest-500 shrink-0" />
          {label && <span className="truncate">{label}</span>}
        </>
      ) : (
        <>
          {label && <span className="truncate">{label}</span>}
          <Chevron size={14} className="text-forest-500 shrink-0" />
        </>
      )}
    </button>
  );
}
