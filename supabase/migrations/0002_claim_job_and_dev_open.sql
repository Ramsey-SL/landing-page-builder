-- Atomic job claim for the polling worker.
create or replace function claim_job(p_kind text)
returns jobs language plpgsql security definer as $$
declare j jobs;
begin
  update jobs set state = 'running', updated_at = now()
  where id = (
    select id from jobs
    where kind = p_kind and state = 'queued'
    order by updated_at asc
    limit 1
    for update skip locked
  )
  returning * into j;
  return j; -- null when nothing queued
end $$;

-- TEMPORARY dev-open access: no-login phase. The frontend uses the anon key and
-- there is no auth.uid() yet, so allow anon+authenticated full access. DROP these
-- `dev_open_*` policies when the login/auth flow lands (multi-tenant RLS via
-- is_member() is already in place underneath).
do $$
declare t text;
begin
  foreach t in array array['organizations','memberships','brands','projects','versions','jobs','assets','deployments'] loop
    execute format('create policy dev_open_%1$s on %1$s for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;
