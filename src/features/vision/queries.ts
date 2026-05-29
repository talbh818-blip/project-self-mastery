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
  created_at: string;
  updated_at: string;
};

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
