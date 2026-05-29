// Row shape of public.profiles. Keep in sync with migrations 0011–0014.
export type Theme = 'dark' | 'light';

/**
 * One entry per planted tree, stored on profiles.tree_placements (jsonb).
 * (di, dj) are row/column offsets from the grid centre — see migration 0013.
 */
export type TreePlacement = { di: number; dj: number };

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  theme: Theme;
  trees_planted: number;
  /** Ordered: index k is the k-th tree the user planted. May be SHORTER
   *  than trees_planted for legacy users; the client falls back to the
   *  default cell order for the surplus. */
  tree_placements: TreePlacement[];
  /** Score baseline at the most recent plant (migration 0014). The
   *  progress meter toward the next tree is `totalScore - cycle_score_floor`.
   *  Only the planting action moves this — admin edits to trees_planted
   *  do NOT touch it, so the meter doesn't reset when an admin tweaks
   *  the count. */
  cycle_score_floor: number;
  score_adjustment: number;
  blocked: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};
