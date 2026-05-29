// ============================================================================
// Course screen — a horizontal shelf of self-development books.
// ----------------------------------------------------------------------------
// V1 layout:
//   • Title (small) at the top.
//   • Horizontally scrolling row of book "cards". Each card is a small 3D
//     book illustration — cover face + a thin spine on the right giving a
//     stacked-book feel. Books without any uploaded summary videos render
//     greyed-out with a "בקרוב" pill so users see the catalog growing.
//   • Tapping a book opens BookVideosSheet with that book's videos.
//
// The catalog itself comes from Supabase (course_books + course_videos, see
// migration 0016). Admin manages content via dashboard for now — no admin UI
// in the app yet.
// ============================================================================
import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import {
  fetchBooks,
  type CourseBookWithCount,
} from '../features/course/queries';
import { BookVideosSheet } from '../features/course/BookVideosSheet';

export function Course() {
  const [books, setBooks] = useState<CourseBookWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeBook, setActiveBook] = useState<CourseBookWithCount | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBooks()
      .then((rows) => {
        if (!cancelled) setBooks(rows);
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

  return (
    <section className="-mt-3 pb-6 space-y-4">
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
        <BookShelf books={books} onSelect={setActiveBook} />
      )}

      <BookVideosSheet
        open={!!activeBook}
        book={activeBook}
        onClose={() => setActiveBook(null)}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// BookShelf — horizontal scroll, RTL, with snap so each card lands cleanly.
// We render extra side padding via the first/last child margins so the first
// book sits a hair from the screen edge (feels like a real shelf).
// ---------------------------------------------------------------------------
function BookShelf({
  books,
  onSelect,
}: {
  books: CourseBookWithCount[];
  onSelect: (b: CourseBookWithCount) => void;
}) {
  return (
    <div
      dir="rtl"
      className="-mx-3 sm:-mx-4 overflow-x-auto themed-scroll"
    >
      <ul className="flex gap-3 px-3 sm:px-4 pb-3 snap-x snap-mandatory">
        {books.map((b) => (
          <li key={b.id} className="snap-start shrink-0">
            <BookCard book={b} onClick={() => onSelect(b)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BookCard — a 3D-looking book. Width 132px, aspect ~2:3 (cover face).
// Right-side spine (in RTL DOM order, first child renders right) is a thin
// strip that creates the depth illusion.
// Disabled (videoCount === 0): full card desaturated + "בקרוב" pill.
// ---------------------------------------------------------------------------
function BookCard({
  book,
  onClick,
}: {
  book: CourseBookWithCount;
  onClick: () => void;
}) {
  const available = book.videoCount > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group block w-[132px] text-right"
      aria-label={`${book.title}${available ? '' : ' (בקרוב)'}`}
    >
      {/* Book body — flex row: spine (right) + cover (left). */}
      <div
        className={`relative flex h-[196px] rounded-md overflow-hidden shadow-lg shadow-black/30 transition-transform group-hover:-translate-y-1 ${
          available ? '' : 'opacity-40 grayscale'
        }`}
      >
        {/* Spine — first DOM child = right in RTL */}
        <div
          className="shrink-0 w-2 bg-gradient-to-l from-black/40 to-transparent"
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
            <PlaceholderCover title={book.title} />
          )}
          {/* Subtle gloss on the cover edge near the spine to sell the 3D. */}
          <div
            className="absolute inset-y-0 right-0 w-3 bg-gradient-to-l from-white/15 to-transparent pointer-events-none"
            aria-hidden
          />
        </div>

        {/* "בקרוב" pill — sits inside the card, top-left corner */}
        {!available && (
          <span className="absolute top-2 left-2 text-[10px] bg-black/60 text-cream-50 px-2 py-0.5 rounded-full">
            בקרוב
          </span>
        )}
      </div>

      {/* Caption */}
      <div className="mt-2 px-0.5">
        <div className="text-[13px] text-ink-100 font-medium leading-tight line-clamp-2">
          {book.title}
        </div>
        {book.author && (
          <div className="text-[11px] text-ink-300 mt-0.5 line-clamp-1">
            {book.author}
          </div>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// PlaceholderCover — used when a book has no cover_url yet. Forest-tinted
// gradient + the title in cream. Looks like a designer cover at small sizes
// and lets the catalog look populated before admin uploads real art.
// ---------------------------------------------------------------------------
function PlaceholderCover({ title }: { title: string }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-between p-2.5 bg-gradient-to-br from-forest-700 to-forest-900">
      <div className="text-[10px] text-cream-50/60 tracking-wider">קורס</div>
      <div className="text-[13px] text-cream-50 font-semibold leading-tight line-clamp-4">
        {title}
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
