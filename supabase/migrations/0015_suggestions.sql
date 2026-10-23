-- EMS Opportunities Portal: suggest a colleague for a post.
--
-- Run once in the Supabase SQL editor, after 0014. Safe to run twice. If
-- Supabase offers "Run and enable RLS", choose "Run without RLS": this file
-- turns RLS on itself.
--
-- Any signed-in member can suggest a colleague for an open post. The
-- colleague gets one email ("X thought you'd be a good fit") with a link,
-- even if they have never signed in. Every suggestion is kept; the post's
-- leads and site admins can see them. Limits keep it personal: one
-- suggestion per person per post a year, 3 to the same person a month,
-- 10 a day per sender. Admins have their own on/off for these emails.
--
-- Also: the name search (find_people) is open to every signed-in member,
-- like the member directory, and erasing a person also removes suggestions,
-- waiting memberships and waiting ownerships by their email.

-- ---------------------------------------------------------------------------
-- Tables and settings
-- ---------------------------------------------------------------------------

alter table public.notification_settings
  add column if not exists suggestions_enabled boolean not null default true;

alter table public.notification_log drop constraint if exists notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check
  check (kind in ('owner_digest', 'member_nudge', 'test', 'run', 'setting', 'roster_check', 'suggestion'));

create table if not exists public.suggestions (
  id bigint generated always as identity primary key,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  suggested_email text not null check (suggested_email = lower(suggested_email)),
  suggested_by uuid references public.profiles (id) on delete set null,
  note text not null default '' check (char_length(note) <= 300),
  log_id bigint references public.notification_log (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists suggestions_email_idx on public.suggestions (suggested_email, created_at);
create index if not exists suggestions_opportunity_idx on public.suggestions (opportunity_id);
create index if not exists suggestions_by_idx on public.suggestions (suggested_by, created_at);

-- ---------------------------------------------------------------------------
-- Emails counted toward the daily limit now include suggestions
-- ---------------------------------------------------------------------------

create or replace function public.emails_sent_on(p_day date) returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.notification_log
  where kind in ('owner_digest', 'member_nudge', 'test', 'roster_check', 'suggestion')
    and status in ('queued', 'sent', 'unknown')
    and (created_at at time zone 'America/Chicago')::date = p_day
$$;

-- ---------------------------------------------------------------------------
-- Suggest someone
-- ---------------------------------------------------------------------------

-- Returns 'sent', or 'already_in' / 'already_suggested' (no email sent).
create or replace function public.suggest_person(p_opportunity_id uuid, p_email text, p_note text default '')
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  s public.notification_settings;
  v_me public.profiles;
  v_opp public.opportunities;
  v_target public.profiles;
  v_position public.member_position;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_note text := trim(coalesce(p_note, ''));
  v_from text;
  v_desc text;
  v_html text;
  v_request bigint;
  v_log bigint;
begin
  select * into v_me from public.profiles where id = auth.uid();
  if v_me.id is null then
    raise exception 'Please sign in first';
  end if;

  select * into v_opp from public.opportunities where id = p_opportunity_id;
  if v_opp.id is null then
    raise exception 'Opportunity not found';
  end if;
  if v_opp.status <> 'open' or (v_opp.visible_until is not null and v_opp.visible_until < public.local_today()) then
    raise exception 'This post is not open, so suggestions are off';
  end if;

  if v_email not like '_%@' || public.allowed_email_domain() then
    raise exception 'Email must end in @%', public.allowed_email_domain();
  end if;
  if v_email = v_me.email then
    raise exception 'That is your own email. To join, click I''m interested';
  end if;
  if char_length(v_note) > 300 then
    raise exception 'Please keep the note to 300 characters';
  end if;

  select * into v_target from public.profiles where email = v_email;

  -- Already on it, or already raised a hand: nothing to send.
  if (v_target.id is not null and exists (
        select 1 from public.signups
        where opportunity_id = p_opportunity_id and user_id = v_target.id
          and status in ('interested', 'committed', 'completed')))
     or exists (select 1 from public.pending_members where opportunity_id = p_opportunity_id and email = v_email) then
    return 'already_in';
  end if;

  if exists (select 1 from public.suggestions
             where opportunity_id = p_opportunity_id and suggested_email = v_email
               and created_at > now() - interval '365 days') then
    return 'already_suggested';
  end if;

  v_position := coalesce(v_target.position, (select position from public.member_presets where email = v_email));
  if v_position is not null and not (v_position = any (v_opp.eligible_positions)) then
    raise exception 'This post is not open to their position';
  end if;

  if v_target.id is not null and not v_target.email_opt_in then
    raise exception 'They have turned off emails from the site. You could tell them yourself';
  end if;

  if (select count(*) from public.suggestions
      where suggested_by = v_me.id
        and (created_at at time zone 'America/Chicago')::date = public.local_today()) >= 10 then
    raise exception 'You have sent 10 suggestions today, the most for one day. Please try again tomorrow';
  end if;
  if (select count(*) from public.suggestions
      where suggested_email = v_email and created_at > now() - interval '30 days') >= 3 then
    raise exception 'They have had 3 suggestions this month already. You could tell them yourself';
  end if;

  select * into s from public.notification_settings;
  if not s.suggestions_enabled then
    raise exception 'Suggestions are turned off for now';
  end if;
  if not public.email_ready() then
    raise exception 'Emails are not set up yet. Please ask a site admin';
  end if;
  if public.emails_sent_on(public.local_today()) >= s.daily_cap then
    raise exception 'The site has reached today''s email limit. Please try again tomorrow';
  end if;

  v_from := coalesce(nullif(trim(v_me.full_name), ''), v_me.email);
  v_desc := regexp_replace(coalesce(v_opp.description, ''), '\s+', ' ', 'g');
  if char_length(v_desc) > 300 then
    v_desc := rtrim(left(v_desc, 300)) || '...';
  end if;

  v_html := public.email_wrap(
    '<p>Hi' || case when coalesce(trim(v_target.full_name), '') <> '' then ' ' || public.html_escape(trim(v_target.full_name)) else '' end || ',</p>'
    || '<p><strong>' || public.html_escape(v_from) || '</strong> thought you would be a good fit for <strong>'
    || public.html_escape(v_opp.title) || '</strong> and asked the EMS Opportunities site to let you know.</p>'
    || case when v_note <> '' then
         '<p style="border-left: 3px solid #6BAEDB; padding-left: 12px; color: #333;">' || public.html_escape(v_note) || '</p>'
       else '' end
    || '<p style="color: #555;">'
    || initcap(replace(v_opp.type::text, '_', ' '))
    || ' · ' || case v_opp.commitment::text when 'one_time' then 'One-time' when 'short_term' then 'Short-term' else 'Ongoing' end
    || case when coalesce(trim(v_opp.time_estimate), '') <> '' then ' · ' || public.html_escape(v_opp.time_estimate) else '' end
    || '</p>'
    || case when v_desc <> '' then '<p>' || public.html_escape(v_desc) || '</p>' else '' end
    || '<p style="margin: 20px 0;"><a href="' || public.html_escape(s.site_url) || '/o/' || v_opp.id
    || '" style="background: #226DA7; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; display: inline-block;">'
    || 'See it and raise your hand</a></p>'
    || '<p>Sign in with your work email; the site emails you a code. Not for you? No need to reply.</p>'
    || '<p style="font-size: 13px; color: #555;">You got this because a colleague suggested you on EMS Opportunities, '
    || 'where the group posts committees, projects and events.</p>'
  );

  v_request := public.send_email(
    v_email,
    v_target.full_name,
    v_from || ' thought you''d be a good fit: ' || v_opp.title,
    v_html
  );
  insert into public.notification_log (kind, user_id, opportunity_id, request_id, details)
  values ('suggestion', v_target.id, v_opp.id, v_request, jsonb_build_object('to', v_email, 'by', v_me.id))
  returning id into v_log;

  insert into public.suggestions (opportunity_id, suggested_email, suggested_by, note, log_id)
  values (p_opportunity_id, v_email, v_me.id, v_note, v_log);
  return 'sent';
end;
$$;

-- Admins turn suggestion emails on or off (separate from reminder emails).
create or replace function public.admin_set_suggestions(p_on boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this';
  end if;
  update public.notification_settings set suggestions_enabled = p_on, updated_at = now() where id;
  insert into public.notification_log (kind, user_id, details, status)
  values ('setting', auth.uid(), jsonb_build_object('suggestions_enabled', p_on), 'done');
end;
$$;

-- Is "Suggest someone" available right now? (Any signed-in member may ask.)
create or replace function public.suggestions_available()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select suggestions_enabled from public.notification_settings), false) and public.email_ready()
$$;

-- ---------------------------------------------------------------------------
-- Name search: open to every signed-in member (like the member directory)
-- ---------------------------------------------------------------------------

create or replace function public.find_people(p_query text)
returns table (email text, full_name text, signed_in boolean)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := lower(trim(coalesce(p_query, '')));
begin
  if not exists (select 1 from public.profiles me where me.id = auth.uid()) then
    raise exception 'Please sign in first';
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

-- ---------------------------------------------------------------------------
-- Admin status: suggestions switch and counts
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
    'suggestions_enabled', s.suggestions_enabled,
    'ready', public.email_ready(),
    'has_key', v_has_key,
    'sender_email', s.sender_email,
    'scheduled', v_scheduled,
    'daily_cap', s.daily_cap,
    'digest_every_days', s.digest_every_days,
    'nudge_after_days', s.nudge_after_days,
    'sent_today', public.emails_sent_on(public.local_today()),
    'sent_14d', (select count(*) from public.notification_log
                 where kind in ('owner_digest', 'member_nudge', 'test', 'roster_check', 'suggestion') and status = 'sent'
                   and created_at > now() - interval '14 days'),
    'failed_14d', (select count(*) from public.notification_log
                   where kind in ('owner_digest', 'member_nudge', 'test', 'roster_check', 'suggestion') and status in ('failed', 'unknown')
                     and created_at > now() - interval '14 days'),
    'suggestions_14d', (select count(*) from public.suggestions where created_at > now() - interval '14 days'),
    'opted_out', (select count(*) from public.profiles where not email_opt_in),
    'last_run', (select to_jsonb(x) from (
                   select created_at, status, details, error from public.notification_log
                   where kind = 'run' order by id desc limit 1) x),
    'recent', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id desc), '[]'::jsonb) from (
                 select l.id, l.kind, l.status, l.status_code, l.error, l.created_at, l.details,
                        coalesce(nullif(p.full_name, ''), p.email, l.details ->> 'to') as person, o.title
                 from public.notification_log l
                 left join public.profiles p on p.id = l.user_id
                 left join public.opportunities o on o.id = l.opportunity_id
                 where l.kind <> 'run'
                 order by l.id desc limit 20) x)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Erasing a person also removes what is kept under their email
