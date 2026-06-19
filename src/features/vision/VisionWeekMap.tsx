// ============================================================================
// VisionWeekMap — the "weekly" view: a month drilled down to its days.
// ----------------------------------------------------------------------------
// A close cousin of VisionYearMap's monthly mode, one zoom level DEEPER. Where
// the monthly view shows month cards full of week squares, this shows a single
// month broken into:
//
//   [ חזון שנתי {year} ]                         ← yearly layer, one strip
//   [ חזון חודשי · {month} ]                     ← monthly layer, one strip
//   ‹   for each week of the month:          ›   ← month nav arrows flank these
//       שבוע N · 1.6 – 7.6
//       [א׳ 1][ב׳ 2][ג׳ 3][ד׳ 4][ה׳ 5][ו׳ 6][ש׳ 7]   ← the days = "חזון יומי"
//
// Everything is a NAVIGATOR: tapping the year / month / a week / a day opens
// THAT period in the editor below (the view itself never moves) — exactly like
// the year map. The chosen period is highlighted here.
//
// Marks (mirroring the year map / layered view):
//   • forest "written" dot  = that period has content.
//   • soft forest tint      = "now" (current year / month / week / day).
//   • forest ring           = the period currently open in the editor.
//   • per-period icon shows next to its label.
//
// NOTE on keys: a weekly key and a daily key share the 'YYYY-MM-DD' shape (a
// week is keyed by its Sunday). fetchVisionRowMeta looks rows up by period_key
// alone, so we key the content/icon maps by `${scope}:${period_key}` to keep
// a Sunday's daily entry from being mistaken for its week's vision.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { CompassLoader } from '../../components/CompassLoader';
import { HabitIcon } from '../habits/HabitIcon';
import { fetchVisionRowMeta } from './queries';
import { isVisionContentEmpty } from './content';
import {
  getDayKey,
  getMonthKey,
  getPeriodKey,
  getWeekKey,
  firstWeekStartOfMonth,
  isFuturePeriod,
  monthName,
  weekdayShort,
  type VisionScope,
} from './period';

type DayCellData = { key: string; date: Date };
type WeekData = { key: string; start: Date; index: number; days: DayCellData[] };

/** Enumerate the weeks (Sundays) that OVERLAP a calendar month, in order, each
 *  expanded into its 7 days (Sun→Sat). Boundary weeks are shared with the
 *  neighbouring month, so some days fall outside `monthIndex` — kept (the week
 *  is a real 7-day unit) but de-emphasised by the cell. */
function monthWeeksWithDays(year: number, monthIndex: number): WeekData[] {
  const out: WeekData[] = [];
  const monthEnd = new Date(year, monthIndex + 1, 0);
  const d = firstWeekStartOfMonth(year, monthIndex);
  let index = 1;
  while (d <= monthEnd) {
    const start = new Date(d);
    const days: DayCellData[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push({ key: getDayKey(day), date: day });
    }
    out.push({ key: getWeekKey(start), start, index: index++, days });
    d.setDate(d.getDate() + 7);
  }
  return out;
}

