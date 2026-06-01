// ============================================================================
// visionCache — session + cross-session cache for vision entries.
// ----------------------------------------------------------------------------
// Goal: kill the "טוען…" flash. Loading a period the user has already seen
// (this session OR a previous one) should be INSTANT, with the network fetch
// happening in the background (stale-while-revalidate).
//
// Two layers:
//   • In-memory Map — survives in-app navigation (leaving and returning to
//     the Vision screen) until a full page reload. Instant.
//   • localStorage  — survives reloads / new sessions, so the very first
//     view after reopening the app is instant too. Seeds the memory map on
//     demand.
//
// `loadEntry` de-duplicates concurrent fetches for the same key, so the
// editor's revalidation and a prefetch can't double-hit the network.
//
// NOTE: this is a *read* cache only. It never decides what to save — the
// save path in useVisionEntry stays the single source of truth and just
// calls setCachedEntry() after a successful write to keep the cache fresh.
// ============================================================================
import { fetchVisionEntry, type VisionEntry } from './queries';
import type { VisionScope } from './period';

const LS_PREFIX = 'vision-cache:';
const memKey = (u: string, s: VisionScope, p: string) => `${u}:${s}:${p}`;
const lsKey = (u: string, s: VisionScope, p: string) =>
  `${LS_PREFIX}${u}:${s}:${p}`;

const mem = new Map<string, VisionEntry | null>();
const inflight = new Map<string, Promise<VisionEntry | null>>();

/**
 * Synchronously read the cached entry.
 *   • returns VisionEntry      → cached row
 *   • returns null             → cached "no row exists"
 *   • returns undefined        → not cached (caller should show loading)
 * Falls back to localStorage (and warms the memory map) on a memory miss.
 */
export function getCachedEntry(
  userId: string,
  scope: VisionScope,
  periodKey: string,
): VisionEntry | null | undefined {
  const k = memKey(userId, scope, periodKey);
  if (mem.has(k)) return mem.get(k);
  try {
    const raw = localStorage.getItem(lsKey(userId, scope, periodKey));
    if (raw !== null) {
      const parsed = JSON.parse(raw) as VisionEntry | null;
      mem.set(k, parsed);
      return parsed;
    }
  } catch {
    // ignore parse / access failures — treat as cache miss
  }
  return undefined;
}

/** Write through to both cache layers. Call after any successful fetch/save. */
export function setCachedEntry(
  userId: string,
  scope: VisionScope,
  periodKey: string,
  entry: VisionEntry | null,
): void {
  mem.set(memKey(userId, scope, periodKey), entry);
  try {
    localStorage.setItem(
      lsKey(userId, scope, periodKey),
      JSON.stringify(entry),
    );
  } catch {
    // quota / private-mode — memory cache still works for this session
  }
}

/**
 * Fetch the entry (de-duplicated) and cache the result. Multiple callers for
 * the same key during an in-flight request share the one promise.
 */
export function loadEntry(
  userId: string,
  scope: VisionScope,
  periodKey: string,
): Promise<VisionEntry | null> {
  const k = memKey(userId, scope, periodKey);
  const existing = inflight.get(k);
  if (existing) return existing;

  const p = fetchVisionEntry(userId, scope, periodKey)
    .then((row) => {
      setCachedEntry(userId, scope, periodKey, row);
      return row;
    })
    .finally(() => {
      inflight.delete(k);
    });

  inflight.set(k, p);
  return p;
}

/** Fire-and-forget warm-up — only fetches if not already cached/in-flight. */
export function prefetchEntry(
  userId: string,
  scope: VisionScope,
  periodKey: string,
): void {
  const k = memKey(userId, scope, periodKey);
  if (mem.has(k) || inflight.has(k)) return;
  void loadEntry(userId, scope, periodKey).catch(() => {
    /* prefetch failures are silent; the real load will surface errors */
  });
}
