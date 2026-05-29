// ============================================================================
// BookVideosSheet — the modal that opens when a user taps a book.
// ----------------------------------------------------------------------------
// Lifecycle: the parent (Course screen) controls `open` + `book`. We fetch
// the videos on first open and again whenever the book id changes. Closing
// resets the inline player so the next book opens fresh.
//
// Two states:
//   1. List — vertical list of videos for the book.
//   2. Player — inline embedded player (YouTube or Drive). Back returns
//      to the list without closing the sheet.
// ============================================================================
import { useEffect, useState } from 'react';
import { X, ChevronRight, Play, BookOpen } from 'lucide-react';
import {
  fetchVideos,
  videoEmbedUrl,
  videoThumbnail,
  type CourseBookWithCount,
  type CourseVideo,
} from './queries';

type Props = {
  open: boolean;
  book: CourseBookWithCount | null;
  onClose: () => void;
};

export function BookVideosSheet({ open, book, onClose }: Props) {
  const [videos, setVideos] = useState<CourseVideo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<CourseVideo | null>(null);

  // Fetch whenever the sheet opens with a (new) book.
  useEffect(() => {
    if (!open || !book) {
      setVideos(null);
      setPlaying(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPlaying(null);
    fetchVideos(book.id)
      .then((rows) => {
        if (cancelled) return;
        setVideos(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'שגיאה בטעינה';
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, book]);

  if (!open || !book) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-surface-border">
          <button
            onClick={playing ? () => setPlaying(null) : onClose}
            className="p-1 text-ink-300 hover:text-ink-100"
            aria-label={playing ? 'חזרה לרשימת הסרטונים' : 'סגור'}
          >
            {playing ? <ChevronRight size={20} /> : <X size={20} />}
          </button>
          <div className="flex-1 min-w-0 px-2 text-center">
            <h2 className="text-base font-semibold text-ink-100 truncate">
              {book.title}
            </h2>
            {book.author && (
              <p className="text-xs text-ink-300 truncate mt-0.5">{book.author}</p>
            )}
          </div>
          <div className="w-7" />
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto themed-scroll">
          {playing ? (
            <Player video={playing} />
          ) : (
            <VideoList
              videos={videos}
              loading={loading}
              error={error}
              description={book.description}
              onSelect={setPlaying}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VideoList — empty / loading / error / populated.
// ---------------------------------------------------------------------------
function VideoList({
  videos,
  loading,
  error,
  description,
  onSelect,
}: {
  videos: CourseVideo[] | null;
  loading: boolean;
  error: string | null;
  description: string | null;
  onSelect: (v: CourseVideo) => void;
}) {
  if (loading) {
    return <p className="text-ink-300 text-sm py-10 text-center">טוען…</p>;
  }
  if (error) {
    return <p className="text-red-400 text-sm py-10 text-center">{error}</p>;
  }
  if (!videos || videos.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <BookOpen size={28} className="text-ink-500 mx-auto mb-3" />
        <p className="text-ink-100 font-medium">סרטוני סיכום בקרוב</p>
        <p className="text-ink-300 text-sm mt-1">
          סרטוני הסיכום של הספר הזה עוד לא הועלו.
        </p>
      </div>
    );
  }
  return (
    <div className="px-4 py-4 space-y-3">
      {description && (
        <p className="text-ink-300 text-sm leading-relaxed px-1 pb-1">
          {description}
        </p>
      )}
      {videos.map((v) => (
        <VideoRow key={v.id} video={v} onClick={() => onSelect(v)} />
      ))}
    </div>
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
      className="w-full flex items-center gap-3 p-2 rounded-2xl bg-surface-raised hover:bg-surface-border transition-colors text-right"
    >
      <div className="relative shrink-0 w-28 aspect-video rounded-xl overflow-hidden bg-surface-base">
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-500">
            <Play size={20} />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="w-9 h-9 rounded-full bg-black/55 flex items-center justify-center">
            <Play size={16} className="text-cream-50 ms-0.5" fill="currentColor" />
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

// ---------------------------------------------------------------------------
// Player — embedded iframe. Same height ratio (16:9) for any provider.
// ---------------------------------------------------------------------------
function Player({ video }: { video: CourseVideo }) {
  return (
    <div className="px-3 py-4 space-y-3">
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
        <iframe
          src={videoEmbedUrl(video)}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>
      <h3 className="text-base font-semibold text-ink-100 px-1">{video.title}</h3>
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
