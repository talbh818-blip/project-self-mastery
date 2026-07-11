// ============================================================================
// useCellNotes — loads the user's per-cell notes once and exposes a lookup +
// an optimistic saver. Deliberately SEPARATE from useHabitData so a failure
// here can never break the core habit grid (see cellNotes.ts).
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import {
  fetchCellNotes,
  isCellNoteEmpty,
  saveCellNote,
  type CellNoteInput,
} from './cellNotes';
import type { HabitCellNote } from './types';

const keyOf = (habitId: string, date: string) => `${habitId}:${date}`;

export type UseCellNotes = {
  /** The note on (habit, date), or undefined if none. */
  getNote: (habitId: string, date: string) => HabitCellNote | undefined;
  /** Save (or clear) the note — optimistic, persists in the background. */
  saveNote: (
    habitId: string,
    date: string,
    input: CellNoteInput,
  ) => Promise<void>;
};

export function useCellNotes(userId: string | null): UseCellNotes {
  const [notes, setNotes] = useState<Map<string, HabitCellNote>>(new Map());

  useEffect(() => {
    if (!userId) {
      setNotes(new Map());
      return;
    }
    let cancelled = false;
    void fetchCellNotes(userId).then((rows) => {
      if (cancelled) return;
      const m = new Map<string, HabitCellNote>();
      for (const r of rows) m.set(keyOf(r.habit_id, r.date), r);
      setNotes(m);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const getNote = useCallback(
    (habitId: string, date: string) => notes.get(keyOf(habitId, date)),
    [notes],
  );

  const saveNote = useCallback(
    async (habitId: string, date: string, input: CellNoteInput) => {
      if (!userId) return;
      const k = keyOf(habitId, date);
      const prev = notes;
      // Optimistic update.
      const next = new Map(prev);
      if (isCellNoteEmpty(input)) {
        next.delete(k);
      } else {
        next.set(k, {
          habit_id: habitId,
          date,
          text: input.text?.trim() ? input.text.trim() : null,
          symbol: input.symbol ?? null,
          color: input.color ?? null,
        });
      }
      setNotes(next);
      try {
        await saveCellNote({ userId, habitId, date, input });
      } catch (e) {
        setNotes(prev); // rollback on failure
        throw e;
      }
    },
    [userId, notes],
  );

  return { getNote, saveNote };
}