-- ---------------------------------------------------------------------------

create or replace function public.erase_member_permanently(p_email text) returns text
language plpgsql set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid;
  v_opps uuid[];
  v_opp uuid;
  v_signups integer := 0;
  v_other integer := 0;
  v_n integer;
begin
  select id into v_id from public.profiles where email = v_email;

  delete from public.suggestions where suggested_email = v_email or (v_id is not null and suggested_by = v_id);
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  delete from public.pending_members where email = v_email;
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  delete from public.owner_presets where email = v_email;
  get diagnostics v_n = row_count; v_other := v_other + v_n;

  if v_id is null then
    if v_other = 0 then
      raise exception 'No member with the email %', p_email;
    end if;
    return format('%s had not signed in; removed %s waiting or suggestion record(s).', v_email, v_other);
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

  return format('Erased %s and their %s sign-up(s).', v_email, v_signups);
end;
$$;

-- ---------------------------------------------------------------------------
-- Full backup now includes suggestions
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
    'schema_version', 15,
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
    'suggestions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from public.suggestions t),
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

revoke all on table public.suggestions from anon, authenticated;
alter table public.suggestions enable row level security;
grant select on public.suggestions to authenticated;
drop policy if exists suggestions_select on public.suggestions;
create policy suggestions_select on public.suggestions
  for select to authenticated
  using (suggested_by = auth.uid() or public.is_admin() or public.is_opp_owner(opportunity_id));

revoke execute on function public.emails_sent_on(date) from public, anon, authenticated;
revoke execute on function public.suggest_person(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admin_set_suggestions(boolean) from public, anon, authenticated;
revoke execute on function public.suggestions_available() from public, anon, authenticated;
revoke execute on function public.find_people(text) from public, anon, authenticated;
revoke execute on function public.admin_notification_status() from public, anon, authenticated;
revoke execute on function public.erase_member_permanently(text) from public, anon, authenticated;
revoke execute on function public.admin_export_all() from public, anon, authenticated;

grant execute on function public.suggest_person(uuid, text, text) to authenticated;
grant execute on function public.admin_set_suggestions(boolean) to authenticated;
grant execute on function public.suggestions_available() to authenticated;
grant execute on function public.find_people(text) to authenticated;
grant execute on function public.admin_notification_status() to authenticated;
grant execute on function public.admin_export_all() to authenticated;
