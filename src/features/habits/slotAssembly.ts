// ============================================================================
// Pure slot assembly — no I/O. Operates on in-memory data so the UI can
// derive SlotView[] for any range without hitting the server.
//
// Semantics: each slot always shows the habit that is CURRENTLY active in
// it (the assignment with end_date IS NULL). The visible range only filters
// the logs (marks/amounts), not the habit itself. This means a habit you
// created today will also appear when you scroll back to past weeks — just
// with no marks for those past days.
// ============================================================================
import type {
  Habit,
  HabitLog,
  SlotAssignment,
  SlotIndex,
  SlotView,
} from './types';
import { SLOT_INDEXES } from './types';
import { toDateString } from './week';

export function assembleSlots(
  habits: Habit[],
  assignments: SlotAssignment[],
  logs: HabitLog[],
  range: { start: Date; end: Date },
): SlotView[] {
  const startStr = toDateString(range.start);
  const endStr = toDateString(range.end);

  // 1. Pick the active assignment per slot (end_date IS NULL). If multiple
  // are somehow active for the same slot (data races), prefer the latest
  // start_date.
  const bySlot = new Map<SlotIndex, SlotAssignment>();
  for (const a of assignments) {
    if (a.end_date !== null) continue;
    const cur = bySlot.get(a.slot_index);
    if (!cur || a.start_date > cur.start_date) {
      bySlot.set(a.slot_index, a);
    }
  }

  // 2. Habit lookup, hiding archived habits.
  const habitsById = new Map(habits.map((h) => [h.id, h]));

  // 3. Build SlotView per slot. Logs are filtered to the visible range.
  return SLOT_INDEXES.map((slot) => {
    const a = bySlot.get(slot);
    const candidate = a ? habitsById.get(a.habit_id) ?? null : null;
    const habit = candidate && !candidate.archived_at ? candidate : null;
    const marks: SlotView['marks'] = {};
    const amounts: SlotView['amounts'] = {};
    if (habit) {
      for (const log of logs) {
        if (
          log.habit_id === habit.id &&
          log.date >= startStr &&
          log.date <= endStr
        ) {
          marks[log.date] = log.status;
          amounts[log.date] = log.amount;
        }
      }
    }
    return { slot_index: slot, habit, marks, amounts, habitStartDate: a?.start_date ?? null };
  });
}
