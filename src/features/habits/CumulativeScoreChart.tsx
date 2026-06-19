// ---------------------------------------------------------------------------
// CumulativeScoreChart — SVG line of a running point total over the visible
// range. Shared by the Habits data view (own data) and the UserDetail screen
// (another user's data fetched via get_user_dashboard). The caller pre-builds
// the cumulative {date, value} series; this component only draws it.
//
// `headerExtra` is an optional control (e.g. a range toggle) rendered under the
// title row — the Habits view omits it, UserDetail passes a range selector.
// ---------------------------------------------------------------------------
import type { ReactNode } from 'react';

export function CumulativeScoreChart({
  points,
  headerExtra,
}: {
  points: { date: Date; value: number }[];
  headerExtra?: ReactNode;
}) {
  if (points.length === 0) return null;
  const min = Math.min(0, ...points.map((p) => p.value));
  const max = Math.max(0, ...points.map((p) => p.value));
  const W = 320;
  const H = 80;
  const padX = 4;
  const padY = 8;
  const xStep = (W - padX * 2) / Math.max(1, points.length - 1);
  const yScale = (v: number) => {
    if (max === min) return H / 2;
    return padY + (1 - (v - min) / (max - min)) * (H - padY * 2);
  };

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${padX + i * xStep} ${yScale(p.value)}`)
    .join(' ');
  const areaPath =
    `M ${padX} ${H - padY} ` +
    points
      .map((p, i) => `L ${padX + i * xStep} ${yScale(p.value)}`)
      .join(' ') +
    ` L ${padX + (points.length - 1) * xStep} ${H - padY} Z`;

  const last = points[points.length - 1].value;
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card p-3">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[11px] uppercase tracking-wider text-ink-100">
          נקודות מצטברות
        </h3>
        <div className="text-sm font-bold text-ink-100 tabular-nums">
          {last > 0 ? `+${last}` : last}
        </div>
      </div>
      {headerExtra && <div className="mb-2">{headerExtra}</div>}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-20"
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
