-- ============================================================================
-- Migration 0010 — re-palette existing habits to the new 21-swatch palette
-- ============================================================================
-- The HABIT_COLORS palette was rewritten to a 21-swatch rainbow (7 cols x 3
-- rows) matching the user's reference image. Habits created against either of
-- the two previous palettes (the original pastel set, and the brighter Habit-
-- Kit-inspired set) are migrated to the closest match in the new palette so
-- the UI stays consistent everywhere — picker, week strip, monthly heatmap.
--
-- Already applied to the live DB via the Supabase Management API; this file
-- documents both passes for fresh deployments.
-- ============================================================================

-- Pass 1 — bright HabitKit-style set → new palette
update public.habits
set color = case lower(color)
  when '#ff3b3b' then '#F76C6C'  -- red
  when '#ff8500' then '#F2994A'  -- orange
  when '#ffd700' then '#FFE066'  -- yellow
  when '#aaee00' then '#A8D63B'  -- lime
  when '#2ecc71' then '#4ED371'  -- green
  when '#1fd1b3' then '#1FD1AC'  -- mint
  when '#3ec5f5' then '#22BCDB'  -- cyan
  when '#4d8aff' then '#2D8FDE'  -- blue
  when '#a070ff' then '#A175F2'  -- lavender
  when '#ff5fae' then '#EB80B5'  -- pink
  when '#a8b1bd' then '#8B9DAF'  -- blue-gray
  when '#56aa70' then '#4ED371'  -- old DB default green → new green
  else color
end;

-- Pass 2 — original pastel set → new palette
update public.habits
set color = case lower(color)
  when '#e57373' then '#F76C6C'  -- red
  when '#f0a05a' then '#F2994A'  -- orange
  when '#e8c44d' then '#FFE066'  -- yellow
  when '#a6c553' then '#A8D63B'  -- lime
  when '#4ec3a8' then '#1FD1AC'  -- mint
  when '#62b6dc' then '#22BCDB'  -- cyan
  when '#5b8cd9' then '#2D8FDE'  -- blue
  when '#9b7bd4' then '#A175F2'  -- lavender
  when '#e58aba' then '#EB80B5'  -- pink
  when '#9aa3ab' then '#8B9DAF'  -- blue-gray
  else color
end;
