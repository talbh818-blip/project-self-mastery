// ============================================================================
// Vision entries — writes. Auto-save uses upsertVisionEntry on every change.
// ============================================================================
import { supabase } from '../../lib/supabase';
import type { VisionScope } from './period';
import type { VisionEntry } from './queries';

export async function upsertVisionEntry(
  userId: string,
  scope: VisionScope,
  periodKey: string,
  content: unknown,
): Promise<VisionEntry> {
  const { data, error } = await supabase
    .from('vision_entries')
    .upsert(
      {
        user_id: userId,
        scope,
        period_key: periodKey,
        content,
      },
      { onConflict: 'user_id,scope,period_key' },
    )
    .select('*')
    .single();

  if (error) throw error;
  return data as VisionEntry;
}
