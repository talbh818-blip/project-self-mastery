// ============================================================================
// ReminderEditorSheet — create / edit a single reminder.
// A bottom sheet (matches the app's other sheets). Body order, top→bottom:
//   1. enabled toggle
//   2. which days (letters only, no presets)
//   3. notification type — fixed times vs random times
//   4. config: how many random firings a day, OR the fixed time(s) via a
//      custom 24h in-app picker (HH:MM, no AM/PM)
//   5. title
//   6. message phrasings
//   7. "אפשרויות נוספות" drawer — habit link (dropdown, "ללא" on top) +
//      sound + vibration + a test send
// Persists to the `notification_reminders` table.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  Check,
  ChevronDown,
  Clock,
  Dices,
  Plus,
  SlidersHorizontal,
  Trash2,
  Vibrate,
  Volume2,
  X,
} from 'lucide-react';
import { HabitIcon } from '../habits/HabitIcon';
import type { Habit } from '../habits/types';
import {
  ALL_DAYS,
  HEBREW_DAY_LETTERS,
  createReminder,
  deleteReminder,
  newReminderInput,
  updateReminder,
  type NotificationReminder,
  type ReminderInput,
} from './reminders';
import {
  getPermission,
  requestPermission,
  showReminderNotification,
} from './delivery';
import { REMINDER_SOUNDS, playReminderSound } from './sounds';

type Props = {
  open: boolean;
  /** Existing reminder to edit, or null to create a new one. */
  reminder: NotificationReminder | null;
  habits: Habit[];
  onClose: () => void;
  onSaved: () => void;
};

function reminderToInput(r: NotificationReminder): ReminderInput {
  return {
    habit_id: r.habit_id,
    enabled: r.enabled,
    title: r.title,
    days: [...r.days],
    times: [...r.times],
    messages: [...r.messages],
    message_order: r.message_order,
    random_time: r.random_time,
    random_count: r.random_count,
    vibrate: r.vibrate,
    sound: r.sound,
    timezone: r.timezone,
  };
}

