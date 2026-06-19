// ============================================================================
// "כתיבה יומית — Journaling" feature flag (per device, localStorage).
// ----------------------------------------------------------------------------
// The daily journaling layer — the "יומי" view in the Vision screen, where each
// day under a week is its own entry — is OPT-IN. It appears ONLY once the user
// enables the "כתיבה יומית - Journaling" feature on the פיצ'רים screen; until
// then the Vision view switcher doesn't offer it at all.
//
// Mirrors the notifications master switch (features/notifications/delivery.ts):
// a per-device localStorage flag. The reactive hook lets the Features screen and
// the Vision view switcher update the moment it's toggled — same tab (a custom
// event) or another tab (the storage event).
// ============================================================================
import { useEffect, useState } from 'react';

const FLAG_KEY = 'feature:journaling:enabled';
const CHANGE_EVENT = 'journaling-feature-changed';

export function isJournalingEnabled(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function setJournalingEnabled(on: boolean): void {
  try {
    localStorage.setItem(FLAG_KEY, on ? '1' : '0');
  } catch {
    /* private-mode / quota — non-fatal */
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* no window — non-fatal */
  }
}

/** Reactive read — re-renders when the flag flips (same tab via the custom
 *  event, other tabs via the storage event). */
export function useJournalingEnabled(): boolean {
  const [on, setOn] = useState(isJournalingEnabled);
  useEffect(() => {
    const sync = () => setOn(isJournalingEnabled());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return on;
}
