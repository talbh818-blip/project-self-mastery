-- Migration 0045 — scoring-neutral "late" mark on habit_logs
--
-- Background: V2 scoring locks a date 4 days after it passes (the marking
-- window). Users asked to still be able to RECORD a habit on an older day —
-- purely as a personal note — WITHOUT it touching the score.
--
-- Implementation: a new status value 'V_late'. Every scoring path (the v2
-- engine RPCs + the dashboard RPCs) keys strictly on status = 'V' (and the
-- v1 penalties on status in ('X','auto_x')), so a 'V_late' row is INVISIBLE
-- to scoring: it earns nothing, doesn't fill a quota slot (so the miss
-- penalty stays), and never revives a streak bonus. Only the UI treats it
-- like a green V. No scoring function changes — just widen the CHECK.
alter table public.habit_logs
  drop constraint if exists habit_logs_status_check;

alter table public.habit_logs
  add constraint habit_logs_status_check
  check (status in ('V', 'X', 'auto_x', 'V_late'));
