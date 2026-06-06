// ============================================================================
// MiniHeatmap — a condensed calendar heatmap of a user's daily success.
// Mirrors the Habits "נתונים" yearly heatmap but shorter (default ~26 weeks).
// Columns = weeks (oldest left → newest right), rows = Sun..Sat. Cell colour
// scales with how many habits were marked V that day (capped at habitCount).
// ============================================================================
import type { DailyV } from './queries';

type Props = {
  daily: DailyV[];
  /** Max V's possible per day — used to scale colour intensity. */
  habitCount: number;
  weeks?: number;
};

// rgba interpolation from a faint tint (empty) to forest green (full).
function colorFor(count: number, max: number): string {
  if (count <= 0) return 'rgba(122,160,134,0.07)';
  const ratio = Math.min(1, count / Math.max(1, max));
  const alpha = 0.18 + ratio * 0.67; // 0.18 → 0.85
  return `rgba(85,181,112,${alpha.toFixed(2)})`;
}

const DAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']; // Sun..Sat

export function MiniHeatmap({ daily, habitCount, weeks = 26 }: Props) {
  const byDate = new Map<string, number>();
  for (const d of daily) byDate.set(d.date, d.v);

  // Anchor the grid on the most recent Saturday-ending week so columns align
  // to Sun..Sat. Walk back `weeks` weeks.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // End of current week = upcoming Saturday (dow 6).
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));

  const max = Math.max(1, habitCount);

  // Build column-major: for each week, 7 day cells.
  const cols: { key: string; level: number; future: boolean }[][] = [];
  const cur = new Date(start);
  for (let w = 0; w < weeks; w++) {
    const col: { key: string; level: number; future: boolean }[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const iso = toISO(cur);
      const future = cur > today;
      col.push({ key: iso, level: byDate.get(iso) ?? 0, future });
      cur.setDate(cur.getDate() + 1);
    }
    cols.push(col);
  }

  return (
    <div className="flex gap-1" dir="ltr">
      {/* Day-of-week labels on the left */}
      <div className="flex flex-col gap-[3px] pt-[2px]">
        {DAY_LABELS.map((d, i) => (
          <span
            key={i}
            className="text-[8px] leading-none text-ink-500 h-[10px] flex items-center"
          >
            {d}
          </span>
        ))}
      </div>
      {/* Week columns */}
      <div className="flex gap-[3px] flex-1 overflow-hidden">
        {cols.map((col, w) => (
          <div key={w} className="flex flex-col gap-[3px] flex-1">
            {col.map((cell) => (
              <span
                key={cell.key}
                title={`${cell.key}: ${cell.level}`}
                className="rounded-[2px] aspect-square w-full"
                style={{
                  backgroundColor: cell.future
                    ? 'transparent'
                    : colorFor(cell.level, max),
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
