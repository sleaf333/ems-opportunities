-- EMS Opportunities Portal: safety net against accidental deletes.
--
-- Run once in the Supabase SQL editor, after 0005. Safe to run twice (a
-- second run skips what already exists). If Supabase offers "Run and enable
-- RLS", choose "Run without RLS": this file turns RLS on itself.
--
-- 1. Block cascades. Deleting a person in Supabase (Authentication > Delete
--    user) used to silently erase their sign-ups and history. Now it fails
--    with "Database error deleting user" if they have any sign-ups, history
--    or picked topics. Same for deleting a post that has sign-ups or edit
--    history. People and posts with no activity still delete normally.
-- 2. Deliberate erase. For the rare real deletion, run one of these in the
--    SQL editor (the website can never call them):
--      select public.erase_member_permanently('name@ems-wi.com');
--      select public.erase_opportunity_permanently('<post id>');
-- 3. Edit history. Every change to a post keeps the previous values and who
--    made the change (admins only can read it).
-- 4. Role change log. Who became a poster or admin, when, and who did it.
-- 5. Full backup. admin_export_all() returns every table in one file for
--    admins, and records each download in backup_log.

-- ---------------------------------------------------------------------------
-- 1. Block cascades
-- ---------------------------------------------------------------------------

alter table public.signups
  drop constraint if exists signups_user_id_fkey,
  add constraint signups_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete restrict,
  drop constraint if exists signups_opportunity_id_fkey,
  add constraint signups_opportunity_id_fkey
    foreign key (opportunity_id) references public.opportunities (id) on delete restrict;

alter table public.signup_events
  drop constraint if exists signup_events_user_id_fkey,
  add constraint signup_events_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete restrict,
  drop constraint if exists signup_events_opportunity_id_fkey,
  add constraint signup_events_opportunity_id_fkey
    foreign key (opportunity_id) references public.opportunities (id) on delete restrict,
  drop constraint if exists signup_events_signup_id_fkey,
  add constraint signup_events_signup_id_fkey
    foreign key (signup_id) references public.signups (id) on delete restrict;

alter table public.member_interest_categories
  drop constraint if exists member_interest_categories_user_id_fkey,
  add constraint member_interest_categories_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 3. Edit history for posts
-- ---------------------------------------------------------------------------

create table if not exists public.opportunity_history (
  id bigint generated always as identity primary key,
  opportunity_id uuid not null references public.opportunities (id) on delete restrict,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles (id) on delete set null,
  changed_fields text[] not null,
  old_values jsonb not null
);
create index if not exists opportunity_history_opportunity_idx
  on public.opportunity_history (opportunity_id, changed_at);

-- Keeps only the fields that changed, with their previous values.
-- changed_by is empty for changes made in the Supabase dashboard.
create or replace function public.log_opportunity_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_fields text[];
  v_old jsonb;
begin
  select array_agg(o.key order by o.key), jsonb_object_agg(o.key, o.value)
  into v_fields, v_old
  from jsonb_each(to_jsonb(old)) o
  join jsonb_each(to_jsonb(new)) n on n.key = o.key
  where o.key <> 'updated_at' and o.value is distinct from n.value;

  if v_fields is not null then
    insert into public.opportunity_history (opportunity_id, changed_by, changed_fields, old_values)
    values (new.id, auth.uid(), v_fields, v_old);
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_log_change on public.opportunities;
create trigger opportunities_log_change after update on public.opportunities
  for each row execute function public.log_opportunity_change();

-- ---------------------------------------------------------------------------
-- 4. Role change log
-- ---------------------------------------------------------------------------

create table if not exists public.role_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  old_role public.user_role,
  new_role public.user_role not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists role_changes_changed_at_idx on public.role_changes (changed_at);

