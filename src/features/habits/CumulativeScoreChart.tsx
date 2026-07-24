// ---------------------------------------------------------------------------
// CumulativeScoreChart — SVG line of a running point total over the visible
// range. Shared by the Habits data view (own data) and the UserDetail screen
// (another user's data fetched via get_user_dashboard). The caller pre-builds
// the cumulative {date, value} series; this component draws it and lets the
// user switch between two views:
//
//   • הכל       — the raw cumulative series the caller supplied. Line rises
//                 on V days, falls on X / auto_x days, follows every wobble.
//   • עליות     — a derived series where each day contributes max(0, delta)
//                 to the running total. Net-negative days flatten instead of
//                 pushing the line down, so the graph reads as "cumulative
//                 wins only". The derivation is self-contained here so no
//                 caller has to know about the second mode.
//
// `headerExtra` is an optional control (e.g. a range toggle) rendered under
// the title row — the Habits view omits it, UserDetail passes a range
// selector.
// ---------------------------------------------------------------------------
import { useMemo, useState, type ReactNode } from 'react';
import { Activity, TrendingUp } from 'lucide-react';

type PointSeries = { date: Date; value: number }[];
type Mode = 'all' | 'positive';

// Derive the "positive-only" cumulative series from the raw one.
// Each day's delta is `raw[i].value - raw[i-1].value`; we accumulate only
// the positive part. Days with a net drop become flat segments — the line
// never turns down in this mode.
function toPositiveOnly(points: PointSeries): PointSeries {
  const out: PointSeries = [];
  let running = 0;
  let prev = points.length > 0 ? points[0].value : 0;
  // Seed the first point at its own value if positive, else 0 — matches the
  // way the raw series starts from wherever the caller anchored day 0.
  const first = Math.max(0, prev);
  running = first;
  out.push({ date: points[0].date, value: running });
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].value - prev;
    running += Math.max(0, delta);
    out.push({ date: points[i].date, value: running });
    prev = points[i].value;
  }
  return out;
}

export function CumulativeScoreChart({
  points,
  headerExtra,
  baseOffset = 0,
}: {
  points: PointSeries;
  headerExtra?: ReactNode;
  /**
   * Constant to add to every point's y-value before rendering. Used to
   * fold profiles.score_adjustment into the trend so the chart's last
   * number matches the score number shown everywhere else in the app.
   * Defaults to 0 — callers that don't have an adjustment can ignore it.
   */
  baseOffset?: number;
}) {
  const [mode, setMode] = useState<Mode>('all');

  // Derive the visible series — the "positive" variant is cheap to recompute
  // whenever `points` changes so we don't need to lift it to the caller.
  // baseOffset shifts every point uniformly; the line shape stays intact.
  const positiveSeries = useMemo(
    () => (points.length > 0 ? toPositiveOnly(points) : []),
    [points],
  );
  const rawDisplayed = mode === 'positive' ? positiveSeries : points;
  const displayed = useMemo(
    () =>
      baseOffset === 0
        ? rawDisplayed
        : rawDisplayed.map((p) => ({ date: p.date, value: p.value + baseOffset })),
    [rawDisplayed, baseOffset],
  );

  if (displayed.length === 0) return null;

  // Y-axis auto-zoom. Fitting the raw data range (instead of clamping min to
  // 0) is what makes small drops actually visible — otherwise a −20 dip
  // against a +2900 total collapses into a sub-pixel wiggle. We keep 0 in
  // the range only when the series legitimately crosses zero (goes negative
  // or starts there), so the line's polarity still reads at a glance.
  const values = displayed.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const min = rawMin < 0 ? Math.min(0, rawMin) : rawMin;
  const max = rawMax > 0 ? Math.max(0, rawMax) : rawMax;
  const W = 320;
  const H = 80;
  const padX = 4;
  const padY = 8;
  const xStep = (W - padX * 2) / Math.max(1, displayed.length - 1);
  const yScale = (v: number) => {
    if (max === min) return H / 2;
    return padY + (1 - (v - min) / (max - min)) * (H - padY * 2);
  };

  const path = displayed
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${padX + i * xStep} ${yScale(p.value)}`)
    .join(' ');
  const areaPath =
    `M ${padX} ${H - padY} ` +
    displayed
      .map((p, i) => `L ${padX + i * xStep} ${yScale(p.value)}`)
      .join(' ') +
    ` L ${padX + (displayed.length - 1) * xStep} ${H - padY} Z`;

  // Header total is a fact about the user's score TODAY, not about the
  // rendering mode — so it stays pinned to the true cumulative value even
  // when the line is drawn in "עליות בלבד" mode (where the raw series
  // skips drops and would otherwise inflate above the real score).
  // Always derive from the raw "all" series, then apply the same offset.
  const last = Math.round(points[points.length - 1].value + baseOffset);
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card p-3">
      {/* Header row: title on the visual right (RTL: first child), the mode
          toggle in the middle, and the running total on the visual left. */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[11px] uppercase tracking-wider text-ink-100 shrink-0">
          נקודות מצטברות
        </h3>
        <ModeToggle mode={mode} onChange={setMode} />
        <div className="text-sm font-bold text-ink-100 tabular-nums shrink-0">
          {last > 0 ? `+${last}` : last}
        </div>
      </div>

      {headerExtra && <div className="mt-2">{headerExtra}</div>}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-20 mt-2"
      >
        <defs>
          <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-forest-500)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-forest-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#scoreFill)" />
        <path
          d={path}
          fill="none"
          stroke="var(--color-forest-500)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

// Two-option segmented control inside the chart's header row. Each button
// shows a small icon + short Hebrew label so meaning reads at a glance
// without hovering. Text is intentionally small (10.5px) so the row keeps
// fitting between title and total on the narrowest phones.
function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="מצב תצוגת גרף"
      className="inline-flex bg-surface-raised rounded-lg p-0.5 gap-0.5 shrink-0"
    >
      <ModeBtn
        active={mode === 'positive'}
        onClick={() => onChange('positive')}
        icon={<TrendingUp size={11} strokeWidth={2.2} />}
        label="עליות בלבד"
      />
      <ModeBtn
        active={mode === 'all'}
        onClick={() => onChange('all')}
        icon={<Activity size={11} strokeWidth={2.2} />}
        label="כולל ירידות"
      />
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`h-6 px-2 rounded-md inline-flex items-center gap-1 text-[10.5px] transition-colors ${
        active
          ? 'bg-forest-700/20 text-forest-700 ring-1 ring-forest-700/45'
          : 'text-ink-300 hover:text-ink-100'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
