export type HabitType = 'positive' | 'negative';
export type LogStatus = 'V' | 'X' | 'auto_x';
export type SlotIndex = 1 | 2 | 3 | 4 | 5;

export const SLOT_INDEXES: readonly SlotIndex[] = [1, 2, 3, 4, 5] as const;

export type CatalogItem = {
  id: string;
  name: string;
  type: HabitType;
  icon: string;
  sort_order: number;
};

export type Habit = {
  id: string;
  user_id: string;
  catalog_id: string | null;
  name: string;
  icon: string;
  type: HabitType;
};

export type SlotAssignment = {
  id: string;
  user_id: string;
  slot_index: SlotIndex;
  habit_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
};

export type HabitLog = {
  id: string;
  user_id: string;
  habit_id: string;
  date: string; // YYYY-MM-DD
  status: LogStatus;
};

// What renders inside a single slot column for a given week.
export type SlotView = {
  slot_index: SlotIndex;
  habit: Habit | null; // null = empty slot (no habit chosen yet for this week)
  marks: Record<string, LogStatus | undefined>; // date string → status
};
