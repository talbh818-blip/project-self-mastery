// ============================================================================
// Course books + videos — writes (admin only).
// ----------------------------------------------------------------------------
// RLS (migration 0016) restricts insert/update/delete to is_admin(), so these
// functions only succeed for the app owner. The UI gates them behind the
// admin panel; RLS is the real enforcement.
//
// All mutations use `.select().maybeSingle()` (or `.select()`) so a silent
// RLS denial surfaces as data: null rather than a false success.
// ============================================================================
import { supabase } from '../../lib/supabase';
import type { CourseBook, CourseVideo, VideoProvider } from './queries';

// ─── Books ──────────────────────────────────────────────────────────────────

export type BookInput = {
  title: string;
  author: string | null;
  cover_url: string | null;
  description: string | null;
  sort_order: number;
  is_published: boolean;
};

export async function createBook(input: BookInput): Promise<CourseBook> {
  const { data, error } = await supabase
    .from('course_books')
    .insert(input)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('ההוספה נדחתה (אין הרשאת אדמין?)');
  return data as CourseBook;
}

export async function updateBook(
  id: string,
  patch: Partial<BookInput>,
): Promise<CourseBook> {
  const { data, error } = await supabase
    .from('course_books')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('העדכון נדחה (אין הרשאת אדמין?)');
  return data as CourseBook;
}

export async function deleteBook(id: string): Promise<void> {
  // Videos cascade via the FK (on delete cascade, migration 0016).
  const { error } = await supabase.from('course_books').delete().eq('id', id);
  if (error) throw error;
}

// ─── Videos ─────────────────────────────────────────────────────────────────

export type VideoInput = {
  book_id: string;
  title: string;
  provider: VideoProvider;
  source_id: string;
  thumbnail_url: string | null;
  duration_sec: number | null;
  sort_order: number;
};

export async function createVideo(input: VideoInput): Promise<CourseVideo> {
  const { data, error } = await supabase
    .from('course_videos')
    .insert(input)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('ההוספה נדחתה (אין הרשאת אדמין?)');
  return data as CourseVideo;
}

export async function updateVideo(
  id: string,
  patch: Partial<Omit<VideoInput, 'book_id'>>,
): Promise<CourseVideo> {
  const { data, error } = await supabase
    .from('course_videos')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('העדכון נדחה (אין הרשאת אדמין?)');
  return data as CourseVideo;
}

export async function deleteVideo(id: string): Promise<void> {
  const { error } = await supabase.from('course_videos').delete().eq('id', id);
  if (error) throw error;
}

// ─── URL → source-id parsing ─────────────────────────────────────────────────
// The admin pastes either a full share URL or a bare id. We extract the id so
// the player URL builder (videoEmbedUrl) gets a clean value.

/**
 * Accepts any of:
 *   https://www.youtube.com/watch?v=ID
 *   https://youtu.be/ID
 *   https://www.youtube.com/embed/ID
 *   https://www.youtube.com/shorts/ID
 *   ID (bare 11-char id)
 * Returns the 11-char id, or null if nothing id-like is found.
 */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // Bare id — YouTube ids are 11 chars of [A-Za-z0-9_-].
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s);
    // youtu.be/ID
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    // youtube.com/watch?v=ID
    const v = url.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    // youtube.com/embed/ID  or  /shorts/ID
    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^[A-Za-z0-9_-]{11}$/.test(last)) return last;
  } catch {
    // not a URL — fall through
  }
  return null;
}

/**
 * Accepts any of:
 *   https://drive.google.com/file/d/FILEID/view?...
 *   https://drive.google.com/open?id=FILEID
 *   https://drive.google.com/uc?id=FILEID
 *   FILEID (bare)
 * Returns the file id, or null.
 */
export function parseDriveId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // Bare id — Drive file ids are long [A-Za-z0-9_-], typically 25+ chars.
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;
  try {
    const url = new URL(s);
    const id = url.searchParams.get('id');
    if (id) return id;
    // /file/d/FILEID/...
    const m = url.pathname.match(/\/d\/([A-Za-z0-9_-]+)/);
    if (m) return m[1];
  } catch {
    // not a URL
  }
  return null;
}

/** Dispatch to the right parser for the chosen provider. */
export function parseSourceId(
  provider: VideoProvider,
  input: string,
): string | null {
  return provider === 'youtube' ? parseYouTubeId(input) : parseDriveId(input);
}
