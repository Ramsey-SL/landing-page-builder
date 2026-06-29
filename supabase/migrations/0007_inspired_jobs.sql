-- "Inspired-by": a child version reimagined in the style of a reference URL.
alter table versions add column if not exists reference_url text;

alter table jobs drop constraint if exists jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind in ('clone','publish','edit','inspired'));
