// ============================================================================
// VisionNav — compact two-row navigation header for the vision pyramid.
// ----------------------------------------------------------------------------
// Replaces the old three-tab bar entirely.
//
//   Row 1 — Breadcrumb / zoom control:  2026 ‹ יוני ‹ שבוע 1
//           The CURRENT (deepest shown) level is a green pill; parent levels
//           are muted, tappable, and zoom OUT to that level. The path always
//           runs year (right) → week (left) in RTL, with chevron-left
//           separators pointing "inward / deeper".
//
//   Row 2 — Period stepper:  ‹ שבוע 1 מתוך 4 ›            [היום]
//           Steps between periods at the current level. Horizontal SWIPE on
//           the header is the primary gesture; the chevrons are a secondary
//           affordance. The "היום" chip appears only when off the current
//           period and jumps back to it.
//
//   Under row 2 — tiny progress dots (weeks-in-month / 12 months) reinforce
//   "where am I inside the bigger structure".
//
// Everything is derived from a single (level, anchor) position, so the path
// is always internally consistent.
// ============================================================================
import { Fragment, useRef } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import {
  addAnchor,
  getPeriodKey,
  getYearKey,
  isFuturePeriod,
  monthName,
  weekOfMonthOf,
  weeksInMonthOf,
  type VisionScope,
} from './period';

type Props = {
  level: VisionScope;
  anchor: Date;
  today: Date;
  onSetLevel: (level: VisionScope) => void;
  onStep: (delta: number) => void;
  onToday: () => void;
};

export function VisionNav({
  level,
  anchor,
  today,
  onSetLevel,
  onStep,
  onToday,
}: Props) {
  const isCurrent =
    getPeriodKey(level, anchor) === getPeriodKey(level, today);
  const nextIsFuture = isFuturePeriod(
    level,
    getPeriodKey(level, addAnchor(level, anchor, 1)),
  );

  // ── Breadcrumb crumbs (year → month → week, up to the current level) ──
  const crumbs: { level: VisionScope; label: string }[] = [
    { level: 'yearly', label: getYearKey(anchor) },
  ];
  if (level === 'monthly' || level === 'weekly') {
    crumbs.push({ level: 'monthly', label: monthName(anchor) });
  }
  if (level === 'weekly') {
    crumbs.push({ level: 'weekly', label: `שבוע ${weekOfMonthOf(anchor)}` });
  }

  // ── Stepper context ("X מתוך Y") ──
  const stepperLabel =
    level === 'yearly'
      ? getYearKey(anchor)
      : level === 'monthly'
        ? `חודש ${anchor.getMonth() + 1} מתוך 12`
        : `שבוע ${weekOfMonthOf(anchor)} מתוך ${weeksInMonthOf(anchor)}`;

  // ── Progress dots ──
  const dots =
    level === 'monthly'
      ? { count: 12, index: anchor.getMonth() }
      : level === 'weekly'
        ? { count: weeksInMonthOf(anchor), index: weekOfMonthOf(anchor) - 1 }
        : null;

  // ── Swipe (header area). RTL: finger moving LEFT (dx<0) advances to the
  //    next period (new content reads in from the left); moving RIGHT goes
  //    back. Guarded against stepping into the future by the parent. ──
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return; // not a clear horizontal swipe
    onStep(dx < 0 ? 1 : -1);
  };

  return (
    <div
      dir="rtl"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="px-2 pb-2 border-b border-surface-border/60 select-none"
    >
      {/* Row 1 — breadcrumb */}
      <div className="flex items-center gap-1 py-1 min-w-0">
        {crumbs.map((c, i) => {
          const current = i === crumbs.length - 1;
          return (
            <Fragment key={c.level}>
              {i > 0 && (
                <ChevronLeft
                  size={14}
                  className="text-ink-500 shrink-0"
                  aria-hidden
                />
              )}
              {current ? (
                <span
                  aria-current="true"
                  className="shrink-0 bg-forest-700/15 text-forest-500 font-medium text-[15px] leading-none px-3.5 py-[6px] rounded-lg"
                >
                  {c.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSetLevel(c.level)}
                  className="shrink-0 text-ink-300 hover:text-ink-100 text-[14px] leading-none px-2 py-1 rounded-md transition-colors"
                >
                  {c.label}
                </button>
              )}
            </Fragment>
          );
        })}
      </div>

      {/* Row 2 — stepper + today */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onStep(-1)}
            aria-label="התקופה הקודמת"
            className="w-7 h-7 flex items-center justify-center rounded-md text-ink-300 hover:text-ink-100 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
          <span className="text-[13px] text-ink-300 min-w-0 text-center px-1">
            {stepperLabel}
          </span>
          <button
            type="button"
            onClick={() => onStep(1)}
            disabled={nextIsFuture}
            aria-label="התקופה הבאה"
            className="w-7 h-7 flex items-center justify-center rounded-md text-ink-300 hover:text-ink-100 disabled:opacity-25 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        {!isCurrent && (
          <button
            type="button"
            onClick={onToday}
            className="text-[12px] text-forest-500 border border-forest-500/60 rounded-md px-2.5 py-[3px] hover:bg-forest-700/10 transition-colors"
          >
            היום
          </button>
        )}
      </div>

      {/* Progress dots */}
      {dots && (
        <div className="flex items-center justify-center gap-1 mt-1.5" aria-hidden>
          {Array.from({ length: dots.count }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === dots.index
                  ? 'w-3 bg-forest-500'
                  : 'w-1.5 bg-ink-500/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
