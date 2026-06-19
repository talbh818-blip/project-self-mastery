// ============================================================================
// Habit notifications — per-device reminder settings, permission handling and
// delivery. Configured from the "פיצ'רים" (Features) screen, NOT from inside a
// habit. Per habit the user picks which days + at which times they want a
// reminder; the browser asks for the Notification permission; reminders fire
// via a lightweight foreground scheduler while the app is open (plus an
// on-demand "test" notification).
//
// Two layers of on/off:
//   • feature-level master switch  (isNotificationsFeatureEnabled)
//   • per-habit enabled flag       (settings.enabled)
// A reminder fires only when BOTH are on and the day/time matches.
//
// Settings live in localStorage — notifications are inherently per-device
// (permission + delivery are tied to the browser / installed PWA), so
// per-device local storage is the correct model here, not a shared DB table.
// Each saved setting snapshots the habit's name/type so the scheduler can fire
// without loading the habit list (it just scans localStorage).
//
// Background delivery while the app is CLOSED needs Web Push (Push API + a
// backend that sends at the scheduled time) — that's the next step, not now.
// ============================================================================
import { useEffect, useRef } from 'react';
import type { HabitType } from './types';

export type HabitNotificationSettings = {
  enabled: boolean;
  /** Day-of-week indexes that fire: 0 = Sunday … 6 = Saturday (Israeli week). */
  days: number[];
  /** Times of day in 24h "HH:MM". Each fires on every selected day. */
  times: string[];
  /** Optional custom message; empty → a sensible default derived from habit. */
  message?: string;
  /** Snapshot of the habit so the scheduler can fire from localStorage alone. */
  habitName?: string;
  habitType?: HabitType;
};

const STORAGE_PREFIX = 'habit-notifications:';
const FEATURE_FLAG_KEY = 'feature:notifications:enabled';

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Short Hebrew day labels, indexed Sunday→Saturday. */
export const HEBREW_DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export function defaultSettings(): HabitNotificationSettings {
  return { enabled: false, days: [...ALL_DAYS], times: ['20:00'], message: '' };
}

// ---------------------------------------------------------------------------
// Feature-level master switch
// ---------------------------------------------------------------------------

export function isNotificationsFeatureEnabled(): boolean {
  try {
    return localStorage.getItem(FEATURE_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function setNotificationsFeatureEnabled(on: boolean): void {
  try {
    localStorage.setItem(FEATURE_FLAG_KEY, on ? '1' : '0');
  } catch {
    /* blocked — non-fatal */
  }
}

// ---------------------------------------------------------------------------
// Per-habit persistence
// ---------------------------------------------------------------------------

function normalize(
  parsed: Partial<HabitNotificationSettings>,
): HabitNotificationSettings {
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
    habitName:
      typeof parsed.habitName === 'string' ? parsed.habitName : undefined,
    habitType:
      parsed.habitType === 'positive' || parsed.habitType === 'negative'
        ? parsed.habitType
        : undefined,
  };
}

export function loadSettings(habitId: string): HabitNotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + habitId);
    if (!raw) return defaultSettings();
    return normalize(JSON.parse(raw) as Partial<HabitNotificationSettings>);
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

/** Every stored per-habit setting (used by the scheduler + the settings list). */
export function loadAllNotificationSettings(): Array<{
  habitId: string;
  settings: HabitNotificationSettings;
}> {
  const out: Array<{ habitId: string; settings: HabitNotificationSettings }> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      out.push({
        habitId: key.slice(STORAGE_PREFIX.length),
        settings: normalize(JSON.parse(raw) as Partial<HabitNotificationSettings>),
      });
    }
  } catch {
    /* ignore — return whatever we collected */
  }
  return out;
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

type ReminderTarget = { id: string; name: string; type?: HabitType };

function defaultMessageFor(type: HabitType | undefined): string {
  return type === 'negative'
    ? 'רגע של מודעות — אתה חזק מההתמכרות 🛡️'
    : 'הגיע הזמן להרגל שלך — סמן ✅ והמשך לצמוח 🌱';
}

/**
 * Fire a reminder notification for a habit. Prefers the service-worker
 * registration (richer + works for an installed PWA); falls back to the plain
 * Notification constructor. No-op unless permission is granted.
 */
export async function showHabitReminder(
  habit: ReminderTarget,
  message?: string,
): Promise<void> {
  if (getPermission() !== 'granted') return;
  const title = habit.name || 'תזכורת הרגל';
  const body = (message ?? '').trim() || defaultMessageFor(habit.type);
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
 * chosen day + time. Self-contained: it scans localStorage, so it can be
 * mounted once at the app shell (Layout) and run on every screen — no habit
 * list needed. Delivering reminders when the app is fully closed needs Web
 * Push and a backend — a separate, later step.
 */
export function useHabitReminderScheduler(): void {
  // Remember exactly which (habit, minute) reminders already fired so a 20s
  // poll inside the same minute doesn't double-fire.
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!notificationsSupported()) return;

    const tick = () => {
      if (!isNotificationsFeatureEnabled()) return;
      if (getPermission() !== 'granted') return;
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const time = `${hh}:${mm}`;
      const day = now.getDay();
      const fired = firedRef.current;

      for (const { habitId, settings } of loadAllNotificationSettings()) {
        if (!settings.enabled) continue;
        if (!settings.days.includes(day)) continue;
        if (!settings.times.includes(time)) continue;
        const key = `${now.toDateString()} ${time} ${habitId}`;
        if (fired.has(key)) continue;
        fired.add(key);
        void showHabitReminder(
          { id: habitId, name: settings.habitName ?? '', type: settings.habitType },
          settings.message,
        );
      }

      // Keep the dedupe set from growing forever — once it's large, the day has
      // almost certainly rolled, so the live minute-keys are all fresh anyway.
      if (fired.size > 500) fired.clear();
    };

    tick();
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, []);
}
