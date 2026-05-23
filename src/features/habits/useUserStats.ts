import { useEffect, useState } from 'react';
import { fetchAllUserData } from './queries';
import { computeUserStats, type UserStats } from './scoring';

type State =
  | { status: 'loading'; stats: null; error: null }
  | { status: 'ready'; stats: UserStats; error: null }
  | { status: 'error'; stats: null; error: string };

// Loads the user's entire habit dataset and computes scoring stats.
// Re-runs whenever userId or refreshKey changes.
export function useUserStats(userId: string | null, refreshKey: number = 0): State {
  const [state, setState] = useState<State>({
    status: 'loading',
    stats: null,
    error: null,
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setState({ status: 'loading', stats: null, error: null });
    fetchAllUserData(userId)
      .then(({ habits, assignments, logs }) => {
        if (cancelled) return;
        const stats = computeUserStats({
          habits,
          assignments,
          logs,
          today: new Date(),
        });
        setState({ status: 'ready', stats, error: null });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'שגיאה בחישוב הניקוד';
        setState({ status: 'error', stats: null, error: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  return state;
}
