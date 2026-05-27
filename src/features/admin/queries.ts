import { supabase } from '../../lib/supabase';
import type { Profile } from './types';

// Per-user activity totals derived from habit_logs.
// Returned for every user shown in the admin list.
export type UserActivity = {
  user_id: string;
  v_count: number;
  x_count: number;
  habit_count: number;
  log_score: number; // V*5 + X*-3 (no streak bonuses — admin overview only)
};

export async function fetchAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('last_seen_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Profile[];
}

// Lightweight activity rollup. Admin sees one summary number per user; we
// don't need the full scoring pipeline (bonuses, etc.) — that's per-user
// and shown inside that user's own UI.
export async function fetchActivityRollup(): Promise<Map<string, UserActivity>> {
  const [logsRes, habitsRes] = await Promise.all([
    supabase.from('habit_logs').select('user_id,status'),
    supabase.from('habits').select('user_id,archived_at'),
  ]);
  if (logsRes.error) throw logsRes.error;
  if (habitsRes.error) throw habitsRes.error;

  const map = new Map<string, UserActivity>();
  const get = (uid: string): UserActivity => {
    let r = map.get(uid);
    if (!r) {
      r = { user_id: uid, v_count: 0, x_count: 0, habit_count: 0, log_score: 0 };
      map.set(uid, r);
    }
    return r;
  };

  for (const row of logsRes.data ?? []) {
    const r = get(row.user_id as string);
    if (row.status === 'V') {
      r.v_count++;
      r.log_score += 5;
    } else if (row.status === 'X' || row.status === 'auto_x') {
      r.x_count++;
      r.log_score -= 3;
    }
  }
  for (const row of habitsRes.data ?? []) {
    if ((row as { archived_at: string | null }).archived_at !== null) continue;
    const r = get(row.user_id as string);
    r.habit_count++;
  }

  return map;
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<Profile, 'blocked' | 'trees_planted' | 'score_adjustment' | 'display_name'>>,
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

// Deletes a user's activity data (habits + assignments + logs cascade from
// the habits row). Leaves the profile row in place so the user can still
// log in — they'll just see an empty app.
export async function deleteUserActivity(userId: string): Promise<void> {
  // Logs and assignments cascade off habits; deleting habits is enough.
  const { error } = await supabase.from('habits').delete().eq('user_id', userId);
  if (error) throw error;
  // Logs that somehow exist without a habit (shouldn't, but defensive):
  await supabase.from('habit_logs').delete().eq('user_id', userId);
  await supabase.from('habit_slot_assignments').delete().eq('user_id', userId);
}
