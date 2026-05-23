import { useEffect, useState } from 'react';
import type { SlotView } from './types';
import { fetchWeek } from './queries';
import type { WeekRange } from './week';

type State =
  | { status: 'loading'; slots: null; error: null }
  | { status: 'ready'; slots: SlotView[]; error: null }
  | { status: 'error'; slots: null; error: string };

export function useWeekView(
  userId: string | null,
  range: WeekRange,
  refreshKey: number = 0,
): State {
  const [state, setState] = useState<State>({
    status: 'loading',
    slots: null,
    error: null,
  });

  // Re-fetch when user, week range, or refreshKey changes.
  const rangeKey = `${range.start.toISOString()}_${range.end.toISOString()}`;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setState({ status: 'loading', slots: null, error: null });
    fetchWeek(userId, range)
      .then((slots) => {
        if (!cancelled) setState({ status: 'ready', slots, error: null });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'שגיאה בטעינת השבוע';
        setState({ status: 'error', slots: null, error: msg });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, rangeKey, refreshKey]);

  return state;
}
