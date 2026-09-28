-- EMS Opportunities Portal: second update.
--
-- Run once in the Supabase SQL editor, after 0001_init.sql (paste the whole
-- file and click Run). Existing data is carried over.
--
-- What changes:
--   * Positions: Employed physician, Partnership track, Partner, APC,
--     Administrative staff. Partner replaces the separate shareholder flag and
--     only an admin can assign it. "Shareholders only" becomes "Partners only".
--   * Location (required), optional hospital/site, and meeting format.
--   * "Show on site until" date (blank = indefinitely). Expired posts leave the
--     public list but stay in the database.
--   * Opportunities can no longer be deleted by anyone using the site.
--   * A curated list of interest categories, used both for opportunity topics
--     and for members' interests.
--   * Names of who signed up are visible to admins and the poster; members see
--     them only when the poster turns on "Show names to members".

-- ---------------------------------------------------------------------------
-- 1. Positions and partners
-- ---------------------------------------------------------------------------

create type public.member_position_v2 as enum (
  'employed_physician', 'partnership_track', 'partner', 'apc', 'admin_staff'
);

-- Shareholders become partners. Other physicians must pick their new position
-- the next time they sign in (the site asks automatically).
alter table public.profiles
  alter column position type public.member_position_v2
  using (
    case
      when is_shareholder then 'partner'
      when position::text = 'apc' then 'apc'
      when position::text = 'staff' then 'admin_staff'
    end
  )::public.member_position_v2;

drop type public.member_position;
alter type public.member_position_v2 rename to member_position;

alter table public.profiles drop column is_shareholder;

alter table public.member_presets add column is_partner boolean not null default false;
update public.member_presets set is_partner = is_shareholder;
alter table public.member_presets drop column is_shareholder;

alter type public.opp_audience rename value 'shareholders' to 'partners';

-- Members choose their own position, but only an admin can make someone a
-- partner or remove partner status. (Changes made directly in the Supabase
-- SQL editor, with no signed-in user, are allowed.)
create function public.guard_partner_position() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.position is distinct from old.position
     and (new.position = 'partner' or old.position = 'partner')
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only an admin can set or remove the Partner position';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_partner before update of position on public.profiles
  for each row execute function public.guard_partner_position();

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
    case when v_preset.is_partner then 'partner'::public.member_position end
  );

  insert into public.member_interests (user_id) values (new.id);

  delete from public.member_presets where email = v_email;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Location, format, posting window, name visibility
-- ---------------------------------------------------------------------------

create type public.opp_region as enum (
  'group_wide', 'door_county', 'fox_valley', 'milwaukee', 'watertown'
);
create type public.opp_format as enum ('in_person', 'virtual', 'hybrid');

alter table public.opportunities
  add column region public.opp_region not null default 'group_wide',
  add column site text not null default '',
  add column format public.opp_format not null default 'in_person',
  add column visible_until date,
  add column show_names boolean not null default false;

-- Existing posts start as group-wide; new posts must choose a location.
alter table public.opportunities alter column region drop default;

grant update (region, site, format, visible_until, show_names)
  on public.opportunities to authenticated;

-- Nothing is ever deleted through the site; close or archive instead.
drop policy opportunities_delete on public.opportunities;
revoke delete on public.opportunities from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Interest categories
-- ---------------------------------------------------------------------------

create table public.interest_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index interest_categories_name_key on public.interest_categories (lower(name));

create table public.opportunity_categories (
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  category_id uuid not null references public.interest_categories (id) on delete restrict,
  primary key (opportunity_id, category_id)
);

create table public.member_interest_categories (
  user_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.interest_categories (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, category_id)
);

alter table public.member_interests add column other_interests text not null default '';

-- Carry over existing topics as categories, and match members' existing
-- interests to them. Anything that does not match is kept as free text.
insert into public.interest_categories (name)
select distinct initcap(trim(t.tag))
from public.opportunities o
cross join lateral unnest(o.tags) as t(tag)
where trim(t.tag) <> ''
on conflict do nothing;

insert into public.opportunity_categories (opportunity_id, category_id)
select distinct o.id, c.id
from public.opportunities o
cross join lateral unnest(o.tags) as t(tag)
join public.interest_categories c on lower(c.name) = lower(trim(t.tag));

insert into public.member_interest_categories (user_id, category_id)
select distinct m.user_id, c.id
from public.member_interests m
cross join lateral unnest(m.interests) as t(tag)
join public.interest_categories c on lower(c.name) = lower(trim(t.tag));

update public.member_interests m
set other_interests = coalesce((
  select string_agg(trim(t.tag), ', ')
  from unnest(m.interests) as t(tag)
  where trim(t.tag) <> ''
    and not exists (
      select 1 from public.interest_categories c where lower(c.name) = lower(trim(t.tag))
    )
), '');

alter table public.opportunities drop column tags;
alter table public.member_interests drop column interests;

-- ---------------------------------------------------------------------------
-- 4. Actions the website calls
-- ---------------------------------------------------------------------------

-- Physicians-only covers all three physician positions; partners-only needs
-- the Partner position. Expired posts take no new sign-ups.
create or replace function public.set_my_signup(p_opportunity_id uuid, p_status public.signup_status)
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
  if v_opp.visible_until is not null and v_opp.visible_until < public.local_today() then
    raise exception 'This opportunity is no longer posted';
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

  if v_opp.audience = 'physicians'
     and v_profile.position not in ('employed_physician', 'partnership_track', 'partner') then
    raise exception 'This opportunity is open to physicians only. You can still mark yourself as Interested.';
  end if;
  if v_opp.audience = 'partners' and v_profile.position <> 'partner' then
    raise exception 'This opportunity is open to partners only. You can still mark yourself as Interested.';
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

