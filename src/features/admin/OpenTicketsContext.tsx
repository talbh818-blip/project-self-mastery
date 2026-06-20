// ============================================================================
// OpenTicketsContext — live count of open (unanswered) feedback/support tickets.
// ----------------------------------------------------------------------------
// Feeds the notification badge on the admin ("ניהול") nav icon so the app owner
// can see at a glance how many feedback/support messages are waiting for a reply
// without opening the admin screen.
//
// Non-admins never fetch (count stays 0). For admins we fetch once, poll lightly
// so a message that arrives while the app is open eventually shows up, and
// refetch when the tab regains focus. The FeedbackAdminPanel also calls refresh()
// right after marking a ticket handled, so the badge updates instantly.
// ============================================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useCurrentProfile } from './ProfileContext';
import { fetchOpenTicketCount } from './queries';

type Ctx = {
  /** Number of open (unanswered) feedback + support tickets. 0 for non-admins. */
  openTickets: number;
  /** Re-fetch the count now — used after the admin marks a ticket handled. */
  refresh: () => Promise<void>;
};

const OpenTicketsContext = createContext<Ctx | undefined>(undefined);

// Light polling so a ticket that arrives while the app is open turns up on its
// own. The count is a cheap HEAD request; once a minute is plenty.
const POLL_MS = 60_000;

export function OpenTicketsProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useCurrentProfile();
  const [openTickets, setOpenTickets] = useState(0);

  const refresh = useCallback(async () => {
    if (!isAdmin) {
      setOpenTickets(0);
      return;
    }
    try {
      setOpenTickets(await fetchOpenTicketCount());
    } catch (e) {
      // The badge is non-critical chrome — never surface an error for it,
      // just keep the last known value.
      console.error('[admin/badge] open-ticket count failed:', e);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setOpenTickets(0);
      return;
    }
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    // Refetch when the user comes back to the tab — the most common "let me
    // check" moment, and snappier than waiting for the next poll tick.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [isAdmin, refresh]);

  return (
    <OpenTicketsContext.Provider value={{ openTickets, refresh }}>
      {children}
    </OpenTicketsContext.Provider>
  );
}

export function useOpenTickets() {
  const ctx = useContext(OpenTicketsContext);
  if (!ctx)
    throw new Error('useOpenTickets must be used within OpenTicketsProvider');
  return ctx;
}
