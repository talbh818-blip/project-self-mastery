// ============================================================================
// useAssistMode — per-user "guided writing" toggle, persisted in localStorage.
// ----------------------------------------------------------------------------
// Lightweight on purpose: no DB column yet. If the user clears their browser
// storage the toggle resets to off, which is harmless. When/if we want
// cross-device sync we can promote this to a column on `profiles`.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

const LS_PREFIX = 'vision-assist:';

const lsKey = (userId: string) => `${LS_PREFIX}${userId}`;

function read(userId: string): boolean {
  try {
    return localStorage.getItem(lsKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function useAssistMode() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [enabled, setEnabled] = useState<boolean>(() =>
    userId ? read(userId) : false,
  );

  // Re-read on user change (e.g. sign-in flow lands).
  useEffect(() => {
    if (!userId) return;
    setEnabled(read(userId));
  }, [userId]);

  const toggle = useCallback(() => {
    if (!userId) return;
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(lsKey(userId), next ? '1' : '0');
      } catch {
        // ignore quota / private-mode failures
      }
      return next;
    });
  }, [userId]);

  return { enabled, toggle };
}
