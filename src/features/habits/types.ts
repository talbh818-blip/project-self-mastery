export type HabitType = 'positive' | 'negative';
export type LogStatus = 'V' | 'X' | 'auto_x';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type SlotIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type FrequencyPeriod = 'daily' | 'weekly' | 'monthly';

export const SLOT_INDEXES: readonly SlotIndex[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
] as const;

// Curated palette offered when picking a habit color.
// Names are descriptive; values are concrete hex codes stored on the habit row.
// Vivid / saturated set inspired by HabitKit so the marked cells read as
// solid bright blocks instead of pastel washes.
export type HabitColor = { name: string; hex: string };
export const HABIT_COLORS: readonly HabitColor[] = [
  { name: 'אדום',   hex: '#FF3B3B' },
  { name: 'כתום',   hex: '#FF8500' },
  { name: 'צהוב',   hex: '#FFD700' },
  { name: 'ליים',   hex: '#AAEE00' },
  { name: 'ירוק',   hex: '#2ecc71' },
  { name: 'טורקיז', hex: '#1fd1b3' },
  { name: 'תכלת',   hex: '#3ec5f5' },
  { name: 'כחול',   hex: '#4d8aff' },
  { name: 'סגול',   hex: '#a070ff' },
  { name: 'ורוד',   hex: '#ff5fae' },
  { name: 'אפור',   hex: '#a8b1bd' },
] as const;

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
  description: string | null;
  color: string; // hex
  frequency_period: FrequencyPeriod;
  frequency_target: number; // > 0
  is_quantitative: boolean;
  quantitative_target: number | null;
  quantitative_unit: string | null;
  difficulty: Difficulty; // self-reported difficulty
  sort_order: number; // user-controlled display order within the type group
  archived_at: string | null; // ISO timestamp; non-null = archived
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
  amount: number | null; // populated for quantitative habits, null otherwise
};

// What renders inside a single slot column for a given week.
export type SlotView = {
  slot_index: SlotIndex;
  habit: Habit | null; // null = empty slot (no habit chosen yet for this week)
  marks: Record<string, LogStatus | undefined>; // date string → status
  amounts: Record<string, number | null | undefined>; // date string → amount
};
