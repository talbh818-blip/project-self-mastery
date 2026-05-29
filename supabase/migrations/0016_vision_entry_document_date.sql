-- ============================================================================
-- vision_entries.document_date — user-editable "written on" date (mig 0016)
-- ============================================================================
-- Adds a date the user can attach to each vision entry (the same way a
-- letter has a date at the top). Defaults to the day the row was first
-- inserted, but the user can override it from the editor.
--
-- Order of operations matters: add nullable → backfill from created_at::date
-- → flip to NOT NULL + default current_date. If we added the column with
-- the default in one step, EXISTING rows would all get TODAY's date instead
-- of their actual creation date.
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.vision_entries
  add column if not exists document_date date;

-- Backfill: existing rows take their creation date.
update public.vision_entries
   set document_date = created_at::date
 where document_date is null;

-- Now make it NOT NULL with a server-side default so future rows fill
-- themselves automatically.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vision_entries'
      and column_name = 'document_date'
      and is_nullable = 'YES'
  ) then
    alter table public.vision_entries
      alter column document_date set not null;
  end if;
end$$;

alter table public.vision_entries
  alter column document_date set default current_date;