-- An admin sets someone's role and partner status by email. If that person
-- has not signed in yet, the setting is saved and applied when they do.
-- Returns 'updated' or 'saved'.
drop function public.admin_set_member(text, public.user_role, boolean);

create function public.admin_set_member(p_email text, p_role public.user_role, p_is_partner boolean)
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
    set role = p_role,
        -- Removing partner status clears the position so they pick a new one.
        position = case
          when p_is_partner then 'partner'::public.member_position
          when v_profile.position = 'partner' then null
          else v_profile.position
        end
    where id = v_profile.id;
    return 'updated';
  end if;

  insert into public.member_presets (email, role, is_partner, created_by)
  values (v_email, p_role, p_is_partner, auth.uid())
  on conflict (email) do update
    set role = excluded.role, is_partner = excluded.is_partner;
  return 'saved';
end;
$$;

-- Replace an opportunity's topics. Only people who can edit the opportunity
-- may do this. Retired categories already on the post may stay; new ones
-- must be active.
create function public.set_opportunity_categories(p_opportunity_id uuid, p_category_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select created_by into v_owner from public.opportunities where id = p_opportunity_id;
  if not found then
    raise exception 'Opportunity not found';
  end if;
  -- coalesce: a post with no recorded poster (seeded ones) is admin-only.
  if not (public.is_admin() or (public.can_post() and coalesce(v_owner = auth.uid(), false))) then
    raise exception 'Only the poster or an admin can change this';
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

-- Save the signed-in member's interests, other interests and goals.
create function public.set_my_interests(p_category_ids uuid[], p_other text, p_goals text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Please sign in first';
  end if;

  update public.member_interests
  set other_interests = trim(coalesce(p_other, '')),
      leadership_goals = trim(coalesce(p_goals, ''))
  where user_id = v_uid;

  delete from public.member_interest_categories
  where user_id = v_uid
    and not (category_id = any (coalesce(p_category_ids, '{}')));

  insert into public.member_interest_categories (user_id, category_id)
  select v_uid, c.id
  from public.interest_categories c
  where c.id = any (coalesce(p_category_ids, '{}')) and c.active
  on conflict do nothing;
end;
$$;

-- Sign-up counts per opportunity, without names, for everyone.
create function public.opportunity_counts()
returns table (opportunity_id uuid, committed integer, interested integer, waitlisted integer)
language sql stable security definer set search_path = ''
as $$
  select
    s.opportunity_id,
    (count(*) filter (where s.status in ('committed', 'completed')))::integer,
    (count(*) filter (where s.status = 'interested'))::integer,
    (count(*) filter (where s.status = 'waitlisted'))::integer
  from public.signups s
  join public.opportunities o on o.id = s.opportunity_id
  where o.status <> 'draft' or o.created_by = auth.uid() or public.is_admin()
  group by s.opportunity_id
$$;

-- ---------------------------------------------------------------------------
-- 5. Permissions
-- ---------------------------------------------------------------------------

revoke all on table
  public.interest_categories, public.opportunity_categories, public.member_interest_categories
from anon, authenticated;

alter table public.interest_categories enable row level security;
alter table public.opportunity_categories enable row level security;
alter table public.member_interest_categories enable row level security;

-- Categories: everyone signed in can read; admins add, rename and retire.
-- Categories are never deleted, so past interests stay meaningful.
grant select, insert on public.interest_categories to authenticated;
grant update (name, active) on public.interest_categories to authenticated;

create policy interest_categories_select on public.interest_categories
  for select to authenticated using (true);
create policy interest_categories_insert on public.interest_categories
  for insert to authenticated with check (public.is_admin());
create policy interest_categories_update on public.interest_categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Opportunity topics: readable by everyone; changed through set_opportunity_categories.
grant select on public.opportunity_categories to authenticated;
create policy opportunity_categories_select on public.opportunity_categories
  for select to authenticated using (true);

-- Member interests: only the member and admins; changed through set_my_interests.
grant select on public.member_interest_categories to authenticated;
create policy member_interest_categories_select on public.member_interest_categories
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Sign-ups: you see your own; admins see all; the poster sees everything on
-- their own posts; members see names only when the poster allows it (and
-- never withdrawals or no-shows).
drop policy signups_select on public.signups;
create policy signups_select on public.signups
  for select to authenticated
  using (
    signups.user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.opportunities o
      where o.id = signups.opportunity_id
        and (
          o.created_by = auth.uid()
          or (o.show_names and signups.status in ('interested', 'committed', 'waitlisted', 'completed'))
        )
    )
  );

-- Functions: lock everything down again (Supabase grants new functions to
-- everyone by default), then allow only what the website calls.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_post() to authenticated;
grant execute on function public.local_today() to authenticated;
grant execute on function public.allowed_email_domain() to authenticated;
grant execute on function public.set_my_signup(uuid, public.signup_status) to authenticated;
grant execute on function public.admin_set_member(text, public.user_role, boolean) to authenticated;
grant execute on function public.set_opportunity_categories(uuid, uuid[]) to authenticated;
grant execute on function public.set_my_interests(uuid[], text, text) to authenticated;
grant execute on function public.opportunity_counts() to authenticated;
