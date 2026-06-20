// ============================================================================
// useHabitData — the app's central source of truth for the user's habit data.
//
// Loads everything once, holds it in local state, and exposes:
//   - stats              UserStats, derived (memoized) from local state
//   - slotsForRange(r)   pure derivation of SlotView[] for any date range
//   - setLog(...)        OPTIMISTIC mark/unmark — updates local state first,
//                        then persists in the background. UI never waits.
//   - createHabit(...)   waits for server (needs DB-generated id), then
//                        patches local state. No refetch.
//
// Every read in the rest of the app reads from local state; mutations stay
// in sync without round-tripping the server. This is what makes the app
// feel instant.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAllUserData } from './queries';
import { computeUserStats, type UserStats } from './scoring';
import {
  computeCombinedStats,
  decayFactor,
  effectiveQuota,
  filledSlots,
  isV2Date,
  periodOf,
  periodValue,
  slotWeights,
  type CombinedStats,
} from './scoring2';
import { assembleSlots } from './slotAssembly';
import {
  SLOT_INDEXES,
  type Habit,
  type HabitLog,
  type LogStatus,
  type SlotAssignment,
  type SlotIndex,
  type SlotView,
} from './types';
import { toDateString } from './week';
import {
  archiveHabit as archiveHabitRemote,
  createHabitInSlot,
  deleteHabitPermanently as deleteHabitPermanentlyRemote,
  restoreHabit as restoreHabitRemote,
  setHabitLog,
  setHabitsOrder as setHabitsOrderRemote,
  updateHabit as updateHabitRemote,
  type CreateHabitInput,
  type UpdateHabitInput,
} from './mutations';
import { applyOutbox, clearCell, enqueueLog, flushOutbox } from './outbox';
import {
  readPersisted,
  removePersistedByPrefix,
  writePersisted,
} from '../../lib/persistentCache';
import { dbgLog } from '../../lib/debug';

type Loaded = {
  habits: Habit[];
  assignments: SlotAssignment[];
  logs: HabitLog[];
};

type State =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: Loaded; error: null }
  | { status: 'error'; data: null; error: string };

// ---------------------------------------------------------------------------
// Session cache (memory-only, keyed by user) — lets navigating BACK to the
// Habits screen paint instantly from the last-loaded data instead of flashing
// the loader and refetching from scratch. We still revalidate in the
// background (stale-while-revalidate), so the data stays fresh; the loader
// only ever shows on the genuine first load of a session (when there's nothing
// to show yet).
//
// Two layers: (1) an in-memory cache makes navigation within a session instant;
// (2) a localStorage snapshot makes even a COLD load / page reload paint the
// last-known data at once (then revalidate silently), instead of flashing the
// loader. The snapshot is per-device and always corrected by the background
// revalidation, and the Habits screen re-renders fully from state — so a stale
// paint can never get "stuck" (the bug that kept vision content memory-only).
// Same localStorage pattern the app already uses for vision drafts.
// ---------------------------------------------------------------------------
let habitCache: { userId: string; data: Loaded } | null = null;
let habitCacheFetchedAt = 0;
// On a remount within this window we trust the cache and DON'T hit the server
// again — avoids re-querying on rapid tab switching. After it elapses, the
// next remount revalidates silently in the background.
const HABIT_REVALIDATE_AFTER_MS = 30_000;

const habitPersistKey = (userId: string) => `habit-data:${userId}`;

/** Build the initial state: memory cache → device snapshot → loading. Only the
 *  last (genuine first-ever load, nothing stored) ever shows the loader. */
function initialHabitState(userId: string | null): State {
  if (!userId) {
    dbgLog('Habits: no userId yet → loading');
    return { status: 'loading', data: null, error: null };
  }
  if (habitCache && habitCache.userId === userId) {
    dbgLog('Habits: MEMORY hit → instant (no loader)');
    return { status: 'ready', data: habitCache.data, error: null };
  }
  const snapshot = readPersisted<Loaded>(habitPersistKey(userId));
  if (snapshot) {
    dbgLog('Habits: localStorage hit → instant (no loader)');
    // Seed the memory cache so the rest of the session is instant too.
    habitCache = { userId, data: snapshot };
    return { status: 'ready', data: snapshot, error: null };
  }
  dbgLog('Habits: MISS (no memory/localStorage) → LOADER');
  return { status: 'loading', data: null, error: null };
}

/** Drop the cached habit data (call on sign-out so the next user starts clean). */
export function clearHabitCache() {
  habitCache = null;
  habitCacheFetchedAt = 0;
  removePersistedByPrefix('habit-data:');
}

