alter table brands add column if not exists display_font_url text;

-- TEMPORARY dev write access to the brand-assets bucket (no-login phase).
-- Drop when auth lands; the worker uses the service role in production anyway.
create policy dev_brand_assets_write on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'brand-assets')
  with check (bucket_id = 'brand-assets');
