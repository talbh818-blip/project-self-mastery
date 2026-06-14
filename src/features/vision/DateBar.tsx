// ============================================================================
// DateBar — top row of the open vision's header.
// ----------------------------------------------------------------------------
// Layout (RTL): [icon picker] [assist] · ‹ TITLE › · [save] [back-to-now]
//   • Icon picker  — pick the per-period icon (right-most).
//   • Assist       — compact 🗺️ toggle that reveals the "+ כתיבה מודרכת"
//     inserter below (guided-writing). Kept small so the header stays tidy.
//   • Title        — the vision's name + range ("חזון שבועי · 7–13.6.26"),
//     the centrepiece, flanked by small chevrons that step the period
//     (prev / next week-month-year) for quick browsing.
//   • Save status  — "שומר…" / "נשמר" / "שגיאה".
//   • Back-to-now  — jump to the current week.
//
// A per-habit success summary lives at the BOTTOM of the vision (below the
// writing, owned by VisionEditor); this bar keeps its own bottom divider that
// separates the header from the writing surface.
// ============================================================================
import {
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  AlertCircle,
  SmilePlus,
} from 'lucide-react';
import type { ReactNode } from 'react';
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
  /** "Back to current week" control — inactive when already there. */
  jumpToNow: { label: string; enabled: boolean; onJump: () => void };
  /** Assist toggle state + handler (reveals the guided-writing inserter). */
  assistOn: boolean;
  onToggleAssist: () => void;
  /** Current level's icon (Lucide name or emoji char), or null. */
  icon: string | null;
  onIconClick: () => void;
  /** Save indicator state — driven by useVisionEntry. */
  saveStatus: SaveStatus;
  /** 'desktop' bumps the chrome icons/buttons a notch (consistency with the
   *  desktop toolbar) AND moves the back-to-now button into the RIGHT cluster,
   *  freeing the LEFT cluster for `leftSlot`. Default 'mobile' leaves the phone
   *  layout untouched. */
  variant?: 'mobile' | 'desktop';
  /** Desktop only: content for the LEFT cluster (where back-to-now used to be)
   *  — e.g. the per-period habit rings. Ignored on mobile. */
  leftSlot?: ReactNode;
};

export function DateBar({
  title,
  onStepPeriod,
  canStepNext,
  jumpToNow,
  assistOn,
  onToggleAssist,
  icon,
  onIconClick,
  saveStatus,
  variant = 'mobile',
  leftSlot,
}: Props) {
  // Desktop sizes the chrome icons to match the formatting toolbar (~20px);
  // mobile keeps its original compact sizing.
  const big = variant === 'desktop';
  const sideBtn = big ? 'h-9 w-9' : 'h-7 w-7';
  const habitGlyph = big ? 20 : 16;
  const smileGlyph = big ? 19 : 15;
  const assistGlyph = big ? 18 : 15;
  const nowBtn = big ? 'h-9 px-3 text-[12px]' : 'h-7 px-2.5 text-[11px]';
  const nowGlyph = big ? 16 : 13;

  // "Back to current week" — on mobile it lives in the LEFT cluster; on desktop
  // it moves to the RIGHT cluster (right of the icon picker) so the left can
  // host the habit rings.
  const backToNowBtn = (
    <button
      type="button"
      onClick={jumpToNow.enabled ? jumpToNow.onJump : undefined}
      disabled={!jumpToNow.enabled}
      aria-label={
        jumpToNow.enabled
          ? `חזרה ל${jumpToNow.label}`
          : `כבר ב${jumpToNow.label}`
      }
      className={`
        shrink-0 inline-flex items-center gap-1 ${nowBtn} rounded-lg
        font-semibold transition-colors
        ${
          jumpToNow.enabled
            ? // Soft green tint instead of a loud solid fill.
              'bg-forest-700/15 text-forest-300 hover:bg-forest-700/25'
            : 'bg-surface-raised text-ink-300/40 ring-1 ring-surface-border cursor-default'
        }
      `}
    >
      <RotateCcw size={nowGlyph} className="shrink-0" />
      {jumpToNow.label}
    </button>
  );

  return (
    // 3-column grid. Mobile keeps equal-width flanks (1fr each) so the TITLE is
    // truly centred. Desktop instead gives the LEFT cluster (the habit rings)
    // the bulk of the width — title + right buttons are content-sized — so the
    // rings sit flush-left across the row with room to breathe; they scroll if
    // they ever exceed that (wide) track instead of overflowing onto the title.
    <div
      dir="rtl"
      className={`grid items-center gap-2 pb-2 mb-3 border-b border-surface-border ${
        big
          ? 'grid-cols-[auto_minmax(0,auto)_minmax(0,1fr)]'
          : 'grid-cols-[1fr_minmax(0,auto)_1fr]'
      }`}
    >
      {/* RIGHT cluster (RTL → start = right): on desktop, back-to-now sits
          rightmost, then the icon picker + assist toggle. */}
      <div className="flex items-center gap-1.5 justify-self-start">
        {big && backToNowBtn}
        <button
          type="button"
          onClick={onIconClick}
          aria-label="בחר אייקון לחזון"
          title="בחר אייקון לחזון"
          className={`
            shrink-0 inline-flex items-center justify-center
            ${sideBtn} rounded-lg transition-all
            ${icon
              ? 'bg-forest-700/25 text-ink-100'
              : 'bg-surface-raised ring-1 ring-surface-border hover:ring-ink-300 text-ink-300'}
          `}
        >
          {icon ? (
            <HabitIcon name={icon} size={habitGlyph} />
          ) : (
            <SmilePlus size={smileGlyph} strokeWidth={1.9} />
          )}
        </button>

        {/* Assist — compact 🗺️ toggle, immediately after the icon picker. */}
        <button
          type="button"
          onClick={onToggleAssist}
          aria-label="מצב כתיבה מודרכת"
          aria-pressed={assistOn}
          title={assistOn ? 'כיבוי כתיבה מודרכת' : 'הפעלת כתיבה מודרכת'}
          className={`
            shrink-0 inline-flex items-center justify-center
            ${sideBtn} rounded-lg transition-all
            ${assistOn
              ? 'bg-forest-700/25 ring-1 ring-forest-700'
              : 'bg-surface-raised ring-1 ring-surface-border hover:ring-ink-300 opacity-70'}
          `}
        >
          <Emoji emoji="🗺️" size={assistGlyph} ariaLabel="" />
        </button>
      </div>

      {/* CENTRE: title + period steppers — dead-centre in the row. */}
      <div className="min-w-0 flex items-center justify-center gap-1">
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

      {/* LEFT cluster (RTL → justify-self-end = left): mobile shows back-to-now;
          desktop shows the leftSlot (habit rings). A minimal save indicator sits
          to its right (usually invisible — error only). */}
      <div className="justify-self-end flex items-center gap-1.5 min-w-0">
        <SaveBadge status={saveStatus} />
        {big ? leftSlot : backToNowBtn}
      </div>
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

// Save feedback is fully SILENT during normal use — auto-save is implicit, so
// neither "נשמר" nor a saving pulse earns its space. The ONLY thing worth
// surfacing is a failure (e.g. offline), so the user knows their writing
// hasn't reached the cloud yet.
function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'error') {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[11px] text-red-400 shrink-0"
        aria-live="polite"
      >
        <AlertCircle size={13} />
        לא נשמר
      </span>
    );
  }
  return null;
}
