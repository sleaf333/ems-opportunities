-- EMS Opportunities Portal: automatic emails.
--
-- Run once in the Supabase SQL editor, after 0010. Safe to run twice. If
-- Supabase offers "Run and enable RLS", choose "Run without RLS": this file
-- turns RLS on itself.
--
-- Nothing is emailed until an admin turns emails on (Admin page, "Email
-- reminders"), which needs a Brevo API key saved in the Supabase Vault under
-- the name brevo_api_key. See docs/SETUP.md, "Automatic emails".
--
-- What gets sent (both skip anyone who turned emails off on their Profile):
--   Owners: a summary about every two weeks, listing people who raised a hand
--     on their open posts and are not ticked "Contacted" yet. Only sent when
--     someone is waiting. Owners are spread across the 14 days so the group's
--     emails do not all go out on one day.
--   Members: one follow-up, three weeks after they marked Interested or
--     Commit, if no owner has ticked them "Contacted". It lists who to contact.
--
-- A daily limit (150 by default) keeps these well under Brevo's free 300 a
-- day, leaving room for sign-in codes. A database schedule (pg_cron) runs the
-- check each morning; emails go out through Brevo's web API (pg_net).

-- ---------------------------------------------------------------------------
-- Extensions (both come with Supabase; skipped with a notice elsewhere)
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    create extension if not exists pg_net with schema extensions;
  exception when others then
    raise notice 'pg_net is not available here (%); emails cannot be sent', sqlerrm;
  end;
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron is not available here (%); the daily check is not scheduled', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

-- Each person can turn the emails off on their Profile.
alter table public.profiles
  add column if not exists email_opt_in boolean not null default true;

-- Owners tick "Contacted" once they have reached out. nudged_at is when the
-- member got their one follow-up. Changing these is not a status change, so
-- it adds nothing to signup_events or Insights.
alter table public.signups
  add column if not exists contacted_at timestamptz,
  add column if not exists contacted_by uuid references public.profiles (id) on delete set null,
  add column if not exists nudged_at timestamptz;

-- ---------------------------------------------------------------------------
-- Settings (one row) and the email log
-- ---------------------------------------------------------------------------

create table if not exists public.notification_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  sender_email text not null default '',
  sender_name text not null default 'EMS Opportunities',
  site_url text not null default 'https://ems-opportunities.pages.dev',
  api_url text not null default 'https://api.brevo.com/v3/smtp/email',
  daily_cap integer not null default 150 check (daily_cap between 0 and 290),
  digest_every_days integer not null default 14 check (digest_every_days between 7 and 28),
  nudge_after_days integer not null default 21 check (nudge_after_days between 7 and 60),
  updated_at timestamptz not null default now()
);

insert into public.notification_settings (id) values (true) on conflict do nothing;

-- One row per email (and per daily run and per on/off switch). The text of an
-- email is not kept, only who it went to, about what, and whether Brevo took it.
create table if not exists public.notification_log (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('owner_digest', 'member_nudge', 'test', 'run', 'setting')),
  user_id uuid references public.profiles (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  details jsonb not null default '{}'::jsonb,
  request_id bigint,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'unknown', 'done')),
  status_code integer,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists notification_log_kind_user_idx on public.notification_log (kind, user_id, created_at);
