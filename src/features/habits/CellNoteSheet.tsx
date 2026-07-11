// ============================================================================
// CellNoteSheet — the compact popup opened by LONG-PRESSING a habit day-cell.
// ----------------------------------------------------------------------------
// Lets the user attach extra documentation to that single (habit, date):
//   • a SYMBOL — an emoji typed on the keyboard OR a quick-pick from the set,
//   • a COLOR — a tint override for the cell,
//   • free TEXT — when present the cell shows a small white dot (like vision).
// Engineered to stay SMALL: everything on a few tight rows, no wasted height.
// ============================================================================
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { HabitIcon, isLucideIconName } from './HabitIcon';
import { HABIT_COLORS, type Habit, type HabitCellNote } from './types';
import type { CellNoteInput } from './cellNotes';

// Documentation-oriented quick picks (emojis render via <HabitIcon/>).
const QUICK_SYMBOLS: readonly string[] = [
  '✅', '⭐', '🔥', '💪', '🏃', '😊', '😌', '😴', '🤒', '💊',
  '❤️', '💧', '🥗', '📝', '🎯', '📈', '⚠️', '❌',
];

// A compact colour set (subset of the habit palette) + a "none" choice.
const SWATCHES: readonly string[] = [
  '#F76C6C', '#F2994A', '#F2C94C', '#4ED371', '#27AE92',
  '#22BCDB', '#2D8FDE', '#6962F2', '#A175F2', '#EB80B5', '#8E9296',
].filter((hex) => HABIT_COLORS.some((c) => c.hex === hex));

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d}.${m}`;
}

type Props = {
  habit: Habit;
  date: string; // YYYY-MM-DD
  note: HabitCellNote | undefined;
  onClose: () => void;
  onSave: (input: CellNoteInput) => Promise<void>;
};

export function CellNoteSheet({ habit, date, note, onClose, onSave }: Props) {
  const [symbol, setSymbol] = useState<string | null>(note?.symbol ?? null);
  const [color, setColor] = useState<string | null>(note?.color ?? null);
  const [text, setText] = useState<string>(note?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The long-press that OPENED this sheet ends in a pointer-release that would
  // otherwise land on the backdrop and close it instantly. Ignore backdrop
  // taps for a short beat after mount.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setArmed(true), 350);
    return () => window.clearTimeout(t);
  }, []);

  const hasText = text.trim().length > 0;
  // The emoji field mirrors `symbol` only when it's an emoji (not a picked
  // Lucide icon) — so typing swaps the icon out for an emoji cleanly.
  const emojiValue = symbol && !isLucideIconName(symbol) ? symbol : '';

  const commit = async (input: CellNoteInput) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(input);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירה');
      setBusy(false);
    }
  };

  const save = () => commit({ text: text.trim() || null, symbol, color });
  const clearAll = () => commit({ text: null, symbol: null, color: null });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={() => armed && onClose()}
      dir="rtl"
    >
      <div
        className="w-full max-w-sm bg-surface-card rounded-t-2xl p-4 space-y-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — live preview of the cell + habit name/date + close. */}
        <div className="flex items-center gap-2.5">
          <div
            className="relative w-9 h-9 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: color ?? habit.color }}
          >
            {symbol ? (
              <HabitIcon name={symbol} size={20} className="text-cream-50" />
            ) : null}
            {hasText && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-white" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-ink-100 truncate">
              {habit.name}
            </div>
            <div className="text-[11px] text-ink-300">{formatDate(date)}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-300 hover:bg-surface-raised"
          >
            <X size={18} />
          </button>
        </div>

        {/* Symbol — keyboard emoji + quick picks. */}
        <div className="flex items-center gap-2">
          <input
            value={emojiValue}
            onChange={(e) => setSymbol(e.target.value.trim() || null)}
            inputMode="text"
            maxLength={8}
            placeholder="😀"
            aria-label="אימוג'י מהמקלדת"
            className="shrink-0 w-11 h-9 text-center text-lg rounded-lg bg-surface-raised ring-1 ring-surface-border focus:ring-forest-600 outline-none"
          />
          <div className="flex-1 min-w-0 overflow-x-auto vision-habits-scroll">
            <div className="flex items-center gap-1.5 min-w-max">
              {QUICK_SYMBOLS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSymbol((cur) => (cur === s ? null : s))}
                  className={`shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-lg transition-all ${
                    symbol === s
                      ? 'bg-forest-700/25 ring-1 ring-forest-700'
                      : 'bg-surface-raised hover:ring-1 hover:ring-ink-300'
                  }`}
                >
                  <HabitIcon name={s} size={18} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Colour — swatches + "none". */}
        <div className="flex items-center gap-1.5 overflow-x-auto vision-habits-scroll">
          <button
            type="button"
            onClick={() => setColor(null)}
            aria-label="ללא צבע"
            className={`shrink-0 w-6 h-6 rounded-full border border-surface-border text-[10px] text-ink-300 inline-flex items-center justify-center ${
              color === null ? 'ring-2 ring-ink-100' : ''
            }`}
          >
            <X size={12} />
          </button>
          {SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => setColor(hex)}
              aria-label={`צבע ${hex}`}
              className={`shrink-0 w-6 h-6 rounded-full transition-transform ${
                color === hex ? 'ring-2 ring-ink-100 scale-110' : ''
              }`}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>

        {/* Free text — the white-dot trigger. */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="תיעוד / הערה…"
          className="w-full resize-none rounded-lg bg-surface-raised ring-1 ring-surface-border focus:ring-forest-600 outline-none px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500"
        />

        {error && <div className="text-[12px] text-red-400">{error}</div>}

        {/* Actions. */}
        <div className="flex items-center gap-2">
          {note && (
            <button
              type="button"
              onClick={clearAll}
              disabled={busy}
              className="shrink-0 h-10 px-4 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            >
              מחק
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex-1 h-10 rounded-xl bg-forest-700 text-on-accent text-sm font-bold hover:brightness-110 disabled:opacity-60"
          >
            שמור
          </button>
        </div>
      </div>
    </div>
  );
}