export type UseHabitData = {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  /** All habits owned by the user, including archived. */
  habits: Habit[];
  /** V1 engine over ALL days — still drives cell visuals + streak display. */
  stats: UserStats | null;
  /** The score layer: frozen-v1 (pre-epoch) + v2 (monthly pie). Every number
   *  shown to the user comes from here. */
  combined: CombinedStats | null;
  slotsForRange: (range: { start: Date; end: Date }) => SlotView[];
  setLog: (params: {
    habitId: string;
    date: string;
    status: LogStatus | null;
    amount: number | null;
  }) => Promise<void>;
  createHabit: (params: {
    slotIndex: SlotIndex;
    input: CreateHabitInput;
  }) => Promise<void>;
  updateHabit: (params: {
    habitId: string;
    input: UpdateHabitInput;
  }) => Promise<void>;
  archiveHabit: (habitId: string) => Promise<void>;
  /**
   * Persist a new display order. `orderedHabitIds` is the FULL new order for
   * the given group (positive or negative); we'll write sort_order = 0..n-1.
   */
  reorderHabits: (orderedHabitIds: string[]) => Promise<void>;
  /**
   * Restore a previously-archived habit. Re-opens the habit and assigns it
   * to the next available slot. Throws if no slot is free.
   */
  restoreHabit: (habitId: string) => Promise<void>;
  /** Hard-delete a habit and all of its logs/assignments. Irreversible. */
  deleteHabitPermanently: (habitId: string) => Promise<void>;
  /** Force a full reload from the server (use sparingly — e.g. retry on error). */
  reload: () => void;
};

