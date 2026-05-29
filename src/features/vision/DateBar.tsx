// ============================================================================
// DateBar — the editable "written on" date at the top of every vision page.
// ----------------------------------------------------------------------------
// Looks like a small chip below the tabs (above the editor). Click it →
// the browser's native date picker opens. Selecting a new date fires
// `onChange(dateIso)`; the parent (useVisionEntry) persists immediately.
//
// We use `showPicker()` to open the native control without rendering a
// raw date input visibly (avoids the browser's English label inside RTL
// chrome). The visible label is Hebrew.
// ============================================================================
import { useRef } from 'react';
import { Calendar } from 'lucide-react';

type Props = {
  /** Date stamped on the entry. ISO 'YYYY-MM-DD'. */
  value: string;
  onChange: (iso: string) => void;
};

const HEB_MONTHS_FULL = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

function formatHebrew(iso: string): string {
  // Parse as local-date to avoid timezone drift on YYYY-MM-DD.
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ב${HEB_MONTHS_FULL[m - 1]} ${y}`;
}

export function DateBar({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    // showPicker is the modern API for triggering the native date control
    // without focusing the (visually hidden) input itself.
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        // Some browsers throw if not user-activated. Fall through to focus.
      }
    }
    el.focus();
    el.click();
  };

  return (
    <div
      dir="rtl"
      className="
        flex items-center justify-between gap-2
        pb-2 mb-3 border-b border-surface-border
      "
    >
      <button
        type="button"
        onClick={openPicker}
        className="
          inline-flex items-center gap-1.5
          text-[12px] text-ink-300 hover:text-ink-100
          transition-colors
        "
        aria-label="שנה את תאריך המסמך"
        title="לחץ לשינוי תאריך"
      >
        <Calendar size={13} strokeWidth={1.8} />
        <span>{formatHebrew(value)}</span>
      </button>

      {/* The native date input. Visually hidden but in the layout so
          `showPicker()` anchors the popover near the visible button. */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          if (next && next !== value) onChange(next);
        }}
        // sr-only-ish: zero-size but still focusable / pickable.
        className="absolute opacity-0 pointer-events-none w-0 h-0"
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}
