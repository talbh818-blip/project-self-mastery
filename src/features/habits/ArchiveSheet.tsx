import { useState } from 'react';
import { ArchiveRestore, Trash2, X } from 'lucide-react';
import { HabitIcon } from './HabitIcon';
import type { Habit } from './types';

// Bottom-sheet that lists archived habits and lets the user either restore
// them (back into an empty slot) or permanently delete them. The list is
// passed in from the parent — this component just renders + dispatches.

type Props = {
  open: boolean;
  habits: Habit[];
  onClose: () => void;
  onRestore: (habitId: string) => Promise<void>;
  onDelete: (habitId: string) => Promise<void>;
};

export function ArchiveSheet({
  open,
  habits,
  onClose,
  onRestore,
  onDelete,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!open) return null;

  const handleRestore = async (habit: Habit) => {
    setBusyId(habit.id);
    setError(null);
    try {
      await onRestore(habit.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשחזור');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (habit: Habit) => {
    setBusyId(habit.id);
    setError(null);
    try {
      await onDelete(habit.id);
      setConfirmDeleteId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה במחיקה');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[80vh] flex flex-col"
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
          <h2 className="text-lg font-semibold text-ink-100">
            ארכיון הרגלים
          </h2>
          <div className="w-7" />
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto themed-scroll">
          {error && (
            <div className="m-4 rounded-xl border border-red-800/50 bg-red-950/30 text-red-400 text-sm px-3 py-2">
              {error}
            </div>
          )}

          {habits.length === 0 ? (
            <div className="px-5 py-12 text-center text-ink-300 text-sm">
              אין הרגלים בארכיון.
            </div>
          ) : (
            <ul className="px-3 py-3 space-y-2">
              {habits.map((habit) => {
                const isConfirming = confirmDeleteId === habit.id;
                const isBusy = busyId === habit.id;
                const iconStyle: React.CSSProperties = {
                  backgroundColor: hexWithAlpha(habit.color, 0.08),
                  color: habit.color,
                };
                return (
                  <li
                    key={habit.id}
                    className="rounded-2xl border border-surface-border bg-surface-raised/40 px-3 py-2.5 flex items-center gap-3"
                  >
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={iconStyle}
                    >
                      <HabitIcon name={habit.icon} size={22} strokeWidth={1.8} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink-100 truncate">
                        {habit.name}
                      </div>
                      {habit.archived_at && (
                        <div className="text-[10px] text-ink-500 mt-0.5">
                          נכנס לארכיון {formatArchiveDate(habit.archived_at)}
                        </div>
                      )}
                    </div>

                    {isConfirming ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDelete(habit)}
                          disabled={isBusy}
                          className="px-2.5 py-1.5 text-[11px] rounded-lg bg-red-600 text-cream-50 hover:bg-red-500 disabled:opacity-50"
                        >
                          {isBusy ? '...' : 'מחק לצמיתות'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={isBusy}
                          className="px-2.5 py-1.5 text-[11px] rounded-lg bg-surface-card text-ink-300 hover:text-ink-100"
                        >
                          ביטול
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleRestore(habit)}
                          disabled={isBusy}
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-forest-500 hover:bg-forest-700/20 disabled:opacity-40"
                          aria-label="שחזר"
                          title="שחזר"
                        >
                          <ArchiveRestore size={18} strokeWidth={1.9} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(habit.id)}
                          disabled={isBusy}
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-950/30 disabled:opacity-40"
                          aria-label="מחק לצמיתות"
                          title="מחק"
                        >
                          <Trash2 size={18} strokeWidth={1.9} />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function formatArchiveDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const months = [
    'ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני',
    'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳',
  ];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
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
