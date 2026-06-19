// ============================================================================
// ReminderEditorSheet — create / edit a single reminder.
// A bottom sheet (matches the app's other sheets) for: optional habit link,
// title, which days (+ presets), one or more times, one or more message
// phrasings (+ random / sequential), an enabled toggle, a test send, and
// delete. Persists to the `notification_reminders` table.
// ============================================================================
import { useEffect, useState } from 'react';
import { Bell, BellRing, Plus, Trash2, X } from 'lucide-react';
import { HabitIcon } from '../habits/HabitIcon';
import type { Habit } from '../habits/types';
import {
  ALL_DAYS,
  DAY_PRESETS,
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
    timezone: r.timezone,
  };
}

function sameDays(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((d) => set.has(d));
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

  useEffect(() => {
    if (!open) return;
    setDraft(reminder ? reminderToInput(reminder) : newReminderInput());
    setError(null);
    setSaving(false);
    setTestState('idle');
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
    await showReminderNotification(effectiveTitle, body, 'reminder-test');
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
    if (times.length === 0) {
      setError('בחר לפחות שעה אחת.');
      return;
    }
    const payload: ReminderInput = {
      ...draft,
      title: effectiveTitle,
      days,
      times,
      messages: cleanMessages,
      message_order: cleanMessages.length > 1 ? draft.message_order : 'random',
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
          {/* Habit link */}
          <div>
            <label className="block text-sm font-medium text-ink-100 mb-2">
              קשר להרגל <span className="text-ink-500 font-normal">(לא חובה)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              <ChipButton active={linkedHabit === null} onClick={() => chooseHabit(null)}>
                <Bell size={15} />
                כללי
              </ChipButton>
              {habits.map((h) => (
                <ChipButton
                  key={h.id}
                  active={draft.habit_id === h.id}
                  onClick={() => chooseHabit(h)}
                >
                  <HabitIcon name={h.icon} size={15} strokeWidth={1.8} />
                  <span className="truncate max-w-[7rem]">{h.name}</span>
                </ChipButton>
              ))}
            </div>
          </div>

          {/* Title */}
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

          {/* Days */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-ink-100">באילו ימים</span>
              <div className="flex gap-1.5">
                {DAY_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => patch({ days: [...p.days] })}
                    className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                      sameDays(draft.days, p.days)
                        ? 'bg-forest-700/25 text-forest-300'
                        : 'text-ink-300 hover:text-ink-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
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
              <span className="text-sm font-medium text-ink-100">באילו שעות</span>
              <button
                type="button"
                onClick={addTime}
                className="inline-flex items-center gap-1 text-[12px] text-forest-400 hover:text-forest-300"
              >
                <Plus size={14} />
                הוסף שעה
              </button>
            </div>
            <p className="text-[11px] text-ink-500 mb-2 leading-snug">
              כל שעה שתוסיף = התראה נוספת באותו יום.
            </p>
            <div className="space-y-2">
              {draft.times.map((time, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-raised/40 px-3 py-2"
                >
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => updateTime(i, e.target.value)}
                    dir="ltr"
                    className="flex-1 bg-transparent text-ink-100 text-base font-medium outline-none"
                  />
                  {draft.times.length > 1 && (
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

          {/* Messages */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-ink-100">
                נוסחים <span className="text-ink-500 font-normal">(טקסט ההתראה)</span>
              </span>
              <button
                type="button"
                onClick={addMessage}
                className="inline-flex items-center gap-1 text-[12px] text-forest-400 hover:text-forest-300"
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
                      className="p-1.5 mt-0.5 rounded-lg text-ink-300 hover:text-red-400 hover:bg-red-950/30 shrink-0"
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

          {/* Enabled */}
          <button
            type="button"
            role="switch"
            aria-checked={draft.enabled}
            onClick={() => patch({ enabled: !draft.enabled })}
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface-raised/40 px-4 py-3 text-right"
          >
            <span className="text-sm font-medium text-ink-100">תזכורת פעילה</span>
            <span
              aria-hidden
              className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
                draft.enabled ? 'bg-forest-700' : 'bg-surface-border'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  draft.enabled ? '-translate-x-5' : 'translate-x-0'
                }`}
              />
            </span>
          </button>

          {/* Test */}
          <button
            type="button"
            onClick={handleTest}
            className="w-full rounded-2xl border border-surface-border bg-surface-raised/50 hover:bg-surface-border text-ink-100 text-sm font-medium py-2.5 flex items-center justify-center gap-2 transition-colors"
          >
            <BellRing size={16} />
            {testState === 'sent' ? 'נשלחה התראת בדיקה ✓' : 'שלח התראת בדיקה'}
          </button>

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
              className="px-4 py-3 rounded-2xl bg-surface-raised text-red-400 text-sm hover:bg-red-950/30 transition-colors disabled:opacity-50"
            >
              מחק
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-2xl bg-forest-700 hover:bg-forest-600 text-cream-50 font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'שומר…' : 'שמירה'}
          </button>
        </div>
      </div>
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
          ? 'bg-forest-700 border-forest-700 text-cream-50'
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
          ? 'bg-forest-700 text-cream-50'
          : 'bg-surface-raised/60 text-ink-300 hover:text-ink-100'
      }`}
    >
      {label}
    </button>
  );
}
