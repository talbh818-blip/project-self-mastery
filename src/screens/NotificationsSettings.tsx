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
  migrateLegacyRemindersOnce,
  setCachedReminders,
  summarizeReminder,
  updateReminder,
  type NotificationReminder,
} from '../features/notifications/reminders';
import {
  getPermission,
  isNotificationsFeatureEnabled,
  notificationsSupported,
  requestPermission,
  setNotificationsFeatureEnabled,
} from '../features/notifications/delivery';
import {
  ensurePushSubscription,
  removePushSubscription,
} from '../features/notifications/push';

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

  const [enabled, setEnabled] = useState(isNotificationsFeatureEnabled);
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
      // Turning off — flip immediately and drop this device's push subscription.
      setEnabled(false);
      setNotificationsFeatureEnabled(false);
      void removePushSubscription();
      return;
    }
    // Turning ON requires the OS permission. Ask for it now; if the user
    // doesn't grant it the switch stays OFF — there's nothing to deliver to.
    const p = supported ? await requestPermission() : 'denied';
    setPermission(p);
    if (p !== 'granted') {
      setEnabled(false);
      setNotificationsFeatureEnabled(false);
      return;
    }
    setEnabled(true);
    setNotificationsFeatureEnabled(true);
    // Register this device for closed-app push now that permission is granted.
    void ensurePushSubscription();
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

      {/* Master switch */}
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
            כשכבוי — אף תזכורת לא תופיע, גם אם הוגדרה
          </span>
        </span>
        <span
          aria-hidden
          className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
            enabled ? 'bg-forest-700' : 'bg-surface-border'
          }`}
        >
          <span
            className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
              enabled ? '-translate-x-5' : 'translate-x-0'
            }`}
          />
        </span>
      </button>

      {/* Only surface a blocker when the device itself can't deliver. When all
          is well there's no status text — the toggle handles the permission
          request, and won't turn on unless it's granted. */}
      {!supported ? (
        <div className="mb-4 rounded-xl border border-yellow-800/50 bg-yellow-950/20 text-yellow-300/90 light:border-yellow-600/50 light:bg-yellow-400/15 light:text-yellow-800 text-[13px] px-3 py-2.5 leading-snug">
          הדפדפן הזה לא תומך בהתראות. נסה דרך Chrome / Safari או התקן את
          האפליקציה למסך הבית.
        </div>
      ) : permission === 'denied' ? (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 light:text-red-700 light:border-red-500/40 light:bg-red-400/10 light:text-red-700 text-[13px] px-3 py-2.5 leading-snug">
          ההתראות חסומות בטלפון. כדי להפעיל — אפשר התראות לאתר זה בהגדרות
          הדפדפן/הטלפון.
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
        <ul className="space-y-2">
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
                <button
                  type="button"
                  onClick={() => toggleReminderEnabled(r)}
                  className={`text-[11px] px-2.5 py-1 rounded-full shrink-0 transition-colors ${
                    r.enabled
                      ? 'bg-forest-700/20 text-forest-700'
                      : 'bg-surface-raised text-ink-300'
                  }`}
                >
                  {r.enabled ? 'פעיל' : 'כבוי'}
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
