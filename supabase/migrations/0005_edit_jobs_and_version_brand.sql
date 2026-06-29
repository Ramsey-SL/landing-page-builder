-- Prompt-based edits: child versions carry the instruction + a brand snapshot,
-- and 'edit' becomes a valid job kind / version type.
alter table versions add column if not exists instruction text;
alter table versions add column if not exists brand jsonb;

alter table jobs drop constraint if exists jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind in ('clone','publish','edit'));

alter table versions drop constraint if exists versions_type_check;
alter table versions add constraint versions_type_check check (type in ('clone','inspired','edit'));
