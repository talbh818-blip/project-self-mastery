// ============================================================================
// Vision entries — reads.
// ============================================================================
import { supabase } from '../../lib/supabase';
import type { VisionScope } from './period';

export type VisionEntry = {
  id: string;
  user_id: string;
  scope: VisionScope;
  period_key: string;
  content: unknown; // Tiptap JSON document (or {} when freshly created)
  visibility: 'private' | 'public' | 'specific';
  /** Date stamped at the top of the entry. Defaults (DB-side) to the date
   *  the row was first inserted; the user can override via the DateBar. */
  document_date: string; // 'YYYY-MM-DD'
  /** A Lucide icon name OR a raw emoji char, picked by the user and shown
   *  next to this level's title. null = no icon. See migration 0021. */
  icon: string | null;
  created_at: string;
  updated_at: string;
};

export type VisionRowMeta = {
  scope: VisionScope;
  period_key: string;
  icon: string | null;
  content: unknown;
};

/**
 * Fetch the lightweight per-row metadata (icon + content) for a set of period
 * keys — used to badge all three rows of the layered navigator at once (the
 * chosen icon and a "written" check-mark). Period-key formats are distinct
 * per scope (YYYY / YYYY-MM / YYYY-Www) so an `in (...)` on period_key alone
 * never collides across scopes.
 */
export async function fetchVisionRowMeta(
  userId: string,
  periodKeys: string[],
): Promise<VisionRowMeta[]> {
  if (periodKeys.length === 0) return [];
  const { data, error } = await supabase
    .from('vision_entries')
    .select('scope, period_key, icon, content')
    .eq('user_id', userId)
    .in('period_key', periodKeys);
  if (error) throw error;
  return (data ?? []) as VisionRowMeta[];
}

export async function fetchVisionEntry(
  userId: string,
  scope: VisionScope,
  periodKey: string,
): Promise<VisionEntry | null> {
  const { data, error } = await supabase
    .from('vision_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('scope', scope)
    .eq('period_key', periodKey)
    .maybeSingle();

  if (error) throw error;
  return (data as VisionEntry | null) ?? null;
}
