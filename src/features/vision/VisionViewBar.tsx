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
import { ChevronDown, Rows3, LayoutGrid, GalleryVertical } from 'lucide-react';

export type VisionView = 'layers' | 'board';

type Props = {
  /** Is the layered navigator currently expanded? */
  layersOpen: boolean;
  onToggleLayers: () => void;
  /** Active view: layered stack or the year map. */
  view: VisionView;
  onViewChange: (view: VisionView) => void;
  /** Free-scroll browse mode (board view only). */
  freeScroll: boolean;
  onToggleFreeScroll: () => void;
};

export function VisionViewBar({
  layersOpen,
  onToggleLayers,
  view,
  onViewChange,
  freeScroll,
  onToggleFreeScroll,
}: Props) {
  return (
    <div dir="rtl" className="flex items-center justify-between gap-2 mb-2">
      {/* physical RIGHT (first DOM child): view toggles + (board only) the
          free-scroll toggle just to their left. */}
      <div className="inline-flex items-center gap-1.5">
        <div className="inline-flex items-center gap-0.5 rounded-xl bg-surface-raised p-0.5 ring-1 ring-surface-border">
          <ViewToggle
            active={view === 'board'}
            label="מפת השנה"
            onClick={() => onViewChange('board')}
          >
            <LayoutGrid size={16} />
          </ViewToggle>
          <ViewToggle
            active={view === 'layers'}
            label="תצוגת שכבות"
            onClick={() => onViewChange('layers')}
          >
            <Rows3 size={16} />
          </ViewToggle>
        </div>

        {/* Free-scroll browse — only meaningful with the map (it highlights
            the scrolled-to vision there). Toggles a feed of all visions. */}
        {view === 'board' && (
          <button
            type="button"
            onClick={onToggleFreeScroll}
            aria-label="גלילה חופשית בין החזונות"
            aria-pressed={freeScroll}
            title="גלילה חופשית בין החזונות"
            className={`
              shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg
              transition-all
              ${
                freeScroll
                  ? 'bg-forest-700/25 text-ink-100 ring-1 ring-forest-700'
                  : 'bg-surface-raised ring-1 ring-surface-border text-ink-300 hover:text-ink-100 hover:ring-ink-300'
              }
            `}
          >
            <GalleryVertical size={16} />
          </button>
        )}
      </div>

      {/* physical LEFT (last DOM child): collapse chevron — folds whichever
          navigator is active (the 3-layer stack OR the year map) like a
          drawer. (The "back to now" control now lives in the editor's title
          row, next to the save indicator.) */}
      <button
        type="button"
        onClick={onToggleLayers}
        aria-label={layersOpen ? 'כווץ תצוגה' : 'פתח תצוגה'}
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
