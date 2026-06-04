// ============================================================================
// Vision images — upload + signed-URL access.
// ----------------------------------------------------------------------------
// Storage layout: `vision-images/{userId}/{uuid}.jpg`. The bucket is PRIVATE
// (see migration 0022) so reads always go through a short-lived signed URL.
//
// Images are downscaled to a max edge of 1600 px and re-encoded as JPEG/0.85
// before upload — large enough for sharp mobile viewing, small enough that a
// vision page with multiple images stays cheap to fetch.
// ============================================================================
import { supabase } from '../../lib/supabase';

const BUCKET = 'vision-images';
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;
/** 7 days. The editor regenerates URLs on every mount, so the only constraint
 *  is that a URL must outlive one editing session. */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

export type UploadedVisionImage = {
  /** Storage path — persisted in the Tiptap doc. */
  path: string;
  /** Signed URL for immediate use (display right after upload). */
  url: string;
  /** Natural pixel dimensions of the resized image (for layout hinting). */
  width: number;
  height: number;
};

/**
 * Resize + re-encode `file` to a JPEG that fits inside MAX_EDGE × MAX_EDGE.
 * Falls back to the original file if the canvas pipeline fails (e.g. an
 * unsupported codec) — upload still proceeds with whatever the user gave us.
 */
async function resizeImage(
  file: File,
): Promise<{ blob: Blob; ext: string; width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d ctx');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error('toBlob returned null');
    return { blob, ext: 'jpg', width: w, height: h };
  } catch {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    return { blob: file, ext, width: 0, height: 0 };
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Upload a single image picked by the user (file input, paste, or drop) into
 * their vision-images folder and return the storage path + a signed URL ready
 * to embed in the editor.
 */
export async function uploadVisionImage(
  userId: string,
  file: File,
): Promise<UploadedVisionImage> {
  const { blob, ext, width, height } = await resizeImage(file);
  const path = `${userId}/${randomId()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: false,
    });
  if (uploadErr) throw uploadErr;

  const url = await signVisionImage(path);
  rememberSignedUrl(path, url);
  return { path, url, width, height };
}

// ─── Signed-URL cache ───────────────────────────────────────────────────────
// Image NodeViews ask for a signed URL the moment they mount. Without a cache
// we'd hit Supabase once per <img> per render — even when the same image
// renders inside multiple entries (or after a re-render). The cache is keyed
// by storage path, with a TTL trimmed to 90 % of the URL's real lifetime so a
// cached URL never sneaks past its expiry.

type CachedUrl = { url: string; expiresAt: number };
const signedUrlCache = new Map<string, CachedUrl>();

function rememberSignedUrl(path: string, url: string): void {
  signedUrlCache.set(path, {
    url,
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 * 0.9,
  });
}

export function getCachedSignedUrl(path: string): string | null {
  const hit = signedUrlCache.get(path);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    signedUrlCache.delete(path);
    return null;
  }
  return hit.url;
}

/**
 * Generate a signed URL for a stored vision image. The TTL is long (7 days)
 * because the editor re-signs every URL on mount — a stale URL in a saved doc
 * is never actually loaded; it's replaced before the <img> ever renders.
 */
export async function signVisionImage(path: string): Promise<string> {
  const cached = getCachedSignedUrl(path);
  if (cached) return cached;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  rememberSignedUrl(path, data.signedUrl);
  return data.signedUrl;
}

/**
 * Batch-sign a list of storage paths. Returns a map { path → url }; paths that
 * fail to sign are simply omitted (the editor falls back to the broken-image
 * glyph for those — better than tearing down the whole entry).
 */
export async function signVisionImages(
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) {
      out[row.path] = row.signedUrl;
      rememberSignedUrl(row.path, row.signedUrl);
    }
  }
  return out;
}
