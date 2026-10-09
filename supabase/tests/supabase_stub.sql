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

-- Stand-ins for pg_net (web requests), Vault (secrets) and pg_cron (schedule)
-- so the email code can be tested without sending anything. net.sent keeps
-- each request; tests write Brevo's answers into net._http_response.
create schema net;
create table net.sent (
  id bigint generated always as identity primary key,
  url text,
  body jsonb,
  headers jsonb,
  sent_at timestamptz not null default now()
);
create table net._http_response (
  id bigint,
  status_code integer,
  content_type text,
  headers jsonb,
  content text,
  timed_out boolean,
  error_msg text,
  created timestamptz not null default now()
);
create function net.http_post(
  url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds integer default 5000
) returns bigint
language sql
as $$ insert into net.sent (url, body, headers) values (url, body, headers) returning id $$;

create schema vault;
create table vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  secret text
);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;

create schema cron;
create table cron.job (
  jobid bigint generated always as identity primary key,
  jobname text unique,
  schedule text,
  command text
);
create function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql
as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;