create index if not exists notification_log_queued_idx on public.notification_log (request_id) where status = 'queued';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.html_escape(p text) returns text
language sql immutable set search_path = ''
as $$
  select replace(replace(replace(replace(replace(coalesce(p, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;

-- Shared look and the footer every email carries.
create or replace function public.email_wrap(p_body text) returns text
language plpgsql stable set search_path = ''
as $$
declare
  v_site text := (select site_url from public.notification_settings);
begin
  return '<div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.5; color: #0B2440; max-width: 560px;">'
    || p_body
    || '<p style="font-size: 13px; color: #555;">You can turn these emails off on your <a href="'
    || public.html_escape(v_site) || '/profile">Profile</a>.</p></div>';
end;
$$;

-- Hands one email to Brevo. Returns the pg_net request id; the answer arrives
-- a moment later in net._http_response (see record_notification_results).
create or replace function public.send_email(p_to text, p_to_name text, p_subject text, p_html text)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  s public.notification_settings;
  v_key text;
  v_id bigint;
begin
  select * into s from public.notification_settings;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'brevo_api_key' limit 1;
  if coalesce(v_key, '') = '' then
    raise exception 'No Brevo API key in the Vault (it must be named brevo_api_key)';
  end if;
  if coalesce(s.sender_email, '') = '' then
    raise exception 'Set sender_email in notification_settings first';
  end if;

  select net.http_post(
    url := s.api_url,
    body := jsonb_build_object(
      'sender', jsonb_build_object('name', s.sender_name, 'email', s.sender_email),
      'to', jsonb_build_array(jsonb_build_object('email', p_to, 'name', coalesce(nullif(trim(p_to_name), ''), p_to))),
      'subject', p_subject,
      'htmlContent', p_html
    ),
    headers := jsonb_build_object('api-key', v_key, 'content-type', 'application/json', 'accept', 'application/json'),
    timeout_milliseconds := 10000
  ) into v_id;
  return v_id;
end;
$$;

-- Is everything in place to send? (key saved, sender set)
create or replace function public.email_ready() returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if to_regclass('vault.secrets') is null then
    return false;
  end if;
  return exists (select 1 from vault.secrets where name = 'brevo_api_key')
    and (select sender_email <> '' from public.notification_settings);
end;
$$;

-- Emails handed to Brevo today (Wisconsin time), for the daily limit.
create or replace function public.emails_sent_on(p_day date) returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.notification_log
  where kind in ('owner_digest', 'member_nudge', 'test')
    and status in ('queued', 'sent', 'unknown')
    and (created_at at time zone 'America/Chicago')::date = p_day
$$;

-- ---------------------------------------------------------------------------
-- Owners tick "Contacted"
-- ---------------------------------------------------------------------------

-- Returns when the person was marked contacted (null once unticked).
create or replace function public.set_contacted(p_signup_id uuid, p_contacted boolean)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_opp uuid;
  v_at timestamptz;
begin
  select opportunity_id into v_opp from public.signups where id = p_signup_id;
  if v_opp is null then
    raise exception 'Sign-up not found';
  end if;
  if not (public.is_admin() or public.is_opp_owner(v_opp)) then
    raise exception 'Only the post''s owners or an admin can do this';
  end if;

  update public.signups
  set contacted_at = case when p_contacted then coalesce(contacted_at, now()) end,
      contacted_by = case when p_contacted then coalesce(contacted_by, auth.uid()) end
  where id = p_signup_id
  returning contacted_at into v_at;
  return v_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- The daily run
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
          and sg.status in ('interested', 'committed', 'waitlisted')
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
                   || ' · ' || case w.status when 'committed' then 'Committed' when 'waitlisted' then 'Waitlisted' else 'Interested' end
                   || ' since ' || to_char(w.status_changed_at at time zone 'America/Chicago', 'Mon FMDD')
                   || case when w.is_new then ' <strong>(new)</strong>' else '' end
                   || '</li>',
                 '' order by case w.status when 'committed' then 1 when 'waitlisted' then 2 else 3 end, w.status_changed_at, w.signup_id)
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
        'EMS Opportunities: ' || v_count || case when v_count = 1 then ' person' else ' people' end || ' to reach out to',
        public.email_wrap(
          '<p>Hi ' || public.html_escape(coalesce(nullif(trim(split_part(r.full_name, ',', 1)), ''), 'there')) || ',</p>'
          || '<p>These people raised a hand on your posts and are not marked as contacted yet. A short note from you goes a long way.</p>'
          || v_list
          || '<p>Once you have reached out, tick <strong>Contacted</strong> next to their name on <a href="'
          || public.html_escape(s.site_url) || '/my-posts">My posts</a> so they drop off this list.</p>'
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
      where sg.status in ('interested', 'committed')
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
          || '<p>About ' || v_weeks || ' ago you marked yourself <strong>'
          || case r.status when 'committed' then 'Committed' else 'Interested' end
          || '</strong> for <a href="' || public.html_escape(s.site_url) || '/o/' || r.opp_id || '">'
          || public.html_escape(r.title) || '</a>. If no one has been in touch yet, you are welcome to reach out directly:</p>'
          || '<ul>' || v_list || '</ul>'
          || '<p>Changed your mind? You can update or withdraw on the <a href="' || public.html_escape(s.site_url)
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

-- Copies Brevo's answers onto the log. pg_net keeps answers for about six
-- hours, so this runs shortly after the daily run (and when admins look).
create or replace function public.record_notification_results()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if to_regclass('net._http_response') is not null then
    update public.notification_log l
    set status = case when r.status_code between 200 and 299 then 'sent' else 'failed' end,
        status_code = r.status_code,
        error = case when r.status_code between 200 and 299 then null
                     else left(coalesce(nullif(r.error_msg, ''), r.content, 'No answer'), 500) end
    from net._http_response r
    where r.id = l.request_id and l.status = 'queued';
    get diagnostics v_count = row_count;
  end if;

  update public.notification_log
  set status = 'unknown', error = 'No answer recorded from Brevo'
  where status = 'queued' and created_at < now() - interval '6 hours';

  return v_count;
end;
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
                 where kind in ('owner_digest', 'member_nudge', 'test') and status = 'sent'
                   and created_at > now() - interval '14 days'),
    'failed_14d', (select count(*) from public.notification_log
                   where kind in ('owner_digest', 'member_nudge', 'test') and status in ('failed', 'unknown')
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

-- The on/off switch on the Admin page.
create or replace function public.admin_set_notifications(p_enabled boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this';
  end if;
  if p_enabled and not public.email_ready() then
    raise exception 'Add the Brevo API key and sender first (see the setup guide)';
  end if;
  update public.notification_settings set enabled = p_enabled, updated_at = now() where id;
  insert into public.notification_log (kind, user_id, details, status)
  values ('setting', auth.uid(), jsonb_build_object('enabled', p_enabled), 'done');
end;
$$;

-- Sends the admin a test email (works before emails are turned on).
create or replace function public.admin_send_test_email()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this';
  end if;
  if not public.email_ready() then
    raise exception 'Add the Brevo API key and sender first (see the setup guide)';
  end if;
  if public.emails_sent_on(public.local_today()) >= (select daily_cap from public.notification_settings) then
    raise exception 'Today''s email limit is used up; try again tomorrow';
  end if;
  select * into v_me from public.profiles where id = auth.uid();
  insert into public.notification_log (kind, user_id, request_id)
  values ('test', v_me.id, public.send_email(
    v_me.email,
    v_me.full_name,
    'EMS Opportunities: test email',
    public.email_wrap('<p>If you can read this, automatic emails from EMS Opportunities are working.</p>')
  ));
end;
$$;

-- ---------------------------------------------------------------------------
-- Full backup now includes the email settings and log (the key stays in the
-- Vault and is never exported).
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
    'schema_version', 11,
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
    'notification_settings', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.notification_settings t),
    'notification_log', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.notification_log t),
    'backup_log', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.backup_log t)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

grant update (email_opt_in) on public.profiles to authenticated;

-- Settings: only the database itself (and admins through the functions above).
revoke all on table public.notification_settings from anon, authenticated;
alter table public.notification_settings enable row level security;

-- Log: admins read it; nobody writes it except the functions above.
revoke all on table public.notification_log from anon, authenticated;
alter table public.notification_log enable row level security;
grant select on public.notification_log to authenticated;
drop policy if exists notification_log_select on public.notification_log;
create policy notification_log_select on public.notification_log
  for select to authenticated using (public.is_admin());

revoke execute on function public.html_escape(text) from public, anon, authenticated;
revoke execute on function public.email_wrap(text) from public, anon, authenticated;
revoke execute on function public.send_email(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.email_ready() from public, anon, authenticated;
revoke execute on function public.emails_sent_on(date) from public, anon, authenticated;
revoke execute on function public.set_contacted(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.run_daily_notifications(timestamptz) from public, anon, authenticated;
revoke execute on function public.record_notification_results() from public, anon, authenticated;
revoke execute on function public.admin_notification_status() from public, anon, authenticated;
revoke execute on function public.admin_set_notifications(boolean) from public, anon, authenticated;
revoke execute on function public.admin_send_test_email() from public, anon, authenticated;

grant execute on function public.set_contacted(uuid, boolean) to authenticated;
grant execute on function public.admin_notification_status() to authenticated;
grant execute on function public.admin_set_notifications(boolean) to authenticated;
grant execute on function public.admin_send_test_email() to authenticated;

-- ---------------------------------------------------------------------------
-- Schedule (times are UTC: 13:00 is 8am in summer, 7am in winter, Wisconsin)
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('ems-daily-notifications', '0 13 * * *', 'select public.run_daily_notifications()');
    perform cron.schedule('ems-notification-results', '30 13 * * *', 'select public.record_notification_results()');
  else
    raise notice 'pg_cron is not installed, so the daily email check is not scheduled';
  end if;
end $$;
