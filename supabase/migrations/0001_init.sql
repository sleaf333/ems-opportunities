-- EMS Opportunities Portal: initial schema.
--
-- Run once in the Supabase SQL editor (paste the whole file and click Run),
-- or apply with the Supabase CLI. All permission rules live here, so the
-- website cannot bypass them.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('member', 'poster', 'admin');
create type public.member_position as enum ('physician', 'apc', 'staff');
create type public.opp_type as enum ('committee', 'leadership', 'event', 'project', 'other');
create type public.commitment_level as enum ('one_time', 'short_term', 'ongoing');
create type public.opp_audience as enum ('all', 'physicians', 'shareholders');
create type public.opp_status as enum ('draft', 'open', 'closed', 'archived');
create type public.signup_status as enum (
  'interested', 'committed', 'waitlisted', 'withdrawn', 'completed', 'no_show'
);

-- Only addresses at this domain can create an account.
create function public.allowed_email_domain() returns text
language sql immutable
as $$ select 'ems-wi.com' $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  position public.member_position,
  role public.user_role not null default 'member',
  is_shareholder boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Private to the member and admins.
create table public.member_interests (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  interests text[] not null default '{}',
  leadership_goals text not null default '',
  updated_at timestamptz not null default now()
);

-- Roles set by an admin for people who have not signed in yet. Applied and
-- removed when that person first signs in.
create table public.member_presets (
  email text primary key check (email = lower(email)),
  role public.user_role not null default 'member',
  is_shareholder boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  type public.opp_type not null default 'committee',
  description text not null default '',
  commitment public.commitment_level not null default 'ongoing',
  time_estimate text not null default '',
  audience public.opp_audience not null default 'all',
  capacity integer check (capacity is null or capacity > 0),
  start_date date,
  end_date date,
  signup_deadline date,
  new_hire_friendly boolean not null default false,
  tags text[] not null default '{}',
  contact_name text not null default '',
  contact_email text not null default '',
  status public.opp_status not null default 'open',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per person per opportunity; its status is the person's current
-- state. Every change is copied to signup_events.
create table public.signups (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.signup_status not null,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (opportunity_id, user_id)
);

create index signups_waitlist_idx on public.signups (opportunity_id, status, status_changed_at);
create index signups_user_idx on public.signups (user_id);

create table public.signup_events (
  id bigint generated always as identity primary key,
  signup_id uuid not null references public.signups (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  from_status public.signup_status,
  to_status public.signup_status not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index signup_events_opportunity_idx on public.signup_events (opportunity_id);
create index signup_events_user_idx on public.signup_events (user_id);

-- ---------------------------------------------------------------------------
-- Helper functions (used by the permission rules below)
-- ---------------------------------------------------------------------------

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
$$;

create function public.can_post() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('poster', 'admin')
  )
$$;

-- Today's date in Wisconsin, so a deadline lasts until midnight local time.
create function public.local_today() returns date
language sql stable
as $$ select (now() at time zone 'America/Chicago')::date $$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger member_interests_touch before update on public.member_interests
  for each row execute function public.touch_updated_at();
create trigger opportunities_touch before update on public.opportunities
  for each row execute function public.touch_updated_at();

-- Refuse accounts outside the group's email domain.
create function public.enforce_email_domain() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null
     or lower(new.email) not like '%@' || public.allowed_email_domain() then
    raise exception 'Only @% email addresses can use this site', public.allowed_email_domain();
  end if;
  return new;
end;
$$;

create trigger enforce_email_domain before insert or update of email on auth.users
  for each row execute function public.enforce_email_domain();

-- Create a profile for each new account, applying any preset from an admin.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(new.email);
  v_preset public.member_presets;
begin
  select * into v_preset from public.member_presets where email = v_email;

  insert into public.profiles (id, email, role, is_shareholder)
  values (
    new.id,
    v_email,
    coalesce(v_preset.role, 'member'),
    coalesce(v_preset.is_shareholder, false)
  );

  insert into public.member_interests (user_id) values (new.id);

  delete from public.member_presets where email = v_email;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the waitlist order fair: record when each status last changed.
create function public.signups_before_update() returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger signups_before_update before update on public.signups
  for each row execute function public.signups_before_update();

-- History log of every sign-up change.
create function public.log_signup_event() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.signup_events
      (signup_id, opportunity_id, user_id, from_status, to_status, changed_by)
    values (
      new.id,
      new.opportunity_id,
      new.user_id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger signups_log after insert or update on public.signups
  for each row execute function public.log_signup_event();

-- Move people up from the waitlist while there are open spots.
create function public.promote_waitlist(p_opportunity_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_capacity integer;
  v_committed integer;
  v_next uuid;
begin
  select capacity into v_capacity
  from public.opportunities where id = p_opportunity_id;

  loop
    if v_capacity is not null then
      select count(*) into v_committed
      from public.signups
      where opportunity_id = p_opportunity_id and status = 'committed';
      exit when v_committed >= v_capacity;
    end if;

    select id into v_next
    from public.signups
    where opportunity_id = p_opportunity_id and status = 'waitlisted'
    order by status_changed_at, created_at
    limit 1
    for update;

    exit when v_next is null;

    update public.signups set status = 'committed' where id = v_next;
  end loop;
end;
$$;

-- When a poster adds spots (or removes the limit), fill them from the waitlist.
create function public.opportunities_after_capacity_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.capacity is distinct from old.capacity
     and (new.capacity is null or old.capacity is null or new.capacity > old.capacity) then
    perform public.promote_waitlist(new.id);
  end if;
  return new;
end;
$$;

create trigger opportunities_capacity_change after update of capacity on public.opportunities
  for each row execute function public.opportunities_after_capacity_change();

-- ---------------------------------------------------------------------------
-- Actions the website calls
-- ---------------------------------------------------------------------------

-- A member marks themselves Interested, Committed or Withdrawn.
-- Returns the resulting status ('waitlisted' when the opportunity is full).
create function public.set_my_signup(p_opportunity_id uuid, p_status public.signup_status)
returns public.signup_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_opp public.opportunities;
  v_current public.signup_status;
  v_new public.signup_status;
  v_committed integer;
begin
  if v_uid is null then
    raise exception 'Please sign in first';
  end if;

  if p_status not in ('interested', 'committed', 'withdrawn') then
    raise exception 'That choice is not allowed';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is null or v_profile.position is null or trim(v_profile.full_name) = '' then
    raise exception 'Please complete your profile first';
  end if;

  -- Lock the opportunity so two people cannot take the last spot at once.
  select * into v_opp from public.opportunities where id = p_opportunity_id for update;
  if v_opp.id is null or (v_opp.status = 'draft' and v_opp.created_by is distinct from v_uid) then
    raise exception 'Opportunity not found';
  end if;

  select status into v_current
  from public.signups
  where opportunity_id = p_opportunity_id and user_id = v_uid;

  if v_current in ('completed', 'no_show') then
    raise exception 'Attendance has already been recorded for this opportunity';
  end if;

  if p_status = 'withdrawn' then
    if v_current is null or v_current = 'withdrawn' then
      return v_current;
    end if;
    update public.signups set status = 'withdrawn'
    where opportunity_id = p_opportunity_id and user_id = v_uid;
    if v_current = 'committed' then
      perform public.promote_waitlist(p_opportunity_id);
    end if;
    return 'withdrawn';
  end if;

  if v_opp.status <> 'open' then
    raise exception 'This opportunity is not open for sign-ups';
  end if;
  if v_opp.signup_deadline is not null and v_opp.signup_deadline < public.local_today() then
    raise exception 'The sign-up deadline has passed';
  end if;

  if p_status = 'interested' then
    if v_current = 'interested' then
      return v_current;
    end if;
    insert into public.signups (opportunity_id, user_id, status)
    values (p_opportunity_id, v_uid, 'interested')
    on conflict (opportunity_id, user_id) do update set status = excluded.status;
    if v_current = 'committed' then
      perform public.promote_waitlist(p_opportunity_id);
    end if;
    return 'interested';
  end if;

  -- p_status = 'committed'
  if v_current in ('committed', 'waitlisted') then
    return v_current;
  end if;

  if v_opp.audience = 'physicians' and v_profile.position <> 'physician' then
    raise exception 'This opportunity is open to physicians only. You can still mark yourself as Interested.';
  end if;
  if v_opp.audience = 'shareholders' and not v_profile.is_shareholder then
    raise exception 'This opportunity is open to shareholders only. You can still mark yourself as Interested.';
  end if;

  v_new := 'committed';
  if v_opp.capacity is not null then
    select count(*) into v_committed
    from public.signups
    where opportunity_id = p_opportunity_id and status = 'committed';
    if v_committed >= v_opp.capacity then
      v_new := 'waitlisted';
    end if;
  end if;

  insert into public.signups (opportunity_id, user_id, status)
  values (p_opportunity_id, v_uid, v_new)
  on conflict (opportunity_id, user_id) do update set status = excluded.status;

  return v_new;
end;
$$;

-- An admin sets someone's role and shareholder status by email. If that
-- person has not signed in yet, the setting is saved and applied when they do.
-- Returns 'updated' or 'saved'.
create function public.admin_set_member(p_email text, p_role public.user_role, p_is_shareholder boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this';
  end if;

  if v_email not like '_%@' || public.allowed_email_domain() then
    raise exception 'Email must end in @%', public.allowed_email_domain();
  end if;

  select * into v_profile from public.profiles where email = v_email for update;

  if v_profile.id is not null then
    if v_profile.role = 'admin' and p_role <> 'admin'
       and (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'You cannot remove the last admin';
    end if;
    update public.profiles
    set role = p_role, is_shareholder = p_is_shareholder
    where id = v_profile.id;
    return 'updated';
  end if;

  insert into public.member_presets (email, role, is_shareholder, created_by)
  values (v_email, p_role, p_is_shareholder, auth.uid())
  on conflict (email) do update
    set role = excluded.role, is_shareholder = excluded.is_shareholder;
  return 'saved';
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
-- Supabase grants broad table access to the anon and authenticated roles by
-- default. Take it all away, then grant back only what each table needs.
-- Signed-out visitors (anon) get nothing.

revoke all on table
  public.profiles, public.member_interests, public.member_presets,
  public.opportunities, public.signups, public.signup_events
from anon, authenticated;

alter table public.profiles enable row level security;
alter table public.member_interests enable row level security;
alter table public.member_presets enable row level security;
alter table public.opportunities enable row level security;
alter table public.signups enable row level security;
alter table public.signup_events enable row level security;

-- profiles: everyone signed in can see names; you can change only your own
-- name and position. Roles change only through admin_set_member.
grant select on public.profiles to authenticated;
grant update (full_name, position) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- member_interests: only you and admins.
grant select on public.member_interests to authenticated;
grant update (interests, leadership_goals) on public.member_interests to authenticated;

create policy member_interests_select on public.member_interests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy member_interests_update_own on public.member_interests
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- member_presets: admins only (created through admin_set_member).
grant select, delete on public.member_presets to authenticated;

create policy member_presets_select on public.member_presets
  for select to authenticated using (public.is_admin());
create policy member_presets_delete on public.member_presets
  for delete to authenticated using (public.is_admin());

-- opportunities: everyone sees everything except other people's drafts.
-- Approved posters create and edit their own; admins edit and delete any.
grant select, insert, delete on public.opportunities to authenticated;
grant update (
  title, type, description, commitment, time_estimate, audience, capacity,
  start_date, end_date, signup_deadline, new_hire_friendly, tags,
  contact_name, contact_email, status
) on public.opportunities to authenticated;

create policy opportunities_select on public.opportunities
  for select to authenticated
  using (status <> 'draft' or created_by = auth.uid() or public.is_admin());
create policy opportunities_insert on public.opportunities
  for insert to authenticated
  with check (public.can_post() and created_by = auth.uid());
create policy opportunities_update on public.opportunities
  for update to authenticated
  using (public.is_admin() or (public.can_post() and created_by = auth.uid()))
  with check (public.is_admin() or (public.can_post() and created_by = auth.uid()));
create policy opportunities_delete on public.opportunities
  for delete to authenticated using (public.is_admin());

-- signups: the public list shows interested, committed, waitlisted and
-- completed. Withdrawals and no-shows are visible only to the person, the
-- opportunity's poster and admins. Changes go through set_my_signup.
grant select on public.signups to authenticated;

create policy signups_select on public.signups
  for select to authenticated
  using (
    status in ('interested', 'committed', 'waitlisted', 'completed')
    or user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id and o.created_by = auth.uid()
    )
  );

-- signup_events: your own history, or everything for admins.
grant select on public.signup_events to authenticated;

create policy signup_events_select on public.signup_events
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Functions: Supabase lets anyone call functions by default. Lock them down
-- and allow signed-in members to call only the ones the website uses.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_post() to authenticated;
grant execute on function public.local_today() to authenticated;
grant execute on function public.allowed_email_domain() to authenticated;
grant execute on function public.set_my_signup(uuid, public.signup_status) to authenticated;
grant execute on function public.admin_set_member(text, public.user_role, boolean) to authenticated;
