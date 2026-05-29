// ============================================================================
// useVisionEntry — load + auto-save a single (scope, periodKey) entry.
// ----------------------------------------------------------------------------
// Behaviour:
//   • On (scope, periodKey) change, fetches the row (or null) and exposes its
//     content as the editor's starting document.
//   • `scheduleSave(nextContent)` debounces writes (1s idle) and reports
//     save status: 'idle' | 'pending' | 'saving' | 'saved' | 'error'.
//   • Cancels in-flight debounce on unmount or period switch.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { fetchVisionEntry, type VisionEntry } from './queries';
import { upsertVisionEntry } from './mutations';
import type { VisionScope } from './period';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 1000;

export function useVisionEntry(scope: VisionScope, periodKey: string) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [entry, setEntry] = useState<VisionEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');

  const debounceRef = useRef<number | null>(null);
  const pendingContentRef = useRef<unknown>(null);
  // Token used to discard responses from stale period switches.
  const reqIdRef = useRef(0);

  // Load whenever (user, scope, periodKey) changes.
  useEffect(() => {
    if (!userId) return;
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setStatus('idle');
    fetchVisionEntry(userId, scope, periodKey)
      .then((row) => {
        if (reqIdRef.current !== myReq) return;
        setEntry(row);
      })
      .catch((err) => {
        if (reqIdRef.current !== myReq) return;
        console.error('[vision] fetch failed', err);
        setEntry(null);
      })
      .finally(() => {
        if (reqIdRef.current !== myReq) return;
        setLoading(false);
      });

    return () => {
      // Flush nothing on unmount; cancel debounce so we don't write to the
      // *previous* period after the user switches tabs.
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      pendingContentRef.current = null;
    };
  }, [userId, scope, periodKey]);

  const flush = useCallback(async () => {
    if (!userId || pendingContentRef.current === null) return;
    const content = pendingContentRef.current;
    pendingContentRef.current = null;
    setStatus('saving');
    try {
      const row = await upsertVisionEntry(userId, scope, periodKey, content);
      setEntry(row);
      setStatus('saved');
    } catch (err) {
      console.error('[vision] save failed', err);
      setStatus('error');
    }
  }, [userId, scope, periodKey]);

  const scheduleSave = useCallback(
    (nextContent: unknown) => {
      if (!userId) return;
      pendingContentRef.current = nextContent;
      setStatus('pending');
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void flush();
      }, DEBOUNCE_MS);
    },
    [userId, flush],
  );

  return {
    entry,
    loading,
    status,
    scheduleSave,
  };
}
