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
import { Calendar, CalendarCheck, CheckCircle2, Smile } from 'lucide-react';
import { Emoji } from '../../components/Emoji';
import { HabitIcon } from '../habits/HabitIcon';
import { DatePickerSheet } from './DatePickerSheet';
import { VisionIconPicker } from './VisionIconPicker';
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
  /** "Jump to current period" (השבוע / החודש / השנה); null = hidden. */
  jumpToNow: { label: string; onJump: () => void } | null;
  /** This entry's icon (Lucide name or emoji char), or null. */
  icon: string | null;
  /** Pick a new icon, or null to clear it. */
  onPickIcon: (icon: string | null) => void;
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
  jumpToNow,
  icon,
  onPickIcon,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

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
            inline-flex items-center gap-1.5 shrink-0
            text-[12px] text-ink-300 hover:text-ink-100
            transition-colors min-w-0
          "
          aria-label="שנה את תאריך המסמך"
          title="לחץ לשינוי תאריך"
        >
          <Calendar size={13} strokeWidth={1.8} className="shrink-0" />
          <span className="truncate">{formatHebrew(value)}</span>
        </button>

        {/* Assist toggle — sits right next to the date (RTL: visually
            immediately to the LEFT of the date). Always full-opacity emoji
            + label so it reads as a real button. ON state gets the forest
            ring; OFF state uses a neutral surface chip. */}
        <button
          type="button"
          onClick={onToggleAssist}
          aria-label="מצב כתיבה מודרכת"
          aria-pressed={assistOn}
          title={assistOn ? 'כיבוי כתיבה מודרכת' : 'הפעלת כתיבה מודרכת'}
          className={`
            shrink-0 inline-flex items-center gap-1.5
            h-7 px-2 rounded-lg transition-all text-[11px] font-medium
            ${assistOn
              ? 'bg-forest-700/25 ring-1 ring-forest-700 text-ink-100'
              : 'bg-surface-raised ring-1 ring-surface-border hover:ring-ink-300 text-ink-300'}
          `}
        >
          <Emoji emoji="💡" size={14} ariaLabel="" />
          <span>כתיבה מודרכת</span>
        </button>

        {/* Icon picker — sits immediately to the LEFT of the Assist toggle.
            Shows the chosen icon when set, else a neutral "pick" affordance. */}
        <button
          type="button"
          onClick={() => setIconPickerOpen(true)}
          aria-label="בחר אייקון לחזון"
          title="בחר אייקון לחזון"
          className={`
            shrink-0 inline-flex items-center justify-center
            h-7 w-7 rounded-lg transition-all
            ${icon
              ? 'bg-forest-700/25 ring-1 ring-forest-700 text-forest-500'
              : 'bg-surface-raised ring-1 ring-surface-border hover:ring-ink-300 text-ink-300'}
          `}
        >
          {icon ? (
            <HabitIcon name={icon} size={16} />
          ) : (
            <Smile size={15} strokeWidth={1.8} />
          )}
        </button>

        {/* Spacer pushes the controls below to the visual LEFT. */}
        <div className="grow" />

        {/* Jump-to-current-period chip (השבוע / החודש / השנה). Only shown
            when off the current period. */}
        {jumpToNow && (
          <button
            type="button"
            onClick={jumpToNow.onJump}
            aria-label={`חזרה ל${jumpToNow.label}`}
            className="
              shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-lg
              text-[11px] font-medium text-forest-500
              border border-forest-500/60 hover:bg-forest-700/10
              transition-colors
            "
          >
            <CalendarCheck size={13} className="shrink-0" />
            {jumpToNow.label}
          </button>
        )}

        {/* Save status — LEFT-most in RTL */}
        <SaveBadge status={saveStatus} />
      </div>

      <DatePickerSheet
        open={pickerOpen}
        value={value}
        onConfirm={onChange}
        onClose={() => setPickerOpen(false)}
      />

      <VisionIconPicker
        open={iconPickerOpen}
        value={icon}
        onPick={onPickIcon}
        onClose={() => setIconPickerOpen(false)}
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
