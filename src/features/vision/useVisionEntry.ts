// ============================================================================
// useVisionEntry — load + auto-save + LIVE-SYNC a single (scope, periodKey)
// entry.
// ----------------------------------------------------------------------------
// PERSISTENCE LAYERS:
//   1. localStorage draft — written on every keystroke; survives tab close /
//      crash / offline. Reconciled against the DB on load (draft rescue).
//   2. Supabase upsert — debounced 1s. The persistent source of truth.
//   3. visibilitychange flush + period-switch flush — never sit on unsaved
//      content when leaving.
//
// CROSS-DEVICE SYNC:
//   • The in-memory cache (visionCache) is NOT persisted, so every device
//     fetches the true current row on load.
//   • A Supabase Realtime subscription pushes other devices' edits in live.
//   • `contentVersion` bumps whenever EXTERNAL content (a newer DB row from
//     another device, via revalidation or Realtime) replaces what's shown.
//     The screen folds it into the editor's resetKey so the editor re-mounts
//     with the fresh content — the editor is uncontrolled and only reads its
//     document on mount, so this is how external changes become visible.
//   • `displayedRef` mirrors the content currently in the editor. We bump
//     only when an incoming row DIFFERS from it, and never while the user is
//     actively typing (pendingContentRef set) — so our own save echoes and
//     in-progress keystrokes are never clobbered.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { type VisionEntry } from './queries';
import { updateVisionEntryDate, upsertVisionEntry } from './mutations';
import { addPeriod, isFuturePeriod, type VisionScope } from './period';
import {
  getCachedEntry,
  loadEntry,
  prefetchEntry,
  setCachedEntry,
} from './visionCache';
import { recordSnapshot } from './visionHistory';

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

