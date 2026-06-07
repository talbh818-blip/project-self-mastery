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
//   • View toggle (physical RIGHT): switches between the year map and the
//     free-scroll feed.
//
// This component is purely presentational — all state lives in the Vision
// screen so the drawer animation and the editor stay in sync.
// ============================================================================
import {
  ChevronDown,
  LayoutGrid,
  GalleryVertical,
  History,
  Search,
  X,
} from 'lucide-react';

export type VisionView = 'board' | 'feed';

type Props = {
  /** Is the layered navigator currently expanded? */
  layersOpen: boolean;
  onToggleLayers: () => void;
  /** Active view: the year map or the free-scroll feed. */
  view: VisionView;
  onViewChange: (view: VisionView) => void;
  /** Open the version-history (restore) sheet for the open vision. */
  onOpenHistory: () => void;
  /** Feed-view search box — rendered inline, filling the row left of the
   *  toggles. Only shown when `view === 'feed'`. */
  searchQuery: string;
  onSearchChange: (q: string) => void;
};

export function VisionViewBar({
  layersOpen,
  onToggleLayers,
  view,
  onViewChange,
  onOpenHistory,
  searchQuery,
  onSearchChange,
}: Props) {
  return (
    <div dir="rtl" className="flex items-center justify-between gap-2 mb-2">
      {/* physical RIGHT (first DOM child): the two view toggles. Map leads
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
          active={view === 'feed'}
          label="גלילה חופשית בין החזונות"
          onClick={() => onViewChange('feed')}
        >
          <GalleryVertical size={16} />
        </ViewToggle>
      </div>

      {/* physical LEFT (last DOM child). In the FEED view this is the search
          box, filling the row left of the toggles. In the other views it's the
          version-history button + collapse chevron (DOM order [history][chevron]
          → in RTL the chevron lands left-most, history just to its right). */}
      {view === 'feed' ? (
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-300 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="חיפוש מילה בחזונות…"
            className="
              w-full h-9 rounded-xl bg-surface-card text-ink-100 text-sm
              pr-9 pl-9 ring-1 ring-surface-border focus:ring-forest-600
              outline-none transition placeholder:text-ink-500
            "
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="נקה חיפוש"
              className="absolute top-1/2 left-2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-md text-ink-300 hover:text-ink-100 hover:bg-surface-raised"
            >
              <X size={15} />
            </button>
          )}
        </div>
      ) : (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenHistory}
            aria-label="גרסאות קודמות"
            title="גרסאות קודמות"
            className="
              shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-lg
              bg-surface-raised ring-1 ring-surface-border
              text-ink-300 hover:text-ink-100 hover:ring-ink-300 transition-all
            "
          >
            <History size={16} />
          </button>
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
