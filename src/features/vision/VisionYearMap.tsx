// ============================================================================
// VisionYearMap — the "board" view: a zoom-out map of an entire year.
// ----------------------------------------------------------------------------
// One compact picture of every monthly + weekly vision in a year, so the user
// can see at a glance where they've written and jump straight there. The
// chosen vision below the map updates in place — the view never leaves.
//
//   ‹     2026 🦅 •     ›        narrow year selector (icon + written dot)
//   ┌─────┬─────┬─────┬─────┐
//   │1·ינו│2·פבר│3·מרץ│4·אפר│    12 months, 3-column grid (RTL)
//   │▫▫▫▫▫│▫▫▫▫▫│ …               tiny week squares; a white dot inside = written
//   └─────┴─────┴─────┴─────┘
//
// Marks (mirroring the layered view):
//   • WHITE DOT (right of the label / inside a week square) = written content.
//   • Soft forest TINT = the current week / month / year ("now").
//   • Bold forest OUTLINE (+ tint) = the period currently open in the editor.
//   • Shorter months centre their fewer (uniform-size) week squares.
//   • Per-period icon shows to the right of the year / month label.
// ============================================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { CompassLoader } from '../../components/CompassLoader';
import { HabitIcon } from '../habits/HabitIcon';
import { fetchVisionRowMeta } from './queries';
import { isVisionContentEmpty } from './content';
import {
  getPeriodKey,
  getWeekKey,
  monthShort,
  firstWeekStartOfMonth,
  isFuturePeriod,
  type VisionScope,
} from './period';

type WeekCell = { key: string; start: Date };

// The month-name pill (only painted for the current/active month) is a uniform
// width — the span of 5 week squares (5/6 of the row + the 4 gaps) — so the
// green mark sits on the title row alone, aligned to the squares, without
// tinting the whole card. min-width lets a rare long label grow rather than cut.
const PILL_MIN_WIDTH = 'calc(5 * ((100% - 10px) / 6) + 8px)';

type Props = {
  userId: string | null;
  /** Year currently shown on the map. */
  year: number;
  today: Date;
  /** The period currently open in the editor below — highlighted on the map. */
  selectedLevel: VisionScope;
  selectedKey: string;
  /** Step the shown year (-1 / +1) — stays in the map. */
  onStepYear: (delta: number) => void;
  /** Open a period's vision in the editor BELOW (the map view stays put). */
  onPickYear: () => void;
  onPickMonth: (monthKey: string) => void;
  onPickWeek: (weekKey: string) => void;
  /** "שנתי" view: show the WHOLE year (12 months, future dimmed) inside a
   *  height-capped scroller — exactly 2 rows (6 months) visible, the rest
   *  reachable via a scrollbar on the right. Off = compact mode (future rows
   *  hidden, no inner scroll). */
  scrollable?: boolean;
  /** "חודשי" view: same map style, but only TWO month cards in one row —
   *  the reference month + the one before it — under the year header. */
  recentMonths?: boolean;
  /** Reference (later) month for `recentMonths`; the pair shown is
   *  [monthAnchor−1, monthAnchor]. Defaults to today's month. */
  monthAnchor?: Date;
  /** Step the recent-months window by ±1 month (the flanking arrows). */
  onStepMonths?: (delta: number) => void;
  /** Whether stepping the window FORWARD stays in the past/present. */
  canStepMonthsNext?: boolean;
};

/** Enumerate the weeks (Sundays) that OVERLAP a calendar month, in order —
 *  from the week containing the 1st through the week containing the last day.
 *  Boundary weeks are shared with the neighbouring month (so a month gets 4–6
 *  weeks, and the current week opens under the current month immediately). */
function monthWeeks(year: number, monthIndex: number): WeekCell[] {
  const out: WeekCell[] = [];
  const monthEnd = new Date(year, monthIndex + 1, 0);
  const d = firstWeekStartOfMonth(year, monthIndex);
  while (d <= monthEnd) {
    const start = new Date(d);
    out.push({ key: getWeekKey(start), start });
    d.setDate(d.getDate() + 7);
  }
  return out;
}

