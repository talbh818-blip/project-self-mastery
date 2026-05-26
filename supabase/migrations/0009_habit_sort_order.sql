-- 0009_habit_sort_order.sql
-- User-controlled display order for habits.
-- The UI sorts visible rows by (type, sort_order) so positive habits group
-- above negative ones, with each group ordered independently. Default 0 for
-- existing rows; the picker will normalize them on the first reorder.

alter table public.habits
  add column if not exists sort_order int not null default 0;

create index if not exists habits_user_type_order_idx
  on public.habits(user_id, type, sort_order);
