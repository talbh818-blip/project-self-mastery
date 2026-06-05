// ============================================================================
// Course books + videos — reads.
// ----------------------------------------------------------------------------
// The course screen needs two pieces of data:
//   1. The full shelf of books (with a per-book videoCount so books that
//      don't have summaries yet can render grayed out).
//   2. The videos for a given book, fetched on-demand when the user opens
//      a book's sheet.
//
// Writes (admin CRUD on the catalog) live in mutations.ts when added later —
// for V1 the admin manages content via the Supabase dashboard.
// ============================================================================
import { supabase } from '../../lib/supabase';

export type VideoProvider = 'youtube' | 'drive';

export type CourseBook = {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  description: string | null;
  sort_order: number;
  is_published: boolean;
};

export type CourseBookWithCount = CourseBook & {
  videoCount: number;
};

export type CourseVideo = {
  id: string;
  book_id: string;
  title: string;
  provider: VideoProvider;
  source_id: string;
  thumbnail_url: string | null;
  duration_sec: number | null;
  sort_order: number;
};

// ---------------------------------------------------------------------------
// fetchBooks — returns every published book plus a videoCount used by the UI
// to grey out empty books.
//
// We do two parallel queries instead of an aggregate join: the books table is
// small (<100 rows) and the video count map is also small. This keeps the
// query simple and avoids needing a database view.
// ---------------------------------------------------------------------------
export async function fetchBooks(): Promise<CourseBookWithCount[]> {
  const [booksRes, videosRes] = await Promise.all([
    supabase
      .from('course_books')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase.from('course_videos').select('book_id'),
  ]);

  if (booksRes.error) throw booksRes.error;
  if (videosRes.error) throw videosRes.error;

  const counts = new Map<string, number>();
  for (const row of (videosRes.data ?? []) as { book_id: string }[]) {
    counts.set(row.book_id, (counts.get(row.book_id) ?? 0) + 1);
  }

  return (booksRes.data as CourseBook[]).map((b) => ({
    ...b,
    videoCount: counts.get(b.id) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// fetchAllBooksAdmin — like fetchBooks but INCLUDES unpublished books, for the
// admin panel. RLS still requires admin to even see the rows differently; the
// read policy is world-read, so the is_published filter is the only difference
// from fetchBooks. Admin needs to manage hidden books too.
// ---------------------------------------------------------------------------
export async function fetchAllBooksAdmin(): Promise<CourseBookWithCount[]> {
  const [booksRes, videosRes] = await Promise.all([
    supabase
      .from('course_books')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase.from('course_videos').select('book_id'),
  ]);

  if (booksRes.error) throw booksRes.error;
  if (videosRes.error) throw videosRes.error;

  const counts = new Map<string, number>();
  for (const row of (videosRes.data ?? []) as { book_id: string }[]) {
    counts.set(row.book_id, (counts.get(row.book_id) ?? 0) + 1);
  }

  return (booksRes.data as CourseBook[]).map((b) => ({
    ...b,
    videoCount: counts.get(b.id) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// fetchVideos — videos for one book, in display order.
// ---------------------------------------------------------------------------
export async function fetchVideos(bookId: string): Promise<CourseVideo[]> {
  const { data, error } = await supabase
    .from('course_videos')
    .select('*')
    .eq('book_id', bookId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CourseVideo[];
}

// ---------------------------------------------------------------------------
// Player URL + thumbnail helpers — small enough to live here next to the
// types, and shared by the sheet and any future inline player.
// ---------------------------------------------------------------------------
export function videoEmbedUrl(v: Pick<CourseVideo, 'provider' | 'source_id'>): string {
  if (v.provider === 'youtube') {
    // youtube-nocookie + rel=0 keeps the player focused on the current video
    // without "related videos" from other channels at the end.
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.source_id)}?rel=0&modestbranding=1`;
  }
  // Google Drive shared file preview. The user must have set link sharing
  // to "anyone with the link". Drive ignores rel/modestbranding params.
  return `https://drive.google.com/file/d/${encodeURIComponent(v.source_id)}/preview`;
}

export function videoThumbnail(v: CourseVideo): string | null {
  if (v.thumbnail_url) return v.thumbnail_url;
  if (v.provider === 'youtube') {
    return `https://i.ytimg.com/vi/${encodeURIComponent(v.source_id)}/hqdefault.jpg`;
  }
  return null;
}
