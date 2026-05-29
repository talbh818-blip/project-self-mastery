// ============================================================================
// useVisionEntry — load + auto-save a single (scope, periodKey) entry.
// ----------------------------------------------------------------------------
// Behaviour:
//   • On (scope, periodKey) change, fetches the row (or null) and exposes its
//     content as the editor's starting document.
//   • `scheduleSave(nextContent)` debounces writes (1s idle) and reports
//     save status: 'idle' | 'pending' | 'saving' | 'saved' | 'error'.
//   • Critical: on period switch we *flush* any pending content before
//     resetting state. Cancelling instead would silently drop the user's
//     last keystrokes if they switched tabs within the debounce window.
//   • A request token (`reqIdRef`) discards stale fetches and prevents
//     in-flight saves from a previous period from polluting the new
//     period's `entry` / `status`.
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

    // Capture the values this effect was responsible for; the cleanup needs
    // to flush against THESE coordinates, not whatever the closure sees after
    // the next render.
    const cleanupScope = scope;
    const cleanupPeriodKey = periodKey;
    const cleanupUserId = userId;

    return () => {
      // Flush any pending content BEFORE wiping it — otherwise switching
      // tabs within the 1s debounce window silently deletes the user's
      // last keystrokes. We fire-and-forget; we don't need to await.
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const pending = pendingContentRef.current;
      pendingContentRef.current = null;
      if (pending !== null) {
        void upsertVisionEntry(
          cleanupUserId,
          cleanupScope,
          cleanupPeriodKey,
          pending,
        ).catch((err) => {
          console.error('[vision] flush-on-switch save failed', err);
        });
      }
    };
  }, [userId, scope, periodKey]);

  const flush = useCallback(async () => {
    if (!userId || pendingContentRef.current === null) return;
    // Capture the period we're saving INTO so a switch mid-save doesn't
    // make us announce "saved" or load the wrong entry into the UI.
    const myReq = reqIdRef.current;
    const targetScope = scope;
    const targetPeriodKey = periodKey;
    const content = pendingContentRef.current;
    pendingContentRef.current = null;
    setStatus('saving');
    try {
      const row = await upsertVisionEntry(
        userId,
        targetScope,
        targetPeriodKey,
        content,
      );
      // Only commit to UI state if the user is still viewing this period.
      if (reqIdRef.current === myReq) {
        setEntry(row);
        setStatus('saved');
      }
    } catch (err) {
      console.error('[vision] save failed', err);
      if (reqIdRef.current === myReq) {
        setStatus('error');
      }
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
