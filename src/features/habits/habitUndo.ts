// ============================================================================
// Recent-unmark undo — restore a mark's EXACT points if it's re-added quickly.
// ----------------------------------------------------------------------------
// Removing a mark drops its points. If it was an OLD mark, re-adding it would
// normally earn less (decay) — so an accidental unmark would silently cost
// points. To prevent that, when a mark is removed we stash its full snapshot;
// re-marking the SAME cell within UNDO_WINDOW_MS restores the snapshot verbatim
// (status + earned_points), as if it was never removed.
//
// Stored in localStorage (per user), so it also survives a page refresh inside
// the window. Entries older than the window are pruned on every touch.
// ============================================================================
import type { LogStatus } from './types';

export const UNDO_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export type MarkSnapshot = {
  status: LogStatus;
  amount: number | null;
  target_at_log: number | null;
  earned_points: number | null;
};

type StoredSnapshot = MarkSnapshot & { at: number };

const LS_PREFIX = 'habit-mark-undo:';
const keyOf = (habitId: string, date: string) => `${habitId}:${date}`;

function read(userId: string): Record<string, StoredSnapshot> {
  try {
    return JSON.parse(localStorage.getItem(LS_PREFIX + userId) || '{}');
  } catch {
    return {};
  }
}

function write(userId: string, map: Record<string, StoredSnapshot>) {
  try {
    localStorage.setItem(LS_PREFIX + userId, JSON.stringify(map));
  } catch {
    // storage blocked — undo just won't persist; harmless.
  }
}

function prune(map: Record<string, StoredSnapshot>): Record<string, StoredSnapshot> {
  const now = Date.now();
  const out: Record<string, StoredSnapshot> = {};
  for (const [k, v] of Object.entries(map)) {
    if (now - v.at < UNDO_WINDOW_MS) out[k] = v;
  }
  return out;
}

/** Stash the just-removed mark so a quick re-mark can restore it. */
export function recordRemoval(
  userId: string,
  habitId: string,
  date: string,
  snap: MarkSnapshot,
): void {
  const map = prune(read(userId));
  map[keyOf(habitId, date)] = { ...snap, at: Date.now() };
  write(userId, map);
}

/** Return (and consume) a recent-enough removal snapshot for this cell, or
 *  null if there's none within the window. */
export function takeRecentRemoval(
  userId: string,
  habitId: string,
  date: string,
): MarkSnapshot | null {
  const map = prune(read(userId));
  const k = keyOf(habitId, date);
  const snap = map[k];
  if (!snap) {
    write(userId, map); // persist the prune
    return null;
  }
  delete map[k];
  write(userId, map);
  const { at: _at, ...rest } = snap;
  void _at;
  return rest;
}
