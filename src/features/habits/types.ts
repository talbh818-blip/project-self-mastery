export type HabitType = 'positive' | 'negative';
export type LogStatus = 'V' | 'X' | 'auto_x';
export type Difficulty = 'easy' | 'medium' | 'hard';
// How the habit's description text should be rendered. For the list formats
// the `description` column holds one item per line; for 'text' it's a plain
// sentence (the legacy default).
export type DescriptionFormat = 'text' | 'bullets' | 'numbers' | 'checklist';
export type SlotIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type FrequencyPeriod = 'daily' | 'weekly' | 'monthly';

export const SLOT_INDEXES: readonly SlotIndex[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
] as const;

// Curated palette offered when picking a habit color.
// 21 swatches arranged as 7 columns × 3 rows in the picker — matches the
// HabitKit-style rainbow the user requested. Row 1 = warm spectrum, row 2 =
// cool spectrum, row 3 = pinks + grays.
export type HabitColor = { name: string; hex: string };
export const HABIT_COLORS: readonly HabitColor[] = [
  // Row 1 — warm: red → orange → yellow → green
  { name: 'אדום',      hex: '#F76C6C' },
  { name: 'כתום',      hex: '#F2994A' },
  { name: 'זהב',       hex: '#F2C94C' },
  { name: 'צהוב',      hex: '#FFE066' },
  { name: 'ליים',      hex: '#A8D63B' },
  { name: 'ירוק',      hex: '#4ED371' },
  { name: 'אזמרגד',    hex: '#27AE92' },
  // Row 2 — cool: cyan → blue → purple
  { name: 'מנטה',      hex: '#1FD1AC' },
  { name: 'תכלת',      hex: '#22BCDB' },
  { name: 'כחול',      hex: '#2D8FDE' },
  { name: 'אינדיגו',   hex: '#4F7BEE' },
  { name: 'סגול',      hex: '#6962F2' },
  { name: 'לבנדר',     hex: '#A175F2' },
  { name: 'סגול-ורוד', hex: '#B770EF' },
  // Row 3 — pinks + grays
  { name: 'מג׳נטה',     hex: '#CB7AEF' },
  { name: 'ורוד',       hex: '#EB80B5' },
  { name: 'אלמוג',      hex: '#EE6D85' },
  { name: 'אפור-כחול', hex: '#8B9DAF' },
  { name: 'אפור בהיר', hex: '#ACB0B5' },
  { name: 'אפור',       hex: '#8E9296' },
  { name: 'אפור כהה',  hex: '#787A7C' },
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
  description_format: DescriptionFormat; // how to render `description`
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
  /** YYYY-MM-DD the habit was assigned to this slot — days before this date
   *  should render as completely blank (no dash) rather than "missed". */
  habitStartDate: string | null;
};
