-- ============================================================================
-- Vision-images storage bucket (migration 0022)
-- ============================================================================
-- Backs the "+" (insert image) action and Ctrl-V paste in the vision editor.
-- Each user can drop images into their own vision entries; those images are
-- stored under {auth.uid()}/{uuid}.jpg in a PRIVATE bucket. Reads go through
-- signed URLs (the app generates them when rendering an entry) so an image
-- URL never leaks outside the owner's own session in normal use.
--
-- Privacy parity with vision_entries (see migration 0015 + section 3 of
-- CLAUDE.md): vision content is owner-only forever; images are part of that
-- content. We do NOT publicise this bucket the way `avatars` is publicised.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- Private bucket — owner-only reads via signed URLs.
insert into storage.buckets (id, name, public)
values ('vision-images', 'vision-images', false)
on conflict (id) do nothing;

drop policy if exists "vision-images owner select" on storage.objects;
drop policy if exists "vision-images owner insert" on storage.objects;
drop policy if exists "vision-images owner update" on storage.objects;
drop policy if exists "vision-images owner delete" on storage.objects;

create policy "vision-images owner select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'vision-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "vision-images owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'vision-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "vision-images owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'vision-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'vision-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "vision-images owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'vision-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
