// ============================================================================
// visionHistory — a local "undo" safety net for vision content.
// ----------------------------------------------------------------------------
// A snapshot of the (non-empty) content is kept in localStorage, keyed per
// vision. Because it's persisted, the history survives a refresh / navigation
// / new tab — so even if content is accidentally cleared and the change syncs
// to the cloud, the previous versions are still here to restore. Empty content
// is never snapshotted, so a deletion can't push out the good versions.
//
// COALESCING (why the list isn't a wall of near-identical saves): auto-save
// fires on every ~1s typing pause, but we DON'T seal a version each time —
// that produced dozens of versions from tiny edits within a minute. Instead,
// while edits keep coming within COALESCE_WINDOW_MS of the latest snapshot we
// UPDATE that snapshot in place (one evolving "session" version); a brand-new
// version is only sealed once that much idle time has passed. So you get
// roughly one version per sitting — the convention in Docs/Notion-style
// editors — while the latest content of the current session stays recoverable.
// ============================================================================
import { isVisionContentEmpty } from './content';
import type { VisionScope } from './period';

export type VisionSnapshot = { content: unknown; savedAt: number };

/** Keep the last N distinct non-empty versions per vision. */
const MAX_SNAPSHOTS = 12;

/** Edits landing within this long of the newest snapshot update it in place
 *  (same session) instead of sealing a new version. */
const COALESCE_WINDOW_MS = 5 * 60_000; // 5 minutes

const keyFor = (userId: string, scope: VisionScope, periodKey: string) =>
  `vision-history:${userId}:${scope}:${periodKey}`;

// CANONICAL serialisation — sorts object keys recursively. The editor's JSON
// and the DB's jsonb round-trip with DIFFERENT key order, so a plain
// JSON.stringify would treat structurally-identical content as different and
// defeat dedupe (→ duplicate snapshots on restore). Sorting keys fixes that.
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

function read(userId: string, scope: VisionScope, periodKey: string): VisionSnapshot[] {
  try {
    const raw = localStorage.getItem(keyFor(userId, scope, periodKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VisionSnapshot[]) : [];
  } catch {
    return [];
  }
}

function write(
  userId: string,
  scope: VisionScope,
  periodKey: string,
  items: VisionSnapshot[],
): void {
  try {
    const k = keyFor(userId, scope, periodKey);
    if (items.length === 0) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(items));
  } catch {
    // Quota / private mode — best-effort.
  }
}

/**
 * Record a version. No-ops for empty content (so deletions never evict the
 * good versions), dedupes against existing snapshots, and COALESCES edits made
 * within COALESCE_WINDOW_MS of the newest snapshot (updates it in place rather
 * than sealing a near-duplicate).
 */
export function recordSnapshot(
  userId: string | null,
  scope: VisionScope,
  periodKey: string,
  content: unknown,
): void {
  if (!userId || isVisionContentEmpty(content)) return;
  const items = read(userId, scope, periodKey);
  const next = canonical(content);
  // Dedupe against ANY recent snapshot (not just the last) so restoring an
  // earlier version doesn't re-add an identical copy.
  if (items.some((s) => canonical(s.content) === next)) return;

  const now = Date.now();
  const newest = items[items.length - 1];
  if (newest && now - newest.savedAt < COALESCE_WINDOW_MS) {
    // Same editing session — replace the latest checkpoint with the newer
    // content instead of appending a new version.
    items[items.length - 1] = { content, savedAt: now };
  } else {
    // Enough idle time passed (or first ever) — seal a new version.
    items.push({ content, savedAt: now });
    while (items.length > MAX_SNAPSHOTS) items.shift();
  }
  write(userId, scope, periodKey, items);
}

/** Recent versions, NEWEST first (for display). */
export function getHistory(
  userId: string | null,
  scope: VisionScope,
  periodKey: string,
): VisionSnapshot[] {
  if (!userId) return [];
  return read(userId, scope, periodKey).slice().reverse();
}

export function hasHistory(
  userId: string | null,
  scope: VisionScope,
  periodKey: string,
): boolean {
  if (!userId) return false;
  return read(userId, scope, periodKey).length > 0;
}
