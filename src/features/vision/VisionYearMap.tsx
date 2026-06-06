// ============================================================================
// VisionYearMap — the "board" view: a zoom-out map of an entire year.
// ----------------------------------------------------------------------------
// One compact picture of every monthly + weekly vision in a year, so the user
// can see at a glance where they've written and jump straight there.
//
//   ┌──────────────────────────────────────────┐
//   │  ‹            2026 •            ›          │   year bar (big)
//   ├──────────────────────────────────────────┤
//   │  1·ינו  2·פבר  3·מרץ  4·אפר                │   12 months, 3×4 grid
//   │  ▪▪▪▪▫   ▪▫▫▫▫   ▫▫▫▫▫   …                  │   tiny week squares
//   │  …                                         │
//   └──────────────────────────────────────────┘
//
// Marks:
//   • A FILLED square / dot = that period has written content.
//   • A RING = the current week / month / year (where "now" lands).
//   • A faint dashed square = a padding slot (months with 4 ISO weeks show a
//     greyed 5th so every month lines up).
//
// Tapping the year, a month, or a week navigates to that period in the layered
// view (the parent switches `view` back to 'layers').
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { CompassLoader } from '../../components/CompassLoader';
import { fetchVisionRowMeta } from './queries';
import { isVisionContentEmpty } from './content';
import {
  getPeriodKey,
  getWeekKey,
  monthShort,
  parsePeriodStart,
  weeksInMonthOf,
  isFuturePeriod,
} from './period';

type WeekCell = { key: string; start: Date };

type Props = {
  userId: string | null;
  /** Year currently shown. */
  year: number;
  today: Date;
  /** Step the shown year (-1 / +1) — stays in the map. */
  onStepYear: (delta: number) => void;
  /** Navigate to the yearly vision (switches to the layered view). */
  onPickYear: () => void;
  onPickMonth: (monthKey: string) => void;
  onPickWeek: (weekKey: string) => void;
};

// Minimum week slots rendered per month, so a 4-week month gets a greyed 5th
// and the grid stays aligned. Months with more real weeks (rare 6) show them
// all.
const MIN_WEEK_SLOTS = 5;

/** Enumerate the ISO weeks that overlap a calendar month, in order. */
function monthWeeks(year: number, monthIndex: number): WeekCell[] {
  const monthStart = new Date(year, monthIndex, 1);
  const count = weeksInMonthOf(monthStart);
  const firstStart = parsePeriodStart('weekly', getWeekKey(monthStart));
  const out: WeekCell[] = [];
  for (let i = 0; i < count; i++) {
    const start = new Date(firstStart);
    start.setDate(firstStart.getDate() + i * 7);
    out.push({ key: getWeekKey(start), start });
  }
  return out;
}

