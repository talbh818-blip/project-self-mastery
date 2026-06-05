// ============================================================================
// Vision images — upload + signed-URL access.
// ----------------------------------------------------------------------------
// Storage layout: `vision-images/{userId}/{uuid}.jpg`. The bucket is PRIVATE
// (see migration 0022) so reads always go through a short-lived signed URL.
//
// Images are downscaled to a max edge of 1280 px and re-encoded as JPEG/0.78
// before upload — small enough that a vision page full of photos still feels
// instant on a phone, sharp enough that the page doesn't look like a fax.
//
// PERFORMANCE NOTE: signed URLs are cached in BOTH memory and localStorage.
// Without the localStorage tier, every page refresh would re-sign every
// image (full network round trip) AND the URL would change — invalidating
// the browser's image cache too. With it, the same URL comes back on every
// refresh until the 7-day TTL expires, so the browser's HTTP cache for the
// JPEG itself stays warm. That's where the Google-Docs-feel comes from.
// ============================================================================
import { supabase } from '../../lib/supabase';

const BUCKET = 'vision-images';
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.78;
/** 7 days. New uploads cache locally for almost this long, so a doc that
 *  was open yesterday still paints its images on first frame today. */
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

// ─── Signed-URL cache (memory + localStorage two-tier) ──────────────────────
// Memory is fast for in-session reads (and is the only thing tab-isolated
// contexts get). localStorage survives refreshes — that's what makes a
// refreshed page paint its images on the first frame instead of waiting for
// a sign-then-load round trip.

type CachedUrl = { url: string; expiresAt: number };
const signedUrlCache = new Map<string, CachedUrl>();

const LS_PREFIX = 'vision-img-url:';
const lsKey = (path: string) => LS_PREFIX + path;

function readLsUrl(path: string): CachedUrl | null {
  try {
    const raw = localStorage.getItem(lsKey(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedUrl>;
    if (typeof parsed?.expiresAt !== 'number' || typeof parsed.url !== 'string') {
      return null;
    }
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(lsKey(path));
      return null;
    }
    return parsed as CachedUrl;
  } catch {
    return null;
  }
}

function writeLsUrl(path: string, entry: CachedUrl): void {
  try {
    localStorage.setItem(lsKey(path), JSON.stringify(entry));
  } catch {
    // Quota exhausted / private-mode write block — caching is best-effort,
    // missing the LS layer just degrades to "sign on first paint after
    // refresh", which is no worse than before this layer existed.
  }
}

function rememberSignedUrl(path: string, url: string): void {
  const entry: CachedUrl = {
    url,
    // Trim to 90 % of the real TTL so a cached URL never sneaks past expiry.
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 * 0.9,
  };
  signedUrlCache.set(path, entry);
  writeLsUrl(path, entry);
}

/**
 * SYNCHRONOUS cache lookup — checks memory first, then localStorage. Used by
 * NodeViews to render with the right `src` on the very first frame, with no
 * skeleton flash. Returns null when the path has no cached URL or the entry
 * has expired.
 */
export function getCachedSignedUrl(path: string): string | null {
  const memHit = signedUrlCache.get(path);
  if (memHit) {
    if (Date.now() <= memHit.expiresAt) return memHit.url;
    signedUrlCache.delete(path);
  }
  const lsHit = readLsUrl(path);
  if (lsHit) {
    // Warm the memory tier so subsequent lookups in the same session skip
    // even the localStorage parse cost.
    signedUrlCache.set(path, lsHit);
    return lsHit.url;
  }
  return null;
}

/**
 * Generate (or reuse) a signed URL for a stored vision image. Returns
 * immediately when either cache tier has a hit. The TTL matches the LS cache
 * lifetime so a freshly-signed URL is good through the whole 7-day window.
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
