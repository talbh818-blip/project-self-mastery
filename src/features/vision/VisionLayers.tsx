// ============================================================================
// VisionLayers — stacked layered navigator for the vision pyramid.
// ----------------------------------------------------------------------------
// Three thin rows, always visible, one per zoom level:
//
//   שנתי:   [{year-1} ›]   חזון שנתי {year}   [‹ {year+1}]
//   חודשי:  [{prevMonth} ›] חזון חודשי · {month} [‹ {nextMonth}]
//   שבועי:  [שבוע 1][שבוע 2]…[שבוע N]            [⌖ השבוע]
//
// • Tapping a row's CENTRE makes that level active (its vision shows in the
//   editor) — the primary action.
// • Side pills + chevrons step the period (keep tapping to go further back);
//   they also activate that level. Future periods are disabled.
// • The weekly row lists every week of the current month; "השבוע" (with a
//   calendar-check icon) jumps to the current week.
// • The ACTIVE level's centre is the accent green so you can see which vision
//   you're editing. Period changes animate with a soft ease-in-out fade.
//
// All navigation flows through one (level, anchor) position via onPick.
// ============================================================================
import { ChevronRight, ChevronLeft, CalendarCheck } from 'lucide-react';
import {
  addAnchor,
  getMonthKey,
  getPeriodKey,
  getWeekKey,
  isFuturePeriod,
  monthName,
  parsePeriodStart,
  weeksInMonthOf,
  type VisionScope,
} from './period';

type Props = {
  level: VisionScope;
  anchor: Date;
  today: Date;
  /** Activate a level at a given anchor (centre tap, side step, week pick). */
  onPick: (level: VisionScope, anchor: Date) => void;
  /** Jump to the current week. */
  onToday: () => void;
};

export function VisionLayers({ level, anchor, today, onPick, onToday }: Props) {
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

  const weeks = weekAnchorsOfMonth(anchor);
  const selectedWeekKey = getWeekKey(anchor);
  const todayWeekKey = getWeekKey(today);

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
      <div className="vision-chips flex items-stretch gap-1.5 overflow-x-auto">
        {weeks.map((w, i) => {
          const isSel = level === 'weekly' && w.key === selectedWeekKey;
          return (
            <button
              key={w.key}
              type="button"
              disabled={w.future}
              onClick={() => onPick('weekly', w.anchor)}
              className={`shrink-0 h-9 px-3 rounded-xl text-[13px] font-medium transition-colors disabled:opacity-25 ${
                isSel
                  ? 'bg-forest-700/20 text-forest-500 ring-1 ring-forest-700'
                  : 'bg-surface-raised text-ink-300 hover:text-ink-100'
              }`}
            >
              שבוע {i + 1}
            </button>
          );
        })}
        {/* This-week jump */}
        <button
          type="button"
          onClick={onToday}
          aria-label="חזרה לשבוע הנוכחי"
          className={`shrink-0 h-9 px-3 rounded-xl text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors ${
            todayWeekKey === selectedWeekKey && level === 'weekly'
              ? 'text-forest-500'
              : 'text-ink-300 hover:text-ink-100'
          }`}
        >
          <CalendarCheck size={15} />
          השבוע
        </button>
      </div>
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

// ─── Week anchors of the anchor's month ─────────────────────────────────────
// Mirrors the drill-down math: i=0 → the 1st (in-month, week 1); i≥1 → that
// week's Monday (which lands inside the month). Each anchor is guaranteed to
// resolve to the right ISO week within the month.
function weekAnchorsOfMonth(anchor: Date): {
  key: string;
  anchor: Date;
  future: boolean;
}[] {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const count = weeksInMonthOf(anchor);
  const firstMon = parsePeriodStart('weekly', getWeekKey(new Date(y, m, 1)));
  const out: { key: string; anchor: Date; future: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    let a: Date;
    if (i === 0) {
      a = new Date(y, m, 1);
    } else {
      a = new Date(firstMon);
      a.setDate(a.getDate() + i * 7);
    }
    const key = getWeekKey(a);
    out.push({ key, anchor: a, future: isFuturePeriod('weekly', key) });
  }
  return out;
}