/** "1.6 – 7.6" — the week's Sunday through Saturday. */
function weekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.getDate()}.${start.getMonth() + 1} – ${end.getDate()}.${end.getMonth() + 1}`;
}

type Props = {
  userId: string | null;
  today: Date;
  /** The month whose weeks (and days) we drill into. */
  monthAnchor: Date;
  /** Step the shown month by ±1 (the flanking arrows). */
  onStepMonth: (delta: number) => void;
  /** Whether stepping the month FORWARD stays in the past/present. */
  canStepMonthNext: boolean;
  /** The period currently open in the editor below — highlighted here. */
  selectedLevel: VisionScope;
  selectedKey: string;
  /** Open a period's vision in the editor BELOW (this view stays put). */
  onPickYear: (yearKey: string) => void;
  onPickMonth: (monthKey: string) => void;
  onPickWeek: (weekKey: string) => void;
  onPickDay: (dayKey: string) => void;
};

export function VisionWeekMap({
  userId,
  today,
  monthAnchor,
  onStepMonth,
  canStepMonthNext,
  selectedLevel,
  selectedKey,
  onPickYear,
  onPickMonth,
  onPickWeek,
  onPickDay,
}: Props) {
  const year = monthAnchor.getFullYear();
  const monthIndex = monthAnchor.getMonth();
  const yearKey = getPeriodKey('yearly', monthAnchor);
  const monthKey = getMonthKey(monthAnchor);

  const weeks = useMemo(
    () => monthWeeksWithDays(year, monthIndex),
    [year, monthIndex],
  );

  // Every period key shown here, for one metadata round-trip.
  const allKeys = useMemo(() => {
    const keys = new Set<string>([yearKey, monthKey]);
    for (const w of weeks) {
      keys.add(w.key);
      for (const day of w.days) keys.add(day.key);
    }
    return Array.from(keys);
  }, [yearKey, monthKey, weeks]);

  // `${scope}:${period_key}` → has content / chosen icon. Scope-keyed so a
  // Sunday's daily entry never masquerades as its week's vision (shared key).
  const [contentByKey, setContentByKey] = useState<Set<string>>(new Set());
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
          const k = `${r.scope}:${r.period_key}`;
          if (!isVisionContentEmpty(r.content)) nextContent.add(k);
          if (r.icon) nextIcons.set(k, r.icon);
        }
        setContentByKey(nextContent);
        setIconByKey(nextIcons);
      })
      .catch((err) => console.error('[vision] week-map fetch failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, allKeys]);

  const has = (scope: VisionScope, key: string) =>
    contentByKey.has(`${scope}:${key}`);
  const iconOf = (scope: VisionScope, key: string) =>
    iconByKey.get(`${scope}:${key}`) ?? null;

  const currentDayKey = getDayKey(today);
  const currentWeekKey = getWeekKey(today);

  return (
    <div dir="rtl" className="pt-1 space-y-2">
      {/* ── Yearly layer ── */}
      <LayerStrip
        label={`חזון שנתי ${year}`}
        icon={iconOf('yearly', yearKey)}
        hasContent={has('yearly', yearKey)}
        isCurrent={String(today.getFullYear()) === yearKey}
        isSelected={selectedLevel === 'yearly' && selectedKey === yearKey}
        onClick={() => onPickYear(yearKey)}
      />

      {/* ── Monthly layer — flanked by the month-step arrows (right = a month
          back, left = forward). Putting them HERE frees the full width for the
          weeks below. ── */}
      <div className="flex items-stretch gap-1.5">
        {/* RTL: prev arrow (back in time) is the first child → rightmost. */}
        <SideStepArrow
          dir="prev"
          aria-label="חודש קודם"
          onClick={() => onStepMonth(-1)}
        />
        <div className="flex-1 min-w-0">
          <LayerStrip
            label={`חזון חודשי · ${monthName(monthAnchor)}`}
            icon={iconOf('monthly', monthKey)}
            hasContent={has('monthly', monthKey)}
            isCurrent={monthKey === getMonthKey(today)}
            isSelected={selectedLevel === 'monthly' && selectedKey === monthKey}
            onClick={() => onPickMonth(monthKey)}
          />
        </div>
        <SideStepArrow
          dir="next"
          aria-label="חודש הבא"
          disabled={!canStepMonthNext}
          onClick={() => onStepMonth(1)}
        />
      </div>

      {/* ── Weeks of the month — TWO per row, full width (the month arrows moved
          up to the monthly strip). The week card opens the WEEKLY vision; its
          day squares open each day. ── */}
      {loading ? (
        <div className="py-10">
          <CompassLoader size="md" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 items-start">
          {weeks.map((week) => {
            const isWeekSelected =
              selectedLevel === 'weekly' && selectedKey === week.key;
            const isCurrentWeek = week.key === currentWeekKey;
            const isFutureWeek = isFuturePeriod('weekly', week.key, today);
            const weekIcon = iconOf('weekly', week.key);
            return (
              <div
                key={week.key}
                onClick={isFutureWeek ? undefined : () => onPickWeek(week.key)}
                role={isFutureWeek ? undefined : 'button'}
                tabIndex={isFutureWeek ? undefined : 0}
                onKeyDown={
                  isFutureWeek
                    ? undefined
                    : (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onPickWeek(week.key);
                        }
                      }
                }
                className={`rounded-xl p-1.5 flex flex-col gap-1 bg-surface-card ${
                  isFutureWeek ? '' : 'cursor-pointer'
                }`}
              >
                {/* Header bar — "שבוע N" on the right, the date range on the
                    left, all on one line. The whole card opens the weekly vision;
                    this bar carries the selection / current-week tint. */}
                <span
                  className={`
                    flex items-center gap-1 h-6 px-2 rounded-md
                    text-[12px] font-semibold transition-colors
                    ${
                      isWeekSelected
                        ? 'bg-forest-700/20 ring-2 ring-forest-500 text-ink-100'
                        : isCurrentWeek
                          ? 'bg-forest-700/15 text-ink-100'
                          : isFutureWeek
                            ? 'text-ink-500'
                            : 'text-ink-100'
                    }
                  `}
                >
                  {has('weekly', week.key) && <WrittenDot />}
                  {weekIcon && (
                    <HabitIcon name={weekIcon} size={12} className="shrink-0" />
                  )}
                  <span className="shrink-0">שבוע {week.index}</span>
                  <span
                    dir="ltr"
                    className="ms-auto shrink-0 text-[10px] font-normal text-ink-300/70 tabular-nums"
                  >
                    {weekRange(week.start)}
                  </span>
                </span>

                {/* The 7 days — the daily journaling layer. Uniform squares
                    showing the day-of-month number. */}
                <div className="flex justify-center gap-[3px] mt-0.5">
                  {week.days.map((day) => (
                    <DaySquare
                      key={day.key}
                      date={day.date}
                      inMonth={day.date.getMonth() === monthIndex}
                      hasContent={has('daily', day.key)}
                      isCurrent={day.key === currentDayKey}
                      isSelected={
                        selectedLevel === 'daily' && selectedKey === day.key
                      }
                      isFuture={isFuturePeriod('daily', day.key, today)}
                      onClick={() => onPickDay(day.key)}
                    />
                  ))}
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

/** A full-width layer row (yearly / monthly) — tap to open it in the editor. */
function LayerStrip({
  label,
  icon,
  hasContent,
  isCurrent,
  isSelected,
  onClick,
}: {
  label: string;
  icon: string | null;
  hasContent: boolean;
  isCurrent: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl
        text-[13px] font-bold transition-colors
        ${
          isSelected
            ? 'bg-forest-700/20 text-ink-100 ring-2 ring-inset ring-forest-500'
            : isCurrent
              ? 'bg-forest-700/15 text-ink-100'
              : 'bg-surface-card text-ink-100 hover:bg-surface-raised'
        }
      `}
    >
      {hasContent && <WrittenDot />}
      {icon && <HabitIcon name={icon} size={15} className="shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

/** A single day — a compact, whole SQUARE showing the day-of-month number
 *  (1…31). A forest dot marks written days; tinted when it's "today"; ringed
 *  when open; dimmed + inert in the future; faded when it belongs to the
 *  neighbouring month (a shared boundary week). */
function DaySquare({
  date,
  inMonth,
  hasContent,
  isCurrent,
  isSelected,
  isFuture,
  onClick,
}: {
  date: Date;
  inMonth: boolean;
  hasContent: boolean;
  isCurrent: boolean;
  isSelected: boolean;
  isFuture: boolean;
  onClick: () => void;
}) {
  const full = `יום ${weekdayShort(date.getDay())} ${date.getDate()}.${date.getMonth() + 1}`;
  return (
    <button
      type="button"
      onClick={isFuture ? undefined : (e) => { e.stopPropagation(); onClick(); }}
      disabled={isFuture}
      title={full}
      aria-label={`${full}${hasContent ? ' — נכתב' : ''}`}
      // Uniform 1/7-of-row squares (6 gaps × 3px = 18px) so all seven match and
      // the card stays compact — the month's week-squares language, one deeper.
      style={{ width: 'calc((100% - 18px) / 7)' }}
      className={`
        relative shrink-0 aspect-square rounded-[5px] flex items-center justify-center
        text-[11px] font-medium tabular-nums transition-colors
        ${
          isFuture
            ? 'bg-surface-raised/40 text-ink-500 opacity-50 cursor-default'
            : isSelected
              ? 'bg-forest-700/40 ring-2 ring-forest-500 text-ink-100'
              : isCurrent
                ? 'bg-forest-700/30 text-ink-100'
                : `bg-surface-raised hover:bg-surface-border ${inMonth ? 'text-ink-100/55' : 'text-ink-500/70'}`
        }
      `}
    >
      {date.getDate()}
      {hasContent && (
        <span
          aria-hidden
          className="absolute top-[2px] left-[2px] w-1 h-1 rounded-full bg-forest-700"
        />
      )}
    </button>
  );
}

/** Forest "written" dot — same language as the year map / layered view. */
function WrittenDot() {
  return (
    <span
      aria-hidden
      className="shrink-0 w-[5px] h-[5px] rounded-full bg-forest-700 ring-2 ring-forest-700/20"
    />
  );
}

/** Full-height month-step arrow flanking the weeks column. */
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
        bg-surface-raised text-forest-500 hover:text-forest-600
        disabled:opacity-25 transition-colors
      "
      {...rest}
    >
      <Chevron size={18} />
    </button>
  );
}
