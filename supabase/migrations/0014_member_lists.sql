-- EMS Opportunities Portal: committee member lists.
--
-- Run once in the Supabase SQL editor, after 0013. Safe to run twice. If
-- Supabase offers "Run and enable RLS", choose "Run without RLS": this file
-- turns RLS on itself.
--
-- Each committee's member list (confirmed people) is the group's record of
-- who serves where. This adds:
--   - Leads add members who have not signed in yet: they wait in
--     pending_members and become confirmed members at their first sign-in
--     (their history shows who added them and when). Waiting members count
--     toward seats.
--   - find_people: leads and admins type part of a name or email and pick
--     from suggestions (signed-in people, and the email lists loaded in
--     advance).
--   - 'remove' in owner_decide_signup: take a confirmed member off the list
--     (recorded as having left that day).
--   - Once a year: leads click "List is up to date" (roster_checks). Each
--     November, leads whose list has not been confirmed for about a year get
--     one reminder email (when reminder emails are on).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.pending_members (
  email text not null check (email = lower(email)),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (email, opportunity_id)
);

create table if not exists public.roster_checks (
  id bigint generated always as identity primary key,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  checked_by uuid references public.profiles (id) on delete set null,
  checked_at timestamptz not null default now()
);
create index if not exists roster_checks_opportunity_idx on public.roster_checks (opportunity_id, checked_at);

-- The email log learns the yearly member-list reminder.
alter table public.notification_log drop constraint if exists notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check
  check (kind in ('owner_digest', 'member_nudge', 'test', 'run', 'setting', 'roster_check'));

-- ---------------------------------------------------------------------------
-- Member lists
-- ---------------------------------------------------------------------------

create or replace function public.check_seat_available(p_opp public.opportunities)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_taken integer;
begin
  if p_opp.capacity is null then
    return;
  end if;
  select (select count(*) from public.signups where opportunity_id = p_opp.id and status = 'committed')
       + (select count(*) from public.pending_members where opportunity_id = p_opp.id)
  into v_taken;
  if v_taken >= p_opp.capacity then
    raise exception 'All % seats are filled. Raise the number of seats in Edit, or remove someone first.', p_opp.capacity;
  end if;
end;
$$;

-- p_decision: 'confirm', 'not_selected', 'undo' (back to Interested) or
-- 'remove' (take a confirmed member off the list; recorded as having left).
-- Returns the new status. Leads may decide after the deadline or once closed.
create or replace function public.owner_decide_signup(p_signup_id uuid, p_decision text)
returns public.signup_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_signup public.signups;
  v_opp public.opportunities;
begin
  select * into v_signup from public.signups where id = p_signup_id;
  if v_signup.id is null then
    raise exception 'Sign-up not found';
  end if;
  if not (public.is_admin() or public.is_opp_owner(v_signup.opportunity_id)) then
    raise exception 'Only the post''s owners or an admin can do this';
  end if;

  -- Lock the post so two leads cannot fill the last seat at once.
  select * into v_opp from public.opportunities where id = v_signup.opportunity_id for update;
  select * into v_signup from public.signups where id = p_signup_id for update;

  if p_decision = 'confirm' then
    if v_signup.status = 'committed' then
      return v_signup.status;
    end if;
    if v_signup.status not in ('interested', 'not_selected', 'waitlisted') then
      raise exception 'This person is no longer signed up';
    end if;
    perform public.check_seat_available(v_opp);
    update public.signups set status = 'committed' where id = p_signup_id;
    return 'committed';
  elsif p_decision = 'not_selected' then
    if v_signup.status = 'not_selected' then
      return v_signup.status;
    end if;
    if v_signup.status not in ('interested', 'committed', 'waitlisted') then
      raise exception 'This person is no longer signed up';
    end if;
    update public.signups set status = 'not_selected' where id = p_signup_id;
    return 'not_selected';
  elsif p_decision = 'undo' then
    if v_signup.status = 'interested' then
      return v_signup.status;
    end if;
    if v_signup.status not in ('committed', 'not_selected', 'waitlisted') then
      raise exception 'This person is no longer signed up';
    end if;
    update public.signups set status = 'interested' where id = p_signup_id;
    return 'interested';

  elsif p_decision = 'remove' then
    if v_signup.status = 'withdrawn' then
      return v_signup.status;
    end if;
    if v_signup.status <> 'committed' then
      raise exception 'This person is not on the member list';
    end if;
    update public.signups set status = 'withdrawn' where id = p_signup_id;
    return 'withdrawn';
  end if;

  raise exception 'That choice is not allowed';
