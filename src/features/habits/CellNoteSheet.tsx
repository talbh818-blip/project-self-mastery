// ============================================================================
// CellNoteSheet — the compact popup opened by LONG-PRESSING a habit day-cell.
// ----------------------------------------------------------------------------
// Lets the user attach extra documentation to that single (habit, date):
//   • a SYMBOL — one of a few quick emojis,
//   • a COLOR — three shades of the habit's OWN colour, plus grey,
//   • free TEXT — when present the cell shows a small white dot (like vision).
// Centred on the page and engineered to stay SMALL: symbols + colours share a
// single row.
// ============================================================================
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { HabitIcon } from './HabitIcon';
import type { Habit, HabitCellNote } from './types';
import type { CellNoteInput } from './cellNotes';

// The only quick-pick symbols (emojis render via <HabitIcon/>).
const QUICK_SYMBOLS: readonly string[] = ['✅', '⭐', '🔥'];

const GREY = '#8E9296';

/** Shift a hex colour toward white (t > 0) or black (t < 0). */
function shadeHex(hex: string, t: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const to = t > 0 ? 255 : 0;
  const amt = Math.min(1, Math.abs(t));
  const ch = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16);
    const m = Math.round(c + (to - c) * amt);
    return m.toString(16).padStart(2, '0');
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

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

  // Three shades of the habit's own colour + grey.
  const swatches = [
    shadeHex(habit.color, -0.3),
    habit.color,
    shadeHex(habit.color, 0.32),
    GREY,
  ];

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={() => armed && onClose()}
      dir="rtl"
    >
      <div
        className="w-full max-w-sm bg-surface-card rounded-2xl p-4 space-y-3 shadow-2xl"
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

        {/* Symbols + colours — one compact row. */}
        <div className="flex items-center gap-2 overflow-x-auto vision-habits-scroll">
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

          <div className="w-px h-6 bg-surface-border shrink-0 mx-0.5" />

          {/* Clear colour. */}
          <button
            type="button"
            onClick={() => setColor(null)}
            aria-label="ללא צבע"
            className={`shrink-0 w-7 h-7 rounded-full border border-surface-border text-ink-300 inline-flex items-center justify-center ${
              color === null ? 'ring-2 ring-ink-100' : ''
            }`}
          >
            <X size={12} />
          </button>
          {swatches.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => setColor(hex)}
              aria-label={`צבע ${hex}`}
              className={`shrink-0 w-7 h-7 rounded-full transition-transform ${
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
