import { supabase } from '../../lib/supabase';
import type {
  PublicProfileRow,
  PublicProfileDetail,
  Gender,
  Visibility,
} from '../admin/types';

// One habit as exposed on another user's dashboard (no logs inline).
export type DashboardHabit = {
  id: string;
  name: string;
  icon: string;
  type: 'positive' | 'negative';
  color: string;
  /** % of resolved days marked V; null when nothing logged yet. */
  success_pct: number | null;
  frequency_period: 'daily' | 'weekly' | 'monthly';
  frequency_target: number;
  /** YYYY-MM-DD the (active) assignment started. */
  start_date: string | null;
  /** Number of days marked V (all-time). */
  v_count: number;
  /** Log-based points (V=+5, X/auto_x=-3), matching the admin score column. */
  total_points: number;
};

// Per-day count of successful (V) marks across the user's habits.
export type DailyV = { date: string; v: number };

// Shape returned by get_user_dashboard(target). habits/daily present only
// when can_view_habits is true.
export type UserDashboard = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  gender: Gender | null;
  created_at: string;
  trees_planted: number;
  score: number;
  habit_count: number;
  vision_count: number;
  habits_visibility: Visibility;
  /** This user explicitly shared their habits with the current viewer. */
  shared_with_me: boolean;
  can_view_habits: boolean;
  habits?: DashboardHabit[];
  daily?: DailyV[];
};

export async function fetchUserDashboard(
  target: string,
): Promise<UserDashboard | null> {
  const { data, error } = await supabase.rpc('get_user_dashboard', { target });
  if (error) throw error;
  return (data as UserDashboard | null) ?? null;
}

// Fetches the directory of active users for the User screen.
// Calls a SECURITY DEFINER function that returns only safe-to-share columns,
// so even though it crosses user boundaries, no private data (email, phone,
// real name) leaks.
export async function fetchActiveProfiles(): Promise<PublicProfileRow[]> {
  const { data, error } = await supabase.rpc('list_active_profiles');
  if (error) throw error;
  return (data ?? []) as PublicProfileRow[];
}

// Returns the viewer ids the current owner has shared their habits with
// (resource_type='habits'). Used to pre-check the partner picker.
export async function fetchMyHabitShares(ownerId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('visibility_shares')
    .select('viewer_id')
    .eq('owner_id', ownerId)
    .eq('resource_type', 'habits');
  if (error) throw error;
  return (data ?? []).map((r) => (r as { viewer_id: string }).viewer_id);
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
