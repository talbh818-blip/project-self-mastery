// ============================================================================
// Pure slot assembly — no I/O. Mirrors fetchWeek's logic but operates on
// in-memory data so the UI can derive SlotView[] for any range without
// hitting the server.
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

  // 1. Assignments overlapping the range.
  // Overlap: start_date <= rangeEnd AND (end_date IS NULL OR end_date > rangeStart)
  const overlapping = assignments.filter(
    (a) =>
      a.start_date <= endStr &&
      (a.end_date === null || a.end_date > startStr),
  );

  // 2. Pick the "primary" assignment per slot:
  //   - prefer the active one (end_date null)
  //   - else the one with the latest start_date
  const bySlot = new Map<SlotIndex, SlotAssignment>();
  for (const a of overlapping) {
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

  // 3. Habit lookup.
  const habitsById = new Map(habits.map((h) => [h.id, h]));

  // 4. Build SlotView per slot. Archived habits are treated as if the slot is
  // empty — the user can re-fill it with something new.
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
    return { slot_index: slot, habit, marks, amounts };
  });
}
