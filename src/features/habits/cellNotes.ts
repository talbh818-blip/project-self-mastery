// ============================================================================
// Per-cell notes — isolated data access.
// ----------------------------------------------------------------------------
// A long-press on a habit day-cell attaches personal documentation (symbol /
// color / free text) to that single (habit, date). Kept in its OWN table so it
// can never disturb habit_logs or the scoring engine.
//
// DEFENSIVE ON READ: if the table doesn't exist yet (migration pending) or a
// fetch fails, we return [] rather than throwing — the notes feature simply
// no-ops and the rest of the habit screen keeps working. Writes DO surface
// errors so the sheet can tell the user a save didn't land.
// ============================================================================
import { supabase } from '../../lib/supabase';
import type { HabitCellNote } from './types';

const COLS = 'habit_id, date, text, symbol, color';

export type CellNoteInput = {
  text: string | null;
  symbol: string | null;
  color: string | null;
};

/** True when the note carries nothing worth storing (→ delete the row). */
export function isCellNoteEmpty(input: CellNoteInput): boolean {
  return !input.text?.trim() && !input.symbol && !input.color;
}

export async function fetchCellNotes(userId: string): Promise<HabitCellNote[]> {
  const { data, error } = await supabase
    .from('habit_cell_notes')
    .select(COLS)
    .eq('user_id', userId);
  if (error) {
    // Table missing (pre-migration) or transient — degrade to "no notes".
    console.warn('[cellNotes] fetch failed:', error.message);
    return [];
  }
  return (data ?? []) as HabitCellNote[];
}

/** Upsert the note for one (habit, date), or DELETE it when it's now empty.
 *  Returns the saved note, or null when it was cleared. Throws on failure. */
export async function saveCellNote(params: {
  userId: string;
  habitId: string;
  date: string;
  input: CellNoteInput;
}): Promise<HabitCellNote | null> {
  const { userId, habitId, date, input } = params;

  if (isCellNoteEmpty(input)) {
    const { error } = await supabase
      .from('habit_cell_notes')
      .delete()
      .eq('user_id', userId)
      .eq('habit_id', habitId)
      .eq('date', date);
    if (error) throw error;
    return null;
  }

  const note: HabitCellNote = {
    habit_id: habitId,
    date,
    text: input.text?.trim() ? input.text.trim() : null,
    symbol: input.symbol ?? null,
    color: input.color ?? null,
  };
  const { error } = await supabase
    .from('habit_cell_notes')
    .upsert(
      { user_id: userId, ...note },
      { onConflict: 'user_id,habit_id,date' },
    );
  if (error) throw error;
  return note;
}
