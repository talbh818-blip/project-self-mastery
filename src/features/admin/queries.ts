import { supabase } from '../../lib/supabase';
import { resizeAvatar } from '../user/mutations';
import type { Profile, SupportTicket, TicketStatus, TicketWithSubmitter } from './types';

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

// Fields the admin is allowed to write through the edit sheet. Privacy
// fields (vision_visibility, habits_visibility) are intentionally omitted —
// per the spec, the admin must NOT touch a user's privacy settings.
// avatar_url, tree_placements, cycle_score_floor are also off-limits here:
// they're set by other flows (avatar upload sheet, planting action) where
// stomping on them would create user-visible inconsistencies.
export type ProfileAdminPatch = Partial<
  Pick<
    Profile,
    | 'display_name'
    | 'email'
    | 'first_name'
    | 'last_name'
    | 'phone'
    | 'gender'
    | 'theme'
    | 'trees_planted'
    | 'score_adjustment'
    | 'blocked'
    | 'avatar_url'
  >
>;

export async function updateProfile(
  userId: string,
  patch: ProfileAdminPatch,
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

// Uploads a new avatar for `targetUserId` and returns its public URL.
// The file is parked under the ADMIN's own folder (RLS only lets a user
// write to {auth.uid()}/...) so the upload doesn't require a separate
// admin storage policy. The URL is then written to the target's profile.
// Caller is responsible for actually persisting avatar_url — this returns
// the URL so it can be folded into the same updateProfile() patch.
export async function uploadAvatarForUser(
  adminUserId: string,
  targetUserId: string,
  file: File,
): Promise<string> {
  const { blob, ext } = await resizeAvatar(file);
  // Path: {adminUid}/admin-avatar-{targetUid}-{timestamp}.{ext}
  // Keeping the target's uid in the filename makes the bucket auditable
  // without having to look anything up.
  const path = `${adminUserId}/admin-avatar-${targetUserId}-${Date.now()}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: true,
    });
  if (uploadErr) throw uploadErr;
  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  // Cache-buster — same trick as the user's own avatar upload.
  return `${pub.publicUrl}?v=${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Support tickets — feedback + support submissions from the User screen.
// Admin RLS (migration 0012) lets admins read/update every row.
// ---------------------------------------------------------------------------
export async function fetchAllTickets(): Promise<TicketWithSubmitter[]> {
  // Two queries instead of a join: PostgREST joins via foreign-key embedding
  // work only when an FK to profiles exists; here support_tickets.user_id
  // points at auth.users, not public.profiles. Fetching profiles separately
  // and zipping them client-side is robust and clearer.
  const { data: tickets, error: tErr } = await supabase
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });
  if (tErr) throw tErr;
  const ticketRows = (tickets ?? []) as SupportTicket[];
  if (ticketRows.length === 0) return [];

  const userIds = Array.from(new Set(ticketRows.map((t) => t.user_id)));
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id,display_name,email,avatar_url')
    .in('id', userIds);
  if (pErr) throw pErr;

  const byId = new Map<
    string,
    { display_name: string | null; email: string | null; avatar_url: string | null }
  >();
  for (const p of profiles ?? []) {
    const row = p as { id: string; display_name: string | null; email: string | null; avatar_url: string | null };
    byId.set(row.id, {
      display_name: row.display_name,
      email: row.email,
      avatar_url: row.avatar_url,
    });
  }
  return ticketRows.map((t) => ({ ...t, submitter: byId.get(t.user_id) ?? null }));
}

export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus,
): Promise<void> {
  const { error } = await supabase
    .from('support_tickets')
    .update({ status })
    .eq('id', ticketId);
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