end;
$$;

-- Leads add someone who is already on the committee. Returns 'added' or
-- 'already'; for someone who has not signed in yet, 'pending' or
-- 'already_pending' (they become a confirmed member at first sign-in).
create or replace function public.owner_add_member(p_opportunity_id uuid, p_email text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_opp public.opportunities;
  v_user public.profiles;
  v_current public.signup_status;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not exists (select 1 from public.opportunities where id = p_opportunity_id) then
    raise exception 'Opportunity not found';
  end if;
  if not (public.is_admin() or public.is_opp_owner(p_opportunity_id)) then
    raise exception 'Only the post''s owners or an admin can do this';
  end if;

  select * into v_user from public.profiles where email = v_email;
  select * into v_opp from public.opportunities where id = p_opportunity_id for update;

  if v_user.id is null then
    if v_email not like '_%@' || public.allowed_email_domain() then
      raise exception 'Email must end in @%', public.allowed_email_domain();
    end if;
    if exists (select 1 from public.pending_members where email = v_email and opportunity_id = p_opportunity_id) then
      return 'already_pending';
    end if;
    perform public.check_seat_available(v_opp);
    insert into public.pending_members (email, opportunity_id, added_by)
    values (v_email, p_opportunity_id, auth.uid());
    return 'pending';
  end if;

  select status into v_current
  from public.signups
  where opportunity_id = p_opportunity_id and user_id = v_user.id
  for update;

  if v_current = 'committed' then
    return 'already';
  end if;
  if v_current in ('completed', 'no_show') then
    raise exception 'Attendance has already been recorded for this person';
  end if;

  perform public.check_seat_available(v_opp);
  insert into public.signups (opportunity_id, user_id, status)
  values (p_opportunity_id, v_user.id, 'committed')
  on conflict (opportunity_id, user_id) do update set status = excluded.status;
  return 'added';
end;
$$;

-- Cancel a waiting member (admins, or the post's owners).
create or replace function public.remove_pending_member(p_opportunity_id uuid, p_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.is_admin() or public.is_opp_owner(p_opportunity_id)) then
    raise exception 'Only the post''s owners or an admin can do this';
  end if;
  delete from public.pending_members
  where opportunity_id = p_opportunity_id and email = lower(trim(coalesce(p_email, '')));
end;
$$;

-- Leads and admins look people up by part of a name or email. Signed-in
-- people match on name or email; people loaded in advance (no name yet)
-- match on email. At most 8, signed-in people first.
create or replace function public.find_people(p_query text)
returns table (email text, full_name text, signed_in boolean)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := lower(trim(coalesce(p_query, '')));
begin
  if not (public.is_admin() or exists (select 1 from public.opportunity_owners ow where ow.user_id = auth.uid())) then
    raise exception 'Only post owners and admins can search for people';
  end if;
  if length(v_q) < 2 then
    return;
  end if;
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  select x.email, x.full_name, x.signed_in
  from (
    select p.email, p.full_name, true as signed_in
    from public.profiles p
    where lower(p.full_name) like '%' || v_q || '%' or p.email like '%' || v_q || '%'
    union all
    select m.email, ''::text, false
    from public.member_presets m
    where m.email like '%' || v_q || '%'
      and not exists (select 1 from public.profiles p2 where p2.email = m.email)
  ) x
  order by x.signed_in desc, x.full_name, x.email
  limit 8;
end;
$$;

-- "List is up to date": a lead (or admin) confirms the member list.
create or replace function public.confirm_roster(p_opportunity_id uuid)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if not exists (select 1 from public.opportunities where id = p_opportunity_id) then
    raise exception 'Opportunity not found';
  end if;
  if not (public.is_admin() or public.is_opp_owner(p_opportunity_id)) then
    raise exception 'Only the post''s owners or an admin can do this';
  end if;
  insert into public.roster_checks (opportunity_id, checked_by)
  values (p_opportunity_id, auth.uid())
  returning checked_at into v_at;
  return v_at;
end;
$$;

-- First sign-in: apply the preset position (0009), waiting ownerships (0013)
-- and waiting committee memberships (0014).
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

  -- Memberships a lead added before this person signed in. Their history
  -- shows who added them and when, so "member since" is that date.
  insert into public.signups (opportunity_id, user_id, status, status_changed_at, created_at)
  select opportunity_id, new.id, 'committed', created_at, created_at
  from public.pending_members where email = v_email
  on conflict (opportunity_id, user_id) do update set status = 'committed';
  update public.signup_events e
  set changed_by = pm.added_by, changed_at = pm.created_at
  from public.pending_members pm, public.signups s
  where pm.email = v_email and s.opportunity_id = pm.opportunity_id and s.user_id = new.id
    and e.signup_id = s.id;
  delete from public.pending_members where email = v_email;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Emails: the yearly member-list reminder counts toward the daily limit
-- ---------------------------------------------------------------------------


-- Emails handed to Brevo today (Wisconsin time), for the daily limit.
create or replace function public.emails_sent_on(p_day date) returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.notification_log
  where kind in ('owner_digest', 'member_nudge', 'test', 'roster_check')
    and status in ('queued', 'sent', 'unknown')
    and (created_at at time zone 'America/Chicago')::date = p_day
$$;

-- ---------------------------------------------------------------------------
-- Admin controls
-- ---------------------------------------------------------------------------

create or replace function public.admin_notification_status()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s public.notification_settings;
  v_scheduled boolean := false;
  v_has_key boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this';
  end if;
  perform public.record_notification_results();
  select * into s from public.notification_settings;

  if to_regclass('vault.secrets') is not null then
    v_has_key := exists (select 1 from vault.secrets where name = 'brevo_api_key');
  end if;

  if to_regclass('cron.job') is not null then
    execute 'select exists (select 1 from cron.job where jobname = $1)' into v_scheduled using 'ems-daily-notifications';
  end if;

  return jsonb_build_object(
    'enabled', s.enabled,
    'ready', public.email_ready(),
    'has_key', v_has_key,
    'sender_email', s.sender_email,
    'scheduled', v_scheduled,
    'daily_cap', s.daily_cap,
    'digest_every_days', s.digest_every_days,
    'nudge_after_days', s.nudge_after_days,
    'sent_today', public.emails_sent_on(public.local_today()),
    'sent_14d', (select count(*) from public.notification_log
                 where kind in ('owner_digest', 'member_nudge', 'test', 'roster_check') and status = 'sent'
                   and created_at > now() - interval '14 days'),
    'failed_14d', (select count(*) from public.notification_log
                   where kind in ('owner_digest', 'member_nudge', 'test', 'roster_check') and status in ('failed', 'unknown')
                     and created_at > now() - interval '14 days'),
    'opted_out', (select count(*) from public.profiles where not email_opt_in),
    'last_run', (select to_jsonb(x) from (
                   select created_at, status, details, error from public.notification_log
                   where kind = 'run' order by id desc limit 1) x),
    'recent', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id desc), '[]'::jsonb) from (
                 select l.id, l.kind, l.status, l.status_code, l.error, l.created_at, l.details,
                        coalesce(nullif(p.full_name, ''), p.email) as person, o.title
                 from public.notification_log l
                 left join public.profiles p on p.id = l.user_id
                 left join public.opportunities o on o.id = l.opportunity_id
                 where l.kind <> 'run'
                 order by l.id desc limit 20) x)
  );
