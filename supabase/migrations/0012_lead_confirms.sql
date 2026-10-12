-- EMS Opportunities Portal: leads confirm who joins.
--
-- Run once in the Supabase SQL editor, after 0011. Safe to run twice.
--
-- "Right people, right seats": members no longer add themselves to anything.
-- They raise a hand (Interested). The post's owners (its lead), or a site
-- admin, then choose for each person:
--   Confirm        -> they are in (stored as 'committed', shown as Confirmed)
--   Not this time  -> stored as 'not_selected', shown to them as "Reviewed by
--                     the lead"; they can raise a hand again later
--   Undo           -> back to Interested
-- Leads can also add people who are already on a committee, by email.
-- Seat limits still apply when confirming. The waitlist is no longer used:
-- anyone still on one goes back to Interested so the lead can decide.
-- Reminder emails now only cover people still waiting (Interested).
--
-- Note for whoever edits this file: the Supabase SQL editor runs it as one
-- transaction, and Postgres cannot use a newly added enum value in that same
-- transaction except inside function bodies. Keep 'not_selected' out of any
-- statement that runs here directly (updates, checks, policies, SQL-language
-- functions); plpgsql function bodies are fine.

alter type public.signup_status add value if not exists 'not_selected';

-- Waitlists are retired: everyone waiting goes back to Interested (logged).
update public.signups set status = 'interested' where status = 'waitlisted';

-- ---------------------------------------------------------------------------
-- Members: raise a hand, take it down, or step off
-- ---------------------------------------------------------------------------

create or replace function public.set_my_signup(p_opportunity_id uuid, p_status public.signup_status)
returns public.signup_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_opp public.opportunities;
  v_current public.signup_status;
begin
  if v_uid is null then
    raise exception 'Please sign in first';
  end if;

  if p_status = 'committed' then
    raise exception 'Only the post''s lead can confirm people. Mark Interested and they will be in touch.';
  end if;
  if p_status not in ('interested', 'withdrawn') then
    raise exception 'That choice is not allowed';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is null or v_profile.position is null or trim(v_profile.full_name) = '' then
    raise exception 'Please complete your profile first';
  end if;

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

  -- Taking a hand down, or stepping off after being confirmed.
  if p_status = 'withdrawn' then
    if v_current is null or v_current = 'withdrawn' then
      return v_current;
    end if;
    update public.signups set status = 'withdrawn'
    where opportunity_id = p_opportunity_id and user_id = v_uid;
    return 'withdrawn';
  end if;

  -- p_status = 'interested'
  if v_current in ('interested', 'committed') then
    return v_current;  -- confirmed people stay confirmed; they can step off instead
  end if;

  if not (v_profile.position = any (v_opp.eligible_positions)) then
    raise exception 'This opportunity is not open to your position. You can still view it.';
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

  insert into public.signups (opportunity_id, user_id, status)
  values (p_opportunity_id, v_uid, 'interested')
  on conflict (opportunity_id, user_id) do update set status = excluded.status;
  return 'interested';
end;
$$;

-- ---------------------------------------------------------------------------
-- Leads decide
-- ---------------------------------------------------------------------------

-- Raises an error if confirming one more person would go over the seat limit.
-- Call with the post already locked.
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
  select count(*) into v_taken
  from public.signups
  where opportunity_id = p_opp.id and status = 'committed';
  if v_taken >= p_opp.capacity then
    raise exception 'All % seats are filled. Raise the number of seats in Edit, or move someone back first.', p_opp.capacity;
  end if;
end;
$$;

-- p_decision: 'confirm', 'not_selected' or 'undo' (back to Interested).
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
  end if;

  raise exception 'That choice is not allowed';
end;
$$;

-- Leads add someone who is already on the committee (they must have signed
-- in once). Returns 'added' or 'already'.
create or replace function public.owner_add_member(p_opportunity_id uuid, p_email text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_opp public.opportunities;
  v_user public.profiles;
  v_current public.signup_status;
begin
  if not exists (select 1 from public.opportunities where id = p_opportunity_id) then
    raise exception 'Opportunity not found';
  end if;
  if not (public.is_admin() or public.is_opp_owner(p_opportunity_id)) then
    raise exception 'Only the post''s owners or an admin can do this';
  end if;

  select * into v_user from public.profiles where email = lower(trim(coalesce(p_email, '')));
  if v_user.id is null then
    raise exception 'This person has not signed in yet. Ask them to sign in once, then try again.';
  end if;

  select * into v_opp from public.opportunities where id = p_opportunity_id for update;
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

-- ---------------------------------------------------------------------------
-- Reminder emails: only people still waiting for a decision (Interested)
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

    v_result := jsonb_build_object('digests', v_digests, 'nudges', v_nudges, 'skipped_for_limit', v_skipped, 'slot', v_slot);
    insert into public.notification_log (kind, details, status, created_at) values ('run', v_result, 'done', p_now);
    return v_result;
  exception when others then
    -- Everything above is undone (nothing queued, nothing marked); keep a note.
    insert into public.notification_log (kind, status, error, created_at) values ('run', 'failed', left(sqlerrm, 500), p_now);
    return jsonb_build_object('error', sqlerrm);
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

revoke execute on function public.set_my_signup(uuid, public.signup_status) from public, anon, authenticated;
revoke execute on function public.check_seat_available(public.opportunities) from public, anon, authenticated;
revoke execute on function public.owner_decide_signup(uuid, text) from public, anon, authenticated;
revoke execute on function public.owner_add_member(uuid, text) from public, anon, authenticated;
revoke execute on function public.run_daily_notifications(timestamptz) from public, anon, authenticated;

grant execute on function public.set_my_signup(uuid, public.signup_status) to authenticated;
grant execute on function public.owner_decide_signup(uuid, text) to authenticated;
grant execute on function public.owner_add_member(uuid, text) to authenticated;
