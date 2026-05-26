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
export type HabitColor = { name: string; hex: string };
export const HABIT_COLORS: readonly HabitColor[] = [
  { name: 'אדום',   hex: '#e57373' },
  { name: 'כתום',   hex: '#f0a05a' },
  { name: 'צהוב',   hex: '#e8c44d' },
  { name: 'ליים',   hex: '#a6c553' },
  { name: 'ירוק',   hex: '#56aa70' },
  { name: 'טורקיז', hex: '#4ec3a8' },
  { name: 'תכלת',   hex: '#62b6dc' },
  { name: 'כחול',   hex: '#5b8cd9' },
  { name: 'סגול',   hex: '#9b7bd4' },
  { name: 'ורוד',   hex: '#e58aba' },
  { name: 'אפור',   hex: '#9aa3ab' },
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
