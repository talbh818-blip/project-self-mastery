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

type Loaded = {
  habits: Habit[];
  assignments: SlotAssignment[];
  logs: HabitLog[];
};

type State =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: Loaded; error: null }
  | { status: 'error'; data: null; error: string };

export type UseHabitData = {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  /** All habits owned by the user, including archived. */
  habits: Habit[];
  stats: UserStats | null;
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
  const [state, setState] = useState<State>({
    status: 'loading',
    data: null,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });
    fetchAllUserData(userId)
      .then((data) => {
        if (cancelled) return;
        // Overlay any un-synced offline marks so they survive the reload,
        // then try to push them now that we (presumably) have the network.
        const logs = applyOutbox(userId, data.logs);
        setState({ status: 'ready', data: { ...data, logs }, error: null });
        void flushOutbox(userId);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
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
        });
        // Success — make sure no stale offline copy lingers for this cell.
        clearCell(userId, habitId, date);
      } catch (e) {
        const offline =
          typeof navigator !== 'undefined' && navigator.onLine === false;
        if (offline) {
          // OFFLINE: keep the optimistic mark and queue it for later. The
          // 'online' listener (below) flushes it when the network returns.
          enqueueLog(userId, { habitId, date, status, amount, targetAtLog });
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
