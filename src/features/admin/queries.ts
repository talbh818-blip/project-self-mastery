import { supabase } from '../../lib/supabase';
import { resizeAvatar } from '../user/mutations';
import { computeUserStats } from '../habits/scoring';
import type { Habit, HabitLog, SlotAssignment } from '../habits/types';
import type { Profile, SupportTicket, TicketStatus, TicketWithSubmitter } from './types';

// Per-user activity totals derived from habit_logs.
// Returned for every user shown in the admin list.
export type UserActivity = {
  user_id: string;
  v_count: number; // raw V marks (taps), partials included — an activity tally
  x_count: number;
  habit_count: number;
  /** Real engine score (computeUserStats): snapshot-aware completion,
   *  auto-miss penalties and streak bonuses — the same number the user sees
   *  under their tree, EXCLUDING score_adjustment (the screen adds it). */
  log_score: number;
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
//
// habit_count uses the SAME definition as list_active_profiles() in
// migration 0028: "distinct habits currently sitting in a slot (open
// assignment) and not archived". Counting every non-archived row in
// `habits` is wrong because habits are immutable history — when a slot
// gets swapped, the old row sticks around so its log history stays
// inspectable. Without the assignment filter, a user who has cycled
// through 14 habits but only tracks 3 right now shows up as 14.
export async function fetchActivityRollup(): Promise<Map<string, UserActivity>> {
  // Full rows — the engine needs amounts, target snapshots and assignment
  // windows. Admin RLS (migration 0012) grants read over every user's rows.
  const [logsRes, habitsRes, assignmentsRes] = await Promise.all([
    supabase.from('habit_logs').select('*'),
    supabase.from('habits').select('*'),
    supabase.from('habit_slot_assignments').select('*'),
  ]);
  if (logsRes.error) throw logsRes.error;
  if (habitsRes.error) throw habitsRes.error;
  if (assignmentsRes.error) throw assignmentsRes.error;

  const logs = (logsRes.data ?? []) as HabitLog[];
  const habits = (habitsRes.data ?? []) as Habit[];
  const assignments = (assignmentsRes.data ?? []) as SlotAssignment[];

  // Set of habit_ids that currently have an open slot assignment.
  const habitsWithOpenAssignment = new Set<string>();
  for (const a of assignments) {
    if (a.end_date === null) habitsWithOpenAssignment.add(a.habit_id);
  }

  const map = new Map<string, UserActivity>();
  const get = (uid: string): UserActivity => {
    let r = map.get(uid);
    if (!r) {
      r = { user_id: uid, v_count: 0, x_count: 0, habit_count: 0, log_score: 0 };
      map.set(uid, r);
    }
    return r;
  };

  for (const row of logs) {
    const r = get(row.user_id);
    if (row.status === 'V') {
      r.v_count++;
    } else if (row.status === 'X' || row.status === 'auto_x') {
      r.x_count++;
    }
  }
  for (const h of habits) {
    if (h.archived_at !== null) continue;
    if (!habitsWithOpenAssignment.has(h.id)) continue;
    const r = get(h.user_id);
    r.habit_count++;
  }

  // Score each user through the REAL engine — the same computeUserStats the
  // user's own app runs — so the admin list shows the exact number the user
  // sees under their tree (server RPCs use the SQL port of the same rules,
  // migration 0034).
  const today = new Date();
  const byUser = new Map<
    string,
    { habits: Habit[]; assignments: SlotAssignment[]; logs: HabitLog[] }
  >();
  const bucket = (uid: string) => {
    let b = byUser.get(uid);
    if (!b) {
      b = { habits: [], assignments: [], logs: [] };
      byUser.set(uid, b);
    }
    return b;
  };
  for (const h of habits) bucket(h.user_id).habits.push(h);
  for (const a of assignments) bucket(a.user_id).assignments.push(a);
  for (const l of logs) bucket(l.user_id).logs.push(l);
  for (const [uid, b] of byUser) {
    get(uid).log_score = computeUserStats({ ...b, today }).totalScore;
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
