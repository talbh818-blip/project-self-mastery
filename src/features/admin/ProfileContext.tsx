import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { isAdminEmail } from './config';
import { useProfile } from './useProfile';
import type { Profile } from './types';

type Ctx = {
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
};

const ProfileContext = createContext<Ctx | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profile, loading, refresh } = useProfile();
  const value = useMemo<Ctx>(
    () => ({
      profile,
      loading,
      isAdmin: isAdminEmail(user?.email ?? null),
      refresh,
    }),
    [profile, loading, user?.email, refresh],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useCurrentProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useCurrentProfile must be used within ProfileProvider');
  return ctx;
}
