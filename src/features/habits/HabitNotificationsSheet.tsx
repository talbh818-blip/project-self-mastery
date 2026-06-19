// ============================================================================
// HabitNotificationsSheet — per-habit reminder configuration.
// Opened from HabitDetailSheet. Lets the user (1) grant the browser
// Notification permission, (2) pick which days + times a reminder fires, and
// (3) send a test notification to see it immediately. Settings persist
// per-device in localStorage (see notifications.ts).
// ============================================================================
import { useEffect, useState } from 'react';
import { Bell, BellRing, Plus, Trash2, X } from 'lucide-react';
import { HabitIcon } from './HabitIcon';
import type { Habit } from './types';
import {
  ALL_DAYS,
  HEBREW_DAY_LETTERS,
  defaultSettings,
  getPermission,
  loadSettings,
  notificationsSupported,
  requestPermission,
  saveSettings,
  showHabitReminder,
  type HabitNotificationSettings,
} from './notifications';

type Props = {
  open: boolean;
  habit: Habit | null;
  onClose: () => void;
};

export function HabitNotificationsSheet({ open, habit, onClose }: Props) {
  const [settings, setSettings] = useState<HabitNotificationSettings>(
    defaultSettings,
  );
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [saved, setSaved] = useState(false);
  const [testState, setTestState] = useState<'idle' | 'sent'>('idle');

  // Load this habit's saved settings + current permission whenever the sheet
  // opens for a (new) habit.
  useEffect(() => {
    if (!open || !habit) return;
    setSettings(loadSettings(habit.id));
    setPermission(getPermission());
    setSaved(false);
    setTestState('idle');
  }, [open, habit?.id]);

  // Lock background scroll while open (matches the other sheets).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !habit) return null;

  const supported = notificationsSupported();
  const granted = permission === 'granted';

  const ensurePermission = async (): Promise<boolean> => {
    if (granted) return true;
    const result = await requestPermission();
    setPermission(result);
    return result === 'granted';
  };

  const toggleEnabled = async () => {
    // Turning reminders ON for the first time should also prompt for the
    // browser permission — otherwise the toggle would be a no-op.
    if (!settings.enabled) {
      const ok = await ensurePermission();
      if (!ok) return; // denied / dismissed → leave it off
    }
    setSettings((s) => ({ ...s, enabled: !s.enabled }));
    setSaved(false);
  };

  const toggleDay = (day: number) => {
    setSettings((s) => {
      const has = s.days.includes(day);
      // Never allow zero days — that would silently disable everything.
      const next = has ? s.days.filter((d) => d !== day) : [...s.days, day];
      return { ...s, days: next.length ? next : s.days };
    });
    setSaved(false);
  };

  const setAllDays = () => {
    setSettings((s) => ({ ...s, days: [...ALL_DAYS] }));
    setSaved(false);
  };

  const updateTime = (index: number, value: string) => {
    setSettings((s) => ({
      ...s,
      times: s.times.map((t, i) => (i === index ? value : t)),
    }));
    setSaved(false);
  };

  const addTime = () => {
    setSettings((s) => ({ ...s, times: [...s.times, '09:00'] }));
    setSaved(false);
  };

  const removeTime = (index: number) => {
    setSettings((s) => {
      const next = s.times.filter((_, i) => i !== index);
      return { ...s, times: next.length ? next : s.times };
    });
    setSaved(false);
  };

  const handleSave = () => {
    saveSettings(habit.id, settings);
    setSaved(true);
  };

  const handleTest = async () => {
    const ok = await ensurePermission();
    if (!ok) return;
    await showHabitReminder(habit, settings.message);
    setTestState('sent');
    window.setTimeout(() => setTestState('idle'), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-surface-border shrink-0">
          <button
            onClick={onClose}
            className="p-1 text-ink-300 hover:text-ink-100"
            aria-label="סגור"
          >
            <X size={20} />
          </button>
          <h2 className="text-lg font-semibold text-ink-100 flex items-center gap-2">
            <Bell size={18} className="text-forest-500" />
            התראות להרגל
          </h2>
          <div className="w-7" />
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto themed-scroll px-5 py-4 space-y-4">
          {/* Habit identity */}
          <div className="flex items-center gap-3">
            <span
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-cream-50"
              style={{
                backgroundColor: hexWithAlpha(habit.color, 0.2),
                border: `1px solid ${hexWithAlpha(habit.color, 0.45)}`,
              }}
            >
              <HabitIcon name={habit.icon} size={22} strokeWidth={1.7} />
            </span>
            <div className="min-w-0">
              <div className="text-base font-semibold text-ink-100 leading-tight truncate">
                {habit.name}
              </div>
              <div className="text-[11px] text-ink-300 mt-0.5">
                תזכורות יזומות שיופיעו במכשיר הזה
              </div>
            </div>
          </div>

          {!supported ? (
            <div className="rounded-xl border border-yellow-800/50 bg-yellow-950/20 text-yellow-300/90 text-sm px-3 py-2.5 leading-snug">
              הדפדפן הזה לא תומך בהתראות. נסה דרך הדפדפן של המכשיר (Chrome /
              Safari) או התקן את האפליקציה למסך הבית.
            </div>
          ) : (
            <>
              {/* Permission status */}
              {permission === 'denied' && (
                <div className="rounded-xl border border-red-800/50 bg-red-950/30 text-red-400 text-sm px-3 py-2.5 leading-snug">
                  ההתראות חסומות בדפדפן. כדי להפעיל — אפשר התראות לאתר זה
                  בהגדרות הדפדפן ונסה שוב.
                </div>
              )}
              {permission === 'default' && (
                <button
                  type="button"
                  onClick={ensurePermission}
                  className="w-full rounded-xl border border-forest-700/40 bg-forest-700/15 text-forest-300 text-sm px-3 py-2.5 leading-snug text-right hover:bg-forest-700/25 transition-colors"
                >
                  כדי לקבל תזכורות צריך לאשר הרשאת התראות — הקש כאן לאישור.
                </button>
              )}
              {permission === 'granted' && (
                <div className="rounded-xl border border-forest-700/30 bg-forest-700/10 text-forest-300 text-[13px] px-3 py-2 flex items-center gap-2">
                  <BellRing size={15} />
                  ההתראות מאושרות במכשיר הזה
                </div>
              )}

              {/* Master toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={settings.enabled}
                onClick={toggleEnabled}
                className="w-full flex items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface-raised/50 px-4 py-3 text-right"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-100">
                    תזכורות פעילות
                  </span>
                  <span className="block text-[11px] text-ink-300 leading-snug mt-0.5">
                    הפעלה תבקש הרשאת התראות אם צריך
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
                    settings.enabled ? 'bg-forest-700' : 'bg-surface-border'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      settings.enabled ? '-translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>

              {/* Config — dimmed when disabled */}
              <div
                className={`space-y-4 transition-opacity ${
                  settings.enabled ? '' : 'opacity-40 pointer-events-none'
                }`}
              >
                {/* Days */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-ink-100">
                      באילו ימים
                    </span>
                    <button
                      type="button"
                      onClick={setAllDays}
                      className="text-[11px] text-forest-400 hover:text-forest-300"
                    >
                      כל יום
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    {ALL_DAYS.map((day) => {
                      const active = settings.days.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          aria-pressed={active}
                          className={`flex-1 h-9 rounded-xl text-sm font-medium transition-colors ${
                            active
                              ? 'bg-forest-700 text-cream-50'
                              : 'bg-surface-raised/60 text-ink-300 hover:text-ink-100'
                          }`}
                        >
                          {HEBREW_DAY_LETTERS[day]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Times */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-ink-100">
                      באילו שעות
                    </span>
                    <button
                      type="button"
                      onClick={addTime}
                      className="inline-flex items-center gap-1 text-[12px] text-forest-400 hover:text-forest-300"
                    >
                      <Plus size={14} />
                      הוסף שעה
                    </button>
                  </div>
                  <div className="space-y-2">
                    {settings.times.map((time, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-raised/40 px-3 py-2"
                      >
                        <input
                          type="time"
                          value={time}
                          onChange={(e) => updateTime(i, e.target.value)}
                          dir="ltr"
                          className="flex-1 bg-transparent text-ink-100 text-base font-medium outline-none [color-scheme:dark]"
                        />
                        {settings.times.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTime(i)}
                            className="p-1.5 rounded-lg text-ink-300 hover:text-red-400 hover:bg-red-950/30"
                            aria-label="הסר שעה"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom message */}
                <div>
                  <label className="block text-sm font-medium text-ink-100 mb-2">
                    טקסט ההתראה (אופציונלי)
                  </label>
                  <input
                    type="text"
                    value={settings.message ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSettings((s) => ({ ...s, message: v }));
                      setSaved(false);
                    }}
                    placeholder="ברירת מחדל — תזכורת מעודדת"
                    className="w-full rounded-xl border border-surface-border bg-surface-raised/40 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-forest-700/50"
                  />
                </div>
              </div>

              {/* Test */}
              <button
                type="button"
                onClick={handleTest}
                className="w-full rounded-2xl border border-surface-border bg-surface-raised/50 hover:bg-surface-border text-ink-100 text-sm font-medium py-2.5 flex items-center justify-center gap-2 transition-colors"
              >
                <BellRing size={16} />
                {testState === 'sent' ? 'נשלחה התראת בדיקה ✓' : 'שלח התראת בדיקה'}
              </button>

              <p className="text-[11px] text-ink-500 leading-snug">
                שלב א': התזכורות מופיעות כל עוד האפליקציה פתוחה במכשיר. כדי שיופיעו
                גם כשהיא סגורה — נחבר בהמשך שכבת Push.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-surface-border flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 rounded-2xl bg-surface-raised text-ink-300 text-sm hover:text-ink-100 transition-colors"
          >
            סגור
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!supported}
            className="flex-1 py-3 rounded-2xl bg-forest-700 hover:bg-forest-600 text-cream-50 font-medium transition-colors disabled:opacity-50"
          >
            {saved ? 'נשמר ✓' : 'שמירה'}
          </button>
        </div>
      </div>
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
