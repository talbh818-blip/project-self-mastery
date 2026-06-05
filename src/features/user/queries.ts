import { supabase } from '../../lib/supabase';
import type { PublicProfileRow, PublicProfileDetail } from '../admin/types';

// Fetches the directory of active users for the User screen.
// Calls a SECURITY DEFINER function that returns only safe-to-share columns,
// so even though it crosses user boundaries, no private data (email, phone,
// real name) leaks.
export async function fetchActiveProfiles(): Promise<PublicProfileRow[]> {
  const { data, error } = await supabase.rpc('list_active_profiles');
  if (error) throw error;
  return (data ?? []) as PublicProfileRow[];
}

// Fetches a single user's public-safe profile + visibility checks so the
// UserDetail screen knows what to reveal.
export async function fetchPublicProfile(
  userId: string,
): Promise<PublicProfileDetail | null> {
  const { data, error } = await supabase
    .rpc('get_public_profile', { target: userId })
    .maybeSingle();
  if (error) throw error;
  return (data as PublicProfileDetail | null) ?? null;
}
