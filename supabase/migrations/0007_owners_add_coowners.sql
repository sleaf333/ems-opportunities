-- EMS Opportunities Portal: owners add their own co-owners.
--
-- Run once in the Supabase SQL editor, after 0006. Safe to run twice. If
-- Supabase offers "Run and enable RLS", choose "Run without RLS": this file
-- turns RLS on itself.
--
-- - Being an owner is enough to edit that post; the poster role is only
--   needed to create new posts (poster approval stays with admins).
-- - Owners can add co-owners by email (the person must have signed in once).
--   Adding does not make anyone a poster, unless an admin does the adding.
-- - Owners can step down themselves, but not if they are the only owner.
--   Removing someone else stays admin-only.
-- - Every ownership change is logged in owner_changes (admins only).

-- ---------------------------------------------------------------------------
-- Owners edit without the poster role
-- ---------------------------------------------------------------------------

drop policy if exists opportunities_update on public.opportunities;
create policy opportunities_update on public.opportunities
  for update to authenticated
  using (public.is_admin() or public.is_opp_owner(id))
  with check (public.is_admin() or public.is_opp_owner(id));

create or replace function public.set_opportunity_categories(p_opportunity_id uuid, p_category_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.opportunities where id = p_opportunity_id) then
    raise exception 'Opportunity not found';
  end if;
  if not (public.is_admin() or public.is_opp_owner(p_opportunity_id)) then
    raise exception 'Only the post''s owners or an admin can change this';
  end if;

  delete from public.opportunity_categories
  where opportunity_id = p_opportunity_id
    and not (category_id = any (coalesce(p_category_ids, '{}')));

  insert into public.opportunity_categories (opportunity_id, category_id)
  select p_opportunity_id, c.id
  from public.interest_categories c
  where c.id = any (coalesce(p_category_ids, '{}')) and c.active
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Adding and stepping down
-- ---------------------------------------------------------------------------

-- Owners and admins add an owner by email. Returns 'added', 'added_poster'
-- (only when an admin adds a plain member) or 'already'.
create or replace function public.add_opportunity_owner(p_opportunity_id uuid, p_email text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_user public.profiles;
  v_admin boolean := public.is_admin();
begin
  if not exists (select 1 from public.opportunities where id = p_opportunity_id) then
    raise exception 'Opportunity not found';
  end if;
  if not (v_admin or public.is_opp_owner(p_opportunity_id)) then
    raise exception 'Only this post''s owners or an admin can add owners';
  end if;

  select * into v_user from public.profiles where email = lower(trim(coalesce(p_email, '')));
  if v_user.id is null then
    raise exception 'This person has not signed in yet. Ask them to sign in once, then try again.';
  end if;

  if exists (
    select 1 from public.opportunity_owners
    where opportunity_id = p_opportunity_id and user_id = v_user.id
  ) then
    return 'already';
  end if;

  insert into public.opportunity_owners (opportunity_id, user_id, added_by)
  values (p_opportunity_id, v_user.id, auth.uid());

  if v_admin and v_user.role = 'member' then
    update public.profiles set role = 'poster' where id = v_user.id;
    return 'added_poster';
  end if;
  return 'added';
end;
$$;

-- An owner removes themselves. The last owner must stay until an admin adds
-- someone else (or removes them).
create or replace function public.step_down_as_owner(p_opportunity_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_opp_owner(p_opportunity_id) then
    raise exception 'You are not an owner of this post';
  end if;
  if (select count(*) from public.opportunity_owners where opportunity_id = p_opportunity_id) <= 1 then
    raise exception 'You are the only owner. Ask an admin to add another owner before you step down.';
  end if;
  delete from public.opportunity_owners
  where opportunity_id = p_opportunity_id and user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership log
-- ---------------------------------------------------------------------------

create table if not exists public.owner_changes (
  id bigint generated always as identity primary key,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('added', 'removed')),
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists owner_changes_opportunity_idx on public.owner_changes (opportunity_id, changed_at);

-- changed_by is empty for changes made in the Supabase dashboard. Removals
-- caused by erasing the post or the person are not logged (both are gone).
create or replace function public.log_owner_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.owner_changes (opportunity_id, user_id, action, changed_by)
    values (new.opportunity_id, new.user_id, 'added', auth.uid());
  elsif exists (select 1 from public.opportunities where id = old.opportunity_id)
    and exists (select 1 from public.profiles where id = old.user_id) then
    insert into public.owner_changes (opportunity_id, user_id, action, changed_by)
    values (old.opportunity_id, old.user_id, 'removed', auth.uid());
  end if;
  return null;
end;
$$;

drop trigger if exists opportunity_owners_log on public.opportunity_owners;
create trigger opportunity_owners_log after insert or delete on public.opportunity_owners
  for each row execute function public.log_owner_change();

-- ---------------------------------------------------------------------------
-- Full backup now includes the ownership log
-- ---------------------------------------------------------------------------

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
    'schema_version', 7,
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
    'backup_log', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.backup_log t)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

revoke all on table public.owner_changes from anon, authenticated;
alter table public.owner_changes enable row level security;
grant select on public.owner_changes to authenticated;
drop policy if exists owner_changes_select on public.owner_changes;
create policy owner_changes_select on public.owner_changes
  for select to authenticated using (public.is_admin());

-- Supabase lets anyone call new functions by default. Lock them down and
-- allow only what the website calls (each function checks who is calling).
revoke execute on function public.add_opportunity_owner(uuid, text) from public, anon, authenticated;
revoke execute on function public.step_down_as_owner(uuid) from public, anon, authenticated;
revoke execute on function public.log_owner_change() from public, anon, authenticated;
grant execute on function public.add_opportunity_owner(uuid, text) to authenticated;
grant execute on function public.step_down_as_owner(uuid) to authenticated;
