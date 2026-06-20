// ============================================================================
// persistentCache — a tiny localStorage-backed "paint instantly, revalidate
// silently" cache.
// ----------------------------------------------------------------------------
// Memory caches (e.g. habitCache, booksCache) make NAVIGATION within a session
// instant, but they reset on a full page load / app reopen — so a cold start
// always re-fetched and flashed the loader. This persists the last-known data
// to the device, so even a fresh load paints the previous snapshot at once and
// only refreshes in the background. The loader then shows only on the genuine
// first-ever load (empty storage).
//
// Safe by design: every read/write is wrapped (quota / private-mode failures
// are non-fatal no-ops), and a stale snapshot is always corrected by the
// screen's background revalidation. Only store JSON-serializable data.
//
// NOTE: vision JOURNALING content stays memory-only on purpose (see
// visionCache.ts) — do NOT route it through here.
// ============================================================================

const PREFIX = 'cache:v1:';

export function readPersisted<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writePersisted<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota exceeded / storage blocked — non-fatal */
  }
}

export function removePersisted(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** Remove every persisted entry whose key starts with `keyPrefix` (after the
 *  internal namespace). Used to wipe a user's snapshots on sign-out. */
export function removePersistedByPrefix(keyPrefix: string): void {
  try {
    const full = PREFIX + keyPrefix;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(full)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
