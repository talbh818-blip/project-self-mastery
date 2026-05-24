import { supabase } from '../../lib/supabase';
import type {
  FrequencyPeriod,
  Habit,
  HabitType,
  LogStatus,
  SlotIndex,
} from './types';
import { toDateString } from './week';

// ----------------------------------------------------------------------------
// Create a fully-custom habit (no catalog template) and assign it to a slot.
// Closes any currently active assignment for that slot, starting today.
// ----------------------------------------------------------------------------
export type CreateHabitInput = {
  name: string;
  description: string | null;
  icon: string;
  type: HabitType;
  color: string; // hex
  frequency_period: FrequencyPeriod;
  frequency_target: number;
  is_quantitative: boolean;
  quantitative_target: number | null;
  quantitative_unit: string | null;
};

export async function createHabitInSlot(params: {
  userId: string;
  slotIndex: SlotIndex;
  input: CreateHabitInput;
}): Promise<Habit> {
  const { userId, slotIndex, input } = params;
  const today = toDateString(new Date());

  // 1. Insert the habit row.
  const { data: created, error: insErr } = await supabase
    .from('habits')
    .insert({
      user_id: userId,
      catalog_id: null,
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
    })
    .select('*')
    .single();
  if (insErr) throw insErr;
  const habit = created as Habit;

  // 2. Close any currently active assignment for this slot.
  const { error: closeErr } = await supabase
    .from('habit_slot_assignments')
    .update({ end_date: today })
    .eq('user_id', userId)
    .eq('slot_index', slotIndex)
    .is('end_date', null);
  if (closeErr) throw closeErr;

  // 3. Create the new assignment.
  const { error: assignErr } = await supabase
    .from('habit_slot_assignments')
    .insert({
      user_id: userId,
      slot_index: slotIndex,
      habit_id: habit.id,
      start_date: today,
      end_date: null,
    });
  if (assignErr) throw assignErr;

  return habit;
}

// ----------------------------------------------------------------------------
// Write or clear a log entry for a habit-day.
// Passing newStatus=null deletes the log row (= blank / "–").
// For quantitative habits, pass status='V' along with newAmount.
// ----------------------------------------------------------------------------
export async function setHabitLog(params: {
  userId: string;
  habitId: string;
  date: string; // YYYY-MM-DD
  newStatus: LogStatus | null;
  newAmount?: number | null;
}): Promise<void> {
  const { userId, habitId, date, newStatus, newAmount = null } = params;

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
        amount: newAmount,
      },
      { onConflict: 'habit_id,date' },
    );
  if (error) throw error;
}

// Cycle the mark for a single day on a *binary* habit.
// blank → V → X → blank. Auto-X is treated like X.
export function nextMarkInCycle(current: LogStatus | undefined): LogStatus | null {
  if (current === undefined) return 'V';
  if (current === 'V') return 'X';
  // 'X' or 'auto_x' → blank
  return null;
}

// Cycle the amount for a *quantitative* habit.
// blank → 1 → 2 → ... → target → blank. (Wraps back to empty.)
export function nextAmountInCycle(
  currentAmount: number | null | undefined,
  target: number,
): number | null {
  const safeTarget = Math.max(1, Math.floor(target));
  if (currentAmount === null || currentAmount === undefined || currentAmount <= 0) {
    return 1;
  }
  if (currentAmount >= safeTarget) return null; // cycle back to blank
  return currentAmount + 1;
}
