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
import { Bell, ChevronRight, Plus, Smartphone } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useHabitData } from '../features/habits/useHabitData';
import { HabitIcon } from '../features/habits/HabitIcon';
import { ReminderEditorSheet } from '../features/notifications/ReminderEditorSheet';
import {
  fetchReminders,
  getCachedReminders,
  migrateLegacyRemindersOnce,
  setCachedReminders,
  summarizeReminder,
  updateReminder,
  type NotificationReminder,
} from '../features/notifications/reminders';
import {
  getPermission,
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
  const [permission, setPermission] = useState<NotificationPermission>('default');
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
    setPermission(getPermission());
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
      setPermission(p);
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

      {/* Master switch — a segmented on/off control (so it reads differently
          from the per-reminder toggles below). RTL: מופעל on the right, כבוי
          on the left; each segment is its own tap target. */}
      <div className="w-full mb-3 flex items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface-card px-4 py-3.5 text-right">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink-100">
            הפעל התראות לטלפון
          </span>
          <span className="block text-[11px] text-ink-300 leading-snug mt-0.5">
            כשכבוי — אף תזכורת לא תופיע, גם אם הוגדרה
          </span>
        </span>
        <div
          role="group"
          aria-label="הפעלת התראות לטלפון"
          className="shrink-0 inline-flex items-center gap-0.5 rounded-full border border-surface-border bg-surface-base p-0.5"
        >
          <button
            type="button"
            aria-pressed={enabled}
            onClick={() => {
              if (!enabled) void toggleFeature(true);
            }}
            className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
              enabled ? 'bg-forest-700 text-on-accent' : 'text-ink-300'
            }`}
          >
            מופעל
          </button>
          <button
            type="button"
            aria-pressed={!enabled}
            onClick={() => {
              if (enabled) void toggleFeature(false);
            }}
            className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
              !enabled ? 'bg-surface-raised text-ink-100' : 'text-ink-300'
            }`}
          >
            כבוי
          </button>
        </div>
      </div>

      {/* The setting is on, but THIS device won't show notifications (no
          permission / not the installed app). That's fine — only the phone
          needs permission. Reassure calmly; never block. */}
      {enabled && permission !== 'granted' ? (
        <div className="mb-4 rounded-xl border border-surface-border bg-surface-raised/40 text-ink-300 text-[12px] px-3 py-2.5 leading-snug flex items-start gap-2">
          <Smartphone size={15} className="shrink-0 mt-0.5 text-forest-500" />
          <span>
            ההתראות נשלחות לטלפון שאישרת בו. אפשר לנהל אותן כאן — לא צריך לאשר
            הרשאות במכשיר הזה.
          </span>
        </div>
      ) : null}

      {/* List header + add */}
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-sm font-medium text-ink-300">התזכורות שלי</h2>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1 rounded-full border border-ink-100/40 px-3 py-1 text-[13px] font-medium text-ink-100 hover:bg-ink-100/10 transition-colors"
        >
          <Plus size={16} />
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
                className={`flex items-center gap-3 rounded-2xl border bg-surface-card px-3 py-3 transition-colors ${
                  r.enabled ? 'border-forest-700/40' : 'border-surface-border'
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
                  <span className="flex-1 min-w-0">
                    {habit ? (
                      // Linked to a habit → lead with the schedule (big, white)
                      // and show the habit name underneath (small, green). The
                      // icon already conveys which habit it is.
                      <>
                        <span className="block text-sm font-medium text-ink-100" dir="rtl">
                          {summarizeReminder(r)}
                        </span>
                        <span className="block text-[11px] font-medium text-forest-700 truncate mt-0.5">
                          {r.title || habit.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="block text-sm font-medium text-ink-100 truncate">
                          {r.title || 'תזכורת'}
                        </span>
                        <span className="block text-[11px] text-ink-300 mt-0.5" dir="rtl">
                          {summarizeReminder(r)}
                        </span>
                      </>
                    )}
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
                    className={`block w-11 h-6 rounded-full p-0.5 transition-colors ${
                      r.enabled ? 'bg-forest-700' : 'bg-surface-border'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        r.enabled ? '-translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-ink-500 leading-snug mt-4 px-1">
        שלב א': התזכורות מופיעות כל עוד האפליקציה פתוחה במכשיר. בקרוב — גם כשהיא
        סגורה.
      </p>

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

function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
