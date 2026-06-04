-- ============================================================================
-- Enable Supabase Realtime for vision_entries (migration 0020)
-- ============================================================================
-- Lets a user's vision edits sync LIVE across their devices: writing on the
-- phone pushes the change to the desktop (and vice-versa) the moment it's
-- saved. The client subscribes via postgres_changes; RLS still applies, so
-- each user only ever receives their own rows.
--
--   • Add the table to the `supabase_realtime` publication so INSERT/UPDATE/
--     DELETE events are broadcast.
--   • REPLICA IDENTITY FULL so UPDATE payloads carry the complete new row
--     (including the `content` jsonb), which the client applies directly.
--
-- Idempotent — safe to re-run.
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vision_entries'
  ) then
    alter publication supabase_realtime add table public.vision_entries;
  end if;
end$$;

alter table public.vision_entries replica identity full;
