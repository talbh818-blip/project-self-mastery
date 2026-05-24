import { supabase } from '../../lib/supabase';
import type {
  CatalogItem,
  Habit,
  HabitLog,
  SlotAssignment,
  SlotIndex,
  SlotView,
} from './types';
import { SLOT_INDEXES } from './types';
import { toDateString, type WeekRange } from './week';

// ----------------------------------------------------------------------------
// All-user dataset for scoring. Returns the user's habits, all assignments
// (including closed ones), and all logs. Used by useUserStats.
// ----------------------------------------------------------------------------
export async function fetchAllUserData(userId: string): Promise<{
  habits: Habit[];
  assignments: SlotAssignment[];
  logs: HabitLog[];
}> {
  const [habitsRes, assignmentsRes, logsRes] = await Promise.all([
    supabase.from('habits').select('*').eq('user_id', userId),
    supabase.from('habit_slot_assignments').select('*').eq('user_id', userId),
    supabase.from('habit_logs').select('*').eq('user_id', userId),
  ]);
  if (habitsRes.error) throw habitsRes.error;
  if (assignmentsRes.error) throw assignmentsRes.error;
  if (logsRes.error) throw logsRes.error;
  return {
    habits: (habitsRes.data ?? []) as Habit[],
    assignments: (assignmentsRes.data ?? []) as SlotAssignment[],
    logs: (logsRes.data ?? []) as HabitLog[],
  };
}

// ----------------------------------------------------------------------------
// Catalog
// ----------------------------------------------------------------------------
export async function fetchCatalog(): Promise<CatalogItem[]> {
  const { data, error } = await supabase
    .from('habit_catalog')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CatalogItem[];
}

// ----------------------------------------------------------------------------
// Week loader — returns the slot view for the given week.
// ----------------------------------------------------------------------------
// For each slot 1..5 we find the assignment active on ANY day of this week.
// (If a slot was swapped mid-week, we currently surface the assignment whose
// span covers the most days in the week — good enough for v1.)
//
// We then look up the habit + its logs for the week range.
// ----------------------------------------------------------------------------
export async function fetchWeek(
  userId: string,
  range: WeekRange,
): Promise<SlotView[]> {
  const weekStart = toDateString(range.start);
  const weekEnd = toDateString(range.end);

  // 1. All assignments overlapping the week.
  // Overlap: start_date <= weekEnd AND (end_date IS NULL OR end_date > weekStart)
  const { data: assignmentsRaw, error: aErr } = await supabase
    .from('habit_slot_assignments')
    .select('*')
    .eq('user_id', userId)
    .lte('start_date', weekEnd)
    .or(`end_date.is.null,end_date.gt.${weekStart}`);
  if (aErr) throw aErr;
  const assignments = (assignmentsRaw ?? []) as SlotAssignment[];

  // Pick the "primary" assignment per slot for this week:
  //   - prefer the active one (end_date null)
  //   - else the one with the latest start_date inside the week
  const bySlot = new Map<SlotIndex, SlotAssignment>();
  for (const a of assignments) {
    const cur = bySlot.get(a.slot_index);
    if (!cur) {
      bySlot.set(a.slot_index, a);
      continue;
    }
    const curActive = cur.end_date === null;
    const aActive = a.end_date === null;
    if (aActive && !curActive) {
      bySlot.set(a.slot_index, a);
    } else if (aActive === curActive && a.start_date > cur.start_date) {
      bySlot.set(a.slot_index, a);
    }
  }

  // 2. Habits referenced by these assignments.
  const habitIds = Array.from(new Set(Array.from(bySlot.values()).map((a) => a.habit_id)));
  let habitsById = new Map<string, Habit>();
  if (habitIds.length > 0) {
    const { data: habits, error: hErr } = await supabase
      .from('habits')
      .select('*')
      .in('id', habitIds);
    if (hErr) throw hErr;
    habitsById = new Map((habits ?? []).map((h) => [h.id, h as Habit]));
  }

  // 3. Logs for these habits within the week range.
  let logs: HabitLog[] = [];
  if (habitIds.length > 0) {
    const { data: logsData, error: lErr } = await supabase
      .from('habit_logs')
      .select('*')
      .eq('user_id', userId)
      .in('habit_id', habitIds)
      .gte('date', weekStart)
      .lte('date', weekEnd);
    if (lErr) throw lErr;
    logs = (logsData ?? []) as HabitLog[];
  }

  // 4. Assemble per-slot view.
  return SLOT_INDEXES.map((slot) => {
    const a = bySlot.get(slot);
    const habit = a ? habitsById.get(a.habit_id) ?? null : null;
    const marks: SlotView['marks'] = {};
    const amounts: SlotView['amounts'] = {};
    if (habit) {
      for (const log of logs) {
        if (log.habit_id === habit.id) {
          marks[log.date] = log.status;
          amounts[log.date] = log.amount;
        }
      }
    }
    return { slot_index: slot, habit, marks, amounts };
  });
}
