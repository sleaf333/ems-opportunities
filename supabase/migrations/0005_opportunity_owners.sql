-- EMS Opportunities Portal: more than one owner per post.
--
-- Run once in the Supabase SQL editor, after 0004.
--
-- A post's owners can edit it, see every name on it and email the people who
-- signed up. Until now the only owner was whoever created the post
-- (opportunities.created_by). Now owners are a list, so a committee can have
-- co-chairs, and an admin can add or remove owners by email at any time.
--
-- created_by stays as a record of who first posted it. Whoever creates a post
-- becomes its first owner automatically. Existing posts get their creator as
-- owner; the seeded committees have no creator, so they start with no owner
-- until an admin adds one.
--
-- Only admins add or remove owners. Adding someone who is still a plain member
-- makes them a poster, so they can edit the post. Admins stay admins.
--
-- Safe to run twice (a second run skips what already exists). Run it before
-- merging the matching website change, which reads opportunity_owners.

create table if not exists public.opportunity_owners (
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (opportunity_id, user_id)
);

create index if not exists opportunity_owners_user_idx on public.opportunity_owners (user_id);

insert into public.opportunity_owners (opportunity_id, user_id, added_by, added_at)
select id, created_by, created_by, created_at
from public.opportunities
where created_by is not null
on conflict do nothing;

-- Is the signed-in person an owner of this post?
create or replace function public.is_opp_owner(p_opportunity_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.opportunity_owners
    where opportunity_id = p_opportunity_id and user_id = auth.uid()
  )
$$;

-- The creator of a new post becomes its first owner.
create or replace function public.opportunities_add_creator() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.opportunity_owners (opportunity_id, user_id, added_by)
    values (new.id, new.created_by, new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_add_creator on public.opportunities;
create trigger opportunities_add_creator after insert on public.opportunities
  for each row execute function public.opportunities_add_creator();

-- Admins add an owner by email. The person must have signed in at least once.
-- Returns 'added', 'added_poster' (they were also made a poster) or 'already'.
create or replace function public.admin_add_opportunity_owner(p_opportunity_id uuid, p_email text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_user public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change who owns a post';
  end if;
  if not exists (select 1 from public.opportunities where id = p_opportunity_id) then
    raise exception 'Opportunity not found';
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

  if v_user.role = 'member' then
    update public.profiles set role = 'poster' where id = v_user.id;
    return 'added_poster';
  end if;
  return 'added';
end;
$$;

-- Admins remove an owner. Their role is left alone.
create or replace function public.admin_remove_opportunity_owner(p_opportunity_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change who owns a post';
  end if;
  delete from public.opportunity_owners
  where opportunity_id = p_opportunity_id and user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owners replace "the creator" everywhere permissions are decided.
-- ---------------------------------------------------------------------------

-- Posts: drafts are visible to their owners (and the creator, so a new post
-- can be read back the moment it is saved).
drop policy if exists opportunities_select on public.opportunities;
create policy opportunities_select on public.opportunities
  for select to authenticated
  using (
    status <> 'draft' or created_by = auth.uid() or public.is_opp_owner(id) or public.is_admin()
  );

-- Owners who are posters edit; admins edit anything.
drop policy if exists opportunities_update on public.opportunities;
create policy opportunities_update on public.opportunities
  for update to authenticated
  using (public.is_admin() or (public.can_post() and public.is_opp_owner(id)))
  with check (public.is_admin() or (public.can_post() and public.is_opp_owner(id)));

-- Sign-ups: owners see everything on their posts, like admins.
drop policy if exists signups_select on public.signups;
create policy signups_select on public.signups
  for select to authenticated
  using (
    signups.user_id = auth.uid()
    or public.is_admin()
    or public.is_opp_owner(signups.opportunity_id)
    or exists (
      select 1 from public.opportunities o
      where o.id = signups.opportunity_id
        and o.show_names
        and signups.status in ('interested', 'committed', 'waitlisted', 'completed')
    )
  );

-- Topics: owners (who are posters) and admins.
create or replace function public.set_opportunity_categories(p_opportunity_id uuid, p_category_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.opportunities where id = p_opportunity_id) then
    raise exception 'Opportunity not found';
  end if;
  if not (public.is_admin() or (public.can_post() and public.is_opp_owner(p_opportunity_id))) then
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

-- Counts: drafts count for their owners too.
create or replace function public.opportunity_counts()
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
  where o.status <> 'draft' or o.created_by = auth.uid() or public.is_opp_owner(o.id) or public.is_admin()
  group by s.opportunity_id
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

-- Everyone signed in can see who owns what (names are already visible to all
-- members). Changes go only through the admin functions above.
revoke all on table public.opportunity_owners from anon, authenticated;
alter table public.opportunity_owners enable row level security;
grant select on public.opportunity_owners to authenticated;
drop policy if exists opportunity_owners_select on public.opportunity_owners;
create policy opportunity_owners_select on public.opportunity_owners
  for select to authenticated using (true);

-- Supabase lets anyone call new functions by default. Lock the new ones down
-- and allow only what the website (and the rules above) need.
revoke execute on function public.is_opp_owner(uuid) from public, anon, authenticated;
revoke execute on function public.opportunities_add_creator() from public, anon, authenticated;
revoke execute on function public.admin_add_opportunity_owner(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_remove_opportunity_owner(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_opp_owner(uuid) to authenticated;
grant execute on function public.admin_add_opportunity_owner(uuid, text) to authenticated;
grant execute on function public.admin_remove_opportunity_owner(uuid, uuid) to authenticated;