export function useHabitData(userId: string | null): UseHabitData {
  const [state, setState] = useState<State>(() => initialHabitState(userId));
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    let cached =
      habitCache && habitCache.userId === userId ? habitCache : null;
    // Cover the case where userId only became available after first render
    // (the lazy initializer ran with userId=null): hydrate from the device
    // snapshot now so we still skip the loader.
    if (!cached) {
      const snapshot = readPersisted<Loaded>(habitPersistKey(userId));
      if (snapshot) {
        habitCache = { userId, data: snapshot };
        cached = habitCache;
      }
    }

    if (cached) {
      // Paint cached data immediately — no loader, no "reload from scratch".
      setState({ status: 'ready', data: cached.data, error: null });
      // Still fresh and not an explicit reload? Trust the cache, skip the
      // network round-trip entirely.
      if (
        reloadKey === 0 &&
        Date.now() - habitCacheFetchedAt < HABIT_REVALIDATE_AFTER_MS
      ) {
        return;
      }
      // else: fall through and revalidate silently in the background.
    } else {
      // Nothing to show yet — this is the only path that shows the loader.
      setState({ status: 'loading', data: null, error: null });
    }

    fetchAllUserData(userId)
      .then((data) => {
        if (cancelled) return;
        // Overlay any un-synced offline marks so they survive the reload,
        // then try to push them now that we (presumably) have the network.
        const logs = applyOutbox(userId, data.logs);
        const loaded = { ...data, logs };
        habitCache = { userId, data: loaded };
        habitCacheFetchedAt = Date.now();
        // Persist the fresh snapshot so the NEXT cold load / reload paints it
        // instantly. Only on a real fetch — not on every optimistic mark — to
        // avoid serializing all logs on each tap (the outbox already covers any
        // unsynced marks across a reload).
        writePersisted(habitPersistKey(userId), loaded);
        dbgLog(
          `Habits: fetched from server + saved (${loaded.logs.length} logs)`,
        );
        setState({ status: 'ready', data: loaded, error: null });
        void flushOutbox(userId);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // A failed SILENT revalidation must not blow away a working view —
        // keep showing the cached data we already painted.
        if (cached) {
          console.error('[useHabitData] revalidate failed (keeping cache):', e);
          return;
        }
        console.error('[useHabitData] fetchAllUserData error:', e);
        let msg = 'שגיאה בטעינה';
        if (e instanceof Error) msg = e.message;
        else if (e && typeof e === 'object' && 'message' in e) {
          msg = String((e as { message: unknown }).message);
        }
        setState({ status: 'error', data: null, error: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  // Mirror the latest ready data into the session cache so a remount paints it
  // instantly — INCLUDING any optimistic mark/edit the user just made. We keep
  // the server-fetch timestamp untouched here so local edits don't reset the
  // freshness window (only a real fetch above bumps habitCacheFetchedAt).
  useEffect(() => {
    if (state.status === 'ready' && userId) {
      habitCache = { userId, data: state.data };
    }
  }, [state, userId]);

  // Today is recomputed once per hook instance — fine for a session.
  const today = useMemo(() => new Date(), []);

  const stats = useMemo<UserStats | null>(() => {
    if (state.status !== 'ready') return null;
    return computeUserStats({
      habits: state.data.habits,
      assignments: state.data.assignments,
      logs: state.data.logs,
      today,
    });
  }, [state, today]);

  const combined = useMemo<CombinedStats | null>(() => {
    if (state.status !== 'ready') return null;
    return computeCombinedStats({
      habits: state.data.habits,
      assignments: state.data.assignments,
      logs: state.data.logs,
      today,
    });
  }, [state, today]);

  const slotsForRange = useCallback(
    (range: { start: Date; end: Date }) => {
      if (state.status !== 'ready') return [];
      return assembleSlots(
        state.data.habits,
        state.data.assignments,
        state.data.logs,
        range,
      );
    },
    [state],
  );

  const setLog = useCallback(
    async ({
      habitId,
      date,
      status,
      amount,
    }: {
      habitId: string;
      date: string;
      status: LogStatus | null;
      amount: number | null;
    }) => {
      if (!userId || state.status !== 'ready') return;
      const prevLogs = state.data.logs;

      // Snapshot the habit's current per-day target so a later target change
      // doesn't retroactively re-judge this day. Null for binary habits.
      const habit = state.data.habits.find((h) => h.id === habitId);
      const targetAtLog =
        habit?.is_quantitative ? (habit.quantitative_target ?? null) : null;

      // V2 scoring: points this row's taps have earned, snapshotted AT TAP
      // TIME (slot value × late-marking decay) and accumulated across taps.
      // Snapshotting here is what makes the system non-retroactive.
      const prevRow = prevLogs.find(
        (l) => l.habit_id === habitId && l.date === date,
      );
      let earnedPoints: number | null = prevRow?.earned_points ?? null;
      if (status === null) {
        earnedPoints = null; // row is being deleted
      } else if (status === 'V' && habit && isV2Date(date)) {
        const now = new Date();
        const period = periodOf(habit, date);
        // Judged against the EFFECTIVE quota (partial weeks can't demand
        // more marks than they have active days).
        const quota = effectiveQuota(habit, period, state.data.assignments);
        let prevFilled: number;
        let newFilled: number;
        if (period.kind === 'daily') {
          prevFilled =
            prevRow?.status === 'V'
              ? habit.is_quantitative
                ? Math.min(quota, prevRow.amount ?? 1)
                : 1
              : 0;
          newFilled = habit.is_quantitative
            ? Math.min(quota, amount ?? 1)
            : 1;
        } else {
          // Weekly/monthly: each V day fills one slot; count the OTHER days
          // already marked in this period.
          const others = prevLogs.filter(
            (l) => l.habit_id === habitId && l.date !== date,
          );
          prevFilled = filledSlots(habit, period, others, quota);
          newFilled =
            prevRow?.status === 'V'
              ? prevFilled
              : Math.min(quota, prevFilled + 1);
        }
        if (newFilled > prevFilled) {
          const weights = slotWeights(quota);
          const value = periodValue(habit, period, state.data.assignments);
          const decay = decayFactor(date, now);
          let delta = 0;
          for (let i = prevFilled; i < newFilled; i++) {
            delta += value * (weights[i] ?? 0) * decay;
          }
          earnedPoints = (prevRow?.earned_points ?? 0) + delta;
        } else {
          earnedPoints = prevRow?.earned_points ?? 0;
        }
      }

      // Optimistic: drop any existing log for (habit, date), add the new one
      // if status is not null. Then commit to local state immediately.
      const nextLogs = prevLogs.filter(
        (l) => !(l.habit_id === habitId && l.date === date),
      );
      if (status !== null) {
        nextLogs.push({
          id: `optimistic-${habitId}-${date}`,
          user_id: userId,
          habit_id: habitId,
          date,
          status,
          amount,
          target_at_log: targetAtLog,
          earned_points: earnedPoints,
        });
      }
      setState({
        status: 'ready',
        data: { ...state.data, logs: nextLogs },
        error: null,
      });

      // Persist in the background.
      try {
        await setHabitLog({
          userId,
          habitId,
          date,
          newStatus: status,
          newAmount: amount,
          targetAtLog,
          earnedPoints,
        });
        // Success — make sure no stale offline copy lingers for this cell.
        clearCell(userId, habitId, date);
      } catch (e) {
        const offline =
          typeof navigator !== 'undefined' && navigator.onLine === false;
        if (offline) {
          // OFFLINE: keep the optimistic mark and queue it for later. The
          // 'online' listener (below) flushes it when the network returns.
          enqueueLog(userId, {
            habitId,
            date,
            status,
            amount,
            targetAtLog,
            earnedPoints,
          });
          return;
        }
        // ONLINE but the write still failed → a real error: roll back so the
        // user isn't misled into thinking it saved.
        setState({
          status: 'ready',
          data: { ...state.data, logs: prevLogs },
          error: null,
        });
        throw e;
      }
    },
    [userId, state],
  );

  // Flush the offline outbox on mount and whenever the network comes back, so
  // marks made offline reach the cloud without needing a manual refresh.
  useEffect(() => {
    if (!userId) return;
    const flush = () => void flushOutbox(userId);
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [userId]);

  const createHabit = useCallback(
    async ({
      slotIndex,
      input,
    }: {
      slotIndex: SlotIndex;
      input: CreateHabitInput;
    }) => {
      if (!userId || state.status !== 'ready') return;
      // Compute sort_order for the new habit — append to the end of its
      // type group so it doesn't randomly jump above existing ones.
      const sameType = state.data.habits.filter(
        (h) => h.type === input.type && !h.archived_at,
      );
      const maxOrder = sameType.length > 0
        ? Math.max(...sameType.map((h) => h.sort_order))
        : -1;
      const sortOrder = maxOrder + 1;

      // Wait for the server so we get a real habit id, then patch local state.
      // (Creation is a one-time action, the brief wait is acceptable; this
      // avoids juggling temporary ids.)
      const habit = await createHabitInSlot({
        userId,
        slotIndex,
        input,
        sortOrder,
      });
      const todayStr = toDateString(new Date());
      const newAssignments = state.data.assignments.map((a) =>
        a.slot_index === slotIndex && a.end_date === null
          ? { ...a, end_date: todayStr }
          : a,
      );
      newAssignments.push({
        id: `optimistic-asgn-${habit.id}`,
        user_id: userId,
        slot_index: slotIndex,
        habit_id: habit.id,
        start_date: todayStr,
        end_date: null,
      });
      setState({
        status: 'ready',
        data: {
          habits: [...state.data.habits, habit],
          assignments: newAssignments,
          logs: state.data.logs,
        },
        error: null,
      });
    },
    [userId, state],
  );

  const updateHabit = useCallback(
    async ({
      habitId,
      input,
    }: {
      habitId: string;
      input: UpdateHabitInput;
    }) => {
      if (!userId || state.status !== 'ready') return;
      const prevHabits = state.data.habits;

      // Optimistic: patch local row first.
      const optimisticPatch: Partial<Habit> = {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        icon: input.icon,
        type: input.type,
        color: input.color,
        frequency_period: input.frequency_period,
        frequency_target: input.frequency_target,
        is_quantitative: input.is_quantitative,
        quantitative_target: input.is_quantitative ? input.quantitative_target : null,
        quantitative_max: input.is_quantitative ? input.quantitative_max : null,
        quantitative_unit: input.is_quantitative
          ? input.quantitative_unit?.trim() || null
          : null,
        difficulty: input.difficulty,
      };
      const nextHabits = prevHabits.map((h) =>
        h.id === habitId ? { ...h, ...optimisticPatch } : h,
      );
      setState({
        status: 'ready',
        data: { ...state.data, habits: nextHabits },
        error: null,
      });

      try {
        const updated = await updateHabitRemote(habitId, input);
        // Replace optimistic row with the authoritative one from the server.
        setState((s) =>
          s.status === 'ready'
            ? {
                ...s,
                data: {
                  ...s.data,
                  habits: s.data.habits.map((h) =>
                    h.id === habitId ? updated : h,
                  ),
                },
              }
            : s,
        );
      } catch (e) {
        // Rollback
        setState({
          status: 'ready',
          data: { ...state.data, habits: prevHabits },
          error: null,
        });
        throw e;
      }
    },
    [userId, state],
  );

  const archiveHabit = useCallback(
    async (habitId: string) => {
      if (!userId || state.status !== 'ready') return;
      const prevHabits = state.data.habits;
      const prevAssignments = state.data.assignments;
      const todayStr = toDateString(new Date());
      const nowIso = new Date().toISOString();

      // Optimistic: mark archived locally + close any active assignment.
      const nextHabits = prevHabits.map((h) =>
        h.id === habitId ? { ...h, archived_at: nowIso } : h,
      );
      const nextAssignments = prevAssignments.map((a) =>
        a.habit_id === habitId && a.end_date === null
          ? { ...a, end_date: todayStr }
          : a,
      );
      setState({
        status: 'ready',
        data: {
          ...state.data,
          habits: nextHabits,
          assignments: nextAssignments,
        },
        error: null,
      });

      try {
        await archiveHabitRemote({ userId, habitId });
      } catch (e) {
        setState({
          status: 'ready',
          data: {
            ...state.data,
            habits: prevHabits,
            assignments: prevAssignments,
          },
          error: null,
        });
        throw e;
      }
    },
    [userId, state],
  );

  const reorderHabits = useCallback(
    async (orderedHabitIds: string[]) => {
      if (!userId || state.status !== 'ready') return;
      const prevHabits = state.data.habits;

      // Build sort_order: id → new index in the ordered array.
      const orderMap = new Map<string, number>();
      orderedHabitIds.forEach((id, i) => orderMap.set(id, i));

      // Optimistic patch: any habit whose id appears in the order gets its
      // new sort_order. Habits outside this group are untouched.
      const nextHabits = prevHabits.map((h) =>
        orderMap.has(h.id) ? { ...h, sort_order: orderMap.get(h.id)! } : h,
      );
      setState({
        status: 'ready',
        data: { ...state.data, habits: nextHabits },
        error: null,
      });

      try {
        await setHabitsOrderRemote(
          orderedHabitIds.map((id, i) => ({ id, sort_order: i })),
        );
      } catch (e) {
        setState({
          status: 'ready',
          data: { ...state.data, habits: prevHabits },
          error: null,
        });
        throw e;
      }
    },
    [userId, state],
  );

  const restoreHabit = useCallback(
    async (habitId: string) => {
      if (!userId || state.status !== 'ready') return;
      // Find the next free slot (no active assignment).
      const occupied = new Set(
        state.data.assignments
          .filter((a) => a.end_date === null)
          .map((a) => a.slot_index),
      );
      const nextSlot = SLOT_INDEXES.find((i) => !occupied.has(i));
      if (!nextSlot) {
        throw new Error('אין סלוט פנוי — מחק או ארכב הרגל אחר קודם');
      }
      const prevHabits = state.data.habits;
      const prevAssignments = state.data.assignments;
      const todayStr = toDateString(new Date());

      // Optimistic: clear archived_at and create a new assignment.
      const nextHabits = prevHabits.map((h) =>
        h.id === habitId ? { ...h, archived_at: null } : h,
      );
      const nextAssignments: SlotAssignment[] = [
        ...prevAssignments,
        {
          id: `optimistic-restore-${habitId}`,
          user_id: userId,
          slot_index: nextSlot,
          habit_id: habitId,
          start_date: todayStr,
          end_date: null,
        },
      ];
      setState({
        status: 'ready',
        data: {
          ...state.data,
          habits: nextHabits,
          assignments: nextAssignments,
        },
        error: null,
      });

      try {
        await restoreHabitRemote({ userId, habitId, slotIndex: nextSlot });
      } catch (e) {
        setState({
          status: 'ready',
          data: {
            ...state.data,
            habits: prevHabits,
            assignments: prevAssignments,
          },
          error: null,
        });
        throw e;
      }
    },
    [userId, state],
  );

  const deleteHabitPermanently = useCallback(
    async (habitId: string) => {
      if (!userId || state.status !== 'ready') return;
      const prevHabits = state.data.habits;
      const prevAssignments = state.data.assignments;
      const prevLogs = state.data.logs;

      // Optimistic: drop the habit and everything that references it.
      const nextHabits = prevHabits.filter((h) => h.id !== habitId);
      const nextAssignments = prevAssignments.filter(
        (a) => a.habit_id !== habitId,
      );
      const nextLogs = prevLogs.filter((l) => l.habit_id !== habitId);
      setState({
        status: 'ready',
        data: {
          habits: nextHabits,
          assignments: nextAssignments,
          logs: nextLogs,
        },
        error: null,
      });

      try {
        await deleteHabitPermanentlyRemote(habitId);
      } catch (e) {
        setState({
          status: 'ready',
          data: {
            habits: prevHabits,
            assignments: prevAssignments,
            logs: prevLogs,
          },
          error: null,
        });
        throw e;
      }
    },
    [userId, state],
  );

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return {
    status: state.status,
    error: state.error,
    habits: state.status === 'ready' ? state.data.habits : [],
    stats,
    combined,
    slotsForRange,
    setLog,
    createHabit,
    updateHabit,
    archiveHabit,
    reorderHabits,
    restoreHabit,
    deleteHabitPermanently,
    reload,
  };
}
