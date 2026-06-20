// ============================================================================
// NotificationsSettings — the "התראות" feature screen (route /features/
// notifications). A free-form list of reminders: add / edit / delete, each
// with its own days, times and message phrasings, optionally linked to a habit.
//
// It's a real ROUTE (not local view state) on purpose: granting the OS
// permission can make the service worker take control and reload the page —
// a URL-addressable screen lands the user right back here instead of the hub.
// ============================================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, Plus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useHabitData } from '../features/habits/useHabitData';
import { HabitIcon } from '../features/habits/HabitIcon';
import { ReminderEditorSheet } from '../features/notifications/ReminderEditorSheet';
import {
  fetchReminders,
  getCachedReminders,
  HEBREW_DAY_LETTERS,
  migrateLegacyRemindersOnce,
  setCachedReminders,
  updateReminder,
  type NotificationReminder,
} from '../features/notifications/reminders';
import {
  notificationsSupported,
  requestPermission,
  setNotificationsFeatureEnabled,
} from '../features/notifications/delivery';
import {
  ensurePushSubscription,
  isStandalone,
  removePushSubscription,
} from '../features/notifications/push';
import { useFeatureActive } from '../features/settings/featureFlags';

export function NotificationsSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const data = useHabitData(uid);
  const activeHabits = data.habits.filter((h) => h.archived_at === null);
  const habitsById = new Map(activeHabits.map((h) => [h.id, h]));

  // Seed from the session cache so re-entering the screen paints the saved
  // reminders instantly (no "טוען…" flash); we still revalidate on mount.
  const cachedReminders = uid ? getCachedReminders(uid) : null;

  // Per-USER feature flag, synced across devices (turn it on on the computer,
  // it's on on the phone too). Reactive so a flip on another device/tab shows.
  const enabled = useFeatureActive('notifications');
  const [reminders, setReminders] = useState<NotificationReminder[]>(
    cachedReminders ?? [],
  );
  const [loading, setLoading] = useState(cachedReminders === null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationReminder | null>(null);

  const supported = notificationsSupported();

  const load = async () => {
    try {
      const list = await fetchReminders();
      setReminders(list);
    } catch {
      /* ignore — keep what we have */
    } finally {
      setLoading(false);
    }
  };

  // Mirror the list into the session cache once loaded — covers both the
  // initial fetch and optimistic toggles — so a quick re-entry paints the
  // latest state instantly instead of flashing the loader.
  useEffect(() => {
    if (!loading && uid) setCachedReminders(uid, reminders);
  }, [reminders, loading, uid]);

  useEffect(() => {
    void (async () => {
      await migrateLegacyRemindersOnce().catch(() => {});
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFeature = async (next: boolean) => {
    if (!next) {
      // Turn the feature OFF for the user (synced to every device) and drop
      // this device's push subscription.
      setNotificationsFeatureEnabled(false);
      void removePushSubscription();
      return;
    }
    // Turn the feature ON for the user — synced to every device. This does NOT
    // require THIS device's permission: only the device that actually shows the
    // notifications (the installed phone app) needs it. Managing it here, on the
    // computer, is enough — the phone is what delivers.
    setNotificationsFeatureEnabled(true);
    // Best-effort: if THIS device is the installed app, set it up to receive too
    // (ask permission + subscribe). On a plain browser tab / computer we don't
    // even prompt — there's nothing to deliver here.
    if (isStandalone() && supported) {
      const p = await requestPermission();
      if (p === 'granted') void ensurePushSubscription();
    }
  };

  const toggleReminderEnabled = async (r: NotificationReminder) => {
    const next = !r.enabled;
    // Optimistic — flip locally, then persist.
    setReminders((list) =>
      list.map((x) => (x.id === r.id ? { ...x, enabled: next } : x)),
    );
    try {
      await updateReminder(r.id, { enabled: next });
    } catch {
      setReminders((list) =>
        list.map((x) => (x.id === r.id ? { ...x, enabled: !next } : x)),
      );
    }
  };

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (r: NotificationReminder) => {
    setEditing(r);
    setEditorOpen(true);
  };

  return (
    <div className="max-w-md mx-auto">
      <header className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/features')}
          className="p-1 -mr-1 text-ink-300 hover:text-ink-100"
          aria-label="חזרה"
        >
          <ChevronRight size={24} />
        </button>
        <h1 className="text-xl font-bold text-ink-100 flex items-center gap-2">
          <Bell size={20} className="text-forest-500" />
          התראות לטלפון
        </h1>
      </header>

      {/* Master switch — a BIG sliding toggle. The per-reminder toggles below
          are smaller, so the size difference reads as a hierarchy (master vs
          item) instead of "the same toggle twice". */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => toggleFeature(!enabled)}
        className="w-full mb-3 flex items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface-card px-4 py-3.5 text-right"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink-100">
            הפעל התראות לטלפון
          </span>
          <span className="block text-[11px] text-ink-300 leading-snug mt-0.5">
            ההתראות מקושרות לטלפון שאישרת בו. אפשר לנהל אותן כאן.
          </span>
        </span>
        <span
          aria-hidden
          className={`shrink-0 w-12 h-7 rounded-full p-0.5 transition-colors ${
            enabled ? 'bg-forest-700' : 'bg-surface-border'
          }`}
        >
          <span
            className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${
              enabled ? '-translate-x-5' : 'translate-x-0'
            }`}
          />
        </span>
      </button>

      {/* Add reminder — the button stands on its own (no "my reminders"
          heading) with room to breathe above and below. */}
      <div className="flex items-center px-1 mt-4 mb-4">
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-100/40 px-4 py-1.5 text-sm font-medium text-ink-100 hover:bg-ink-100/10 transition-colors"
        >
          <Plus size={18} />
          תזכורת
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-surface-border bg-surface-card px-4 py-8 text-center text-sm text-ink-300">
          טוען…
        </div>
      ) : reminders.length === 0 ? (
        <button
          type="button"
          onClick={openNew}
          className="w-full rounded-2xl border border-dashed border-surface-border bg-surface-card/60 px-4 py-8 text-center hover:border-forest-700/50 transition-colors"
        >
          <Bell size={26} className="mx-auto text-ink-300 mb-2" />
          <div className="text-sm font-medium text-ink-100">
            אין עדיין תזכורות
          </div>
          <div className="text-[12px] text-ink-300 mt-1">
            הקש כדי להוסיף את התזכורת הראשונה שלך
          </div>
        </button>
      ) : (
        <ul
          className={`space-y-2 transition-opacity ${
            enabled ? '' : 'opacity-50'
          }`}
        >
          {reminders.map((r) => {
            const habit = r.habit_id ? habitsById.get(r.habit_id) : null;
            return (
              <li
                key={r.id}
                className={`flex items-center gap-3 rounded-2xl border bg-surface-card px-3 py-3 transition ${
                  r.enabled
                    ? 'border-forest-700/40'
                    : 'border-surface-border opacity-60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => openEdit(r)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-right"
                >
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={
                      habit
                        ? {
                            backgroundColor: hexWithAlpha(habit.color, 0.2),
                            border: `1px solid ${hexWithAlpha(habit.color, 0.45)}`,
                            color: habit.color,
                          }
                        : {
                            backgroundColor: 'rgba(86,160,109,0.18)',
                            border: '1px solid rgba(86,160,109,0.4)',
                          }
                    }
                  >
                    {habit ? (
                      <HabitIcon name={habit.icon} size={20} strokeWidth={1.7} />
                    ) : (
                      <Bell size={18} className="text-forest-700" />
                    )}
                  </span>
                  {/* The time is the focal point — big & white. */}
                  <span
                    className="shrink-0 text-[28px] font-semibold text-ink-100 leading-none tabular-nums"
                    dir="ltr"
                  >
                    {timesLabel(r)}
                  </span>
                  {/* To the left of the time: the title, with the day info
                      beneath it (habit name in green, plain reminder in white). */}
                  <span className="flex-1 min-w-0 text-right">
                    <span
                      className={`block text-sm font-medium truncate ${
                        habit ? 'text-forest-700' : 'text-ink-100'
                      }`}
                    >
                      {habit ? r.title || habit.name : r.title || 'תזכורת'}
                    </span>
                    <span className="block text-[11px] text-ink-300 mt-0.5">
                      {daysLabel(r)}
                    </span>
                  </span>
                </button>
                {/* Per-reminder control = a sliding toggle. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.enabled}
                  aria-label={r.enabled ? 'כבה תזכורת' : 'הפעל תזכורת'}
                  onClick={() => toggleReminderEnabled(r)}
                  className="shrink-0"
                >
                  <span
                    aria-hidden
                    className={`block w-9 h-5 rounded-full p-0.5 transition-colors ${
                      r.enabled ? 'bg-forest-700' : 'bg-surface-border'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        r.enabled ? '-translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ReminderEditorSheet
        open={editorOpen}
        reminder={editing}
        habits={activeHabits}
        onClose={() => setEditorOpen(false)}
        onSaved={load}
      />
    </div>
  );
}

/** Times of day for a reminder, e.g. "18:44" or "08:00 · 20:00". */
function timesLabel(r: NotificationReminder): string {
  return r.times.slice().sort().join(' · ') || '—';
}

/** Day summary, e.g. "כל יום" or "א ב ג". */
function daysLabel(r: NotificationReminder): string {
  if (r.days.length >= 7) return 'כל יום';
  return (
    r.days
      .slice()
      .sort((a, b) => a - b)
      .map((d) => HEBREW_DAY_LETTERS[d])
      .join(' ') || 'אף יום'
  );
}

function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
