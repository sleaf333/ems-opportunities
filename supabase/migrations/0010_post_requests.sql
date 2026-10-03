-- EMS Opportunities Portal: members request posting access.
--
-- Run once in the Supabase SQL editor, after 0009. Safe to run twice. If
-- Supabase offers "Run and enable RLS", choose "Run without RLS": this file
-- turns RLS on itself.
--
-- Instead of an admin approving people one by one in advance, a member who
-- wants to post clicks "Request posting access" (with an optional note).
-- Admins see waiting requests on the Admin page and approve or decline them,
-- one at a time or all at once. Approving makes the person a poster (logged in
-- role_changes like any role change). Requests are kept as a record.

create table if not exists public.post_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz
);

-- One waiting request per person.
create unique index if not exists post_requests_one_pending
  on public.post_requests (user_id) where status = 'pending';

-- A member asks to post. Returns 'requested' or 'already' (one is waiting).
create or replace function public.request_posting(p_note text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Please sign in first';
  end if;
  if public.can_post() then
    raise exception 'You can already post';
  end if;
  if exists (select 1 from public.post_requests where user_id = v_uid and status = 'pending') then
    return 'already';
  end if;
  insert into public.post_requests (user_id, note)
  values (v_uid, left(trim(coalesce(p_note, '')), 500));
  return 'requested';
end;
$$;

-- Admins approve or decline waiting requests. Approving makes members
-- posters (admins and existing posters keep their role). Returns how many
-- requests were decided.
create or replace function public.admin_decide_post_requests(p_ids bigint[], p_approve boolean)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this';
  end if;

  with decided as (
    update public.post_requests
    set status = case when p_approve then 'approved' else 'declined' end,
        decided_by = auth.uid(),
        decided_at = now()
    where id = any (coalesce(p_ids, '{}')) and status = 'pending'
    returning user_id
  ), promoted as (
    update public.profiles p
    set role = 'poster'
    from decided d
    where p_approve and p.id = d.user_id and p.role = 'member'
    returning p.id
  )
  select count(*) into v_count from decided;

  return v_count;
end;
$$;

-- Full backup now includes posting requests.
create or replace function public.admin_export_all() returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can download a full backup';
  end if;

  insert into public.backup_log (downloaded_by) values (auth.uid());

  return jsonb_build_object(
    'exported_at', now(),
    'schema_version', 10,
    'profiles', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.profiles t),
    'member_interests', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id), '[]') from public.member_interests t),
    'member_interest_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.category_id), '[]') from public.member_interest_categories t),
    'member_presets', (select coalesce(jsonb_agg(to_jsonb(t) order by t.email), '[]') from public.member_presets t),
    'interest_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]') from public.interest_categories t),
    'opportunities', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.opportunities t),
    'opportunity_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.opportunity_id, t.category_id), '[]') from public.opportunity_categories t),
    'opportunity_owners', (select coalesce(jsonb_agg(to_jsonb(t) order by t.opportunity_id, t.user_id), '[]') from public.opportunity_owners t),
    'owner_changes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.owner_changes t),
    'opportunity_history', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.opportunity_history t),
    'signups', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.signups t),
    'signup_events', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.signup_events t),
    'role_changes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.role_changes t),
    'post_requests', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.post_requests t),
    'backup_log', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.backup_log t)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

-- Members see their own requests; admins see all. Writes only through the
-- functions above.
revoke all on table public.post_requests from anon, authenticated;
alter table public.post_requests enable row level security;
grant select on public.post_requests to authenticated;
drop policy if exists post_requests_select on public.post_requests;
create policy post_requests_select on public.post_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

revoke execute on function public.request_posting(text) from public, anon, authenticated;
revoke execute on function public.admin_decide_post_requests(bigint[], boolean) from public, anon, authenticated;
grant execute on function public.request_posting(text) to authenticated;
grant execute on function public.admin_decide_post_requests(bigint[], boolean) to authenticated;
