-- Snapshot of the original/source page (for side-by-side comparison in the UI).
alter table versions add column if not exists source_preview_url text;
