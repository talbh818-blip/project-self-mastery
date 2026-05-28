import { supabase } from '../../lib/supabase';
import type { Theme } from '../admin/types';

// Updates the editable identity fields. Null clears the field; undefined
// leaves it untouched.
export async function updateProfileFields(
  userId: string,
  fields: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', userId);
  if (error) throw error;
}

export async function updateTheme(userId: string, theme: Theme): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ theme })
    .eq('id', userId);
  if (error) throw error;
}

// Downscales the image to fit within 512x512 (preserving aspect) and
// re-encodes to JPEG for size. Returns the resized Blob plus the chosen
// extension. Falls back to the original file if the canvas pipeline fails.
async function resizeAvatar(file: File): Promise<{ blob: Blob; ext: string }> {
  const MAX = 512;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d ctx');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    if (!blob) throw new Error('toBlob returned null');
    return { blob, ext: 'jpg' };
  } catch {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    return { blob: file, ext };
  }
}

// Uploads to the `avatars` bucket under {userId}/avatar-{ts}.{ext}, then
// updates profiles.avatar_url with the public URL.
// Returns the new public URL.
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const { blob, ext } = await resizeAvatar(file);
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: true,
    });
  if (uploadErr) throw uploadErr;

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  // Bust browser caching of the previous avatar URL.
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ avatar_url: url })
    .eq('id', userId);
  if (updateErr) throw updateErr;

  return url;
}

export async function submitTicket(input: {
  userId: string;
  kind: 'feedback' | 'support';
  subject: string | null;
  message: string;
}): Promise<void> {
  const { error } = await supabase.from('support_tickets').insert({
    user_id: input.userId,
    kind: input.kind,
    subject: input.subject ?? null,
    message: input.message,
  });
  if (error) throw error;
}
