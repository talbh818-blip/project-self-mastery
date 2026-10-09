// ============================================================================
// VisionViewBar — control strip ABOVE the vision content.
// ----------------------------------------------------------------------------
// Layout (RTL, physical right→left):
//
//   [ שנתי ] [ ▤ feed ] ……… [ ↺ history ] [ ▾ collapse ]
//
//   • "שנתי" chip (physical RIGHT-most): the yearly map is the ONLY granularity
//     on mobile — it already shows every month at a glance, so the monthly view
//     was retired. The chip returns to the yearly map from the feed; it's
//     tinted green while that map is active.
//   • Free-scroll button: a SEPARATE control (its own chip, a gap away) that
//     switches to the free-scroll feed. Together the two chips act as a plain
//     yearly ⇄ feed toggle.
//   • physical LEFT (yearly map only): version-history + collapse chevron.
//     In the feed it's the search box.
//
// Purely presentational — all state lives in the Vision screen.
// ============================================================================
import { GalleryVertical, History, Search, X, ChevronDown } from 'lucide-react';

// Kept for the shared controller / desktop rail; mobile only ever uses 'yearly'.
export type VisionLevelView = 'yearly' | 'monthly' | 'weekly';
export type VisionView = VisionLevelView | 'feed';

type Props = {
  /** Is the navigator drawer (the year map) currently expanded? */
  layersOpen: boolean;
  onToggleLayers: () => void;
  /** The active view — 'yearly' (the map) or 'feed'. */
  view: VisionView;
  /** Return to the yearly map (deactivate the feed). */
  onPickYearly: () => void;
  onPickFeed: () => void;
  /** Open the version-history (restore) sheet for the open vision. */
  onOpenHistory: () => void;
  /** Feed-view search box. Only shown when `view === 'feed'`. */
  searchQuery: string;
  onSearchChange: (q: string) => void;
};

export function VisionViewBar({
  layersOpen,
  onToggleLayers,
  view,
  onPickYearly,
  onPickFeed,
  onOpenHistory,
  searchQuery,
  onSearchChange,
}: Props) {
  const onYearly = view === 'yearly';

  return (
    <div dir="rtl" className="flex items-center justify-between gap-2 mb-2">
      {/* physical RIGHT: the yearly chip + the (separate) free-scroll chip —
          a plain yearly ⇄ feed toggle. */}
      <div className="flex items-center gap-2">
        {/* ── Yearly map ── */}
        <button
          type="button"
          onClick={onPickYearly}
          aria-pressed={onYearly}
          aria-label="מפה שנתית"
          className={`
            inline-flex items-center h-7 px-2.5 rounded-lg
            text-[13px] font-semibold transition-colors
            ${
              onYearly
                ? 'bg-forest-700/25 text-ink-100 ring-1 ring-forest-700'
                : 'bg-surface-raised text-ink-300 ring-1 ring-surface-border hover:text-ink-100'
            }
          `}
        >
          שנתי
        </button>

        {/* ── Free-scroll — a SEPARATE chip (gap above). ── */}
        <button
          type="button"
          onClick={onPickFeed}
          aria-pressed={view === 'feed'}
          aria-label="גלילה חופשית בין החזונות"
          title="גלילה חופשית בין החזונות"
          className={`
            shrink-0 inline-flex items-center justify-center h-7 w-8 rounded-lg
            transition-colors
            ${
              view === 'feed'
                ? 'bg-forest-700/25 text-ink-100 ring-1 ring-forest-700'
                : 'bg-surface-raised text-ink-300 ring-1 ring-surface-border hover:text-ink-100'
            }
          `}
        >
          <GalleryVertical size={16} />
        </button>
      </div>

      {/* physical LEFT: search (feed) / history + collapse (yearly map). */}
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
