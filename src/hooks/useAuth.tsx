import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearHabitCache } from '../features/habits/useHabitData';
import { clearCatalogCache } from '../features/habits/useCatalog';
import { clearRemindersCache } from '../features/notifications/reminders';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Supabase fires this on every tab focus (TOKEN_REFRESHED / SIGNED_IN)
      // with a BRAND-NEW session object. Blindly storing it churns the `user`
      // object identity, which re-runs every effect keyed on `user` — that's
      // what made screens flash their loader and refetch from scratch each time
      // the browser tab regained focus. Keep the SAME object while the signed-in
      // user is unchanged; only swap on a real identity change (sign in / out /
      // different user). Nothing reads the access token from React state — the
      // supabase client refreshes and uses it internally — so holding the prior
      // object is safe.
      setSession((prev) => (prev?.user?.id === newSession?.user?.id ? prev : newSession));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    // Drop in-memory session caches so the next user never sees stale data.
    clearHabitCache();
    clearCatalogCache();
    clearRemindersCache();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
