// ============================================================================
// Feature flags — per-USER on/off, synced across devices.
// ----------------------------------------------------------------------------
// Each opt-in feature on the "פיצ'רים" screen (notifications, journaling, …) is
// on or off PER USER, and that state syncs to every device the user signs in
// on — turn it on on the phone, it's on on the computer too.
//
// Design: the source of truth is `profiles.feature_flags` (jsonb) in Supabase.
// We MIRROR each flag to a localStorage key so existing synchronous readers
// keep working unchanged (the notifications scheduler reads
// `feature:notifications:enabled`; the Vision view switch reads
// `feature:journaling:enabled`). On app load we pull the server's flags into
// those mirror keys; toggling writes BOTH the mirror (instant) and the server
// (sync). A change event re-renders any reactive reader.
// ============================================================================
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export type FeatureKey = 'notifications' | 'journaling';

// Feature → its existing localStorage mirror key (kept for back-compat with the
// readers that already use these exact keys).
const MIRROR_KEY: Record<FeatureKey, string> = {
  notifications: 'feature:notifications:enabled',
  journaling: 'feature:journaling:enabled',
};

const CHANGE_EVENT = 'feature-flags-changed';

function mirrorKey(key: FeatureKey): string {
  return MIRROR_KEY[key];
}

export function featureActive(key: FeatureKey): boolean {
  try {
    return localStorage.getItem(mirrorKey(key)) === '1';
  } catch {
    return false;
  }
}

function writeMirror(key: FeatureKey, on: boolean): void {
  try {
    localStorage.setItem(mirrorKey(key), on ? '1' : '0');
  } catch {
    /* private mode / quota — non-fatal */
  }
}

function emitChange(): void {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* no window — non-fatal */
  }
}

/** Reactive read of a feature flag — re-renders when it flips on ANY surface
 *  (same tab via our event, other tabs / the journaling toggle via storage). */
export function useFeatureActive(key: FeatureKey): boolean {
  const [on, setOn] = useState(() => featureActive(key));
  useEffect(() => {
    const sync = () => setOn(featureActive(key));
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    // The journaling toggle also fires its own legacy event — listen too.
    window.addEventListener('journaling-feature-changed', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('journaling-feature-changed', sync);
    };
  }, [key]);
  return on;
}

/**
 * Set a flag locally (instant) and push it to Supabase (synced to other
 * devices). Safe to call fire-and-forget — the await only matters if the
 * caller wants to know the server write finished.
 */
export async function setFeatureFlag(key: FeatureKey, on: boolean): Promise<void> {
  writeMirror(key, on);
  emitChange();
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('feature_flags')
      .eq('id', user.id)
      .maybeSingle();
    const flags = { ...((data?.feature_flags ?? {}) as Record<string, boolean>) };
    flags[key] = on;
    await supabase.from('profiles').update({ feature_flags: flags }).eq('id', user.id);
  } catch {
    /* offline / RLS — the local mirror still applied; will reconcile next load */
  }
}

/**
 * On app load: pull the user's flags from Supabase into the local mirrors so
 * this device matches the others. If the server doesn't know a flag yet but
 * this device has it ON, push the local value up (first device seeds it).
 */
export async function initFeatureFlags(): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('feature_flags')
      .eq('id', user.id)
      .maybeSingle();
    const flags = (data?.feature_flags ?? {}) as Record<string, boolean>;
    let changed = false;
    for (const key of Object.keys(MIRROR_KEY) as FeatureKey[]) {
      if (key in flags) {
        writeMirror(key, Boolean(flags[key])); // server wins (synced state)
        changed = true;
      } else if (featureActive(key)) {
        void setFeatureFlag(key, true); // seed the server from this device
      }
    }
    if (changed) emitChange();
  } catch {
    /* non-fatal — keep the local mirror */
  }
}
