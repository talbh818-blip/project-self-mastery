// ============================================================================
// Course screen — horizontal book shelf + inline videos for the active book.
// ----------------------------------------------------------------------------
// Layout (top → bottom):
//   1. Horizontal RTL carousel of small 3D book cards (no page title above —
//      the carousel itself communicates what the screen is).
//        • Active book has a forest ring + slight lift.
//        • Books with no videos render grayscale + a "בקרוב" pill.
//        • Cover image with onError fallback to a blank placeholder.
//        • Caption (title + author) is centered under each card.
//   2. Below the carousel, the active book's videos are embedded DIRECTLY —
//      each one is its own ready-to-play player with its title ABOVE it.
//      There's no clickable list and no "back to list" step: the iframes sit
//      on the page so the user presses play right where the video is.
//      We never repeat the active book's title/author here — they live
//      under the card.
//
// There is ALWAYS an active book — the first book in the catalog is selected
// on mount. Switching books re-mounts the section with the new book's videos.
// ============================================================================
import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import {
  fetchBooks,
  fetchVideos,
  videoEmbedUrl,
  type CourseBookWithCount,
  type CourseVideo,
} from '../features/course/queries';
import { CompassLoader } from '../components/CompassLoader';
import { useVisionLayoutPref } from '../features/vision/useVisionLayoutPref';
import { readPersisted, writePersisted } from '../lib/persistentCache';
import { dbgLog } from '../lib/debug';

// Session cache (memory-only) for the book shelf — lets returning to the
// Course screen paint instantly instead of flashing the loader and refetching
// the whole shelf. We still revalidate in the background so newly-published
// books appear; the loader only shows on the genuine first load (nothing
// cached yet). Mirrors the pattern in useCatalog / visionCache.
let booksCache: CourseBookWithCount[] | null = null;

// Same idea for each book's videos, keyed by book id. Re-entering Course (or
// switching back to a book) paints its videos instantly instead of flashing
// the small loader and refetching. Course content is public, so no per-user
// keying / sign-out clearing is needed.
const videosCache = new Map<string, CourseVideo[]>();

