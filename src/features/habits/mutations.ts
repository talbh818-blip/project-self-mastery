import { supabase } from '../../lib/supabase';
import type { CatalogItem, Habit, HabitType, LogStatus, SlotIndex } from './types';
import { toDateString } from './week';

// ----------------------------------------------------------------------------
// Assign a habit (from catalog or custom) to a slot, starting today.
// Closes any currently active assignment for that slot.
// ----------------------------------------------------------------------------
export type CatalogChoice = { kind: 'catalog'; item: CatalogItem };
export type CustomChoice = {
  kind: 'custom';
  name: string;
  icon: string;
  type: HabitType;
};
export type HabitChoice = CatalogChoice | CustomChoice;

export async function assignHabitToSlot(params: {
  userId: string;
  slotIndex: SlotIndex;
  choice: HabitChoice;
}): Promise<void> {
  const { userId, slotIndex, choice } = params;
  const today = toDateString(new Date());

  // 1. Find or create the habit row.
  let habit: Habit | null = null;

  if (choice.kind === 'catalog') {
    // Reuse an existing habit row for this catalog item if the user already has one.
    const { data: existing, error: findErr } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', userId)
      .eq('catalog_id', choice.item.id)
      .limit(1)
      .maybeSingle();
    if (findErr) throw findErr;
    if (existing) {
      habit = existing as Habit;
    } else {
      const { data: created, error: insErr } = await supabase
        .from('habits')
        .insert({
          user_id: userId,
          catalog_id: choice.item.id,
          name: choice.item.name,
          icon: choice.item.icon,
          type: choice.item.type,
        })
        .select('*')
        .single();
      if (insErr) throw insErr;
      habit = created as Habit;
    }
  } else {
    // Custom — always create a fresh row.
    const { data: created, error: insErr } = await supabase
      .from('habits')
      .insert({
        user_id: userId,
        catalog_id: null,
        name: choice.name.trim(),
        icon: choice.icon,
        type: choice.type,
      })
      .select('*')
      .single();
    if (insErr) throw insErr;
    habit = created as Habit;
  }

  if (!habit) throw new Error('Failed to resolve habit');

  // 2. Close any currently active assignment for this slot.
  const { error: closeErr } = await supabase
    .from('habit_slot_assignments')
    .update({ end_date: today })
    .eq('user_id', userId)
    .eq('slot_index', slotIndex)
    .is('end_date', null);
  if (closeErr) throw closeErr;

  // 3. Create the new assignment.
  const { error: assignErr } = await supabase.from('habit_slot_assignments').insert({
    user_id: userId,
    slot_index: slotIndex,
    habit_id: habit.id,
    start_date: today,
    end_date: null,
  });
  if (assignErr) throw assignErr;
}

// ----------------------------------------------------------------------------
// Mark a day for a habit. Cycles through: blank → V → X → blank.
// Passing newStatus=null deletes the log row (= blank / "–").
// ----------------------------------------------------------------------------
export async function setHabitLog(params: {
  userId: string;
  habitId: string;
  date: string; // YYYY-MM-DD
  newStatus: LogStatus | null;
}): Promise<void> {
  const { userId, habitId, date, newStatus } = params;

  if (newStatus === null) {
    const { error } = await supabase
      .from('habit_logs')
      .delete()
      .eq('user_id', userId)
      .eq('habit_id', habitId)
      .eq('date', date);
    if (error) throw error;
    return;
  }

  // Upsert by (habit_id, date) — the table has a unique constraint on (habit_id, date).
  const { error } = await supabase
    .from('habit_logs')
    .upsert(
      {
        user_id: userId,
        habit_id: habitId,
        date,
        status: newStatus,
      },
      { onConflict: 'habit_id,date' },
    );
  if (error) throw error;
}

// Cycle the mark for a single day. Auto-X behaves like X for cycling
// (i.e. clicking an auto-X cell turns it into a blank).
export function nextMarkInCycle(current: LogStatus | undefined): LogStatus | null {
  if (current === undefined) return 'V';
  if (current === 'V') return 'X';
  // 'X' or 'auto_x' → blank
  return null;
}