end;
$$;

-- ---------------------------------------------------------------------------

-- Run each morning by pg_cron. p_now lets the tests pretend it is another day
-- (log rows are stamped with it, so "already sent" checks follow along).
create or replace function public.run_daily_notifications(p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s public.notification_settings;
  v_today date := (p_now at time zone 'America/Chicago')::date;
  v_slot integer;
  v_cap_left integer;
  v_digests integer := 0;
  v_nudges integer := 0;
  v_skipped integer := 0;
  v_result jsonb;
  r record;
  v_last timestamptz;
  v_count integer;
  v_new integer;
  v_ids jsonb;
  v_list text;
  v_weeks text;
  v_req bigint;
  v_roster integer := 0;
begin
  select * into s from public.notification_settings;
  if not coalesce(s.enabled, false) then
    return jsonb_build_object('enabled', false);
  end if;

  begin
    if not public.email_ready() then
      raise exception 'The Brevo API key or sender is missing';
    end if;

    -- Each owner has a fixed day in every two-week cycle (from their id), so
    -- digests spread evenly over the cycle instead of all landing on one day.
    v_slot := mod(v_today - date '2026-01-05', s.digest_every_days);
    v_cap_left := greatest(s.daily_cap - public.emails_sent_on(v_today), 0);

    -- Owner digests ---------------------------------------------------------
    for r in
      select p.id, p.email, p.full_name
      from public.profiles p
      where p.email_opt_in
        and exists (select 1 from public.opportunity_owners ow where ow.user_id = p.id)
        and mod(('x' || substr(md5(p.id::text), 1, 7))::bit(28)::integer, s.digest_every_days) = v_slot
        -- Never two digests within one cycle (for example if the cycle changes).
        and not exists (
          select 1 from public.notification_log l
          where l.kind = 'owner_digest' and l.user_id = p.id and l.status <> 'failed'
            and l.created_at > p_now - make_interval(days => s.digest_every_days - 1)
        )
      order by p.id
    loop
      select max(created_at) into v_last
      from public.notification_log
      where kind = 'owner_digest' and user_id = r.id and status <> 'failed';

      with waiting as (
        select o.id as opp_id, o.title, sg.id as signup_id, sg.status, sg.status_changed_at,
               m.full_name, m.email,
               (v_last is null or sg.status_changed_at > v_last) as is_new
        from public.opportunity_owners ow
        join public.opportunities o on o.id = ow.opportunity_id
        join public.signups sg on sg.opportunity_id = o.id
        join public.profiles m on m.id = sg.user_id
        where ow.user_id = r.id
          and o.status = 'open'
          and (o.visible_until is null or o.visible_until >= v_today)
          and sg.status = 'interested'
          and sg.contacted_at is null
          and not exists (
            select 1 from public.opportunity_owners x
            where x.opportunity_id = o.id and x.user_id = sg.user_id
          )
      ), per_post as (
        select w.opp_id, w.title,
          '<p style="margin: 16px 0 4px;"><strong><a href="' || public.html_escape(s.site_url) || '/o/' || w.opp_id
            || '">' || public.html_escape(w.title) || '</a></strong></p><ul style="margin-top: 0;">'
            || string_agg(
                 '<li><a href="mailto:' || public.html_escape(w.email) || '">'
                   || public.html_escape(coalesce(nullif(trim(w.full_name), ''), w.email)) || '</a>'
                   || ' · Interested'
                   || ' since ' || to_char(w.status_changed_at at time zone 'America/Chicago', 'Mon FMDD')
                   || case when w.is_new then ' <strong>(new)</strong>' else '' end
                   || '</li>',
                 '' order by w.status_changed_at, w.signup_id)
            || '</ul>' as html
        from waiting w
        group by w.opp_id, w.title
      )
      select
        (select count(*)::integer from waiting),
        (select count(*)::integer from waiting where is_new),
        (select coalesce(jsonb_agg(signup_id order by signup_id), '[]'::jsonb) from waiting),
        (select string_agg(html, '' order by title, opp_id) from per_post)
      into v_count, v_new, v_ids, v_list;

      continue when v_count = 0;
      if v_cap_left <= 0 then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_req := public.send_email(
        r.email,
        r.full_name,
        'EMS Opportunities: ' || v_count || case when v_count = 1 then ' person' else ' people' end || ' waiting to hear from you',
        public.email_wrap(
          '<p>Hi ' || public.html_escape(coalesce(nullif(trim(split_part(r.full_name, ',', 1)), ''), 'there')) || ',</p>'
          || '<p>These people raised a hand on your posts and are waiting for your decision. A short note from you goes a long way.</p>'
          || v_list
          || '<p>On <a href="' || public.html_escape(s.site_url) || '/my-posts">My posts</a>, choose <strong>Confirm</strong> '
          || 'or <strong>Not this time</strong> for each person, or tick <strong>Contacted</strong> once you have reached out. '
          || 'Either way they drop off this list.</p>'
          || '<p style="font-size: 13px; color: #555;">This summary comes about every two weeks, and only when someone is waiting.</p>'
        )
      );
      insert into public.notification_log (kind, user_id, details, request_id, created_at)
      values ('owner_digest', r.id, jsonb_build_object('people', v_count, 'new', v_new, 'signup_ids', v_ids), v_req, p_now);
      v_cap_left := v_cap_left - 1;
      v_digests := v_digests + 1;
    end loop;

    -- Member follow-ups -----------------------------------------------------
    v_weeks := case round(s.nudge_after_days / 7.0)
      when 1 then 'a week' when 2 then 'two weeks' when 3 then 'three weeks' when 4 then 'four weeks'
      else round(s.nudge_after_days / 7.0)::text || ' weeks' end;

    for r in
      select sg.id as signup_id, sg.status, m.id as user_id, m.email, m.full_name,
             o.id as opp_id, o.title, o.contacts
      from public.signups sg
      join public.profiles m on m.id = sg.user_id
      join public.opportunities o on o.id = sg.opportunity_id
      where sg.status = 'interested'
        and sg.contacted_at is null
        and sg.nudged_at is null
        and sg.status_changed_at <= p_now - make_interval(days => s.nudge_after_days)
        -- Only recent sign-ups, so turning emails on does not follow up on
        -- months of old ones at once.
        and sg.status_changed_at > p_now - make_interval(days => s.nudge_after_days + 21)
        and m.email_opt_in
        and o.status = 'open'
        and (o.visible_until is null or o.visible_until >= v_today)
        and not exists (
          select 1 from public.opportunity_owners x
          where x.opportunity_id = o.id and x.user_id = m.id
        )
      order by sg.status_changed_at, sg.id
    loop
      -- Who to contact: the post's contacts, or else its owners.
      select string_agg(
               '<li>' || case when nm <> ''
                 then public.html_escape(nm) || ' (<a href="mailto:' || public.html_escape(em) || '">' || public.html_escape(em) || '</a>)'
                 else '<a href="mailto:' || public.html_escape(em) || '">' || public.html_escape(em) || '</a>' end
               || '</li>', '' order by ord)
      into v_list
      from (
        select trim(coalesce(c ->> 'name', '')) as nm, trim(coalesce(c ->> 'email', '')) as em, ord
        from jsonb_array_elements(r.contacts) with ordinality as t (c, ord)
      ) c
      where em <> '' and lower(em) <> lower(r.email);

      if v_list is null then
        select string_agg(
                 '<li>' || public.html_escape(coalesce(nullif(trim(p.full_name), ''), p.email))
                 || ' (<a href="mailto:' || public.html_escape(p.email) || '">' || public.html_escape(p.email) || '</a>)</li>',
                 '' order by p.full_name, p.id)
        into v_list
        from public.opportunity_owners ow
        join public.profiles p on p.id = ow.user_id
        where ow.opportunity_id = r.opp_id and p.id <> r.user_id;
      end if;

      continue when v_list is null;  -- nobody to point them to
      if v_cap_left <= 0 then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_req := public.send_email(
        r.email,
        r.full_name,
        'Following up: ' || r.title,
        public.email_wrap(
          '<p>Hi ' || public.html_escape(coalesce(nullif(trim(split_part(r.full_name, ',', 1)), ''), 'there')) || ',</p>'
          || '<p>About ' || v_weeks || ' ago you raised your hand for <a href="' || public.html_escape(s.site_url) || '/o/' || r.opp_id || '">'
          || public.html_escape(r.title) || '</a>. If no one has been in touch yet, you are welcome to reach out directly:</p>'
          || '<ul>' || v_list || '</ul>'
          || '<p>Changed your mind? You can remove your interest on the <a href="' || public.html_escape(s.site_url)
          || '/o/' || r.opp_id || '">post</a>. This is the only follow-up you will get about it.</p>'
        )
      );
      update public.signups set nudged_at = p_now where id = r.signup_id;
      insert into public.notification_log (kind, user_id, opportunity_id, details, request_id, created_at)
      values ('member_nudge', r.user_id, r.opp_id, jsonb_build_object('signup_id', r.signup_id), v_req, p_now);
      v_cap_left := v_cap_left - 1;
      v_nudges := v_nudges + 1;
    end loop;

    -- Once a year (November): leads confirm their member lists ---------------
    -- Same owner day as the digest, so these spread over the month too.
    if extract(month from v_today) = 11 then
      for r in
        select p.id, p.email, p.full_name
        from public.profiles p
        where p.email_opt_in
          and mod(('x' || substr(md5(p.id::text), 1, 7))::bit(28)::integer, s.digest_every_days) = v_slot
          and not exists (
            select 1 from public.notification_log l
            where l.kind = 'roster_check' and l.user_id = p.id and l.status <> 'failed'
              and l.created_at > p_now - interval '300 days'
          )
        order by p.id
      loop
        select string_agg(
                 '<li><a href="' || public.html_escape(s.site_url) || '/o/' || o.id || '">'
                 || public.html_escape(o.title) || '</a></li>', '' order by o.title, o.id)
        into v_list
        from public.opportunity_owners ow
        join public.opportunities o on o.id = ow.opportunity_id
        where ow.user_id = r.id
          and o.status = 'open'
          and (o.visible_until is null or o.visible_until >= v_today)
          and coalesce((select max(rc.checked_at) from public.roster_checks rc where rc.opportunity_id = o.id),
                       '-infinity'::timestamptz) < p_now - interval '330 days';

        continue when v_list is null;
        if v_cap_left <= 0 then
          v_skipped := v_skipped + 1;
          continue;
        end if;

        v_req := public.send_email(
          r.email,
          r.full_name,
          'EMS Opportunities: once-a-year check of your member list',
          public.email_wrap(
            '<p>Hi ' || public.html_escape(coalesce(nullif(trim(split_part(r.full_name, ',', 1)), ''), 'there')) || ',</p>'
            || '<p>Once a year we ask each lead to make sure their member list is right, since it is the group''s record of who serves where.</p>'
            || '<ul>' || v_list || '</ul>'
            || '<p>On <a href="' || public.html_escape(s.site_url) || '/my-posts">My posts</a>, remove anyone no longer active, '
            || 'add anyone missing, then click <strong>List is up to date</strong>. It takes a minute.</p>'
          )
        );
        insert into public.notification_log (kind, user_id, request_id, created_at)
        values ('roster_check', r.id, v_req, p_now);
        v_cap_left := v_cap_left - 1;
        v_roster := v_roster + 1;
      end loop;
    end if;

    v_result := jsonb_build_object('digests', v_digests, 'nudges', v_nudges, 'list_checks', v_roster,
                                   'skipped_for_limit', v_skipped, 'slot', v_slot);
    insert into public.notification_log (kind, details, status, created_at) values ('run', v_result, 'done', p_now);
    return v_result;
  exception when others then
    -- Everything above is undone (nothing queued, nothing marked); keep a note.
    insert into public.notification_log (kind, status, error, created_at) values ('run', 'failed', left(sqlerrm, 500), p_now);
    return jsonb_build_object('error', sqlerrm);
  end;
end;
$$;

-- Full backup now includes waiting members and member list checks.
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
    'schema_version', 14,
    'profiles', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.profiles t),
    'member_interests', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id), '[]') from public.member_interests t),
    'member_interest_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.category_id), '[]') from public.member_interest_categories t),
    'member_presets', (select coalesce(jsonb_agg(to_jsonb(t) order by t.email), '[]') from public.member_presets t),
    'interest_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]') from public.interest_categories t),
    'opportunities', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]') from public.opportunities t),
    'opportunity_categories', (select coalesce(jsonb_agg(to_jsonb(t) order by t.opportunity_id, t.category_id), '[]') from public.opportunity_categories t),
    'opportunity_owners', (select coalesce(jsonb_agg(to_jsonb(t) order by t.opportunity_id, t.user_id), '[]') from public.opportunity_owners t),
    'owner_presets', (select coalesce(jsonb_agg(to_jsonb(t) order by t.opportunity_id, t.email), '[]') from public.owner_presets t),
    'pending_members', (select coalesce(jsonb_agg(to_jsonb(t) order by t.opportunity_id, t.email), '[]') from public.pending_members t),
    'roster_checks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.roster_checks t),
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

