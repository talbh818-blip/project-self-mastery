// ============================================================================
// visionCache — IN-MEMORY (session-only) cache for vision entries.
// ----------------------------------------------------------------------------
// Purpose: avoid the "loading" flash when navigating back to a period you
// already viewed THIS session, while always revalidating against the DB.
//
// Deliberately NOT persisted to localStorage. A persistent per-device cache
// caused a cross-device sync bug: device B would paint its own stale copy
// and never reflect what device A had written. Keeping the cache in memory
// means every fresh session / new device starts empty and fetches the true
// current row from Supabase. Within a session the cache stays correct
// because every successful save writes through (setCachedEntry), and the
// editor revalidates + live-syncs via Realtime (see useVisionEntry).
//
// This is a READ cache only — it never decides what to save.
// ============================================================================
import { fetchVisionEntry, type VisionEntry } from './queries';
import type { VisionScope } from './period';

const memKey = (u: string, s: VisionScope, p: string) => `${u}:${s}:${p}`;

const mem = new Map<string, VisionEntry | null>();
const inflight = new Map<string, Promise<VisionEntry | null>>();

/**
 * Synchronously read the cached entry.
 *   • VisionEntry  → cached row
 *   • null         → cached "no row exists"
 *   • undefined    → not cached this session (caller should show loading)
 */
export function getCachedEntry(
  userId: string,
  scope: VisionScope,
  periodKey: string,
): VisionEntry | null | undefined {
  const k = memKey(userId, scope, periodKey);
  return mem.has(k) ? mem.get(k) : undefined;
}

/** Write through to the memory cache. Call after any successful fetch/save. */
export function setCachedEntry(
  userId: string,
  scope: VisionScope,
  periodKey: string,
  entry: VisionEntry | null,
): void {
  mem.set(memKey(userId, scope, periodKey), entry);
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
      mem.set(k, row);
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
    /* prefetch failures are silent; the real load surfaces errors */
  });
}

// ============================================================================
// Row-meta cache (the year/month MAP) — for each period key: does it have
// written content, and which icon was chosen. Keyed by userId:periodKey.
// ----------------------------------------------------------------------------
// Switching views (שנתי ↔ חודשי), stepping years/months, or returning to the
// Vision screen all recompute the set of visible keys. Without this cache the
// map refetched its dots/icons every time and flashed the loader over the whole
// grid. With it, the map paints instantly from the last-known marks and only
// shows the loader on a genuine cold start. Memory-only, same rationale as the
// entry cache above.
// ============================================================================
export type VisionRowMeta = { hasContent: boolean; icon: string | null };

const metaMem = new Map<string, VisionRowMeta>();
const metaKey = (u: string, p: string) => `${u}::${p}`;

/** Read cached map-meta for a period key. `undefined` = not checked this session. */
export function getCachedRowMeta(
  userId: string,
  periodKey: string,
): VisionRowMeta | undefined {
  return metaMem.get(metaKey(userId, periodKey));
}

/** Write through after a successful map fetch (or a known-empty key). */
export function setCachedRowMeta(
  userId: string,
  periodKey: string,
  meta: VisionRowMeta,
): void {
  metaMem.set(metaKey(userId, periodKey), meta);
}
