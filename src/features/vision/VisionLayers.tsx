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
  parsePeriodStart,
  type VisionScope,
} from './period';

type Props = {
  level: VisionScope;
  anchor: Date;
  /** Activate a level at a given anchor (centre tap or side step). */
  onPick: (level: VisionScope, anchor: Date) => void;
  /** Per-level icon (Lucide name or emoji char). Shown inline next to the
   *  title ONLY when set — picking now lives in the editor's DateBar, so a
   *  level with no icon has no empty tile. */
  icons?: Partial<Record<VisionScope, string | null>>;
  /** Per-level "has written content" → shows the check-mark badge. */
  written?: Partial<Record<VisionScope, boolean>>;
};

/** "1.4 – 7.4" for the week containing `anchor`. Uses the app's canonical
 *  week start (parsePeriodStart) so the range matches the real week
 *  boundaries, then +6 days for the end. */
function weekRangeLabel(anchor: Date): string {
  const start = parsePeriodStart('weekly', getWeekKey(anchor));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

export function VisionLayers({
  level,
  anchor,
  onPick,
  icons,
  written,
}: Props) {
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
          done={written?.yearly ?? false}
          onActivate={() => onPick('yearly', anchor)}
        >
          <span className="truncate min-w-0">חזון שנתי {year}</span>
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
          done={written?.monthly ?? false}
          onActivate={() => onPick('monthly', anchor)}
        >
          <span className="truncate min-w-0">חזון חודשי · {monthName(anchor)}</span>
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
          done={written?.weekly ?? false}
          onActivate={() => onPick('weekly', anchor)}
        >
          {/* Label truncates first when cramped; the dates stay. */}
          <span className="truncate min-w-0">חזון שבועי</span>
          {/* date range — LTR so the numbers don't reorder in RTL */}
          <span
            dir="ltr"
            className="shrink-0 text-[11px] font-normal text-ink-100 tabular-nums"
          >
            {weekRangeLabel(anchor)}
          </span>
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
  done = false,
  onActivate,
  children,
}: {
  active: boolean;
  animKey: string;
  icon?: string | null;
  /** Entry has written content → show the check-mark badge. */
  done?: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  // Single tap-target: the whole centre activates the level. The icon (when
  // set) rides inline to the title's RIGHT — no reserved tile, so a level
  // without an icon just shows its title. Picking the icon happens in the
  // editor's DateBar now.
  return (
    <button
      type="button"
      onClick={onActivate}
      className={`flex-1 min-w-0 rounded-xl text-sm font-semibold transition-colors ${
        active
          ? // Active = green ring + faint green bg; the TEXT stays light
            // (ink-100) — only the frame signals selection.
            'bg-forest-700/20 text-ink-100 ring-1 ring-forest-700'
          : 'bg-surface-card text-ink-100 hover:bg-surface-raised'
      }`}
    >
      <span
        key={animKey}
        className="vision-label-anim flex items-center gap-1.5 min-w-0 px-2 h-full"
      >
        {/* "Written" dot — far RIGHT. A tiny status dot is the cleanest,
            most space-efficient "has content" signal; it never crowds the
            row, so it stays visible at every width. */}
        {done && (
          <span className="flex shrink-0 items-center">
            <WrittenBadge />
          </span>
        )}

        {/* Centred group: the TITLE alone is what's centred. The icon (first
            child → physical RIGHT in RTL) leads the line, and an invisible
            spacer the SAME width sits on the physical LEFT so the two cancel
            out — the title stays dead-centre instead of shifting left to make
            room for the icon. Both are shrink-0; the title truncates first. */}
        <span className="flex-1 min-w-0 flex items-center justify-center gap-1.5">
          {icon && <HabitIcon name={icon} size={16} className="shrink-0" />}
          {children}
          {icon && <span aria-hidden className="shrink-0 w-4" />}
        </span>

        {/* Left balance spacer — same width as the right dot so the centred
            group stays truly centred. */}
        {done && <span aria-hidden className="shrink-0 w-1.5" />}
      </span>
    </button>
  );
}

/** "Written" indicator — a tiny white status dot. Minimal, doesn't crowd
 *  the row, and reads cleanly as "this vision has content". A soft ring gives
 *  it a touch of depth without making it loud. */
function WrittenBadge() {
  return (
    <span
      aria-label="נכתב"
      title="נכתב"
      className="shrink-0 w-1.5 h-1.5 rounded-full bg-white ring-2 ring-white/15"
    />
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
