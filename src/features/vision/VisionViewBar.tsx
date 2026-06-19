// ============================================================================
// VisionViewBar — control strip ABOVE the vision content.
// ----------------------------------------------------------------------------
// Layout (RTL, physical right→left):
//
//   [ שנתי ▾ ] [ ▤ feed ] ……… [ ↺ history ] [ ▾ collapse ]
//
//   • View dropdown (physical RIGHT-most): Google-Calendar-style picker for
//     the granularity — שבועי / חודשי / שנתי. Its label shows the active
//     level view; tinted green while a level view is active.
//   • Free-scroll button: a SEPARATE control (its own chip, a gap away from
//     the dropdown — deliberately not one segmented group) that switches to
//     the free-scroll feed.
//   • physical LEFT (level views only): version-history + collapse chevron.
//     In the feed it's the search box; in the (coming-soon) weekly view it's
//     empty.
//
// Purely presentational — all state lives in the Vision screen.
// ============================================================================
import { useState } from 'react';
import {
  ChevronDown,
  GalleryVertical,
  History,
  Search,
  X,
  Check,
} from 'lucide-react';

export type VisionLevelView = 'yearly' | 'monthly' | 'weekly';
export type VisionView = VisionLevelView | 'feed';

const LEVEL_LABELS: Record<VisionLevelView, string> = {
  yearly: 'שנתי',
  monthly: 'חודשי',
  weekly: 'שבועי',
};

// Menu order, top→bottom: weekly, monthly, yearly (fine→broad, like a
// calendar's Day/Week/Month/Year list).
const MENU_ORDER: VisionLevelView[] = ['weekly', 'monthly', 'yearly'];

type Props = {
  /** Is the navigator drawer (map / cards) currently expanded? */
  layersOpen: boolean;
  onToggleLayers: () => void;
  /** The active view. */
  view: VisionView;
  /** The level the dropdown LABELS (the last-picked level view) — stays put
   *  while the feed is active so the dropdown keeps a meaningful caption. */
  levelView: VisionLevelView;
  onPickLevelView: (v: VisionLevelView) => void;
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
  levelView,
  onPickLevelView,
  onPickFeed,
  onOpenHistory,
  searchQuery,
  onSearchChange,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const onLevelView = view !== 'feed';
  // The left cluster (history + collapse) only makes sense for the views with
  // a navigator + editor below: yearly and monthly.
  const showNav = view === 'yearly' || view === 'monthly';

  return (
    <div dir="rtl" className="flex items-center justify-between gap-2 mb-2">
      {/* physical RIGHT: the view dropdown + the (separate) free-scroll chip. */}
      <div className="flex items-center gap-2">
        {/* ── View dropdown ── */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            aria-label="בחירת תצוגה"
            className={`
              inline-flex items-center gap-1 h-7 ps-2 pe-2.5 rounded-lg
              text-[13px] font-semibold transition-colors
              ${
                onLevelView
                  ? 'bg-forest-700/25 text-ink-100 ring-1 ring-forest-700'
                  : 'bg-surface-raised text-ink-300 ring-1 ring-surface-border hover:text-ink-100'
              }
            `}
          >
            <ChevronDown
              size={14}
              className={`shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
            />
            <span>{LEVEL_LABELS[levelView]}</span>
          </button>

          {menuOpen && (
            <>
              {/* Outside-click catcher. */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
                aria-hidden
              />
              <div
                role="listbox"
                className="absolute z-50 top-full mt-1 right-0 min-w-[148px] rounded-xl bg-surface-card ring-1 ring-surface-border shadow-xl p-1"
              >
                {MENU_ORDER.map((opt) => {
                  const active = view === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onPickLevelView(opt);
                        setMenuOpen(false);
                      }}
                      className={`
                        w-full flex items-center justify-between gap-3 px-3 h-8 rounded-lg
                        text-[13px] transition-colors
                        ${
                          active
                            ? 'text-forest-700 font-semibold bg-forest-700/10'
                            : 'text-ink-100 hover:bg-surface-raised'
                        }
                      `}
                    >
                      <span>{LEVEL_LABELS[opt]}</span>
                      {active && <Check size={14} className="shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── Free-scroll — a SEPARATE chip (gap above), not grouped with the
            dropdown. ── */}
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

      {/* physical LEFT: search (feed) / history + collapse (level views) /
          nothing (weekly coming-soon). */}
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
      ) : showNav ? (
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
      ) : null}
    </div>
  );
}
