-- Minimal stand-in for the parts of Supabase the schema depends on, so the
-- migration can be tested on plain Postgres. Mirrors Supabase's default
-- grants, which the migration is expected to tighten.

-- Roles are shared by every database in the cluster, so create them once.
do $$
begin
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Supabase reads the signed-in user's id from the request's JWT.
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- Test helpers.
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.expect_error(p_sql text, p_pattern text) returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike p_pattern then
      return;
    end if;
    raise exception 'TEST FAILED: expected error like "%" but got "%" for: %', p_pattern, sqlerrm, p_sql;
  end;
  raise exception 'TEST FAILED: expected error like "%" but it succeeded: %', p_pattern, p_sql;
end;
$$;

create function tests.eq(p_actual text, p_expected text, p_label text) returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'TEST FAILED: % (expected %, got %)', p_label, p_expected, p_actual;
  end if;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;