export function ReminderEditorSheet({
  open,
  reminder,
  habits,
  onClose,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<ReminderInput>(newReminderInput);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<'idle' | 'sent'>('idle');
  // The habit-link dropdown (inside "אפשרויות נוספות") and the advanced drawer.
  const [habitMenuOpen, setHabitMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(reminder ? reminderToInput(reminder) : newReminderInput());
    setError(null);
    setSaving(false);
    setTestState('idle');
    setHabitMenuOpen(false);
    setMoreOpen(false);
  }, [open, reminder?.id]);

  // Lock background scroll while open (matches the other sheets).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const linkedHabit =
    draft.habit_id != null ? habits.find((h) => h.id === draft.habit_id) ?? null : null;
  const effectiveTitle =
    draft.title.trim() || linkedHabit?.name || 'תזכורת';
  const cleanMessages = draft.messages.map((m) => m.trim()).filter(Boolean);

  // --- mutators -------------------------------------------------------------
  const patch = (p: Partial<ReminderInput>) => {
    setDraft((d) => ({ ...d, ...p }));
    setError(null);
  };

  const chooseHabit = (habit: Habit | null) => {
    setDraft((d) => ({
      ...d,
      habit_id: habit?.id ?? null,
      // Pre-fill the title from the habit when the user hasn't typed one.
      title: d.title.trim() ? d.title : habit?.name ?? d.title,
    }));
    setError(null);
    setHabitMenuOpen(false);
  };

  const pickSound = (key: string) => {
    patch({ sound: key });
    if (key !== 'none') playReminderSound(key); // instant preview
  };

  const toggleDay = (day: number) =>
    setDraft((d) => {
      const has = d.days.includes(day);
      const next = has ? d.days.filter((x) => x !== day) : [...d.days, day];
      return { ...d, days: next };
    });

  const updateTime = (i: number, value: string) =>
    patch({ days: draft.days, times: draft.times.map((t, idx) => (idx === i ? value : t)) });

  const addTime = () => patch({ times: [...draft.times, '09:00'] });
  const removeTime = (i: number) =>
    setDraft((d) => ({ ...d, times: d.times.filter((_, idx) => idx !== i) }));

  const updateMessage = (i: number, value: string) =>
    setDraft((d) => ({
      ...d,
      messages: d.messages.map((m, idx) => (idx === i ? value : m)),
    }));
  const addMessage = () => patch({ messages: [...draft.messages, ''] });
  const removeMessage = (i: number) =>
    setDraft((d) => ({ ...d, messages: d.messages.filter((_, idx) => idx !== i) }));

  // --- actions --------------------------------------------------------------
  const handleTest = async () => {
    let perm = getPermission();
    if (perm !== 'granted') perm = await requestPermission();
    if (perm !== 'granted') {
      setError('צריך לאשר הרשאת התראות כדי לשלוח בדיקה.');
      return;
    }
    const body = cleanMessages.length
      ? cleanMessages[Math.floor(Math.random() * cleanMessages.length)]
      : 'כך תיראה התזכורת שלך 🌱';
    await showReminderNotification(effectiveTitle, body, 'reminder-test', {
      vibrate: draft.vibrate,
      sound: draft.sound,
    });
    setTestState('sent');
    window.setTimeout(() => setTestState('idle'), 2500);
  };

  const handleSave = async () => {
    const days = draft.days.filter((d) => d >= 0 && d <= 6);
    if (days.length === 0) {
      setError('בחר לפחות יום אחד.');
      return;
    }
    const times = Array.from(
      new Set(draft.times.filter((t) => /^\d{2}:\d{2}$/.test(t))),
    ).sort();
    // Random-time reminders don't need a chosen time; fixed ones need ≥1.
    if (!draft.random_time && times.length === 0) {
      setError('בחר לפחות שעה אחת.');
      return;
    }
    const payload: ReminderInput = {
      ...draft,
      title: effectiveTitle,
      days,
      times: times.length ? times : draft.times,
      messages: cleanMessages,
      message_order: cleanMessages.length > 1 ? draft.message_order : 'random',
      random_count: Math.max(1, Math.min(draft.random_count || 1, 12)),
    };
    setSaving(true);
    setError(null);
    try {
      if (reminder) await updateReminder(reminder.id, payload);
      else await createReminder(payload);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירה נכשלה.');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!reminder) return;
    setSaving(true);
    try {
      await deleteReminder(reminder.id);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'מחיקה נכשלה.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[90vh] flex flex-col"
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
            {reminder ? 'עריכת תזכורת' : 'תזכורת חדשה'}
          </h2>
          <div className="w-7" />
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto themed-scroll px-5 py-4 space-y-5">
          {/* 1 — Enabled (top) */}
          <Toggle
            on={draft.enabled}
            onClick={() => patch({ enabled: !draft.enabled })}
            label="תזכורת פעילה"
          />

          {/* 2 — Days (letters only, no presets) — first, before the time */}
          <div>
            <span className="block text-sm font-medium text-ink-100 mb-2">
              באילו ימים
            </span>
            <div className="flex gap-1.5">
              {ALL_DAYS.map((day) => {
                const active = draft.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    aria-pressed={active}
                    className={`flex-1 h-9 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? 'bg-forest-700 text-on-accent'
                        : 'bg-surface-raised/60 text-ink-300 hover:text-ink-100'
                    }`}
                  >
                    {HEBREW_DAY_LETTERS[day]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3 — Notification type: fixed times vs random times */}
          <div>
            <label className="block text-sm font-medium text-ink-100 mb-2">
              סוג ההתראה
            </label>
            <div className="flex gap-2">
              <TypeButton
                active={!draft.random_time}
                onClick={() => patch({ random_time: false })}
                icon={<Clock size={16} />}
                label="זמנים קבועים"
              />
              <TypeButton
                active={draft.random_time}
                onClick={() => patch({ random_time: true })}
                icon={<Dices size={16} />}
                label="זמנים רנדומליים"
              />
            </div>
          </div>

          {/* 4 — Config: how many random firings a day, or the fixed time(s) */}
          {draft.random_time ? (
            <div>
              <span className="block text-sm font-medium text-ink-100 mb-2">
                כמה פעמים ביום
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => patch({ random_count: n })}
                    aria-pressed={draft.random_count === n}
                    className={`w-11 h-11 rounded-xl text-base font-bold border transition-colors ${
                      draft.random_count === n
                        ? 'bg-forest-700 border-forest-700 text-on-accent'
                        : 'bg-surface-raised/60 border-surface-border text-ink-300 hover:text-ink-100'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-ink-500 mt-2 leading-snug">
                הזמנים יוגרלו אקראית בין 9:00 ל-21:00 — שעות אחרות בכל יום.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-ink-100">שעת ההתראה</span>
                <button
                  type="button"
                  onClick={addTime}
                  className="inline-flex items-center gap-1 text-[12px] text-forest-700 hover:text-forest-600"
                >
                  <Plus size={14} />
                  הוסף שעה
                </button>
              </div>
              <div className="space-y-2">
                {draft.times.map((time, i) => (
                  <TimeField
                    key={i}
                    value={time}
                    onChange={(v) => updateTime(i, v)}
                    onRemove={
                      draft.times.length > 1 ? () => removeTime(i) : undefined
                    }
                  />
                ))}
              </div>
              <p className="text-[11px] text-ink-500 mt-2 leading-snug">
                כל שעה שתוסיף = התראה נוספת באותו יום.
              </p>
            </div>
          )}

          {/* 5 — Title */}
          <div>
            <label className="block text-sm font-medium text-ink-100 mb-2">
              כותרת ההתראה
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={linkedHabit?.name || 'כותרת שתופיע בהתראה'}
              className="w-full rounded-xl border border-surface-border bg-surface-raised/40 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-forest-700/50"
            />
          </div>

          {/* 6 — Phrasings (text of the notification) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-ink-100">
                נוסחים{' '}
                <span className="text-ink-500 font-normal">(טקסט ההתראה)</span>
              </span>
              <button
                type="button"
                onClick={addMessage}
                className="inline-flex items-center gap-1 text-[12px] text-forest-700 hover:text-forest-600"
              >
                <Plus size={14} />
                הוסף נוסח
              </button>
            </div>
            {draft.messages.length === 0 ? (
              <button
                type="button"
                onClick={addMessage}
                className="w-full rounded-xl border border-dashed border-surface-border bg-surface-raised/30 px-3 py-3 text-sm text-ink-300 hover:text-ink-100 hover:border-forest-700/40 transition-colors text-right"
              >
                + כתוב נוסח משלך. בלי נוסח — תוצג ברירת מחדל מעודדת.
              </button>
            ) : (
              <div className="space-y-2">
                {draft.messages.map((msg, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-xl border border-surface-border bg-surface-raised/40 px-3 py-2"
                  >
                    <textarea
                      value={msg}
                      onChange={(e) => updateMessage(i, e.target.value)}
                      rows={2}
                      placeholder="מה יהיה כתוב בהתראה?"
                      className="flex-1 bg-transparent text-sm text-ink-100 placeholder:text-ink-500 outline-none resize-none leading-snug"
                    />
                    <button
                      type="button"
                      onClick={() => removeMessage(i)}
                      className="p-1.5 mt-0.5 rounded-lg text-ink-300 hover:text-red-400 hover:bg-red-500/15 shrink-0"
                      aria-label="הסר נוסח"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* random / sequential — only meaningful with 2+ phrasings */}
            {cleanMessages.length > 1 && (
              <div className="mt-3">
                <span className="block text-[12px] text-ink-300 mb-1.5">
                  איך לבחור נוסח בכל פעם
                </span>
                <div className="flex gap-1.5">
                  <OrderButton
                    active={draft.message_order === 'random'}
                    onClick={() => patch({ message_order: 'random' })}
                    label="אקראי"
                  />
                  <OrderButton
                    active={draft.message_order === 'sequential'}
                    onClick={() => patch({ message_order: 'sequential' })}
                    label="לפי הסדר"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 7 — More options (drawer): habit link + sound + vibration + test */}
          <div>
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              className="w-full flex items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface-raised/40 px-4 py-3 text-right hover:bg-surface-raised/60 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink-100">
                <SlidersHorizontal size={16} className="text-forest-500" />
                אפשרויות נוספות
              </span>
              <ChevronDown
                size={18}
                className={`shrink-0 text-ink-300 transition-transform ${moreOpen ? 'rotate-180' : ''}`}
              />
            </button>

            <div className={`assist-reveal ${moreOpen ? 'assist-reveal--open' : ''}`}>
              <div className="assist-reveal__inner">
                <div className="space-y-4 pt-4">
                  {/* Habit link — a dropdown with "ללא" (general) at the top. */}
                  <div>
                    <span className="block text-sm font-medium text-ink-100 mb-2">
                      קשר להרגל
                    </span>
                    <button
                      type="button"
                      onClick={() => setHabitMenuOpen((o) => !o)}
                      aria-haspopup="listbox"
                      aria-expanded={habitMenuOpen}
                      className="w-full flex items-center justify-between gap-2 h-11 px-3 rounded-xl text-[13px] font-medium border border-surface-border bg-surface-raised/40 text-ink-100"
                    >
                      <span className="flex-1 min-w-0 inline-flex items-center gap-2">
                        {linkedHabit ? (
                          <>
                            <HabitIcon
                              name={linkedHabit.icon}
                              size={16}
                              strokeWidth={1.8}
                              className="shrink-0"
                            />
                            <span className="truncate">{linkedHabit.name}</span>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-2 text-ink-300">
                            <Bell size={15} className="shrink-0" />
                            ללא (התראה כללית)
                          </span>
                        )}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`shrink-0 text-ink-300 transition-transform ${habitMenuOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {/* In-flow list (not absolute) so a long list never overruns
                        the sheet — it just scrolls inside its own box. */}
                    {habitMenuOpen && (
                      <div
                        role="listbox"
                        className="mt-1.5 max-h-52 overflow-y-auto themed-scroll rounded-xl border border-surface-border bg-surface-raised/30 p-1"
                      >
                        <button
                          type="button"
                          role="option"
                          aria-selected={linkedHabit === null}
                          onClick={() => chooseHabit(null)}
                          className={`w-full flex items-center justify-between gap-2 px-3 h-9 rounded-lg text-[13px] transition-colors ${
                            linkedHabit === null
                              ? 'text-forest-700 font-semibold bg-forest-700/10'
                              : 'text-ink-100 hover:bg-surface-raised'
                          }`}
                        >
                          <span className="inline-flex items-center gap-2">
                            <Bell size={15} />
                            ללא (התראה כללית)
                          </span>
                          {linkedHabit === null && <Check size={15} className="shrink-0" />}
                        </button>
                        {habits.map((h) => {
                          const active = draft.habit_id === h.id;
                          return (
                            <button
                              key={h.id}
                              type="button"
                              role="option"
                              aria-selected={active}
                              onClick={() => chooseHabit(h)}
                              className={`w-full flex items-center justify-between gap-2 px-3 h-9 rounded-lg text-[13px] transition-colors ${
                                active
                                  ? 'text-forest-700 font-semibold bg-forest-700/10'
                                  : 'text-ink-100 hover:bg-surface-raised'
                              }`}
                            >
                              <span className="inline-flex items-center gap-2 min-w-0">
                                <HabitIcon name={h.icon} size={16} strokeWidth={1.8} />
                                <span className="truncate">{h.name}</span>
                              </span>
                              {active && <Check size={15} className="shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Vibration */}
                  <Toggle
                    on={draft.vibrate}
                    onClick={() => patch({ vibrate: !draft.vibrate })}
                    label={
                      <span className="inline-flex items-center gap-2">
                        <Vibrate size={16} className="text-forest-500" />
                        רטט
                      </span>
                    }
                  />

                  {/* Sound */}
                  <div>
                    <span className="flex items-center gap-2 text-sm font-medium text-ink-100 mb-2">
                      <Volume2 size={16} className="text-forest-500" />
                      צליל
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {REMINDER_SOUNDS.map((s) => (
                        <ChipButton
                          key={s.key}
                          active={draft.sound === s.key}
                          onClick={() => pickSound(s.key)}
                        >
                          {s.label}
                        </ChipButton>
                      ))}
                    </div>
                    <p className="text-[11px] text-ink-500 mt-1.5 leading-snug">
                      הצליל מתנגן כשהאפליקציה פתוחה. כשהיא סגורה — הטלפון משמיע את
                      צליל ההתראה הרגיל שלו.
                    </p>
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
                </div>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-[13px] text-red-400 leading-snug">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-surface-border flex gap-2 shrink-0">
          {reminder && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="px-4 py-3 rounded-2xl bg-surface-raised text-red-400 text-sm hover:bg-red-500/15 transition-colors disabled:opacity-50"
            >
              מחק
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-2xl bg-forest-700 hover:bg-forest-600 text-on-accent font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'שומר…' : 'שמירה'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A labelled on/off switch row (used for "פעיל" and "רטט"). */
function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface-raised/40 px-4 py-3 text-right"
    >
      <span className="text-sm font-medium text-ink-100">{label}</span>
      <span
        aria-hidden
        className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
          on ? 'bg-forest-700' : 'bg-surface-border'
        }`}
      >
        <span
          className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
            on ? '-translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}

/** Full-width segmented choice for the notification type (fixed / random). */
function TypeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 inline-flex items-center justify-center gap-1.5 h-11 px-2 rounded-xl text-[13px] font-medium border transition-colors ${
        active
          ? 'bg-forest-700 border-forest-700 text-on-accent'
          : 'bg-surface-raised/60 border-surface-border text-ink-300 hover:text-ink-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

/** A big 24h time (HH:MM, no AM/PM) with a custom in-app picker — tapping the
 *  time or the clock reveals two scrollable columns styled in the app palette
 *  (no native chooser). */
function TimeField({
  value,
  onChange,
  onRemove,
}: {
  value: string;
  onChange: (v: string) => void;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rawH, rawM] = (value || '20:00').split(':');
  const hh = (rawH ?? '20').padStart(2, '0');
  const mm = (rawM ?? '00').padStart(2, '0');
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-raised/40 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="בחירת שעה"
          className={`shrink-0 transition-colors ${
            open ? 'text-forest-600' : 'text-forest-500 hover:text-forest-600'
          }`}
        >
          <Clock size={24} />
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          dir="ltr"
          className="flex-1 text-left text-3xl font-bold tracking-wide text-ink-100 tabular-nums"
        >
          {hh}:{mm}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="הסר שעה"
            className="shrink-0 p-1.5 rounded-lg text-ink-300 hover:text-red-400 hover:bg-red-500/15"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
      {open && (
        <div className="border-t border-surface-border px-3 py-3">
          <div className="flex items-stretch justify-center gap-3" dir="ltr">
            <ScrollCol
              values={HOURS}
              selected={hh}
              onSelect={(h) => onChange(`${h}:${mm}`)}
            />
            <div className="flex items-center text-3xl font-bold text-ink-300">:</div>
            <ScrollCol
              values={MINUTES}
              selected={mm}
              onSelect={(m) => onChange(`${hh}:${m}`)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** One scrollable wheel-style column. The selected value is centered on open
 *  and highlighted in forest green. Item height 40px, viewport 176px, so 68px
 *  of top/bottom padding lets the first/last value reach the center. */
function ScrollCol({
  values,
  selected,
  onSelect,
}: {
  values: string[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const idx = values.indexOf(selected);
    if (idx >= 0) c.scrollTop = idx * 40; // center the selected value on open
    // run once when the picker opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className="h-44 w-[64px] overflow-y-auto themed-scroll rounded-xl bg-surface-base/50 py-[68px]"
    >
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onSelect(v)}
          className={`block w-full h-10 rounded-lg text-xl font-bold tabular-nums transition-colors ${
            v === selected
              ? 'bg-forest-700 text-on-accent'
              : 'text-ink-200 hover:bg-surface-raised'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-[13px] font-medium border transition-colors ${
        active
          ? 'bg-forest-700 border-forest-700 text-on-accent'
          : 'bg-surface-raised/60 border-surface-border text-ink-300 hover:text-ink-100'
      }`}
    >
      {children}
    </button>
  );
}

function OrderButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 h-9 rounded-xl text-[13px] font-medium transition-colors ${
        active
          ? 'bg-forest-700 text-on-accent'
          : 'bg-surface-raised/60 text-ink-300 hover:text-ink-100'
      }`}
    >
      {label}
    </button>
  );
}
