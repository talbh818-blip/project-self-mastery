// ============================================================================
// VisionViewBar — control strip ABOVE the vision content.
// ----------------------------------------------------------------------------
// Layout (RTL, physical right→left):
//
//   [ ▤ feed toggle ] ……… [ ↺ history ] [ ▾ collapse ]
//
//   • Free-scroll button (physical RIGHT-most): a single TOGGLE. The yearly map
//     is the normal view; pressing this switches to the free-scroll feed, and
//     pressing it again returns to the map. Tinted green while the feed is on.
//     (The yearly map is the only granularity on mobile — it already shows every
//     month at a glance — so there's no separate view picker.)
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
  /** Toggle the free-scroll feed on/off (off = back to the yearly map). */
  onToggleFeed: () => void;
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
  onToggleFeed,
  onOpenHistory,
  searchQuery,
  onSearchChange,
}: Props) {
  const onFeed = view === 'feed';

  return (
    <div dir="rtl" className="flex items-center justify-between gap-2 mb-2">
      {/* physical RIGHT: the free-scroll toggle (map ⇄ feed). */}
      <button
        type="button"
        onClick={onToggleFeed}
        aria-pressed={onFeed}
        aria-label={onFeed ? 'חזרה למפה השנתית' : 'גלילה חופשית בין החזונות'}
        title={onFeed ? 'חזרה למפה השנתית' : 'גלילה חופשית בין החזונות'}
        className={`
          shrink-0 inline-flex items-center justify-center h-7 w-8 rounded-lg
          transition-colors
          ${
            onFeed
              ? 'bg-forest-700/25 text-ink-100 ring-1 ring-forest-700'
              : 'bg-surface-raised text-ink-300 ring-1 ring-surface-border hover:text-ink-100'
          }
        `}
      >
        <GalleryVertical size={16} />
      </button>

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
