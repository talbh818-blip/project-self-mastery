// ============================================================================
// useVisionEntry — load + auto-save a single (scope, periodKey) entry.
// ----------------------------------------------------------------------------
// PERSISTENCE LAYERS (in increasing reliability cost):
//   1. localStorage    — writes synchronously on every keystroke. Survives
//                        tab close, browser crash, network loss. Per-user,
//                        per-period key. Cleared on successful DB save.
//   2. Supabase upsert — debounced 1s. The persistent source of truth.
//   3. visibilitychange flush — when the tab is hidden (mobile app switch,
//      tab close, browser backgrounded) we trigger an immediate save so we
//      never sit on an unsaved pending buffer.
//   4. Period-switch flush — cleanup of the previous effect fires an
//      immediate save against the OLD period coords so the user's last
//      keystrokes aren't dropped when they jump tabs.
//   5. Stale-save guards — a request token (`reqIdRef`) discards in-flight
//      saves and fetches whose period the user has already left.
//
// LOAD RECOVERY:
//   On fetch we compare the DB row's `updated_at` against the cached
//   localStorage timestamp. If localStorage is newer (e.g. the last save
//   failed mid-flight), we restore from localStorage AND re-upsert so DB
//   catches up.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { type VisionEntry } from './queries';
import { updateVisionEntryDate, upsertVisionEntry } from './mutations';
import { addPeriod, isFuturePeriod, type VisionScope } from './period';
import {
  getCachedEntry,
  loadEntry,
  prefetchEntry,
  setCachedEntry,
} from './visionCache';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 1000;
const LS_PREFIX = 'vision-draft:';

type Draft = {
  content: unknown;
  /** Date.now() at the moment of the last keystroke. */
  updatedAt: number;
};

const lsKey = (userId: string, scope: VisionScope, periodKey: string) =>
  `${LS_PREFIX}${userId}:${scope}:${periodKey}`;

