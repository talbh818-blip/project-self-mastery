// ============================================================================
// Course screen — horizontal book shelf + inline videos for the active book.
// ----------------------------------------------------------------------------
// Layout (top → bottom):
//   1. Title.
//   2. Horizontal RTL carousel of small 3D book cards.
//        • Active book has a forest highlight ring + slight lift.
//        • Books with no videos yet render as a "blank book" placeholder
//          (no title on the cover — title sits in the caption below).
//   3. Active book's title / author / description.
//   4. Either:
//        • The embedded video player, if the user clicked a video, OR
//        • The list of videos for the active book.
//
// There is ALWAYS an active book — the first book in the catalog is selected
// on load. Switching books resets the video player.
// ============================================================================
import { useEffect, useState } from 'react';
import { BookOpen, Play, ChevronRight } from 'lucide-react';
import {
  fetchBooks,
  fetchVideos,
  videoEmbedUrl,
  videoThumbnail,
  type CourseBookWithCount,
  type CourseVideo,
} from '../features/course/queries';

export function Course() {
  const [books, setBooks] = useState<CourseBookWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);

  // Load the catalog once on mount. Auto-select the first book so the screen
  // never shows an "empty" state below the carousel.
  useEffect(() => {
    let cancelled = false;
    fetchBooks()
      .then((rows) => {
        if (cancelled) return;
        setBooks(rows);
        if (rows.length > 0) setActiveBookId(rows[0].id);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'שגיאה בטעינה';
        setError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeBook =
    books?.find((b) => b.id === activeBookId) ?? books?.[0] ?? null;

  return (
    <section className="-mt-3 pb-6 space-y-5">
      <header className="px-1">
        <h1 className="text-xl font-semibold text-ink-100">קורס</h1>
        <p className="text-ink-300 text-xs mt-1">
          בחר ספר כדי לצפות בסרטוני סיכום.
        </p>
      </header>

      {error ? (
        <p className="text-red-400 text-sm py-10 text-center">{error}</p>
      ) : !books ? (
        <p className="text-ink-300 text-sm py-10 text-center">טוען…</p>
      ) : books.length === 0 ? (
        <EmptyShelf />
      ) : (
        <>
          <BookShelf
            books={books}
            activeBookId={activeBookId}
            onSelect={setActiveBookId}
          />
          {activeBook && <BookSection key={activeBook.id} book={activeBook} />}
        </>
      )}
    </section>
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
  return (
    <div dir="rtl" className="-mx-3 sm:-mx-4 overflow-x-auto themed-scroll">
      <ul className="flex gap-3 px-3 sm:px-4 pb-3 pt-1 snap-x">
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
  );
}

// ---------------------------------------------------------------------------
// BookCard — 100×150 cover (2:3 ratio) + caption below.
// Active state: subtle forest ring + lift. Unavailable (no videos): grayscale.
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
  return (
    <button
      type="button"
      onClick={onClick}
      className="group block w-[100px] text-right"
      aria-label={`${book.title}${available ? '' : ' (בקרוב)'}`}
      aria-pressed={active}
    >
      <div
        className={`relative flex h-[150px] rounded-md overflow-hidden shadow-lg shadow-black/30 transition-all ${
          active ? '-translate-y-1 ring-2 ring-forest-500' : ''
        } ${available ? '' : 'opacity-50 grayscale'}`}
      >
        {/* Spine — first DOM child = right side in RTL */}
        <div
          className="shrink-0 w-1.5 bg-gradient-to-l from-black/40 to-transparent"
          aria-hidden
        />
        {/* Cover */}
        <div className="flex-1 relative bg-surface-raised">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <PlaceholderCover />
          )}
          {/* Subtle gloss on the cover edge near the spine for 3D feel */}
          <div
            className="absolute inset-y-0 right-0 w-2 bg-gradient-to-l from-white/15 to-transparent pointer-events-none"
            aria-hidden
          />
        </div>
      </div>

      {/* Caption */}
      <div className="mt-2 px-0.5">
        <div
          className={`text-[12px] font-medium leading-tight line-clamp-2 ${
            active ? 'text-ink-100' : 'text-ink-300'
          }`}
        >
          {book.title}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// PlaceholderCover — a generic "blank book" cover used until the admin
// uploads a real cover_url. Cream/leather gradient + thin gold-ish ornamental
// frame + "בקרוב" centered. No book title (the caption below the card carries
// the title).
// ---------------------------------------------------------------------------
function PlaceholderCover() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #efe2c0 0%, #c9a774 100%)',
      }}
    >
      {/* Ornamental frame */}
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
      {/* Label */}
      <span
        className="text-[11px] font-semibold tracking-wider"
        style={{ color: '#5a4015' }}
      >
        בקרוב
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BookSection — title/author/description for the active book, then either
// the player or the list of videos. Loads its own videos on mount; the
// parent passes a fresh `key={book.id}` so a book change re-mounts and
// resets player state.
// ---------------------------------------------------------------------------
function BookSection({ book }: { book: CourseBookWithCount }) {
  const [videos, setVideos] = useState<CourseVideo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<CourseVideo | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchVideos(book.id)
      .then((rows) => {
        if (!cancelled) setVideos(rows);
      })
      .catch((e) => {
        if (cancelled) return;
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

  return (
    <div className="space-y-4">
      {/* Book header */}
      <div className="px-1">
        <h2 className="text-lg font-semibold text-ink-100">{book.title}</h2>
        {book.author && (
          <p className="text-xs text-ink-300 mt-0.5">{book.author}</p>
        )}
        {book.description && (
          <p className="text-sm text-ink-300 mt-2 leading-relaxed">
            {book.description}
          </p>
        )}
      </div>

      {/* Player (when a video is playing) */}
      {playing && (
        <div className="space-y-2">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
            <iframe
              src={videoEmbedUrl(playing)}
              title={playing.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          </div>
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-ink-100 line-clamp-1 flex-1">
              {playing.title}
            </h3>
            <button
              type="button"
              onClick={() => setPlaying(null)}
              className="shrink-0 text-xs text-ink-300 hover:text-ink-100 flex items-center gap-1"
            >
              <ChevronRight size={14} />
              חזרה לרשימה
            </button>
          </div>
        </div>
      )}

      {/* Video list */}
      {!playing && (
        <VideoList
          videos={videos}
          loading={loading}
          error={loadError}
          onSelect={setPlaying}
        />
      )}
    </div>
  );
}

function VideoList({
  videos,
  loading,
  error,
  onSelect,
}: {
  videos: CourseVideo[] | null;
  loading: boolean;
  error: string | null;
  onSelect: (v: CourseVideo) => void;
}) {
  if (loading) {
    return <p className="text-ink-300 text-sm py-6 text-center">טוען…</p>;
  }
  if (error) {
    return <p className="text-red-400 text-sm py-6 text-center">{error}</p>;
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
    <ul className="space-y-2">
      {videos.map((v) => (
        <li key={v.id}>
          <VideoRow video={v} onClick={() => onSelect(v)} />
        </li>
      ))}
    </ul>
  );
}

function VideoRow({
  video,
  onClick,
}: {
  video: CourseVideo;
  onClick: () => void;
}) {
  const thumb = videoThumbnail(video);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-2 rounded-2xl bg-surface-card hover:bg-surface-raised transition-colors text-right"
    >
      <div className="relative shrink-0 w-24 aspect-video rounded-xl overflow-hidden bg-surface-base">
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-500">
            <Play size={18} />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="w-8 h-8 rounded-full bg-black/55 flex items-center justify-center">
            <Play size={14} className="text-cream-50 ms-0.5" fill="currentColor" />
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-100 font-medium line-clamp-2">
          {video.title}
        </div>
        {video.duration_sec ? (
          <div className="text-xs text-ink-300 mt-1">
            {formatDuration(video.duration_sec)}
          </div>
        ) : null}
      </div>
    </button>
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