export function Course() {
  // Course follows the global desktop/mobile toggle (the bottom-nav switch,
  // shared with Vision). MOBILE keeps the original horizontal book carousel with
  // the videos stacked below it. DESKTOP uses the full viewport width: a
  // 3-per-row book grid pinned to the right, with the active book's video player
  // filling the space to its left.
  const { mode } = useVisionLayoutPref();
  const desktop = mode === 'desktop';

  // Initial books: memory cache → device snapshot → none. Seeds the memory
  // cache from the snapshot so a cold load / reload paints the shelf at once.
  const [books, setBooks] = useState<CourseBookWithCount[] | null>(() => {
    if (booksCache) {
      dbgLog('Course: books MEMORY hit → instant');
      return booksCache;
    }
    const snap = readPersisted<CourseBookWithCount[]>('course-books');
    if (snap) {
      dbgLog('Course: books localStorage hit → instant');
      booksCache = snap;
    } else {
      dbgLog('Course: books MISS → LOADER');
    }
    return booksCache;
  });
  const [error, setError] = useState<string | null>(null);
  const [activeBookId, setActiveBookId] = useState<string | null>(() =>
    booksCache && booksCache.length > 0 ? booksCache[0].id : null,
  );

  // Load the catalog on mount — instantly from cache when we have it (no
  // loader), then revalidate silently. Auto-select the first book so the
  // screen never shows an "empty" state next to the carousel/grid; preserve
  // any selection the user already made across a background refresh.
  useEffect(() => {
    let cancelled = false;
    fetchBooks()
      .then((rows) => {
        if (cancelled) return;
        booksCache = rows;
        writePersisted('course-books', rows);
        setBooks(rows);
        setActiveBookId((cur) => cur ?? (rows.length > 0 ? rows[0].id : null));
      })
      .catch((e) => {
        if (cancelled) return;
        // Keep showing cached books if a silent revalidation fails.
        if (booksCache) return;
        const msg = e instanceof Error ? e.message : 'שגיאה בטעינה';
        setError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeBook =
    books?.find((b) => b.id === activeBookId) ?? books?.[0] ?? null;

  const body = error ? (
    <p className="text-red-400 text-sm py-10 text-center">{error}</p>
  ) : !books ? (
    <div className="py-10">
      <CompassLoader size="md" />
    </div>
  ) : books.length === 0 ? (
    <EmptyShelf />
  ) : desktop ? (
    <CourseDesktop
      books={books}
      activeBook={activeBook}
      activeBookId={activeBookId}
      onSelect={setActiveBookId}
    />
  ) : (
    <>
      <BookShelf
        books={books}
        activeBookId={activeBookId}
        onSelect={setActiveBookId}
      />
      {activeBook && <BookSection key={activeBook.id} book={activeBook} />}
    </>
  );

  // The Layout gives /course the full viewport width (like /vision). DESKTOP
  // uses all of it so the book rail can sit flush on the right edge; MOBILE
  // re-constrains itself to phone-width and stays centred.
  return (
    <section
      className={
        desktop
          ? 'w-full h-[calc(100vh-6rem)]'
          : '-mt-3 pb-6 space-y-5 w-full max-w-md mx-auto'
      }
    >
      {body}
    </section>
  );
}

// ---------------------------------------------------------------------------
// CourseDesktop — wide two-column layout. RTL renders the first child on the
// right, so the book rail sits flush on the right edge and the active book's
// videos — laid out like a digital course — fill the space to its left.
// ---------------------------------------------------------------------------
function CourseDesktop({
  books,
  activeBook,
  activeBookId,
  onSelect,
}: {
  books: CourseBookWithCount[];
  activeBook: CourseBookWithCount | null;
  activeBookId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-6 h-full">
      <BookRail books={books} activeBookId={activeBookId} onSelect={onSelect} />
      {/* The active book's videos. Scrolls on its own (green in-app bar) only if
          a book has more videos than fit; the PAGE itself never scrolls. */}
      <div
        dir="ltr"
        className="flex-1 min-w-0 h-full overflow-y-auto vision-feed-scroll"
      >
        <div dir="rtl">
          {activeBook && (
            <BookSection key={activeBook.id} book={activeBook} desktop />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BookRail — desktop-only right rail. A fixed 3 columns of full-size book cards
// (same size as the mobile carousel), pinned to the right edge and filling the
// fixed shell's full height (h-full). The PAGE never scrolls; the rail does.
// RTL auto-placement fills right→left, so a short last row stays right-aligned.
//
// The rail carries its OWN in-app scrollbar — the slim forest-green
// `vision-feed-scroll`, not the bare OS gray. A `dir="ltr"` wrapper parks that
// bar on the RIGHT (the RTL reading side); the card grid inside is flipped back
// to rtl so the cards still flow right→left.
// ---------------------------------------------------------------------------
function BookRail({
  books,
  activeBookId,
  onSelect,
}: {
  books: CourseBookWithCount[];
  activeBookId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="shrink-0 h-full">
      <div
        dir="ltr"
        className="h-full overflow-y-auto vision-feed-scroll"
      >
        <ul
          dir="rtl"
          className="grid grid-cols-[repeat(3,100px)] gap-x-3 gap-y-4 p-1 ps-2"
        >
          {books.map((b) => (
            <li key={b.id}>
              <BookCard
                book={b}
                active={b.id === activeBookId}
                onClick={() => onSelect(b.id)}
              />
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// BookShelf — horizontal RTL carousel. Snap-x so each card lands neatly.
// ---------------------------------------------------------------------------
function BookShelf({
  books,
  activeBookId,
  onSelect,
}: {
  books: CourseBookWithCount[];
  activeBookId: string | null;
  onSelect: (id: string) => void;
}) {
  // Negative margins extend the scroll viewport edge-to-edge so the carousel
  // visually bleeds beyond the page's content padding. `shelf-scroll` (in
  // index.css) gives us a working horizontal RTL scroller WITH a prominent
  // always-visible thumb. The .shelf-scroll-wrap adds a soft left-edge fade
  // so users see at a glance there are more books off-screen to the left.
  return (
    <div className="-mx-3 sm:-mx-4 shelf-scroll-wrap">
      <div
        dir="rtl"
        className="overflow-x-auto shelf-scroll snap-x pb-1"
      >
        <ul className="flex gap-3 px-3 sm:px-4 pb-3 pt-1">
          {books.map((b) => (
            <li key={b.id} className="snap-start shrink-0">
              <BookCard
                book={b}
                active={b.id === activeBookId}
                onClick={() => onSelect(b.id)}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BookCard — 100×150 cover (2:3 ratio) + centered caption (title + author).
//   • Active state: forest ring + slight lift.
//   • Unavailable (no videos): grayscale + opacity + "בקרוב" pill on top.
//   • Cover image with onError → falls back to PlaceholderCover so any
//     broken/missing Open Library link still looks intentional.
// ---------------------------------------------------------------------------
function BookCard({
  book,
  active,
  onClick,
}: {
  book: CourseBookWithCount;
  active: boolean;
  onClick: () => void;
}) {
  const available = book.videoCount > 0;
  // The active book always shows in full color so it pops; inactive books
  // with no videos yet are dimmed (grayscale) as the "coming soon" signal.
  const dimmed = !active && !available;
  const [imgFailed, setImgFailed] = useState(false);
  // Reset the failure flag if the URL changes (e.g. admin updates the cover).
  useEffect(() => {
    setImgFailed(false);
  }, [book.cover_url]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group block w-[100px]"
      aria-label={`${book.title}${available ? '' : ' (בקרוב)'}`}
      aria-pressed={active}
    >
      <div
        className={`relative flex h-[150px] rounded-md overflow-hidden shadow-lg shadow-black/30 transition-all ${
          active ? '-translate-y-1 ring-2 ring-forest-500' : ''
        } ${dimmed ? 'opacity-60 grayscale' : ''}`}
      >
        {/* Spine — first DOM child = right side in RTL */}
        <div
          className="shrink-0 w-1.5 bg-gradient-to-l from-black/40 to-transparent"
          aria-hidden
        />
        {/* Cover */}
        <div className="flex-1 relative bg-surface-raised">
          {book.cover_url && !imgFailed ? (
            <img
              src={book.cover_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              // Covers are local + tiny (~15KB each), so eager-load them all
              // up front — they appear in one shot instead of trickling in.
              loading="eager"
              decoding="async"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <PlaceholderCover />
          )}
          {/* Subtle gloss along the cover's spine edge for 3D feel */}
          <div
            className="absolute inset-y-0 right-0 w-2 bg-gradient-to-l from-white/15 to-transparent pointer-events-none"
            aria-hidden
          />
        </div>

        {/* "בקרוב" pill — shown on books without any videos */}
        {!available && (
          <span className="absolute top-1.5 left-1.5 text-[9px] bg-black/65 text-cream-50 px-1.5 py-0.5 rounded-full">
            בקרוב
          </span>
        )}
      </div>

      {/* Caption — centered, title + author */}
      <div className="mt-2 text-center">
        <div
          className={`text-[12px] font-medium leading-tight line-clamp-2 ${
            active ? 'text-ink-100' : 'text-ink-300'
          }`}
        >
          {book.title}
        </div>
        {book.author && (
          <div className="text-[10px] text-ink-500 leading-tight line-clamp-1 mt-0.5">
            {book.author}
          </div>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// PlaceholderCover — generic blank "book cover" used when no cover_url is
// available (or the image failed to load). Cream/leather gradient + a thin
// ornamental double-frame. The "בקרוב" indicator is shown by the card via a
// pill, NOT here, so this cover stays neutral and works both for missing
// covers and for available-but-uncovered books.
// ---------------------------------------------------------------------------
function PlaceholderCover() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: 'linear-gradient(135deg, #efe2c0 0%, #c9a774 100%)',
      }}
    >
      <div
        className="absolute inset-2 border rounded-sm pointer-events-none"
        style={{ borderColor: 'rgba(94, 65, 26, 0.35)' }}
        aria-hidden
      />
      <div
        className="absolute inset-3 border rounded-sm pointer-events-none"
        style={{ borderColor: 'rgba(94, 65, 26, 0.18)' }}
        aria-hidden
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BookSection — the active book's videos, each embedded directly as its own
// ready-to-play player with the title above it (no list, no "back" step).
// MOBILE stacks them full-width; DESKTOP lays them out as a digital-course grid
// of smaller players. Loads its own videos on mount; parent passes
// `key={book.id}` so a book change re-mounts with the new book's videos.
// ---------------------------------------------------------------------------
function BookSection({
  book,
  desktop = false,
}: {
  book: CourseBookWithCount;
  desktop?: boolean;
}) {
  // Seed from memory cache → device snapshot so re-entering a book (or a cold
  // load / reload) paints its videos instantly; we still revalidate silently.
  const [videos, setVideos] = useState<CourseVideo[] | null>(() => {
    const mem = videosCache.get(book.id);
    if (mem) return mem;
    const snap = readPersisted<CourseVideo[]>(`course-videos:${book.id}`);
    if (snap) videosCache.set(book.id, snap);
    return snap ?? null;
  });
  const [loading, setLoading] = useState(() => !videosCache.has(book.id));
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hasCache = videosCache.has(book.id);
    // Only show the loader on a true cold load; otherwise refresh silently.
    if (!hasCache) setLoading(true);
    setLoadError(null);
    fetchVideos(book.id)
      .then((rows) => {
        if (cancelled) return;
        videosCache.set(book.id, rows);
        writePersisted(`course-videos:${book.id}`, rows);
        setVideos(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        // Keep showing cached videos if a silent revalidation fails.
        if (hasCache) return;
        const msg = e instanceof Error ? e.message : 'שגיאה בטעינה';
        setLoadError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  if (loading) {
    return (
      <div className="py-6">
        <CompassLoader size="sm" />
      </div>
    );
  }
  if (loadError) {
    return <p className="text-red-400 text-sm py-6 text-center">{loadError}</p>;
  }
  if (!videos || videos.length === 0) {
    return (
      <div className="bg-surface-card rounded-2xl p-6 text-center">
        <BookOpen size={24} className="text-ink-500 mx-auto mb-2" />
        <p className="text-ink-100 text-sm font-medium">סרטוני סיכום בקרוב</p>
        <p className="text-ink-300 text-xs mt-1">
          עוד לא הועלו סרטוני סיכום לספר הזה.
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        desktop
          ? 'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-x-5 gap-y-7'
          : 'space-y-6'
      }
    >
      {videos.map((v) => (
        <VideoPlayer key={v.id} video={v} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VideoPlayer — title ABOVE an always-embedded player. The iframe sits ready
// on the page so the user presses play right where the video is.
// ---------------------------------------------------------------------------
function VideoPlayer({ video }: { video: CourseVideo }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h3 className="text-sm font-semibold text-ink-100">{video.title}</h3>
        {video.duration_sec ? (
          <span className="shrink-0 text-xs text-ink-300">
            {formatDuration(video.duration_sec)}
          </span>
        ) : null}
      </div>
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
        <iframe
          src={videoEmbedUrl(video)}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          className="absolute inset-0 w-full h-full"
        />
      </div>
    </div>
  );
}

function EmptyShelf() {
  return (
    <div className="bg-surface-card rounded-2xl p-8 text-center mt-4">
      <BookOpen size={28} className="text-ink-500 mx-auto mb-3" />
      <p className="text-ink-100 font-medium">מדף הספרים ריק</p>
      <p className="text-ink-300 text-sm mt-1">
        עוד לא נוספו ספרים לקורס. חזור בקרוב.
      </p>
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