function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (typeof parsed?.updatedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}
function writeDraft(key: string, content: unknown) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ content, updatedAt: Date.now() } satisfies Draft),
    );
  } catch {
    // Quota or private-mode failures should never break the editor.
  }
}
function clearDraftIfOlder(key: string, dbUpdatedAtIso: string) {
  try {
    const draft = readDraft(key);
    if (!draft) return;
    if (draft.updatedAt <= new Date(dbUpdatedAtIso).getTime()) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

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
    const key = lsKey(userId, scope, periodKey);

    // Reconcile a freshly-fetched row with any unsaved localStorage draft,
    // then commit to state. If the user has unsaved content newer than the
    // DB (e.g. an offline save), restore it AND push it to the DB.
    const applyRow = async (row: VisionEntry | null) => {
      if (reqIdRef.current !== myReq) return;
      const draft = readDraft(key);
      const dbTs = row ? new Date(row.updated_at).getTime() : 0;
      if (draft && draft.updatedAt > dbTs) {
        setEntry(
          row ?? {
            id: '',
            user_id: userId,
            scope,
            period_key: periodKey,
            content: draft.content,
            visibility: 'private',
            document_date: new Date(draft.updatedAt)
              .toISOString()
              .slice(0, 10),
            created_at: new Date(draft.updatedAt).toISOString(),
            updated_at: new Date(draft.updatedAt).toISOString(),
          },
        );
        setStatus('saving');
        try {
          const saved = await upsertVisionEntry(
            userId,
            scope,
            periodKey,
            draft.content,
          );
          setCachedEntry(userId, scope, periodKey, saved);
          if (reqIdRef.current === myReq) {
            setEntry(saved);
            setStatus('saved');
            clearDraftIfOlder(key, saved.updated_at);
          }
        } catch (err) {
          console.error('[vision] draft-rescue save failed', err);
          if (reqIdRef.current === myReq) setStatus('error');
        }
      } else {
        setEntry(row);
        if (row) clearDraftIfOlder(key, row.updated_at);
      }
    };

    // Instant paint from cache to kill the "טוען…" flash — but ONLY when
    // there's no unsaved draft newer than the cache. If a newer draft
    // exists we must show loading and let applyRow mount the editor with
    // the reconciled (rescued) content, since the editor reads its initial
    // content once on mount.
    const cached = getCachedEntry(userId, scope, periodKey);
    const draft = readDraft(key);
    const cachedTs = cached ? new Date(cached.updated_at).getTime() : 0;
    const draftIsNewer = !!draft && draft.updatedAt > cachedTs;

    if (cached !== undefined && !draftIsNewer) {
      setEntry(cached);
      setLoading(false);
      setStatus('idle');
    } else {
      setLoading(true);
      setStatus('idle');
    }

    // Revalidate in the background (also fills the cache; de-duplicated).
    loadEntry(userId, scope, periodKey)
      .then((row) => applyRow(row))
      .catch((err) => {
        if (reqIdRef.current !== myReq) return;
        console.error('[vision] fetch failed', err);
        if (cached === undefined) setEntry(null);
      })
      .finally(() => {
        if (reqIdRef.current === myReq) setLoading(false);
      });

    // Warm the neighbouring periods so prev/next navigation is instant.
    prefetchEntry(userId, scope, addPeriod(scope, periodKey, -1));
    const nextKey = addPeriod(scope, periodKey, 1);
    if (!isFuturePeriod(scope, nextKey)) {
      prefetchEntry(userId, scope, nextKey);
    }

    // Capture the values this effect is responsible for; the cleanup must
    // flush against THESE coordinates, not whatever the closure sees after
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
        const flushKey = lsKey(cleanupUserId, cleanupScope, cleanupPeriodKey);
        void upsertVisionEntry(
          cleanupUserId,
          cleanupScope,
          cleanupPeriodKey,
          pending,
        )
          .then((row) => {
            setCachedEntry(cleanupUserId, cleanupScope, cleanupPeriodKey, row);
            clearDraftIfOlder(flushKey, row.updated_at);
          })
          .catch((err) => {
            console.error('[vision] flush-on-switch save failed', err);
            // localStorage still holds the draft — recovers on next load.
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
    const key = lsKey(userId, targetScope, targetPeriodKey);
    pendingContentRef.current = null;
    setStatus('saving');
    try {
      const row = await upsertVisionEntry(
        userId,
        targetScope,
        targetPeriodKey,
        content,
      );
      setCachedEntry(userId, targetScope, targetPeriodKey, row);
      if (reqIdRef.current === myReq) {
        setEntry(row);
        setStatus('saved');
      }
      clearDraftIfOlder(key, row.updated_at);
    } catch (err) {
      console.error('[vision] save failed', err);
      if (reqIdRef.current === myReq) {
        setStatus('error');
      }
      // localStorage still holds the latest content; next load or next
      // successful save will reconcile.
    }
  }, [userId, scope, periodKey]);

  const scheduleSave = useCallback(
    (nextContent: unknown) => {
      if (!userId) return;
      // ALWAYS write to localStorage immediately, before any debounce or
      // network round-trip. This is the user's safety net — if the tab
      // closes, the network drops, or the device dies right now, the
      // content survives.
      writeDraft(lsKey(userId, scope, periodKey), nextContent);

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
    [userId, scope, periodKey, flush],
  );

  // Flush immediately when the tab is hidden (mobile app switch, tab close,
  // browser backgrounded). Critical for mobile, where `beforeunload` is
  // unreliable. We don't await — sendBeacon-style fire-and-forget.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [flush]);

  /**
   * Override the user-facing document date. Fires immediately (no
   * debounce); if the row doesn't exist yet the upsert creates it with
   * the supplied date and an empty content payload.
   */
  const setDocumentDate = useCallback(
    async (dateIso: string) => {
      if (!userId) return;
      const myReq = reqIdRef.current;
      const targetScope = scope;
      const targetPeriodKey = periodKey;
      setStatus('saving');
      try {
        const row = await updateVisionEntryDate(
          userId,
          targetScope,
          targetPeriodKey,
          dateIso,
        );
        setCachedEntry(userId, targetScope, targetPeriodKey, row);
        if (reqIdRef.current === myReq) {
          setEntry(row);
          setStatus('saved');
        }
      } catch (err) {
        console.error('[vision] date update failed', err);
        if (reqIdRef.current === myReq) setStatus('error');
      }
    },
    [userId, scope, periodKey],
  );

  return {
    entry,
    loading,
    status,
    scheduleSave,
    setDocumentDate,
  };
}
