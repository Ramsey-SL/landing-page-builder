-- Landing Page Builder — Phase 1 schema (multi-tenant, org-scoped, RLS on).
-- pg-boss manages its own schema/tables on boot, so the job queue isn't here;
-- `jobs` below is the user-facing status mirror the frontend subscribes to.

create extension if not exists "pgcrypto";

-- ---------- core tenancy ----------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'internal',
  created_at timestamptz not null default now()
);

create table memberships (
  org_id uuid not null references organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'editor' check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- ---------- brand (reusable chrome) ----------
create table brands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  name text not null,
  base_url text,
  colors jsonb,
  display_font text,
  display_font_file text,
  logo_svg text,
  announcement text,
  nav jsonb,
  category_strip jsonb,
  footer jsonb,
  newsletter jsonb,
  tracking jsonb,
  created_at timestamptz not null default now()
);

-- ---------- projects & versions ----------
create table projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  name text not null,
  root_url text not null,
  brand_id uuid references brands on delete set null,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);

create table versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  project_id uuid not null references projects on delete cascade,
  parent_version_id uuid references versions on delete set null,
  type text not null default 'clone' check (type in ('clone','inspired')),
  reference_url text,
  status text not null default 'queued' check (status in ('queued','running','ready','failed','published')),
  recipe jsonb,
  scores jsonb,
  preview_url text,
  error text,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  version_id uuid not null references versions on delete cascade,
  kind text not null check (kind in ('clone','publish')),
  state text not null default 'queued' check (state in ('queued','running','succeeded','failed')),
  progress int not null default 0,
  step text,
  error text,
  updated_at timestamptz not null default now()
);

-- ---------- assets & deployments ----------
create table assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  cloudinary_public_id text,
  url text,
  width int,
  height int,
  tags text[],
  category text,
  source text check (source in ('upload','dam','scraped')),
  alt text,
  created_at timestamptz not null default now()
);

create table deployments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  version_id uuid not null references versions on delete cascade,
  platform text not null check (platform in ('netlify','shopify','export')),
  url text,
  state text not null default 'live',
  created_at timestamptz not null default now()
);

-- ---------- helper: is the current user a member of this org? ----------
create or replace function is_member(target_org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from memberships m
    where m.org_id = target_org and m.user_id = auth.uid()
  );
$$;

-- ---------- RLS ----------
alter table organizations enable row level security;
alter table memberships  enable row level security;
alter table brands       enable row level security;
alter table projects     enable row level security;
alter table versions     enable row level security;
alter table jobs         enable row level security;
alter table assets       enable row level security;
alter table deployments  enable row level security;

-- Members can see their org; everything else is gated by org membership.
create policy org_read on organizations for select using (is_member(id));
create policy mem_read on memberships  for select using (user_id = auth.uid() or is_member(org_id));

-- Generic org-scoped read/write for the data tables.
do $$
declare t text;
begin
  foreach t in array array['brands','projects','versions','jobs','assets','deployments'] loop
    execute format('create policy %1$s_rw on %1$s using (is_member(org_id)) with check (is_member(org_id));', t);
  end loop;
end $$;

-- Note: the worker uses the service-role key, which bypasses RLS.
-- Storage: create a public bucket `builds` for rendered HTML + assets, and a
-- `brand-assets` bucket for logos/fonts (configured outside this migration).
