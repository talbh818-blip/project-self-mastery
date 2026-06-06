// ============================================================================
// App-update helpers — force the freshest build and detect new deploys.
// ============================================================================

// Asks the service worker to update, wipes every cache, then reloads so the
// browser fetches index.html (and the new bundle) from the network. This is
// the one-tap "get the latest version now" used by the manual update button
// and the version gate.
export async function forceAppUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
      }
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) {
    console.error('[appUpdate] force update failed:', e);
  } finally {
    window.location.reload();
  }
}

// Fetches /version.json (bypassing all caches) and returns true when the
// deployed build is newer than the one currently running. Returns false on
// any error / in dev (where version.json isn't emitted) so we never gate
// users by mistake.
export async function isNewVersionAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { version?: number };
    if (typeof data.version !== 'number') return false;
    return data.version > __APP_VERSION__;
  } catch {
    return false;
  }
}
