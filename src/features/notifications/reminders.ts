// ============================================================================
// Notification reminders — data model + access (Supabase) + message selection.
// ----------------------------------------------------------------------------
// A "reminder" is a self-contained, free-standing notification schedule:
// its own days, times and message phrasings, OPTIONALLY linked to a habit
// (for the icon in the list + to pre-fill the title). Stored in the
// `notification_reminders` table (migration 0041) — RLS scopes every row to
// the signed-in owner, so reads/writes never need an explicit user filter.
//
// Lives in the DB (not localStorage) because Push delivery while the app is
// closed needs the server to read each schedule. Permission + the actual push
// subscription stay per-device (see delivery.ts / the Push step).
// ============================================================================
import { supabase } from '../../lib/supabase';

export type MessageOrder = 'random' | 'sequential';

export type NotificationReminder = {
  id: string;
  user_id: string;
  /** Linked habit (icon + name in the list), or null for a general reminder. */
  habit_id: string | null;
  enabled: boolean;
  title: string;
  /** Day-of-week indexes that fire: 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Times of day in 24h "HH:MM". Each fires on every selected day. */
  times: string[];
  /** The user's phrasings; empty → a generic default line. */
  messages: string[];
  message_order: MessageOrder;
  /** Cursor for 'sequential' rotation (index into non-empty messages, wraps). */
  next_index: number;
  timezone: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** The editable shape used when creating / saving a reminder. */
export type ReminderInput = {
  habit_id: string | null;
  enabled: boolean;
  title: string;
  days: number[];
  times: string[];
  messages: string[];
  message_order: MessageOrder;
  timezone: string;
};

// ---------------------------------------------------------------------------
// Day helpers
// ---------------------------------------------------------------------------

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Short Hebrew day labels, indexed Sunday→Saturday. */
export const HEBREW_DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

/** Quick day presets (Israeli week: work = Sun–Thu, weekend = Fri–Sat). */
export const DAY_PRESETS: Array<{ label: string; days: number[] }> = [
  { label: 'כל יום', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'ימי חול', days: [0, 1, 2, 3, 4] },
  { label: 'סופ״ש', days: [5, 6] },
];

export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jerusalem';
  } catch {
    return 'Asia/Jerusalem';
  }
}

/** A blank reminder for the editor (new reminder). */
export function newReminderInput(): ReminderInput {
  return {
    habit_id: null,
    enabled: true,
    title: '',
    days: [...ALL_DAYS],
    times: ['20:00'],
    messages: [],
    message_order: 'random',
    timezone: localTimezone(),
  };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** One-line summary for a reminder row, e.g. "20:00 · 08:00 · א ב ג". */
export function summarizeReminder(r: NotificationReminder): string {
  const times = r.times.slice().sort().join(' · ') || '—';
  const days =
    r.days.length >= 7
      ? 'כל יום'
      : r.days
          .slice()
          .sort((a, b) => a - b)
          .map((d) => HEBREW_DAY_LETTERS[d])
          .join(' ') || 'אף יום';
  return `${times} · ${days}`;
}

// ---------------------------------------------------------------------------
// Message selection (shared shape with the future Push sender)
// ---------------------------------------------------------------------------

/** Generic fallback when a reminder has no phrasings of its own. */
export const DEFAULT_REMINDER_MESSAGE = 'הגיע הזמן שלך 🌱';

/**
 * Choose the body text for a firing. Returns the picked text and, for
 * 'sequential' order, the next cursor value to persist (null = no write).
 */
export function pickReminderMessage(r: NotificationReminder): {
  body: string;
  nextIndex: number | null;
} {
  const msgs = r.messages.map((m) => m.trim()).filter((m) => m.length > 0);
  if (msgs.length === 0) return { body: DEFAULT_REMINDER_MESSAGE, nextIndex: null };
  if (msgs.length === 1) return { body: msgs[0], nextIndex: null };
  if (r.message_order === 'sequential') {
    const idx = ((r.next_index % msgs.length) + msgs.length) % msgs.length;
    return { body: msgs[idx], nextIndex: r.next_index + 1 };
  }
  return { body: msgs[Math.floor(Math.random() * msgs.length)], nextIndex: null };
}

// ---------------------------------------------------------------------------
// CRUD — RLS scopes everything to the owner; mutations use
// `.select().maybeSingle()` so a silent RLS denial surfaces as data: null.
// ---------------------------------------------------------------------------

export async function fetchReminders(): Promise<NotificationReminder[]> {
  const { data, error } = await supabase
    .from('notification_reminders')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as NotificationReminder[];
}

export async function createReminder(
  input: ReminderInput,
): Promise<NotificationReminder> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('לא מחובר');
  const { data, error } = await supabase
    .from('notification_reminders')
    .insert({ user_id: user.id, ...input })
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('ההוספה נדחתה');
  return data as NotificationReminder;
}

export async function updateReminder(
  id: string,
  patch: Partial<ReminderInput> & { next_index?: number },
): Promise<NotificationReminder | null> {
  const { data, error } = await supabase
    .from('notification_reminders')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return (data as NotificationReminder) ?? null;
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await supabase
    .from('notification_reminders')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// One-time migration of the legacy per-habit localStorage settings.
// Old shape under key `habit-notifications:<habitId>`:
//   { enabled, days[], times[], message, habitName, habitType }
// Each becomes a reminder linked to that habit. Guarded by a flag so it runs
// at most once; a no-op (and cheap) for anyone with no legacy keys.
// ---------------------------------------------------------------------------

const LEGACY_PREFIX = 'habit-notifications:';
const MIGRATED_FLAG = 'notifications:legacy-migrated';

export async function migrateLegacyRemindersOnce(): Promise<void> {
  let legacy: Array<{ habitId: string; v: Record<string, unknown> }> = [];
  try {
    if (localStorage.getItem(MIGRATED_FLAG) === '1') return;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LEGACY_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      legacy.push({
        habitId: key.slice(LEGACY_PREFIX.length),
        v: JSON.parse(raw) as Record<string, unknown>,
      });
    }
  } catch {
    return; // localStorage blocked — try again next mount
  }

  if (legacy.length === 0) {
    try {
      localStorage.setItem(MIGRATED_FLAG, '1');
    } catch {
      /* non-fatal */
    }
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return; // signed out — retry once authenticated

  // Only keep habit links that still resolve (FK would reject a stale id).
  const { data: habits } = await supabase.from('habits').select('id');
  const validIds = new Set((habits ?? []).map((h) => h.id as string));
  const tz = localTimezone();

  const rows = legacy.map((l, i) => {
    const v = l.v;
    const days = Array.isArray(v.days)
      ? (v.days as number[]).filter((d) => d >= 0 && d <= 6)
      : [];
    const times = Array.isArray(v.times)
      ? (v.times as string[]).filter((t) => /^\d{2}:\d{2}$/.test(t))
      : [];
    const message = typeof v.message === 'string' ? v.message.trim() : '';
    return {
      user_id: user.id,
      habit_id: validIds.has(l.habitId) ? l.habitId : null,
      enabled: Boolean(v.enabled),
      title: typeof v.habitName === 'string' ? (v.habitName as string) : '',
      days: days.length ? days : [...ALL_DAYS],
      times: times.length ? times : ['20:00'],
      messages: message ? [message] : [],
      message_order: 'random' as const,
      timezone: tz,
      sort_order: 100 + i,
    };
  });

  const { error } = await supabase.from('notification_reminders').insert(rows);
  if (error) return; // leave the flag unset so we retry next time
  try {
    localStorage.setItem(MIGRATED_FLAG, '1');
  } catch {
    /* non-fatal */
  }
}