revoke all on table public.pending_members from anon, authenticated;
alter table public.pending_members enable row level security;
grant select on public.pending_members to authenticated;
drop policy if exists pending_members_select on public.pending_members;
create policy pending_members_select on public.pending_members
  for select to authenticated
  using (public.is_admin() or public.is_opp_owner(opportunity_id));

revoke all on table public.roster_checks from anon, authenticated;
alter table public.roster_checks enable row level security;
grant select on public.roster_checks to authenticated;
drop policy if exists roster_checks_select on public.roster_checks;
create policy roster_checks_select on public.roster_checks
  for select to authenticated
  using (public.is_admin() or public.is_opp_owner(opportunity_id));

revoke execute on function public.check_seat_available(public.opportunities) from public, anon, authenticated;
revoke execute on function public.owner_decide_signup(uuid, text) from public, anon, authenticated;
revoke execute on function public.owner_add_member(uuid, text) from public, anon, authenticated;
revoke execute on function public.remove_pending_member(uuid, text) from public, anon, authenticated;
revoke execute on function public.find_people(text) from public, anon, authenticated;
revoke execute on function public.confirm_roster(uuid) from public, anon, authenticated;
revoke execute on function public.emails_sent_on(date) from public, anon, authenticated;
revoke execute on function public.admin_notification_status() from public, anon, authenticated;
revoke execute on function public.run_daily_notifications(timestamptz) from public, anon, authenticated;

grant execute on function public.owner_decide_signup(uuid, text) to authenticated;
grant execute on function public.owner_add_member(uuid, text) to authenticated;
grant execute on function public.remove_pending_member(uuid, text) to authenticated;
grant execute on function public.find_people(text) to authenticated;
grant execute on function public.confirm_roster(uuid) to authenticated;
grant execute on function public.admin_notification_status() to authenticated;