export function VisionYearMap({
  userId,
  year,
  today,
  onStepYear,
  onPickYear,
  onPickMonth,
  onPickWeek,
}: Props) {
  // Per-month week lists — pure, recomputed only when the year changes.
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) => ({
        index: m,
        key: getPeriodKey('monthly', new Date(year, m, 1)),
        weeks: monthWeeks(year, m),
      })),
    [year],
  );

  // All period keys we need content-state for: the year, 12 months, and every
  // unique week across them.
  const allKeys = useMemo(() => {
    const keys = new Set<string>([String(year)]);
    for (const mo of months) {
      keys.add(mo.key);
      for (const w of mo.weeks) keys.add(w.key);
    }
    return Array.from(keys);
  }, [year, months]);

  // Set of period keys that actually have written content.
  const [contentKeys, setContentKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    fetchVisionRowMeta(userId, allKeys)
      .then((rows) => {
        if (cancelled) return;
        const next = new Set<string>();
        for (const r of rows) {
          if (!isVisionContentEmpty(r.content)) next.add(r.period_key);
        }
        setContentKeys(next);
      })
      .catch((err) => console.error('[vision] year-map fetch failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, allKeys]);

  const currentYearKey = String(today.getFullYear());
  const currentMonthKey = getPeriodKey('monthly', today);
  const currentWeekKey = getWeekKey(today);

  const isCurrentYear = currentYearKey === String(year);
  const nextYearFuture = isFuturePeriod('yearly', String(year + 1), today);

  return (
    <div dir="rtl" className="pt-1">
      {/* ── Year bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <MapArrow
          dir="prev"
          aria-label="שנה קודמת"
          onClick={() => onStepYear(-1)}
        />
        <button
          type="button"
          onClick={onPickYear}
          className={`
            flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-2xl
            text-xl font-bold transition-colors
            ${
              isCurrentYear
                ? 'bg-forest-700/20 text-ink-100 ring-1 ring-forest-700'
                : 'bg-surface-card text-ink-100 hover:bg-surface-raised'
            }
          `}
        >
          <span>{year}</span>
          {contentKeys.has(String(year)) && <ContentDot />}
        </button>
        <MapArrow
          dir="next"
          aria-label="שנה הבאה"
          disabled={nextYearFuture}
          onClick={() => onStepYear(1)}
        />
      </div>

      {/* ── Month grid ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-10">
          <CompassLoader size="md" />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {months.map((mo) => {
            const slots = Math.max(MIN_WEEK_SLOTS, mo.weeks.length);
            const monthHasContent = contentKeys.has(mo.key);
            const isCurrentMonth = mo.key === currentMonthKey;
            return (
              <div
                key={mo.key}
                className="rounded-xl bg-surface-card p-1.5 flex flex-col gap-1"
              >
                {/* Month label — taps through to the monthly vision. */}
                <button
                  type="button"
                  onClick={() => onPickMonth(mo.key)}
                  className={`
                    inline-flex items-center justify-center gap-1 h-5 rounded-md
                    text-[10px] font-semibold leading-none transition-colors
                    ${
                      isCurrentMonth
                        ? 'bg-forest-700/25 text-forest-300'
                        : 'text-ink-300 hover:text-ink-100'
                    }
                  `}
                >
                  <span className="truncate">
                    {mo.index + 1}·{monthShort(mo.index)}
                  </span>
                  {monthHasContent && <ContentDot size={4} />}
                </button>

                {/* Week squares. */}
                <div className="flex gap-0.5">
                  {Array.from({ length: slots }, (_, i) => {
                    const week = mo.weeks[i];
                    if (!week) {
                      // Padding slot — greyed, inert.
                      return (
                        <span
                          key={`pad-${i}`}
                          aria-hidden
                          className="flex-1 aspect-square rounded-[3px] border border-dashed border-surface-border/60 opacity-40"
                        />
                      );
                    }
                    const hasContent = contentKeys.has(week.key);
                    const isCurrentWeek = week.key === currentWeekKey;
                    return (
                      <WeekSquare
                        key={week.key}
                        start={week.start}
                        hasContent={hasContent}
                        isCurrent={isCurrentWeek}
                        onClick={() => onPickWeek(week.key)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-ink-300/70">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-forest-600" />
          נכתב
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-surface-raised ring-1 ring-forest-400" />
          השבוע
        </span>
      </div>
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function WeekSquare({
  start,
  hasContent,
  isCurrent,
  onClick,
}: {
  start: Date;
  hasContent: boolean;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const label = `${start.getDate()}.${start.getMonth() + 1}`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={`שבוע של ${label}${hasContent ? ' — נכתב' : ''}`}
      className={`
        flex-1 aspect-square rounded-[3px] transition-colors
        ${hasContent ? 'bg-forest-600 hover:bg-forest-500' : 'bg-surface-raised hover:bg-surface-border'}
        ${isCurrent ? 'ring-1 ring-forest-300' : ''}
      `}
    />
  );
}

function ContentDot({ size = 5 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="shrink-0 rounded-full bg-forest-400"
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
        shrink-0 inline-flex items-center justify-center w-9 h-12 rounded-2xl
        bg-surface-raised text-forest-500 hover:text-forest-300
        disabled:opacity-25 transition-colors
      "
      {...rest}
    >
      <Chevron size={18} />
    </button>
  );
}
