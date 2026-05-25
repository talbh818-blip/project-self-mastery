// ============================================================================
// HabitDetailSheet — bottom sheet shown when the user taps an existing habit.
// Surfaces description, frequency target and streak info, plus Edit / Archive
// actions. Edit reopens HabitPickerSheet in edit mode; Archive soft-deletes
// the habit (data preserved).
// ============================================================================
import { useState } from 'react';
import { X, Pencil, Archive, Flame, Trophy } from 'lucide-react';
import { HabitIcon } from './HabitIcon';
import type { Habit } from './types';
import type { HabitScoreResult } from './scoring';

type Props = {
  open: boolean;
  habit: Habit | null;
  stats: HabitScoreResult | null;
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => Promise<void>;
};

export function HabitDetailSheet({
  open,
  habit,
  stats,
  onClose,
  onEdit,
  onArchive,
}: Props) {
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !habit) return null;

  const handleArchive = async () => {
    setWorking(true);
    setError(null);
    try {
      await onArchive();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בארכוב');
      setWorking(false);
      setConfirmingArchive(false);
    }
  };

  const typeBadge =
    habit.type === 'positive'
      ? { label: 'בניית הרגל', cls: 'bg-forest-700/20 text-forest-400' }
      : { label: 'שבירת התמכרות', cls: 'bg-red-950/40 text-red-400' };

  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-surface-border">
          <button
            onClick={onClose}
            className="p-1 text-ink-300 hover:text-ink-100"
            aria-label="סגור"
          >
            <X size={20} />
          </button>
          <h2 className="text-lg font-semibold text-ink-100">פרטי הרגל</h2>
          <div className="w-7" />
        </header>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Identity row */}
          <div className="flex items-start gap-3">
            <span
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: hexWithAlpha(habit.color, 0.18),
                color: habit.color,
              }}
            >
              <HabitIcon name={habit.icon} size={28} strokeWidth={1.7} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-lg font-semibold text-ink-100 leading-tight">
                {habit.name}
              </div>
              <span
                className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full ${typeBadge.cls}`}
              >
                {typeBadge.label}
              </span>
              {habit.description && (
                <p className="text-xs text-ink-300 mt-2 leading-snug">
                  {habit.description}
                </p>
              )}
            </div>
          </div>

          {/* Frequency / quantitative summary */}
          <Row label="יעד">
            <span className="text-sm text-ink-100">
              {formatFrequency(habit)}
            </span>
          </Row>

          {/* Streak info — only meaningful when stats are loaded */}
          {stats && (
            <>
              <Row
                label="רצף נוכחי"
                icon={
                  <Flame
                    size={16}
                    className={stats.currentStreak > 0 ? 'text-forest-500' : 'text-ink-500'}
                  />
                }
              >
                <span className="text-sm text-ink-100 font-medium">
                  {stats.currentStreak} {stats.currentStreak === 1 ? 'יום' : 'ימים'}
                </span>
              </Row>
              <Row
                label="רצף שיא"
                icon={<Trophy size={16} className="text-ink-300" />}
              >
                <span className="text-sm text-ink-100 font-medium">
                  {stats.longestStreak} {stats.longestStreak === 1 ? 'יום' : 'ימים'}
                </span>
              </Row>
              <Row label="ימים מוצלחים סך הכל">
                <span className="text-sm text-ink-100 font-medium">
                  {stats.vCount}
                </span>
              </Row>
              <Row label="נקודות (לכל הזמן)">
                <span
                  className={`text-sm font-medium ${
                    stats.totalPoints > 0
                      ? 'text-forest-500'
                      : stats.totalPoints < 0
                      ? 'text-red-400'
                      : 'text-ink-100'
                  }`}
                >
                  {stats.totalPoints > 0 ? `+${stats.totalPoints}` : stats.totalPoints}
                </span>
              </Row>
            </>
          )}

          {error && (
            <div className="rounded-xl border border-red-800/50 bg-red-950/30 text-red-400 text-sm px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-surface-border flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={working}
            className="flex-1 py-3 rounded-2xl bg-surface-raised hover:bg-surface-border text-ink-100 font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Pencil size={16} />
            עריכה
          </button>
          {confirmingArchive ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmingArchive(false)}
                disabled={working}
                className="px-4 py-3 rounded-2xl bg-surface-raised text-ink-300 text-sm hover:text-ink-100 transition-colors disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleArchive}
                disabled={working}
                className="flex-1 py-3 rounded-2xl bg-red-700 hover:bg-red-600 text-cream-50 font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Archive size={16} />
                {working ? 'מאחסן…' : 'אישור ארכוב'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingArchive(true)}
              disabled={working}
              className="flex-1 py-3 rounded-2xl bg-surface-raised hover:bg-red-950/50 hover:text-red-400 text-ink-100 font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <Archive size={16} />
              ארכוב
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Row({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12px] text-ink-300 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

function formatFrequency(habit: Habit): string {
  const periodLabel =
    habit.frequency_period === 'daily'
      ? 'ביום'
      : habit.frequency_period === 'weekly'
      ? 'בשבוע'
      : 'בחודש';
  const timesLabel =
    habit.frequency_target === 1
      ? 'פעם'
      : habit.frequency_target === 2
      ? 'פעמיים'
      : `${habit.frequency_target} פעמים`;

  let main = `${timesLabel} ${periodLabel}`;
  if (habit.is_quantitative && habit.quantitative_target) {
    const unit = habit.quantitative_unit?.trim();
    const unitSuffix = unit ? ` ${unit}` : '';
    main += ` · יעד ${habit.quantitative_target}${unitSuffix} בכל פעם`;
  }
  return main;
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
