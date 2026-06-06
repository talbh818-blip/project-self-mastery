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

export type VisionView = 'layers' | 'board' | 'feed';

type Props = {
  /** Is the layered navigator currently expanded? */
  layersOpen: boolean;
  onToggleLayers: () => void;
  /** Active view: layered stack, the year map, or the free-scroll feed. */
  view: VisionView;
  onViewChange: (view: VisionView) => void;
};

export function VisionViewBar({
  layersOpen,
  onToggleLayers,
  view,
  onViewChange,
}: Props) {
  return (
    <div dir="rtl" className="flex items-center justify-between gap-2 mb-2">
      {/* physical RIGHT (first DOM child): the three view toggles. Map leads
          (rightmost in RTL); free-scroll is left-most. */}
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
        <ViewToggle
          active={view === 'feed'}
          label="גלילה חופשית בין החזונות"
          onClick={() => onViewChange('feed')}
        >
          <GalleryVertical size={16} />
        </ViewToggle>
      </div>

      {/* physical LEFT (last DOM child): collapse chevron — folds whichever
          navigator is active (the 3-layer stack OR the year map) like a
          drawer. The feed view has no navigator, so it's hidden there. */}
      {view !== 'feed' && (
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
      )}
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