export function VisionYearMap({
  userId,
  year,
  today,
  selectedLevel,
  selectedKey,
  onStepYear,
  onPickYear,
  onPickMonth,
  onPickWeek,
  scrollable = false,
  recentMonths = false,
  monthAnchor,
  onStepMonths,
  canStepMonthsNext = true,
}: Props) {
  const months = useMemo(() => {
    if (recentMonths) {
      // The reference month + the month before it (may cross a year boundary).
      // Order is [prev, cur]: in RTL the FIRST item is rightmost, so the
      // EARLIER month sits on the right and the timeline reads right→left.
      const ref = monthAnchor ?? today;
      const cur = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const prev = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
      return [prev, cur].map((d) => ({
        index: d.getMonth(),
        key: getPeriodKey('monthly', d),
        weeks: monthWeeks(d.getFullYear(), d.getMonth()),
      }));
    }
    return Array.from({ length: 12 }, (_, m) => ({
      index: m,
      key: getPeriodKey('monthly', new Date(year, m, 1)),
      weeks: monthWeeks(year, m),
    }));
  }, [year, recentMonths, today, monthAnchor]);

  // Compact mode hides whole FUTURE rows: in the current year we only show
  // months up to the end of the row that holds the current month (rows are
  // groups of 3), so a future row isn't rendered until its first month
  // arrives; past years show all 12. The scrollable "שנתי" view instead shows
  // the WHOLE year (future months dimmed + inert) so you can scroll it end to
  // end.
  const visibleMonths = useMemo(() => {
    if (recentMonths || scrollable) return months;
    const cy = today.getFullYear();
    if (year < cy) return months;
    if (year > cy) return [];
    const rowEnd = Math.ceil((today.getMonth() + 1) / 3) * 3; // 3, 6, 9 or 12
    return months.slice(0, rowEnd);
  }, [months, year, today, scrollable, recentMonths]);

  const allKeys = useMemo(() => {
    const keys = new Set<string>([String(year)]);
    for (const mo of visibleMonths) {
      keys.add(mo.key);
      for (const w of mo.weeks) keys.add(w.key);
    }
    return Array.from(keys);
  }, [year, visibleMonths]);

  // period key → has written content, and period key → chosen icon.
  const [contentKeys, setContentKeys] = useState<Set<string>>(new Set());
  const [iconByKey, setIconByKey] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    fetchVisionRowMeta(userId, allKeys)
      .then((rows) => {
        if (cancelled) return;
        const nextContent = new Set<string>();
        const nextIcons = new Map<string, string>();
        for (const r of rows) {
          if (!isVisionContentEmpty(r.content)) nextContent.add(r.period_key);
          if (r.icon) nextIcons.set(r.period_key, r.icon);
        }
        setContentKeys(nextContent);
        setIconByKey(nextIcons);
      })
      .catch((err) => console.error('[vision] year-map fetch failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, allKeys]);

  // Scrollable mode: cap the month grid to exactly 2 rows (6 months) and let
  // the rest scroll. All month cards share one structure (heading row + a row
  // of equal-size week squares), so they're the same height — measure the
  // first card and the cap is `2·cardHeight + one row gap`. Re-measured on
  // resize (square size, hence card height, follows the container width).
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [maxH, setMaxH] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!scrollable) {
      setMaxH(null);
      return;
    }
    const grid = gridRef.current;
    const first = grid?.children[0] as HTMLElement | undefined;
    if (!grid || !first) return;
    const measure = () => {
      const h = first.getBoundingClientRect().height;
      if (h > 0) setMaxH(Math.round(h * 2 + 6)); // 2 rows + gap-1.5 (6px)
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(first);
    return () => ro.disconnect();
  }, [scrollable, loading, visibleMonths.length]);

  const currentMonthKey = getPeriodKey('monthly', today);
  const currentWeekKey = getWeekKey(today);

  const yearKey = String(year);
  const isCurrentYear = String(today.getFullYear()) === yearKey;
  const isYearSelected = selectedLevel === 'yearly' && selectedKey === yearKey;
  const nextYearFuture = isFuturePeriod('yearly', String(year + 1), today);

  return (
    <div dir="rtl" className="pt-1">
      {/* ── Year header — the yearly vision. Full year view: flanked by the
          year-step arrows. "Recent months" view: flanked by spacers the SAME
          width as the month-step arrows below, so the header lines up exactly
          with the two month cards (and doesn't bleed to the screen edges). ── */}
      <div className="flex items-center gap-1.5 mb-3">
        {recentMonths ? (
          <span aria-hidden className="w-7 shrink-0" />
        ) : (
          <MapArrow dir="prev" aria-label="שנה קודמת" onClick={() => onStepYear(-1)} />
        )}
        <button
          type="button"
          onClick={onPickYear}
          className={`
            flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded-lg
            text-[13px] font-bold transition-colors
            ${
              isYearSelected
                ? 'bg-forest-700/20 text-ink-100 ring-2 ring-forest-500'
                : isCurrentYear
                  ? 'bg-forest-700/15 text-ink-100'
                  : 'bg-surface-card text-ink-100 hover:bg-surface-raised'
            }
          `}
        >
          {contentKeys.has(yearKey) && <WrittenDot />}
          {iconByKey.has(yearKey) && (
            <HabitIcon name={iconByKey.get(yearKey)!} size={14} className="shrink-0" />
          )}
          <span>{year}</span>
        </button>
        {recentMonths ? (
          <span aria-hidden className="w-7 shrink-0" />
        ) : (
          <MapArrow
            dir="next"
            aria-label="שנה הבאה"
            disabled={nextYearFuture}
            onClick={() => onStepYear(1)}
          />
        )}
      </div>

      {/* ── Month grid ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-10">
          <CompassLoader size="md" />
        </div>
      ) : (
        <MonthsLayout
          recentMonths={recentMonths}
          scrollable={scrollable}
          maxH={maxH}
          gridRef={gridRef}
          onStepMonths={onStepMonths}
          canStepMonthsNext={canStepMonthsNext}
        >
          {visibleMonths.map((mo) => {
            const monthHasContent = contentKeys.has(mo.key);
            const monthIcon = iconByKey.get(mo.key) ?? null;
            const isCurrentMonth = mo.key === currentMonthKey;
            const isMonthSelected =
              selectedLevel === 'monthly' && selectedKey === mo.key;
            const isFutureMonth = isFuturePeriod('monthly', mo.key, today);
            return (
              <div
                key={mo.key}
                onClick={isFutureMonth ? undefined : () => onPickMonth(mo.key)}
                role={isFutureMonth ? undefined : 'button'}
                tabIndex={isFutureMonth ? undefined : 0}
                onKeyDown={
                  isFutureMonth
                    ? undefined
                    : (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onPickMonth(mo.key);
                        }
                      }
                }
                className={`
                  rounded-xl p-1.5 flex flex-col gap-2 bg-surface-card
                  ${isFutureMonth ? '' : 'cursor-pointer'}
                `}
              >
                {/* Month heading — the WHOLE card opens the monthly vision
                    below; this is just its label. Future months (not reached
                    yet) are dimmed and the card is inert. */}
                <span
                  style={{ minWidth: PILL_MIN_WIDTH }}
                  className={`
                    self-center inline-flex items-center justify-center gap-1 h-5 px-2 rounded-md
                    leading-none text-[13px] font-semibold transition-colors
                    ${
                      isMonthSelected
                        ? 'bg-forest-700/20 ring-2 ring-forest-500 text-ink-100'
                        : isCurrentMonth
                          ? 'bg-forest-700/15 text-ink-100'
                          : isFutureMonth
                            ? 'text-ink-500'
                            : 'text-ink-100'
                    }
                  `}
                >
                  {/* White dot to the RIGHT (first child in RTL). */}
                  {monthHasContent && <WrittenDot size={5} />}
                  {monthIcon && <HabitIcon name={monthIcon} size={13} className="shrink-0" />}
                  <span className="truncate">
                    {`${mo.index + 1} · ${monthShort(mo.index)}`}
                  </span>
                </span>

                {/* Week squares — CENTRED and a uniform size everywhere: each
                    square is 1/6 of the row (the most weeks a month can hold),
                    so squares match across every month and a 4- or 5-week month
                    simply centres its fewer same-size squares. */}
                <div className="flex justify-center gap-[2px]">
                  {mo.weeks.map((week) => (
                    <WeekSquare
                      key={week.key}
                      start={week.start}
                      hasContent={contentKeys.has(week.key)}
                      isCurrent={week.key === currentWeekKey}
                      isSelected={
                        selectedLevel === 'weekly' && selectedKey === week.key
                      }
                      isFuture={isFuturePeriod('weekly', week.key, today)}
                      onClick={() => onPickWeek(week.key)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </MonthsLayout>
      )}
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

/** Lays out the month grid per view:
 *   • recentMonths ("חודשי") → two columns flanked by full-height arrows that
 *     step the window a month at a time.
 *   • scrollable ("שנתי")    → a height-capped scroller, bar on the RIGHT
 *     (dir=ltr outer → rtl inner).
 *   • otherwise (compact)    → the bare grid.
 */
function MonthsLayout({
  recentMonths,
  scrollable,
  maxH,
  gridRef,
  onStepMonths,
  canStepMonthsNext,
  children,
}: {
  recentMonths: boolean;
  scrollable: boolean;
  maxH: number | null;
  gridRef: React.RefObject<HTMLDivElement | null>;
  onStepMonths?: (delta: number) => void;
  canStepMonthsNext: boolean;
  children: React.ReactNode;
}) {
  const grid = (
    <div
      ref={gridRef}
      className={`grid gap-1.5 items-start ${recentMonths ? 'grid-cols-2' : 'grid-cols-3'}`}
    >
      {children}
    </div>
  );

  if (recentMonths) {
    return (
      <div className="flex items-stretch gap-1.5">
        {/* RTL: prev arrow (back in time) is the first child → rightmost. */}
        <SideStepArrow
          dir="prev"
          aria-label="חודש אחורה"
          onClick={() => onStepMonths?.(-1)}
        />
        <div className="flex-1 min-w-0">{grid}</div>
        <SideStepArrow
          dir="next"
          aria-label="חודש קדימה"
          disabled={!canStepMonthsNext}
          onClick={() => onStepMonths?.(1)}
        />
      </div>
    );
  }

  if (!scrollable) return grid;
  return (
    <div
      dir="ltr"
      className="vision-feed-scroll overflow-y-auto overscroll-contain pl-1.5"
      style={{ maxHeight: maxH ?? undefined }}
    >
      <div dir="rtl">{grid}</div>
    </div>
  );
}

/** Full-height month-step arrow flanking the "חודשי" view. */
function SideStepArrow({
  dir,
  disabled = false,
  onClick,
  ...rest
}: {
  dir: 'prev' | 'next';
  disabled?: boolean;
  onClick: () => void;
  'aria-label': string;
}) {
  const Chevron = dir === 'prev' ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="
        shrink-0 inline-flex items-center justify-center w-7 rounded-xl
        bg-surface-raised text-forest-500 hover:text-forest-300
        disabled:opacity-25 transition-colors
      "
      {...rest}
    >
      <Chevron size={18} />
    </button>
  );
}

function WeekSquare({
  start,
  hasContent,
  isCurrent,
  isSelected,
  isFuture,
  onClick,
}: {
  start: Date;
  hasContent: boolean;
  isCurrent: boolean;
  isSelected: boolean;
  isFuture: boolean;
  onClick: () => void;
}) {
  const label = `${start.getDate()}.${start.getMonth() + 1}`;
  return (
    <button
      type="button"
      onClick={
        isFuture
          ? undefined
          : (e) => {
              e.stopPropagation(); // open the week, not the month card behind it
              onClick();
            }
      }
      disabled={isFuture}
      title={label}
      aria-label={`שבוע של ${label}${hasContent ? ' — נכתב' : ''}`}
      // Uniform 1/6-of-row width (the most weeks a month can hold) → every
      // square is the same size in every month; shorter months centre theirs.
      style={{ width: 'calc((100% - 10px) / 6)' }}
      className={`
        relative shrink-0 aspect-square rounded-[3px] transition-colors
        flex items-center justify-center
        ${
          isFuture
            ? 'bg-surface-raised/40 opacity-40 cursor-default'
            : isSelected
              ? 'bg-forest-700/40 ring-2 ring-forest-500'
              : isCurrent
                ? 'bg-forest-700/40'
                : 'bg-surface-raised hover:bg-surface-border'
        }
      `}
    >
      {hasContent && (
        <span aria-hidden className="w-1 h-1 rounded-full bg-white" />
      )}
    </button>
  );
}

/** White "written" dot — same language as the layered view's row badge. */
function WrittenDot({ size = 5 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="shrink-0 rounded-full bg-white ring-2 ring-white/15"
      style={{ width: size, height: size }}
    />
  );
}

function MapArrow({
  dir,
  disabled = false,
  onClick,
  ...rest
}: {
  dir: 'prev' | 'next';
  disabled?: boolean;
  onClick: () => void;
  'aria-label': string;
}) {
  const Chevron = dir === 'prev' ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="
        shrink-0 inline-flex items-center justify-center w-8 h-7 rounded-lg
        bg-surface-raised text-forest-500 hover:text-forest-300
        disabled:opacity-25 transition-colors
      "
      {...rest}
    >
      <Chevron size={16} />
    </button>
  );
}
