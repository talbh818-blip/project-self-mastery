// ============================================================================
// Vision entries — reads.
// ============================================================================
import { supabase } from '../../lib/supabase';
import type { VisionScope } from './period';
import { isVisionContentEmpty } from './content';

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

/**
 * Fetch every vision row (period_key + icon + content) a user has for ONE
 * scope. Used by the "look back" panel to list all periods of a scope from
 * newest to oldest, filling gaps with empty cards. Scope is pinned so a weekly
 * period_key (YYYY-MM-DD) never picks up a daily row that shares the shape.
 */
export async function fetchVisionEntriesForScope(
  userId: string,
  scope: VisionScope,
): Promise<VisionRowMeta[]> {
  const { data, error } = await supabase
    .from('vision_entries')
    .select('scope, period_key, icon, content')
    .eq('user_id', userId)
    .eq('scope', scope);
  if (error) throw error;
  return (data ?? []) as VisionRowMeta[];
}

/**
 * Count how many visions the user has actually WRITTEN — i.e. rows whose
 * content is non-empty (a row is created empty the moment a period is opened,
 * so a plain row count would overstate it). Fetches just the content column for
 * the user's rows and filters client-side with `isVisionContentEmpty`.
 */
export async function fetchWrittenVisionCount(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('vision_entries')
    .select('content')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).filter(
    (r) => !isVisionContentEmpty((r as { content: unknown }).content),
  ).length;
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
