// ============================================================================
// VisionYearMap — the "board" view: a zoom-out map of an entire year.
// ----------------------------------------------------------------------------
// One compact picture of every monthly + weekly vision in a year, so the user
// can see at a glance where they've written and jump straight there. The
// chosen vision below the map updates in place — the view never leaves.
//
//   ‹     2026 🦅 •     ›        narrow year selector (icon + written dot)
//   ┌─────┬─────┬─────┬─────┐
//   │1·ינו│2·פבר│3·מרץ│4·אפר│    12 months, 3×4 grid (RTL)
//   │▫▫▫▫▫│▫▫▫▫▫│ …               tiny week squares; a white dot inside = written
//   └─────┴─────┴─────┴─────┘
//
// Marks (mirroring the layered view):
//   • WHITE DOT (right of the label / inside a week square) = written content.
//   • Forest RING = the current week / month / year ("now").
//   • Stronger forest ring/fill = the period currently open in the editor below.
//   • A faint dashed square = a padding slot (4-week months show a greyed 5th).
//   • Per-period icon shows to the right of the year / month label.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { CompassLoader } from '../../components/CompassLoader';
import { HabitIcon } from '../habits/HabitIcon';
import { fetchVisionRowMeta } from './queries';
import { isVisionContentEmpty } from './content';
import {
  getPeriodKey,
  getWeekKey,
  monthShort,
  parsePeriodStart,
  weeksInMonthOf,
  isFuturePeriod,
  type VisionScope,
} from './period';

type WeekCell = { key: string; start: Date };

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
};

// Minimum week slots rendered per month, so a 4-week month gets a greyed 5th
// and the grid stays aligned. Months with more real weeks (rare 6) show them all.
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
  selectedLevel,
  selectedKey,
  onStepYear,
  onPickYear,
  onPickMonth,
  onPickWeek,
}: Props) {
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) => ({
        index: m,
        key: getPeriodKey('monthly', new Date(year, m, 1)),
        weeks: monthWeeks(year, m),
      })),
    [year],
  );

  const allKeys = useMemo(() => {
    const keys = new Set<string>([String(year)]);
    for (const mo of months) {
      keys.add(mo.key);
      for (const w of mo.weeks) keys.add(w.key);
    }
    return Array.from(keys);
  }, [year, months]);

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

  const currentMonthKey = getPeriodKey('monthly', today);
  const currentWeekKey = getWeekKey(today);

  const yearKey = String(year);
  const isCurrentYear = String(today.getFullYear()) === yearKey;
  const isYearSelected = selectedLevel === 'yearly' && selectedKey === yearKey;
  const nextYearFuture = isFuturePeriod('yearly', String(year + 1), today);

  return (
    <div dir="rtl" className="pt-1">
      {/* ── Year selector — full width, THIN (matches the month/week rows) ── */}
      <div className="flex items-center gap-1.5 mb-3">
        <MapArrow dir="prev" aria-label="שנה קודמת" onClick={() => onStepYear(-1)} />
        <button
          type="button"
          onClick={onPickYear}
          className={`
            flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg
            text-sm font-bold transition-colors
            ${
              isYearSelected
                ? 'bg-forest-700/30 text-ink-100 ring-2 ring-forest-600'
                : isCurrentYear
                  ? 'bg-forest-700/15 text-ink-100 ring-1 ring-forest-700'
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
            const monthIcon = iconByKey.get(mo.key) ?? null;
            const isCurrentMonth = mo.key === currentMonthKey;
            const isMonthSelected =
              selectedLevel === 'monthly' && selectedKey === mo.key;
            return (
              <div
                key={mo.key}
                className="rounded-xl bg-surface-card p-1.5 flex flex-col gap-1"
              >
                {/* Month label — opens the monthly vision below. */}
                <button
                  type="button"
                  onClick={() => onPickMonth(mo.key)}
                  className={`
                    inline-flex items-center justify-center gap-1 h-5 px-1 rounded-md
                    text-[10px] font-semibold leading-none transition-colors
                    ${
                      isMonthSelected
                        ? 'bg-forest-700/30 text-forest-200 ring-1 ring-forest-600'
                        : isCurrentMonth
                          ? 'bg-forest-700/20 text-forest-300'
                          : 'text-ink-300 hover:text-ink-100'
                    }
                  `}
                >
                  {/* White dot to the RIGHT (first child in RTL). */}
                  {monthHasContent && <WrittenDot size={4} />}
                  {monthIcon && <HabitIcon name={monthIcon} size={11} className="shrink-0" />}
                  <span className="truncate">
                    {mo.index + 1}·{monthShort(mo.index)}
                  </span>
                </button>

                {/* Week squares. */}
                <div className="flex gap-0.5">
                  {Array.from({ length: slots }, (_, i) => {
                    const week = mo.weeks[i];
                    if (!week) {
                      return (
                        <span
                          key={`pad-${i}`}
                          aria-hidden
                          className="flex-1 aspect-square rounded-[3px] border border-dashed border-surface-border/60 opacity-40"
                        />
                      );
                    }
                    return (
                      <WeekSquare
                        key={week.key}
                        start={week.start}
                        hasContent={contentKeys.has(week.key)}
                        isCurrent={week.key === currentWeekKey}
                        isSelected={
                          selectedLevel === 'weekly' && selectedKey === week.key
                        }
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
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function WeekSquare({
  start,
  hasContent,
  isCurrent,
  isSelected,
  onClick,
}: {
  start: Date;
  hasContent: boolean;
  isCurrent: boolean;
  isSelected: boolean;
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
        relative flex-1 aspect-square rounded-[3px] transition-colors
        flex items-center justify-center
        bg-surface-raised hover:bg-surface-border
        ${
          isSelected
            ? 'ring-2 ring-forest-500'
            : isCurrent
              ? 'ring-1 ring-forest-300'
              : ''
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
        shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg
        bg-surface-raised text-forest-500 hover:text-forest-300
        disabled:opacity-25 transition-colors
      "
      {...rest}
    >
      <Chevron size={16} />
    </button>
  );
}
