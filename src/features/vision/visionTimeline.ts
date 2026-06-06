// ============================================================================
// visionTimeline — the flat, hierarchical sequence of vision periods used by
// the free-scroll feed.
// ----------------------------------------------------------------------------
// Order (earliest → latest), so scrolling DOWN moves toward "now" and UP moves
// back in time:
//
//   Year Y
//     Month Jan ─ then its weeks (Sundays, earliest→latest)
//     Month Feb ─ then its weeks
//     …
//   Year Y+1
//     …
//
// Future periods are excluded (nothing past today). The window is bounded to a
// few years back — enough to browse history without an unbounded list.
// ============================================================================
import {
  firstWeekStartOfMonth,
  getPeriodKey,
  getWeekKey,
  type VisionScope,
} from './period';

export type TimelineItem = {
  scope: VisionScope;
  key: string;
  /** A date inside the period — used to navigate when the user taps it. */
  anchor: Date;
};

/**
 * Build the timeline from `yearsBack` years ago up to today, excluding any
 * period that hasn't started yet.
 */
export function buildVisionTimeline(today: Date, yearsBack = 1): TimelineItem[] {
  const items: TimelineItem[] = [];
  // Boundary weeks overlap two months; dedupe so each week shows once in the
  // feed (it lands under the earlier month it touches).
  const seenWeeks = new Set<string>();
  const curYear = today.getFullYear();
  for (let y = curYear - yearsBack; y <= curYear; y++) {
    items.push({ scope: 'yearly', key: String(y), anchor: new Date(y, 0, 1) });

    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(y, m, 1);
      if (monthStart > today) break; // future month → stop this year

      items.push({
        scope: 'monthly',
        key: getPeriodKey('monthly', monthStart),
        anchor: monthStart,
      });

      // Weeks (Sundays) that OVERLAP this month, earliest→latest.
      const monthEnd = new Date(y, m + 1, 0);
      const d = firstWeekStartOfMonth(y, m);
      while (d <= monthEnd) {
        const key = getWeekKey(d);
        if (d <= today && !seenWeeks.has(key)) {
          seenWeeks.add(key);
          items.push({ scope: 'weekly', key, anchor: new Date(d) });
        }
        d.setDate(d.getDate() + 7);
      }
    }
  }
  return items;
}
