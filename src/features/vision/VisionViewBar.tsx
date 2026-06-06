// ============================================================================
// VisionViewBar — control strip ABOVE the layered navigator.
// ----------------------------------------------------------------------------
// Layout (RTL, physical left→right):
//
//   [ ▼ collapse ] [ היום/החודש/השבוע ] ……… [ ▦ | ▤ view toggle ]
//
//   • Collapse chevron (physical LEFT-most): folds the 3-layer navigator up
//     and down like a drawer. Rotates 180° to signal the open/closed state.
//   • Jump-to-now (just right of the chevron): returns the active level to the
//     current period. Moved here out of the editor's DateBar.
//   • View toggle (physical RIGHT): switches between the layered view and a
//     second view (the second one is a placeholder until its spec lands).
//
// This component is purely presentational — all state lives in the Vision
// screen so the drawer animation and the editor stay in sync.
// ============================================================================
import { ChevronDown, Rows3, LayoutGrid, CalendarCheck } from 'lucide-react';

export type VisionView = 'layers' | 'board';

type Props = {
  /** Is the layered navigator currently expanded? */
  layersOpen: boolean;
  onToggleLayers: () => void;
  /** "Jump to current period" (היום / החודש / השבוע); null = already there. */
  jumpToNow: { label: string; onJump: () => void } | null;
  /** Active view. Only 'layers' is wired today; 'board' is a placeholder. */
  view: VisionView;
  onViewChange: (view: VisionView) => void;
};

export function VisionViewBar({
  layersOpen,
  onToggleLayers,
  jumpToNow,
  view,
  onViewChange,
}: Props) {
  return (
    <div dir="rtl" className="flex items-center justify-between gap-2 mb-2">
      {/* physical RIGHT (first DOM child): the two view toggles */}
      <div className="inline-flex items-center gap-0.5 rounded-xl bg-surface-raised p-0.5 ring-1 ring-surface-border">
        <ViewToggle
          active={view === 'layers'}
          label="תצוגת שכבות"
          onClick={() => onViewChange('layers')}
        >
          <Rows3 size={16} />
        </ViewToggle>
        <ViewToggle
          active={view === 'board'}
          label="תצוגה נוספת (בקרוב)"
          // Placeholder — the second view's spec hasn't landed yet, so this
          // toggle is inert for now (kept visible so the layout is final).
          disabled
          onClick={() => onViewChange('board')}
        >
          <LayoutGrid size={16} />
        </ViewToggle>
      </div>

      {/* physical LEFT (last DOM child): jump (right) + collapse chevron
          (left-most). DOM order [jump][chevron] → in RTL the chevron lands
          on the far left, the jump just to its right. */}
      <div className="inline-flex items-center gap-1.5">
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
        <button
          type="button"
          onClick={onToggleLayers}
          aria-label={layersOpen ? 'כווץ את שכבות החזון' : 'הצג את שכבות החזון'}
          aria-expanded={layersOpen}
          className="
            shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-lg
            bg-surface-raised ring-1 ring-surface-border
            text-ink-300 hover:text-ink-100 hover:ring-ink-300 transition-all
          "
        >
          <ChevronDown
            size={16}
            className={`transition-transform duration-300 ease-in-out ${
              layersOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function ViewToggle({
  active,
  disabled = false,
  label,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`
        inline-flex items-center justify-center h-7 w-8 rounded-lg
        transition-colors
        ${
          active
            ? 'bg-forest-700/25 text-ink-100'
            : disabled
              ? 'text-ink-300/30'
              : 'text-ink-300 hover:text-ink-100 hover:bg-surface-card'
        }
      `}
    >
      {children}
    </button>
  );
}
