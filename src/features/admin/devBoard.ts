// ============================================================================
// Dev board data access — the Trello-style planning board in the admin panel.
// ----------------------------------------------------------------------------
// Two tables (migration 0053): dev_board_columns (lanes) and dev_board_cards
// (tasks). Admin-only RLS — a regular user never reads these rows. Ordering is
// by `position` (lower first); the UI reindexes positions after a drag and
// persists the affected rows.
// ============================================================================
import { supabase } from '../../lib/supabase';

// Keyed label palette — the UI (DevBoardAdminPanel) owns the hex + Hebrew
// label for each key. Stored as the key so the palette can change without a
// data migration; an unknown key falls back to 'slate' in the UI.
export type DevCardColor =
  | 'slate'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink';

export type DevColumn = {
  id: string;
  title: string;
  position: number;
};

export type DevCard = {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  color: DevCardColor;
  position: number;
};

// One round-trip loads the whole board — two small tables, no join needed.
export async function fetchDevBoard(): Promise<{
  columns: DevColumn[];
  cards: DevCard[];
}> {
  const [colsRes, cardsRes] = await Promise.all([
    supabase
      .from('dev_board_columns')
      .select('id,title,position')
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('dev_board_cards')
      .select('id,column_id,title,description,color,position')
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);
  if (colsRes.error) throw colsRes.error;
  if (cardsRes.error) throw cardsRes.error;
  return {
    columns: (colsRes.data ?? []) as DevColumn[],
    cards: (cardsRes.data ?? []) as DevCard[],
  };
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------
export async function createColumn(
  title: string,
  position: number,
): Promise<DevColumn> {
  const { data, error } = await supabase
    .from('dev_board_columns')
    .insert({ title, position })
    .select('id,title,position')
    .single();
  if (error) throw error;
  return data as DevColumn;
}

export async function renameColumn(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('dev_board_columns')
    .update({ title })
    .eq('id', id);
  if (error) throw error;
}

// Cards cascade-delete with the column (FK on delete cascade).
export async function deleteColumn(id: string): Promise<void> {
  const { error } = await supabase
    .from('dev_board_columns')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------
export async function createCard(input: {
  columnId: string;
  title: string;
  description: string | null;
  color: DevCardColor;
  position: number;
}): Promise<DevCard> {
  const { data, error } = await supabase
    .from('dev_board_cards')
    .insert({
      column_id: input.columnId,
      title: input.title,
      description: input.description,
      color: input.color,
      position: input.position,
    })
    .select('id,column_id,title,description,color,position')
    .single();
  if (error) throw error;
  return data as DevCard;
}

export async function updateCard(
  id: string,
  patch: Partial<Pick<DevCard, 'title' | 'description' | 'color'>>,
): Promise<void> {
  const { error } = await supabase
    .from('dev_board_cards')
    .update(patch)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from('dev_board_cards').delete().eq('id', id);
  if (error) throw error;
}

// After a drag, the UI reindexes the affected column(s) locally and hands us
// the cards whose column_id / position changed. Small board → a handful of
// single-row updates in parallel is fine.
export async function persistCardPlacements(
  items: { id: string; column_id: string; position: number }[],
): Promise<void> {
  if (items.length === 0) return;
  const results = await Promise.all(
    items.map((it) =>
      supabase
        .from('dev_board_cards')
        .update({ column_id: it.column_id, position: it.position })
        .eq('id', it.id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
