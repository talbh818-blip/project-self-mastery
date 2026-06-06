// ============================================================================
// DateBar — header strip of the open vision.
// ----------------------------------------------------------------------------
// Layout (RTL): [icon picker] · ‹ TITLE › · [assist] [save]
//   • Icon picker  — pick the per-period icon (right-most).
//   • Title        — the vision's name + range ("חזון שבועי · 7–13.6.26"),
//     the centrepiece, flanked by small chevrons that step the period
//     (prev / next week-month-year) for quick browsing.
//   • Assist       — compact 💡 toggle for guided writing (no wide label).
//   • Save status  — "שומר…" / "נשמר" / "שגיאה".
//
// (The old document-date picker was dropped — the title shows the period
// itself, which is what users actually want to see.)
// ============================================================================
import { ChevronRight, ChevronLeft, CheckCircle2, SmilePlus } from 'lucide-react';
import { Emoji } from '../../components/Emoji';
import { HabitIcon } from '../habits/HabitIcon';
import type { SaveStatus } from './useVisionEntry';

type Props = {
  /** The vision's display title — scope name + period range. */
  title: string;
  /** Step the open period back / forward (prev = -1, next = +1). */
  onStepPeriod: (delta: number) => void;
  /** Whether the NEXT period is reachable (not in the future). */
  canStepNext: boolean;
  /** Assist toggle state + handler. */
  assistOn: boolean;
  onToggleAssist: () => void;
  /** Current level's icon (Lucide name or emoji char), or null. */
  icon: string | null;
  onIconClick: () => void;
  /** Save indicator state — driven by useVisionEntry. */
  saveStatus: SaveStatus;
};

export function DateBar({
  title,
  onStepPeriod,
  canStepNext,
  assistOn,
  onToggleAssist,
  icon,
  onIconClick,
  saveStatus,
}: Props) {
  return (
    <div
      dir="rtl"
      className="flex items-center gap-2 pb-2 mb-3 border-b border-surface-border"
    >
      {/* Icon picker — RIGHT-most in RTL. */}
      <button
        type="button"
        onClick={onIconClick}
        aria-label="בחר אייקון לחזון"
        title="בחר אייקון לחזון"
        className={`
          shrink-0 inline-flex items-center justify-center
          h-7 w-7 rounded-lg transition-all
          ${icon
            ? 'bg-forest-700/25 text-ink-100'
            : 'bg-surface-raised ring-1 ring-surface-border hover:ring-ink-300 text-ink-300'}
        `}
      >
        {icon ? (
          <HabitIcon name={icon} size={16} />
        ) : (
          <SmilePlus size={15} strokeWidth={1.9} />
        )}
      </button>

      {/* Title + period steppers — the centrepiece. */}
      <div className="flex-1 min-w-0 flex items-center justify-center gap-1">
        <StepArrow
          dir="prev"
          aria-label="התקופה הקודמת"
          onClick={() => onStepPeriod(-1)}
        />
        <h2 className="min-w-0 truncate text-center text-[15px] font-bold text-ink-100">
          {title}
        </h2>
        <StepArrow
          dir="next"
          aria-label="התקופה הבאה"
          disabled={!canStepNext}
          onClick={() => onStepPeriod(1)}
        />
      </div>

      {/* Assist — compact icon toggle (no wide label). */}
      <button
        type="button"
        onClick={onToggleAssist}
        aria-label="מצב כתיבה מודרכת"
        aria-pressed={assistOn}
        title={assistOn ? 'כיבוי כתיבה מודרכת' : 'הפעלת כתיבה מודרכת'}
        className={`
          shrink-0 inline-flex items-center justify-center
          h-7 w-7 rounded-lg transition-all
          ${assistOn
            ? 'bg-forest-700/25 ring-1 ring-forest-700'
            : 'bg-surface-raised ring-1 ring-surface-border hover:ring-ink-300 opacity-70'}
        `}
      >
        <Emoji emoji="💡" size={15} ariaLabel="" />
      </button>

      {/* Save status — LEFT-most in RTL. */}
      <SaveBadge status={saveStatus} />
    </div>
  );
}

function StepArrow({
  dir,
  disabled = false,
  onClick,
  ...rest
}: {
  dir: 'prev' | 'next';
  disabled?: boolean;
  onClick: () => void;
  'aria-label': string;
}) {
  const Chevron = dir === 'prev' ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="
        shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md
        text-ink-300 hover:text-forest-400 hover:bg-surface-raised
        disabled:opacity-25 disabled:pointer-events-none transition-colors
      "
      {...rest}
    >
      <Chevron size={16} />
    </button>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') {
    // Reserve a tiny invisible slot so nothing jumps when the status first
    // appears after the first keystroke.
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
