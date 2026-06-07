import { supabase } from '../../lib/supabase';
import type {
  DescriptionFormat,
  Difficulty,
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
  description_format: DescriptionFormat;
  icon: string;
  type: HabitType;
  color: string; // hex
  frequency_period: FrequencyPeriod;
  frequency_target: number;
  is_quantitative: boolean;
  quantitative_target: number | null;
  quantitative_unit: string | null;
  difficulty: Difficulty;
};

export async function createHabitInSlot(params: {
  userId: string;
  slotIndex: SlotIndex;
  input: CreateHabitInput;
  /** Optional explicit display order. If omitted, the DB default (0) is used. */
  sortOrder?: number;
}): Promise<Habit> {
  const { userId, slotIndex, input, sortOrder } = params;
  const today = toDateString(new Date());

  // 1. Insert the habit row.
  const { data: created, error: insErr } = await supabase
    .from('habits')
    .insert({
      user_id: userId,
      catalog_id: null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      description_format: input.description_format,
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
      ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}),
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
  /** Per-day target in effect now; snapshotted so future target changes don't
   *  retroactively re-judge this day. Null for binary habits. */
  targetAtLog?: number | null;
}): Promise<void> {
  const { userId, habitId, date, newStatus, newAmount = null, targetAtLog = null } = params;

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
        target_at_log: targetAtLog,
      },
      { onConflict: 'habit_id,date' },
    );
  if (error) throw error;
}

// Cycle the mark for a single day on a *binary* habit.
// blank / auto_x → V in one tap. V → blank. Explicit X → blank (clear first).
//
// Key distinction:
//  - 'auto_x'  is VIRTUAL (computed by scoring, no DB row).
//    Trying to "clear" it writes nothing → status never changes → infinite loop.
//    So we skip the clear step and go straight to V.
//  - 'X'       is an explicit user mark stored in the DB.
//    Clear it first; a second tap will then set V.
export function nextMarkInCycle(current: LogStatus | undefined): LogStatus | null {
  if (current === 'V') return null;
  if (current === undefined || current === 'auto_x') return 'V';
  // Explicit 'X' — clear it so the user can re-mark as V on the next tap.
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

// ----------------------------------------------------------------------------
// Update an existing habit's metadata (name, description, icon, color, etc.).
// Returns the updated row.
// ----------------------------------------------------------------------------
export type UpdateHabitInput = {
  name: string;
  description: string | null;
  description_format: DescriptionFormat;
  icon: string;
  type: HabitType;
  color: string;
  frequency_period: FrequencyPeriod;
  frequency_target: number;
  is_quantitative: boolean;
  quantitative_target: number | null;
  quantitative_unit: string | null;
  difficulty: Difficulty;
};

export async function updateHabit(
  habitId: string,
  input: UpdateHabitInput,
): Promise<Habit> {
  const { data, error } = await supabase
    .from('habits')
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      description_format: input.description_format,
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
    })
    .eq('id', habitId)
    .select('*')
    .single();
  if (error) throw error;
  return data as Habit;
}

// ----------------------------------------------------------------------------
// Archive a habit. Soft-delete: sets archived_at = now() AND closes any active
// slot assignment so the slot frees up immediately. Logs are preserved.
// ----------------------------------------------------------------------------
export async function archiveHabit(params: {
  userId: string;
  habitId: string;
}): Promise<{ archived_at: string }> {
  const { userId, habitId } = params;
  const today = toDateString(new Date());
  const nowIso = new Date().toISOString();

  const { error: updErr } = await supabase
    .from('habits')
    .update({ archived_at: nowIso })
    .eq('id', habitId);
  if (updErr) throw updErr;

  const { error: closeErr } = await supabase
    .from('habit_slot_assignments')
    .update({ end_date: today })
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .is('end_date', null);
  if (closeErr) throw closeErr;

  return { archived_at: nowIso };
}

// ----------------------------------------------------------------------------
// Restore a previously-archived habit. Clears archived_at AND opens a new
// active assignment in the given slot, so the habit re-appears in the list
// immediately.
// ----------------------------------------------------------------------------
export async function restoreHabit(params: {
  userId: string;
  habitId: string;
  slotIndex: SlotIndex;
}): Promise<void> {
  const { userId, habitId, slotIndex } = params;
  const today = toDateString(new Date());

  const { error: updErr } = await supabase
    .from('habits')
    .update({ archived_at: null })
    .eq('id', habitId);
  if (updErr) throw updErr;

  const { error: insErr } = await supabase
    .from('habit_slot_assignments')
    .insert({
      user_id: userId,
      slot_index: slotIndex,
      habit_id: habitId,
      start_date: today,
      end_date: null,
    });
  if (insErr) throw insErr;
}

// ----------------------------------------------------------------------------
// Hard-delete a habit. ON DELETE CASCADE handles logs and assignments.
// Irreversible — only used from the archive screen.
// ----------------------------------------------------------------------------
export async function deleteHabitPermanently(habitId: string): Promise<void> {
  const { error } = await supabase
    .from('habits')
    .delete()
    .eq('id', habitId);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// Bulk-set sort_order for a set of habits. Used after a drag-and-drop
// reorder. We send the updates in parallel; each row gets exactly one update.
// ----------------------------------------------------------------------------
export async function setHabitsOrder(
  updates: { id: string; sort_order: number }[],
): Promise<void> {
  if (updates.length === 0) return;
  const results = await Promise.all(
    updates.map((u) =>
      supabase
        .from('habits')
        .update({ sort_order: u.sort_order })
        .eq('id', u.id),
    ),
  );
  for (const r of results) {
    if (r.error) throw r.error;
  }
}