-- On first sign-in a role set in advance by an admin is logged with that admin
-- as changed_by (old_role empty). Later changes log the admin who made them;
-- changed_by is empty for changes made in the Supabase dashboard.
create or replace function public.log_role_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.role <> 'member' then
      insert into public.role_changes (user_id, old_role, new_role, changed_by)
      values (
        new.id, null, new.role,
        (select p.created_by from public.member_presets p where p.email = new.email)
      );
    end if;
  elsif new.role is distinct from old.role then
    insert into public.role_changes (user_id, old_role, new_role, changed_by)
    values (new.id, old.role, new.role, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_log_role on public.profiles;
create trigger profiles_log_role after insert or update of role on public.profiles
  for each row execute function public.log_role_change();

-- ---------------------------------------------------------------------------
-- 5. Full backup (admins only; every download is recorded)
-- ---------------------------------------------------------------------------

create table if not exists public.backup_log (
  id bigint generated always as identity primary key,
  downloaded_by uuid references public.profiles (id) on delete set null,
  downloaded_at timestamptz not null default now()
);

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
    'schema_version', 6,
    'profiles', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.profiles t),
    'member_interests', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id), '[]') from public.member_interests t),
    'member_interest_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.category_id), '[]') from public.member_interest_categories t),
    'member_presets', (select coalesce(jsonb_agg(to_jsonb(t) order by t.email), '[]') from public.member_presets t),
    'interest_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]') from public.interest_categories t),
    'opportunities', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.opportunities t),
    'opportunity_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.opportunity_id, t.category_id), '[]') from public.opportunity_categories t),
    'opportunity_owners', (select coalesce(jsonb_agg(to_jsonb(t) order by t.opportunity_id, t.user_id), '[]') from public.opportunity_owners t),
    'opportunity_history', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.opportunity_history t),
    'signups', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.signups t),
    'signup_events', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.signup_events t),
    'role_changes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.role_changes t),
    'backup_log', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.backup_log t)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Deliberate erase (SQL editor only)
-- ---------------------------------------------------------------------------

-- Permanently removes a person and everything they did. Anyone waiting
-- behind their spots moves up.
create or replace function public.erase_member_permanently(p_email text) returns text
language plpgsql set search_path = ''
as $$
declare
  v_id uuid;
  v_opps uuid[];
  v_opp uuid;
  v_signups integer;
begin
  select id into v_id from public.profiles where email = lower(trim(coalesce(p_email, '')));
  if v_id is null then
    raise exception 'No member with the email %', p_email;
  end if;

  select coalesce(array_agg(opportunity_id), '{}'), count(*)
  into v_opps, v_signups
  from public.signups where user_id = v_id;

  delete from public.signup_events where user_id = v_id or signup_id in (select id from public.signups where user_id = v_id);
  delete from public.signups where user_id = v_id;
  delete from public.member_interest_categories where user_id = v_id;
  delete from auth.users where id = v_id;  -- also removes the profile, interests, ownerships, role log

  foreach v_opp in array v_opps loop
    perform public.promote_waitlist(v_opp);
  end loop;

  return format('Erased %s and their %s sign-up(s).', lower(trim(p_email)), v_signups);
end;
$$;

-- Permanently removes a post and everything attached to it.
create or replace function public.erase_opportunity_permanently(p_opportunity_id uuid) returns text
language plpgsql set search_path = ''
as $$
declare
  v_title text;
  v_signups integer;
begin
  select title into v_title from public.opportunities where id = p_opportunity_id;
  if v_title is null then
    raise exception 'No opportunity with the id %', p_opportunity_id;
  end if;
  select count(*) into v_signups from public.signups where opportunity_id = p_opportunity_id;

  delete from public.signup_events where opportunity_id = p_opportunity_id;
  delete from public.signups where opportunity_id = p_opportunity_id;
  delete from public.opportunity_history where opportunity_id = p_opportunity_id;
  delete from public.opportunities where id = p_opportunity_id;  -- also removes its topics and owners

  return format('Erased "%s" and its %s sign-up(s).', v_title, v_signups);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

-- The new tables: admins read; nobody writes except the triggers and functions above.
revoke all on table public.opportunity_history, public.role_changes, public.backup_log from anon, authenticated;
alter table public.opportunity_history enable row level security;
alter table public.role_changes enable row level security;
alter table public.backup_log enable row level security;
grant select on public.opportunity_history, public.role_changes, public.backup_log to authenticated;

drop policy if exists opportunity_history_select on public.opportunity_history;
create policy opportunity_history_select on public.opportunity_history
  for select to authenticated using (public.is_admin());
drop policy if exists role_changes_select on public.role_changes;
create policy role_changes_select on public.role_changes
  for select to authenticated using (public.is_admin());
drop policy if exists backup_log_select on public.backup_log;
create policy backup_log_select on public.backup_log
  for select to authenticated using (public.is_admin());

-- Supabase lets anyone call new functions by default. The site may call only
-- admin_export_all (which checks for admin itself). The erase functions are
-- for the SQL editor alone.
revoke execute on function public.log_opportunity_change() from public, anon, authenticated;
revoke execute on function public.log_role_change() from public, anon, authenticated;
revoke execute on function public.admin_export_all() from public, anon, authenticated;
revoke execute on function public.erase_member_permanently(text) from public, anon, authenticated;
revoke execute on function public.erase_opportunity_permanently(uuid) from public, anon, authenticated;
grant execute on function public.admin_export_all() to authenticated;