// Order-insensitive JSON, used ONLY for comparison (never for storage).
// Postgres `jsonb` does not preserve object key order, so the row we read
// back after a save holds the same document with its keys reordered relative
// to the in-memory Tiptap JSON we sent. A plain JSON.stringify would treat
// that as "different content" and bump `contentVersion` on every save —
// re-mounting the editor (cursor jump) and, since a re-mount can emit a
// normalisation update, kicking off an endless save→echo→re-mount→save loop
// (the "שומר…" that never settles). Sorting keys first makes the
// round-tripped row compare equal to what we already display.
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = sortKeysDeep(src[k]);
    return out;
  }
  return value;
}
const contentJson = (content: unknown) =>
  JSON.stringify(sortKeysDeep(content ?? null));

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
    // Quota / private-mode failures should never break the editor.
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

  // Seed from the session cache so re-opening a period paints instantly with no
  // loader (matches every other screen). `getCachedEntry` returns `undefined`
  // only when we've never fetched this period this session — the lone case that
  // still warrants the loader.
  const [entry, setEntry] = useState<VisionEntry | null>(() => {
    if (!userId) return null;
    const cached = getCachedEntry(userId, scope, periodKey);
    return cached === undefined ? null : cached;
  });
  const [loading, setLoading] = useState(() => {
    if (!userId) return true;
    return getCachedEntry(userId, scope, periodKey) === undefined;
  });
  const [status, setStatus] = useState<SaveStatus>('idle');
  // Bumps when EXTERNAL content replaces what's shown → forces editor re-mount.
  const [contentVersion, setContentVersion] = useState(0);

  const debounceRef = useRef<number | null>(null);
  const pendingContentRef = useRef<unknown>(null);
  // Token used to discard responses from stale period switches.
  const reqIdRef = useRef(0);
  // JSON of the content currently in the editor — the yardstick for deciding
  // whether an incoming row is genuinely new (external) and needs a re-mount.
  const displayedRef = useRef<string>('');
  // Live mirror of the loaded entry, so non-reactive callbacks (the online
  // retry) can compare against the DB's timestamp without a stale closure.
  const entryRef = useRef<VisionEntry | null>(null);
  entryRef.current = entry;

  // Load whenever (user, scope, periodKey) changes.
  useEffect(() => {
    if (!userId) return;
    const myReq = ++reqIdRef.current;
    const key = lsKey(userId, scope, periodKey);

    // Show the period's content; bump the version (→ editor re-mount) only
    // when the content genuinely differs from what's on screen.
    const commit = (row: VisionEntry | null) => {
      if (reqIdRef.current !== myReq) return;
      const json = contentJson(row?.content);
      setEntry(row);
      if (json !== displayedRef.current) {
        displayedRef.current = json;
        setContentVersion((v) => v + 1);
      }
      if (row) clearDraftIfOlder(key, row.updated_at);
    };

    // Reconcile a freshly-fetched row with any unsaved localStorage draft.
    const applyRow = async (row: VisionEntry | null) => {
      if (reqIdRef.current !== myReq) return;
      const draft = readDraft(key);
      const dbTs = row ? new Date(row.updated_at).getTime() : 0;
      if (draft && draft.updatedAt > dbTs) {
        // Unsaved local content is newer than the DB — restore + push it up.
        commit(
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
            icon: null,
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
            displayedRef.current = contentJson(saved.content);
            setStatus('saved');
            clearDraftIfOlder(key, saved.updated_at);
          }
        } catch (err) {
          console.error('[vision] draft-rescue save failed', err);
          if (reqIdRef.current === myReq) setStatus('error');
        }
      } else {
        commit(row);
      }
    };

    // Instant paint from the in-session cache (no draft newer than it).
    const cached = getCachedEntry(userId, scope, periodKey);
    const draft = readDraft(key);
    const cachedTs = cached ? new Date(cached.updated_at).getTime() : 0;
    const draftIsNewer = !!draft && draft.updatedAt > cachedTs;

    if (cached !== undefined && !draftIsNewer) {
      setEntry(cached);
      // Bump the version when the cached content differs from what's on
      // screen, so the editor RE-MOUNTS with THIS period's content. Without
      // this, switching to an already-visited (cached) period updated `entry`
      // but left resetKey (=level:periodKey:contentVersion) unchanged — so the
      // editor kept showing, and could then save, the PREVIOUS period's text
      // under the new period's key. That was the "monthly shows up in weekly /
      // weeks duplicate or vanish" corruption.
      const json = contentJson(cached?.content);
      if (json !== displayedRef.current) {
        displayedRef.current = json;
        setContentVersion((v) => v + 1);
      }
      setLoading(false);
      setStatus('idle');
    } else {
      setLoading(true);
      setStatus('idle');
    }

    // Revalidate against the DB (always) — this is what makes a second device
    // pick up the latest content on load.
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

    // Warm neighbouring periods so prev/next navigation is instant.
    prefetchEntry(userId, scope, addPeriod(scope, periodKey, -1));
    const nextKey = addPeriod(scope, periodKey, 1);
    if (!isFuturePeriod(scope, nextKey)) {
      prefetchEntry(userId, scope, nextKey);
    }

    const cleanupScope = scope;
    const cleanupPeriodKey = periodKey;
    const cleanupUserId = userId;

    return () => {
      // Flush pending content BEFORE wiping it so a fast tab switch never
      // drops the user's last keystrokes.
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
          });
      }
    };
  }, [userId, scope, periodKey]);

  // ── Live sync: push other devices' edits to this one ──────────────────────
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`vision_rt_${userId}_${scope}_${periodKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vision_entries',
          // Realtime filters allow a single column; we narrow to this user
          // and check scope/period in the handler. RLS already restricts the
          // stream to the user's own rows.
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = (payload.new ?? null) as VisionEntry | null;
          if (!row || row.scope !== scope || row.period_key !== periodKey) {
            return;
          }
          // Don't clobber the user while they're actively typing here.
          if (pendingContentRef.current !== null) return;
          const json = contentJson(row.content);
          setCachedEntry(userId, scope, periodKey, row);
          setEntry(row);
          if (json !== displayedRef.current) {
            displayedRef.current = json;
            setContentVersion((v) => v + 1); // re-mount editor with the live content
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, scope, periodKey]);

  // ── Online retry ──────────────────────────────────────────────────────────
  // A save that failed offline leaves an unsynced localStorage draft (the
  // periodic save clears the draft once the DB catches up). When the network
  // returns, re-push the current period's draft so the user doesn't have to
  // reload. Other periods' drafts get rescued on navigation (see load above).
  useEffect(() => {
    if (!userId) return;
    const onOnline = () => {
      const key = lsKey(userId, scope, periodKey);
      const draft = readDraft(key);
      if (!draft) return; // nothing unsynced for this period
      // SAFETY: only push a draft that is genuinely NEWER than what's already
      // in the DB. Without this, a stale/empty draft could clobber good cloud
      // content on a network blip.
      const dbTs = entryRef.current
        ? new Date(entryRef.current.updated_at).getTime()
        : 0;
      if (draft.updatedAt <= dbTs) {
        clearDraftIfOlder(key, entryRef.current?.updated_at ?? '');
        return;
      }
      const myReq = reqIdRef.current;
      setStatus('saving');
      upsertVisionEntry(userId, scope, periodKey, draft.content)
        .then((row) => {
          setCachedEntry(userId, scope, periodKey, row);
          if (reqIdRef.current === myReq) {
            setEntry(row);
            setStatus('saved');
          }
          clearDraftIfOlder(key, row.updated_at);
        })
        .catch((err) => {
          console.error('[vision] online-retry failed', err);
          if (reqIdRef.current === myReq) setStatus('error');
        });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [userId, scope, periodKey]);

  const flush = useCallback(async () => {
    if (!userId || pendingContentRef.current === null) return;
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
      // Safety-net: keep a local version history (non-empty only) so an
      // accidental clear is always recoverable, even after a refresh.
      recordSnapshot(userId, targetScope, targetPeriodKey, content);
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
    }
  }, [userId, scope, periodKey]);

  /**
   * Restore a previous version: snapshot the current content (so the restore
   * itself is reversible), write the chosen content, and re-mount the editor
   * with it via a contentVersion bump.
   */
  const restore = useCallback(
    async (content: unknown) => {
      if (!userId) return;
      const targetScope = scope;
      const targetPeriodKey = periodKey;
      const myReq = reqIdRef.current;
      // Preserve whatever is there now before we overwrite it.
      if (entryRef.current) {
        recordSnapshot(userId, targetScope, targetPeriodKey, entryRef.current.content);
      }
      setStatus('saving');
      try {
        const row = await upsertVisionEntry(
          userId,
          targetScope,
          targetPeriodKey,
          content,
        );
        setCachedEntry(userId, targetScope, targetPeriodKey, row);
        // (No snapshot of the restored content — it's already in history; the
        // pre-restore content was snapshotted above so the restore is undoable.)
        if (reqIdRef.current === myReq) {
          setEntry(row);
          displayedRef.current = contentJson(content);
          setContentVersion((v) => v + 1); // re-mount editor with restored doc
          setStatus('saved');
        }
        clearDraftIfOlder(lsKey(userId, targetScope, targetPeriodKey), row.updated_at);
      } catch (err) {
        console.error('[vision] restore failed', err);
        if (reqIdRef.current === myReq) setStatus('error');
      }
    },
    [userId, scope, periodKey],
  );

  const scheduleSave = useCallback(
    (nextContent: unknown) => {
      if (!userId) return;
      // localStorage safety net first (sync, instant).
      writeDraft(lsKey(userId, scope, periodKey), nextContent);
      // The editor now shows this content — keep displayedRef in lock-step so
      // the Realtime echo of our own save (and revalidation) doesn't trigger
      // a spurious re-mount.
      displayedRef.current = contentJson(nextContent);

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

  // Flush immediately when the tab is hidden (mobile app switch / close).
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

  /** Override the user-facing document date (immediate, no debounce). */
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
    contentVersion,
    scheduleSave,
    setDocumentDate,
    restore,
  };
}
