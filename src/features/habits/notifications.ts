// ============================================================================
// Habit notifications — per-device reminder settings, permission handling and
// delivery. V1 scope: the user configures, per habit, which days + at which
// times they want a reminder, the browser asks for the Notification
// permission, and reminders fire via a lightweight foreground scheduler while
// the app is open (plus an on-demand "test" notification).
//
// Settings live in localStorage keyed by habit id — notifications are
// inherently per-device (permission + delivery are tied to the browser /
// installed PWA), so per-device local storage is the correct model here, not a
// shared DB table. Each device (phone, then computer) configures its own.
//
// Background delivery while the app is CLOSED needs Web Push (Push API + a
// backend that sends at the scheduled time) — that's the next step, not V1.
// ============================================================================
import { useEffect, useRef } from 'react';
import type { Habit } from './types';

export type HabitNotificationSettings = {
  enabled: boolean;
  /** Day-of-week indexes that fire: 0 = Sunday … 6 = Saturday (Israeli week). */
  days: number[];
  /** Times of day in 24h "HH:MM". Each fires on every selected day. */
  times: string[];
  /** Optional custom message; empty → a sensible default derived from habit. */
  message?: string;
};

const STORAGE_PREFIX = 'habit-notifications:';

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Short Hebrew day labels, indexed Sunday→Saturday. */
export const HEBREW_DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export function defaultSettings(): HabitNotificationSettings {
  return { enabled: false, days: [...ALL_DAYS], times: ['20:00'], message: '' };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function loadSettings(habitId: string): HabitNotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + habitId);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<HabitNotificationSettings>;
    return {
      enabled: Boolean(parsed.enabled),
      days:
        Array.isArray(parsed.days) && parsed.days.length > 0
          ? parsed.days.filter((d) => d >= 0 && d <= 6)
          : [...ALL_DAYS],
      times:
        Array.isArray(parsed.times) && parsed.times.length > 0
          ? parsed.times.filter((t) => /^\d{2}:\d{2}$/.test(t))
          : ['20:00'],
      message: typeof parsed.message === 'string' ? parsed.message : '',
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(
  habitId: string,
  settings: HabitNotificationSettings,
): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + habitId, JSON.stringify(settings));
  } catch {
    /* storage full / blocked — non-fatal */
  }
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
// Delivery
// ---------------------------------------------------------------------------

function defaultMessageFor(habit: Habit): string {
  return habit.type === 'negative'
    ? 'רגע של מודעות — אתה חזק מההתמכרות 🛡️'
    : 'הגיע הזמן להרגל שלך — סמן ✅ והמשך לצמוח 🌱';
}

/**
 * Fire a reminder notification for a habit. Prefers the service-worker
 * registration (richer + works for an installed PWA); falls back to the plain
 * Notification constructor. No-op unless permission is granted.
 */
export async function showHabitReminder(
  habit: Habit,
  message?: string,
): Promise<void> {
  if (getPermission() !== 'granted') return;
  const title = habit.name;
  const body = (message ?? '').trim() || defaultMessageFor(habit);
  const options: NotificationOptions = {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    lang: 'he',
    dir: 'rtl',
    // Same tag per habit collapses a repeat reminder instead of stacking.
    tag: `habit-reminder-${habit.id}`,
    data: { habitId: habit.id, url: '/' },
  };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    }
  } catch {
    /* fall through to the constructor */
  }
  try {
    new Notification(title, options);
  } catch {
    /* some browsers throw if the SW path is required — ignore */
  }
}

// ---------------------------------------------------------------------------
// Foreground scheduler
// ---------------------------------------------------------------------------

/**
 * While the app is open, fires each habit's configured reminders at their
 * chosen day + time. This is the V1 mechanism: it only runs while a tab is
 * alive. Delivering reminders when the app is fully closed needs Web Push and
 * a backend — a separate, later step.
 */
export function useHabitReminderScheduler(habits: Habit[]): void {
  // Remember exactly which (habit, minute) reminders already fired so a 20s
  // poll inside the same minute doesn't double-fire.
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!notificationsSupported()) return;

    const tick = () => {
      if (getPermission() !== 'granted') return;
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const time = `${hh}:${mm}`;
      const day = now.getDay();
      const fired = firedRef.current;

      for (const habit of habits) {
        const s = loadSettings(habit.id);
        if (!s.enabled) continue;
        if (!s.days.includes(day)) continue;
        if (!s.times.includes(time)) continue;
        const key = `${now.toDateString()} ${time} ${habit.id}`;
        if (fired.has(key)) continue;
        fired.add(key);
        void showHabitReminder(habit, s.message);
      }

      // Keep the dedupe set from growing forever — once it's large, the day has
      // almost certainly rolled, so the live minute-keys are all fresh anyway.
      if (fired.size > 500) fired.clear();
    };

    tick();
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, [habits]);
}
