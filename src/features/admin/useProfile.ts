import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { Profile } from './types';

// Bootstraps and tracks the current user's profile row.
//
// On first call after login:
//   - upserts (id, email, display_name, avatar_url, last_seen_at) so the row
//     always exists even if the auth trigger was added after this user signed
//     up (defensive: the SQL trigger normally handles new signups).
//
// `trees_planted` is now read/written exclusively from Supabase. A previous
// version of this hook also migrated a legacy `trees-planted-<userId>` value
// from localStorage on first run, but that one-shot migration is removed:
// (a) it's already run for everyone who'd have benefited, and
// (b) polluted localStorage from old testing sessions was leaking bad values
// into the server, leaving users stuck with an inflated trees_planted (and
// a progress bar that read 0%).
//
// Returns the profile (null while loading or on miss) plus a `refresh()`.
export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      console.error('[useProfile] fetch failed:', error);
      return null;
    }
    return (data as Profile | null) ?? null;
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      // Defensive upsert + heartbeat. The auth trigger creates the row on
      // signup, but this also handles cases where the migration was added
      // after the user already existed. Never touches trees_planted —
      // server is the source of truth for that field now.
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const display =
        (meta.full_name as string | undefined) ??
        (meta.name as string | undefined) ??
        user.email?.split('@')[0] ??
        null;
      const avatar = (meta.avatar_url as string | undefined) ?? null;

      const existing = await fetchProfile(user.id);

      const upsertRow: Partial<Profile> & { id: string } = {
        id: user.id,
        email: user.email ?? null,
        display_name: existing?.display_name ?? display,
        avatar_url: existing?.avatar_url ?? avatar,
        last_seen_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase
        .from('profiles')
        .upsert(upsertRow, { onConflict: 'id' });
      if (upErr) {
        console.error('[useProfile] upsert failed:', upErr);
      }

      // Best-effort: clear any lingering legacy localStorage key so it can
      // never be picked up again. Safe no-op if it's already gone.
      try {
        localStorage.removeItem(`trees-planted-${user.id}`);
        localStorage.removeItem('trees-planted-anon');
      } catch {
        // ignore
      }

      const fresh = await fetchProfile(user.id);
      if (cancelled) return;
      setProfile(fresh);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, fetchProfile]);

  const refresh = useCallback(async () => {
    if (!user) return;
    const fresh = await fetchProfile(user.id);
    setProfile(fresh);
  }, [user, fetchProfile]);

  return { profile, loading, refresh };
}
