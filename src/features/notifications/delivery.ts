// ============================================================================
// Notification delivery — feature switch, OS permission, the actual show call,
// and the foreground scheduler.
// ----------------------------------------------------------------------------
// Two layers of on/off:
//   • feature-level master switch  (isNotificationsFeatureEnabled) — per device
//   • per-reminder `enabled` flag  (notification_reminders.enabled)
// A reminder fires only when BOTH are on and the day/time matches.
//
// PHASE 1 (this file): a lightweight foreground scheduler fires reminders while
// the app is OPEN. Delivery while the app is CLOSED needs Web Push (a service-
// worker `push` handler + a backend that sends at the scheduled time) — the
// next step. When Push lands, the foreground scheduler becomes a fallback for
// devices without a push subscription.
// ============================================================================
import { useEffect, useRef } from 'react';
import {
  fetchReminders,
  migrateLegacyRemindersOnce,
  pickReminderMessage,
  randomTimesForDay,
  updateReminder,
  type NotificationReminder,
} from './reminders';
import { ensurePushSubscription, isPushActive } from './push';
import { initFeatureFlags, setFeatureFlag } from '../settings/featureFlags';
import { playReminderSound } from './sounds';

/** Vibration pattern (ms on / off / on) used when a reminder has vibrate on. */
const VIBRATE_PATTERN = [180, 90, 180];

const FEATURE_FLAG_KEY = 'feature:notifications:enabled';

// ---------------------------------------------------------------------------
// Feature-level master switch (per device, localStorage)
// ---------------------------------------------------------------------------

export function isNotificationsFeatureEnabled(): boolean {
  try {
    return localStorage.getItem(FEATURE_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function setNotificationsFeatureEnabled(on: boolean): void {
  // Writes the local mirror (FEATURE_FLAG_KEY) synchronously AND syncs the
  // on/off state to the user's profile so it matches their other devices.
  void setFeatureFlag('notifications', on);
}

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getPermission(): NotificationPermission {
  return notificationsSupported() ? Notification.permission : 'denied';
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return getPermission();
  }
}

// ---------------------------------------------------------------------------
// Show a notification (prefers the SW registration; falls back to the
// Notification constructor). No-op unless permission is granted.
// ---------------------------------------------------------------------------

export async function showReminderNotification(
  title: string,
  body: string,
  tag: string,
  feel?: { vibrate?: boolean; sound?: string },
): Promise<void> {
  if (getPermission() !== 'granted') return;
  // The app is open here (foreground / test), so play the chosen chime from the
  // page — a closed-app push instead uses the OS sound (see push-sw.js).
  if (feel?.sound) playReminderSound(feel.sound);
  const options: NotificationOptions & { vibrate?: number[] } = {
    body,
    icon: '/logo.png?v=5',
    badge: '/logo.png?v=5',
    lang: 'he',
    dir: 'rtl',
    // Same tag collapses a repeat of the SAME reminder instead of stacking.
    tag,
    data: { url: '/' },
  };
  if (feel?.vibrate) options.vibrate = VIBRATE_PATTERN;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title || 'תזכורת', options);
        return;
      }
    }
  } catch {
    /* fall through to the constructor */
  }
  try {
    new Notification(title || 'תזכורת', options);
  } catch {
    /* some browsers require the SW path — ignore */
  }
}

// ---------------------------------------------------------------------------
// Foreground scheduler
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * While the app is open, fires each enabled reminder at its chosen day + time.
 * Mounted once at the app shell (Layout) so it runs on every screen. Caches the
 * reminder list and refreshes it every couple of minutes (and on first run,
 * after migrating any legacy localStorage reminders).
 */
export function useReminderScheduler(): void {
  // Which (reminder, minute) firings already happened, so the 20s poll inside
  // the same minute doesn't double-fire.
  const firedRef = useRef<Set<string>>(new Set());
  const cacheRef = useRef<NotificationReminder[]>([]);
  const lastFetchRef = useRef<number>(0);

  useEffect(() => {
    // Pull the user's synced feature on/off flags into the local mirrors so
    // this device matches the others (runs even where Notifications is absent).
    void initFeatureFlags();
    if (!notificationsSupported()) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const list = await fetchReminders();
        if (!cancelled) {
          cacheRef.current = list;
          lastFetchRef.current = Date.now();
        }
      } catch {
        /* keep the stale cache on a transient failure */
      }
    };

    const tick = async () => {
      if (!isNotificationsFeatureEnabled()) return;
      if (getPermission() !== 'granted') return;
      // When closed-app push is active on this device, the server delivers —
      // skip the foreground path so reminders don't fire twice.
      if (isPushActive()) return;
      // Refresh the cache periodically so edits made elsewhere are picked up.
      if (Date.now() - lastFetchRef.current > 120_000) await refresh();
      if (cancelled) return;

      const now = new Date();
      const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const day = now.getDay();
      const fired = firedRef.current;

      for (const r of cacheRef.current) {
        if (!r.enabled) continue;
        if (!r.days.includes(day)) continue;
        // Random-time reminders fire at deterministic surprise minutes (one per
        // bucket); fixed ones at any of their chosen times.
        const matches = r.random_time
          ? randomTimesForDay(r.id, dateStr, r.random_count).includes(time)
          : r.times.includes(time);
        if (!matches) continue;
        const key = `${now.toDateString()} ${time} ${r.id}`;
        if (fired.has(key)) continue;
        fired.add(key);

        const { body, nextIndex } = pickReminderMessage(r);
        void showReminderNotification(r.title || 'תזכורת', body, `reminder-${r.id}`, {
          vibrate: r.vibrate,
          sound: r.sound,
        });
        if (nextIndex !== null) {
          r.next_index = nextIndex; // advance the local cache immediately
          void updateReminder(r.id, { next_index: nextIndex }).catch(() => {});
        }
      }

      // Keep the dedupe set bounded — by the time it's large the day has rolled.
      if (fired.size > 500) fired.clear();
    };

    void (async () => {
      await migrateLegacyRemindersOnce().catch(() => {});
      // Register this device for Web Push (closed-app delivery) when the user
      // has the feature on and permission granted. No-op until VAPID is set.
      if (isNotificationsFeatureEnabled() && getPermission() === 'granted') {
        void ensurePushSubscription();
      }
      if (!cancelled) await tick();
    })();

    const id = window.setInterval(() => {
      void tick();
    }, 20_000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
}
