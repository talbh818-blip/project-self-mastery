// ============================================================================
// debug — a TEMPORARY, dev-only diagnostic store for the "loads from scratch"
// investigation. Surfaces two things on-screen (see DebugBadge) so we don't
// need browser dev tools:
//   1. bootCount — how many times the app FULLY reloaded the page. If this
//      climbs on every tab switch, navigation is doing full page reloads (and
//      keep-alive wouldn't help). If it stays put, navigation is client-side.
//   2. recent events — the cache decisions (memory hit / localStorage hit /
//      miss / server fetch) as the user moves around.
//
// REMOVE this file (and its call sites) once the diagnosis is done.
// ============================================================================

const DEV = import.meta.env.DEV;
const BOOT_KEY = 'dbg-boot-count';

const events: string[] = [];
const listeners = new Set<() => void>();

function notify() {
  // Defer: dbgLog() is sometimes called during React render (useState
  // initializers), and updating the badge mid-render would warn. A microtask
  // runs it right after the current render commits.
  queueMicrotask(() => {
    for (const l of listeners) l();
  });
}

/** Increment the full-page-load counter (call once on app boot). */
export function dbgIncBoot(): void {
  if (!DEV) return;
  try {
    const n = Number(sessionStorage.getItem(BOOT_KEY) || '0') + 1;
    sessionStorage.setItem(BOOT_KEY, String(n));
  } catch {
    /* ignore */
  }
}

export function dbgBootCount(): number {
  if (!DEV) return 0;
  try {
    return Number(sessionStorage.getItem(BOOT_KEY) || '0');
  } catch {
    return 0;
  }
}

/** Record a diagnostic event (also mirrored to the console). */
export function dbgLog(msg: string): void {
  if (!DEV) return;
  let t = '';
  try {
    t = new Date().toLocaleTimeString();
  } catch {
    /* ignore */
  }
  events.push(`${t}  ${msg}`);
  while (events.length > 10) events.shift();
  // eslint-disable-next-line no-console
  console.log('[🧭cache]', msg);
  notify();
}

export function dbgEvents(): string[] {
  return events;
}

export function dbgSubscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
