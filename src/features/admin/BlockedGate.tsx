import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useCurrentProfile } from './ProfileContext';

// If the current user's profile is flagged `blocked = true`, render a stop
// screen and sign them out. The actual data is also protected by RLS, but
// this gives an explicit, friendly Hebrew message instead of empty screens.
export function BlockedGate({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const { profile, isAdmin } = useCurrentProfile();
  const isBlocked = !!profile?.blocked && !isAdmin;

  useEffect(() => {
    if (!isBlocked) return;
    // Sign out after a brief delay so the user sees the message first.
    const t = window.setTimeout(() => {
      void signOut();
    }, 4000);
    return () => window.clearTimeout(t);
  }, [isBlocked, signOut]);

  if (!isBlocked) return <>{children}</>;
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-2xl font-semibold text-ink-100 mb-3">החשבון חסום</h1>
        <p className="text-ink-300 text-sm leading-relaxed">
          הגישה לאפליקציה חסומה זמנית. מתנתק…
        </p>
      </div>
    </div>
  );
}
