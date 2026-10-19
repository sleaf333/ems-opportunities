-- EMS Opportunities Portal: name a post's owner before they have signed in.
--
-- Run once in the Supabase SQL editor, after 0012. Safe to run twice. If
-- Supabase offers "Run and enable RLS", choose "Run without RLS": this file
-- turns RLS on itself.
--
-- Until now someone had to sign in once before they could be made an owner
-- (a committee lead). Now admins and owners can add anyone with an
-- @ems-wi.com email: if they have not signed in yet, they wait in
-- owner_presets and become an owner automatically the first time they sign
-- in (logged in owner_changes like any other owner change). The Owners box
-- on the post page lists who is waiting and lets admins and owners cancel.

create table if not exists public.owner_presets (
  email text not null check (email = lower(email)),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (email, opportunity_id)
);

-- First sign-in: apply the preset position (0009) and any waiting ownerships.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(new.email);
  v_preset public.member_presets;
begin
  select * into v_preset from public.member_presets where email = v_email;

  insert into public.profiles (id, email, role, position)
  values (
    new.id,
    v_email,
    coalesce(v_preset.role, 'member'),
    coalesce(v_preset.position, case when v_preset.is_partner then 'partner'::public.member_position end)
  );

  insert into public.member_interests (user_id) values (new.id);

  delete from public.member_presets where email = v_email;

  insert into public.opportunity_owners (opportunity_id, user_id, added_by)
  select opportunity_id, new.id, added_by from public.owner_presets where email = v_email
  on conflict do nothing;
  delete from public.owner_presets where email = v_email;

  return new;
end;
$$;

-- Add an owner by email. Returns:
--   'added' / 'added_poster'  signed in; now an owner (as before)
--   'already'                 already an owner
--   'pending'                 not signed in yet; becomes an owner at first sign-in
--   'already_pending'         already waiting
create or replace function public.add_opportunity_owner(p_opportunity_id uuid, p_email text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user public.profiles;
  v_admin boolean := public.is_admin();
begin
  if not exists (select 1 from public.opportunities where id = p_opportunity_id) then
    raise exception 'Opportunity not found';
  end if;
  if not (v_admin or public.is_opp_owner(p_opportunity_id)) then
    raise exception 'Only this post''s owners or an admin can add owners';
  end if;

  select * into v_user from public.profiles where email = v_email;
  if v_user.id is null then
    if v_email not like '_%@' || public.allowed_email_domain() then
      raise exception 'Email must end in @%', public.allowed_email_domain();
    end if;
    if exists (select 1 from public.owner_presets where email = v_email and opportunity_id = p_opportunity_id) then
      return 'already_pending';
    end if;
    insert into public.owner_presets (email, opportunity_id, added_by)
    values (v_email, p_opportunity_id, auth.uid());
    return 'pending';
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

-- Cancel a waiting owner (admins, or the post's owners).
create or replace function public.remove_owner_preset(p_opportunity_id uuid, p_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.is_admin() or public.is_opp_owner(p_opportunity_id)) then
    raise exception 'Only this post''s owners or an admin can do this';
  end if;
  delete from public.owner_presets
  where opportunity_id = p_opportunity_id and email = lower(trim(coalesce(p_email, '')));
end;
$$;

-- Full backup now includes waiting owners.
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
    'schema_version', 13,
    'profiles', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.profiles t),
    'member_interests', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id), '[]') from public.member_interests t),
    'member_interest_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.category_id), '[]') from public.member_interest_categories t),
    'member_presets', (select coalesce(jsonb_agg(to_jsonb(t) order by t.email), '[]') from public.member_presets t),
    'interest_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]') from public.interest_categories t),
    'opportunities', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.opportunities t),
    'opportunity_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.opportunity_id, t.category_id), '[]') from public.opportunity_categories t),
    'opportunity_owners', (select coalesce(jsonb_agg(to_jsonb(t) order by t.opportunity_id, t.user_id), '[]') from public.opportunity_owners t),
    'owner_presets', (select coalesce(jsonb_agg(to_jsonb(t) order by t.opportunity_id, t.email), '[]') from public.owner_presets t),
    'owner_changes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.owner_changes t),
    'opportunity_history', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.opportunity_history t),
    'signups', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.signups t),
    'signup_events', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.signup_events t),
    'role_changes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.role_changes t),
    'post_requests', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.post_requests t),
    'notification_settings', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.notification_settings t),
    'notification_log', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.notification_log t),
    'backup_log', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.backup_log t)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

-- Admins and the post's owners see who is waiting; writes only through the
-- functions above.
revoke all on table public.owner_presets from anon, authenticated;
alter table public.owner_presets enable row level security;
grant select on public.owner_presets to authenticated;
drop policy if exists owner_presets_select on public.owner_presets;
create policy owner_presets_select on public.owner_presets
  for select to authenticated
  using (public.is_admin() or public.is_opp_owner(opportunity_id));

revoke execute on function public.add_opportunity_owner(uuid, text) from public, anon, authenticated;
revoke execute on function public.remove_owner_preset(uuid, text) from public, anon, authenticated;
grant execute on function public.add_opportunity_owner(uuid, text) to authenticated;
grant execute on function public.remove_owner_preset(uuid, text) to authenticated;
