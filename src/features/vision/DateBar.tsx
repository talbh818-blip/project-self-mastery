// ============================================================================
// DateBar — top strip of every vision page.
// ----------------------------------------------------------------------------
// Holds three things in one row, in RTL DOM order (right-to-left visually):
//   • Document date   — click to open the themed DatePickerSheet.
//   • Assist toggle   — 💡 emoji; lit when guided-writing mode is on.
//   • Save status     — "שומר…" / "נשמר" / "שגיאה", or hidden when idle.
//
// Everything that used to live in the bottom toolbar (toggle + save badge)
// is consolidated here so the toolbar stays focused on text formatting.
// ============================================================================
import { useState } from 'react';
import { Calendar, CheckCircle2 } from 'lucide-react';
import { Emoji } from '../../components/Emoji';
import { DatePickerSheet } from './DatePickerSheet';
import type { SaveStatus } from './useVisionEntry';

type Props = {
  /** Date stamped on the entry. ISO 'YYYY-MM-DD'. */
  value: string;
  onChange: (iso: string) => void;
  /** Assist toggle state + handler. */
  assistOn: boolean;
  onToggleAssist: () => void;
  /** Save indicator state — driven by useVisionEntry. */
  saveStatus: SaveStatus;
};

const HEB_MONTHS_FULL = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

function formatHebrew(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ב${HEB_MONTHS_FULL[m - 1]} ${y}`;
}

export function DateBar({
  value,
  onChange,
  assistOn,
  onToggleAssist,
  saveStatus,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <div
        dir="rtl"
        className="
          flex items-center justify-between gap-2
          pb-2 mb-3 border-b border-surface-border
        "
      >
        {/* Date — RIGHT-most in RTL (first DOM child) */}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="
            inline-flex items-center gap-1.5
            text-[12px] text-ink-300 hover:text-ink-100
            transition-colors min-w-0
          "
          aria-label="שנה את תאריך המסמך"
          title="לחץ לשינוי תאריך"
        >
          <Calendar size={13} strokeWidth={1.8} className="shrink-0" />
          <span className="truncate">{formatHebrew(value)}</span>
        </button>

        {/* Spacer pushes the assist + save controls to the visual LEFT. */}
        <div className="grow" />

        {/* Assist toggle — emoji to make it pop. Subtle off / lit on. */}
        <button
          type="button"
          onClick={onToggleAssist}
          aria-label="מצב כתיבה מודרכת"
          aria-pressed={assistOn}
          title={assistOn ? 'כיבוי כתיבה מודרכת' : 'הפעלת כתיבה מודרכת'}
          className={`
            shrink-0 inline-flex items-center justify-center
            w-7 h-7 rounded-lg transition-all
            ${assistOn
              ? 'bg-forest-700/20 ring-1 ring-forest-700/40'
              : 'opacity-50 hover:opacity-100'}
          `}
        >
          <Emoji emoji="💡" size={16} ariaLabel="" />
        </button>

        {/* Save status — LEFT-most in RTL */}
        <SaveBadge status={saveStatus} />
      </div>

      <DatePickerSheet
        open={pickerOpen}
        value={value}
        onConfirm={onChange}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') {
    // Reserve a tiny invisible slot so the toggle doesn't jump when the
    // status appears for the first time after the first keystroke.
    return <span className="w-0 h-4 shrink-0" aria-hidden />;
  }
  const text =
    status === 'pending' || status === 'saving'
      ? 'שומר…'
      : status === 'saved'
        ? 'נשמר'
        : 'שגיאה';
  const color =
    status === 'error'
      ? 'text-red-400'
      : status === 'saved'
        ? 'text-forest-500'
        : 'text-ink-300';
  return (
    <span
      className={`text-[11px] ${color} flex items-center gap-1 shrink-0`}
      aria-live="polite"
    >
      {status === 'saved' && <CheckCircle2 size={11} />}
      {text}
    </span>
  );
}
