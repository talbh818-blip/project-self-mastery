// ============================================================================
// Vision entries — writes. Auto-save uses upsertVisionEntry on every change;
// the DateBar uses updateVisionEntryDate to override the document_date
// without touching the content (and without resetting the cursor or the
// debounced auto-save state).
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

/**
 * Set (or clear) the per-entry icon. `icon` is a Lucide icon name, a raw
 * emoji char, or null to remove it. Upserts so it works even before any
 * content has been written for this period.
 */
export async function updateVisionEntryIcon(
  userId: string,
  scope: VisionScope,
  periodKey: string,
  icon: string | null,
): Promise<VisionEntry> {
  const { data, error } = await supabase
    .from('vision_entries')
    .upsert(
      {
        user_id: userId,
        scope,
        period_key: periodKey,
        icon,
      },
      { onConflict: 'user_id,scope,period_key' },
    )
    .select('*')
    .single();

  if (error) throw error;
  return data as VisionEntry;
}

/**
 * Override the user-facing "written on" date for a vision entry.
 * `dateIso` is 'YYYY-MM-DD'. The entry must already exist — call after the
 * first auto-save of content has inserted the row.
 */
export async function updateVisionEntryDate(
  userId: string,
  scope: VisionScope,
  periodKey: string,
  dateIso: string,
): Promise<VisionEntry> {
  const { data, error } = await supabase
    .from('vision_entries')
    .upsert(
      {
        user_id: userId,
        scope,
        period_key: periodKey,
        document_date: dateIso,
      },
      { onConflict: 'user_id,scope,period_key' },
    )
    .select('*')
    .single();

  if (error) throw error;
  return data as VisionEntry;
}
