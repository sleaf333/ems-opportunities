-- Set each committee's lead (owner) and contact, create committees that are
-- not on the site yet, and merge Chart Reviews with Missing Charts.
--
-- Run in the Supabase SQL editor, AFTER migration 0013. Run it twice:
--   1. As is (v_apply := false): a PREVIEW. Nothing changes. Check each row:
--      the email next to each last name, and the committee it goes to.
--   2. Find "v_apply boolean := false" (under SETTING, after the list) and
--      change it to true, then run again to make the changes.
-- Download a full backup first (Admin page).
--
-- Leads are matched by last name to the emails already loaded on the site
-- (people who signed in, and the position lists you set in advance). If a
-- name finds no email or more than one, the row is marked !! and nothing is
-- changed: replace that last name with the person's full email in the list
-- below and run again.
--
-- What it does for each committee in the list:
--   - finds the post (or creates it, for the four new committees);
--   - makes the listed leads its owners. Leads who have not signed in yet
--     become owners automatically at their first sign-in. Anyone else who
--     owned the post stops being an owner (site admins can still edit it);
--   - makes the leads the post's contacts (replacing "EMS Admin").
-- Peer Support is not in the list, so it keeps EMS Admin as its contact.
-- Chart Reviews and Missing Charts become one post, "Chart Review and
-- Missing Charts"; the Missing Charts post is archived (not deleted).
--
-- Safe to run again: a second run changes nothing that is already right.

drop table if exists pg_temp.committee_leads;
create temp table committee_leads (
  ord integer, committee text, patterns text[], new_title text,
  new_eligible public.member_position[], new_topics text[], leads text[]
);

-- THE LIST. Leads: last names, or full emails (name@ems-wi.com) to be exact.
-- Patterns find the existing post by title (lower case, % = anything).
insert into committee_leads values
  (1,  'Outreach',               array['outreach%'],                                   'Outreach Committee',            '{employed_physician,partnership_track,partner,apc,admin_staff}', array['Community'],          array['levay']),
  (2,  'Physician Mentorship',   array['physician mentorship%', '%mentorship%'],       null, null, null,                                                                                      array['skizycki']),
  (3,  'Chart Review / Missing Charts', array['chart review%'],                        null, null, null,                                                                                      array['kraus']),
  (4,  'Trauma',                 array['trauma', 'trauma committee%'],                 null, null, null,                                                                                      array['beer']),
  (5,  'Prehospital',            array['ems prehospital%', '%prehospital%', '%pre-hospital%', '%pre hospital%'], null, null, null,                                                           array['staszko', 'haugen']),
  (6,  'Ultrasound',             array['ultrasound%'],                                 null, null, null,                                                                                      array['dwyer']),
  (7,  'Education',              array['education committee', 'education'],            null, null, null,                                                                                      array['fine']),
  (8,  'MedEx',                  array['medex%'],                                      null, null, null,                                                                                      array['fine']),
  (9,  'Wellness',               array['wellness%'],                                   null, null, null,                                                                                      array['lawson']),
  (10, 'Research & Academics',   array['research%'],                                   null, null, null,                                                                                      array['tejido']),
  (11, 'Peer Review (PRC)',      array['peer review%'],                                'Peer Review Committee (PRC)',   '{employed_physician,partnership_track,partner}',                 array['Quality'],            array['suriano', 'eiche']),
  (12, 'Disaster',               array['disaster%'],                                   null, null, null,                                                                                      array['lau']),
  (13, 'Resident Education',     array['resident education%'],                         'Resident Education',            '{employed_physician,partnership_track,partner}',                 array['Education'],          array['makowski']),
  (14, 'Patient Satisfaction',   array['patient satisfaction%'],                       'Patient Satisfaction',          '{employed_physician,partnership_track,partner,apc,admin_staff}', array['Quality'],            array['jentsch']),
  (15, 'Physician Interview',    array['physician interview%', 'physician and apc interview%', '%interview%'], null, null, null,                                                             array['peterson']),
  (16, 'Physician Performance (PPC)', array['%physician performance%'],                null, null, null,                                                                                      array['peterson']);

drop table if exists pg_temp.leads_report;
create temp table leads_report (n serial, committee text, post text, lead text, email text, result text);
drop table if exists pg_temp.leads_plan;
create temp table leads_plan (ord integer, opp uuid, emails text[]);

do $$
declare
  -- SETTING: false = preview only (changes nothing). true = make the changes.
  v_apply boolean := false;

  v_domain text := '@' || public.allowed_email_domain();
  v_problems integer := 0;
  c record;
  p record;
  v_lead text;
  v_pattern text;
  v_matches uuid[];
  v_opp uuid;
  v_title text;
  v_emails text[];
  v_found text[];
  v_email text;
  v_name text;
  v_note text;
  v_keep uuid;
  v_merge uuid;
  v_contacts jsonb;
begin
  -- Pass 1: work everything out and report. No changes yet.

  -- Chart Reviews + Missing Charts become one post.
  select id into v_keep from public.opportunities
  where lower(title) like 'chart review%' and status <> 'archived' order by created_at limit 1;
  select id into v_merge from public.opportunities
  where lower(title) like 'missing chart%' and status <> 'archived' order by created_at limit 1;
  if v_keep is not null and v_merge is not null then
    insert into leads_report (committee, post, result) values
      ('Chart Review / Missing Charts',
       (select title from public.opportunities where id = v_merge),
       'will be merged into "Chart Review and Missing Charts" and archived (not deleted)'
       || coalesce(' (' || nullif((select count(*) from public.signups where opportunity_id = v_merge
            and status in ('interested', 'committed'))::text, '0') || ' current sign-ups there: ask those people to raise a hand on the merged post)', ''));
  end if;

  for c in select * from committee_leads order by ord loop
    -- Find the post: the first pattern that matches exactly one post.
    v_opp := null;
    v_note := null;
    foreach v_pattern in array c.patterns loop
      select array_agg(id) into v_matches from public.opportunities
      where lower(title) like v_pattern and status <> 'archived';
      if coalesce(array_length(v_matches, 1), 0) = 1 then
        v_opp := v_matches[1];
        exit;
      elsif coalesce(array_length(v_matches, 1), 0) > 1 then
        v_note := (select string_agg('"' || title || '"', ', ') from public.opportunities where id = any (v_matches));
      end if;
    end loop;

    if v_opp is not null then
      select title into v_title from public.opportunities where id = v_opp;
    elsif c.new_title is not null then
      v_title := c.new_title || ' (new)';
    else
      v_problems := v_problems + 1;
      insert into leads_report (committee, post, result)
      values (c.committee, '!!', coalesce('more than one post matches: ' || v_note, 'no post found on the site')
                                   || '. Tell Claude the exact title.');
      continue;
    end if;

    -- Match each lead to one email.
    v_emails := '{}';
    foreach v_lead in array c.leads loop
      v_lead := lower(trim(v_lead));
      v_email := null;
      v_note := null;
      if v_lead like '%@%' then
        if v_lead like '_%' || v_domain then
          v_email := v_lead;
        else
          v_note := 'must be an ' || v_domain || ' email';
        end if;
      else
        -- Exact last-name part first (jane.levay), then any ending (jlevay).
        select array_agg(email order by email) into v_found from (
          select email from public.profiles union select email from public.member_presets
        ) k
        where email like '%' || v_domain
          and split_part(email, '@', 1) ~* ('(^|[._-])' || v_lead || '$');
        if v_found is null then
          select array_agg(email order by email) into v_found from (
            select email from public.profiles union select email from public.member_presets
          ) k
          where email like '%' || v_domain and split_part(email, '@', 1) ~* (v_lead || '$');
        end if;
        if coalesce(array_length(v_found, 1), 0) = 1 then
          v_email := v_found[1];
        elsif v_found is null then
          v_note := 'no email found (check the spelling, or put their full email in the list)';
        else
          v_note := 'more than one match: ' || array_to_string(v_found, ', ') || ' (put the right full email in the list)';
        end if;
      end if;

      if v_email is null then
        v_problems := v_problems + 1;
        insert into leads_report (committee, post, lead, email, result)
        values (c.committee, v_title, v_lead, '!!', v_note);
      else
        v_emails := v_emails || v_email;
        select nullif(trim(full_name), '') into v_name from public.profiles where email = v_email;
        insert into leads_report (committee, post, lead, email, result)
        values (c.committee, v_title, v_lead, v_email,
                case when v_name is not null then 'owner and contact (' || v_name || ', signed in)'
                     else 'contact now; owner at their first sign-in' end);
      end if;
    end loop;

    insert into leads_plan values (c.ord, v_opp, v_emails);
  end loop;

  insert into leads_report (committee, result) values ('',
    case
      when v_problems > 0 then 'NOTHING CHANGED: fix the ' || v_problems || ' row(s) marked !! in the list, then run again.'
      when v_apply then 'DONE: changes made.'
      else 'PREVIEW ONLY: nothing changed. If every row looks right, set v_apply := true and run again.'
    end);

  if not v_apply or v_problems > 0 then
    return;
  end if;

  -- Pass 2: make the changes.
  if v_keep is not null and v_merge is not null then
    update public.opportunities k
    set title = 'Chart Review and Missing Charts',
        description = case when position(m.description in k.description) > 0 then k.description
                           else trim(both E'\n' from k.description || E'\n' || m.description) end
    from public.opportunities m
    where k.id = v_keep and m.id = v_merge;
    insert into public.opportunity_categories (opportunity_id, category_id)
    select v_keep, category_id from public.opportunity_categories where opportunity_id = v_merge
    on conflict do nothing;
    update public.opportunities set status = 'archived' where id = v_merge;
  end if;

  for p in select l.*, c2.new_title, c2.new_eligible, c2.new_topics
           from leads_plan l join committee_leads c2 on c2.ord = l.ord order by l.ord loop
    v_opp := p.opp;
    if v_opp is null then
      insert into public.opportunities (title, type, commitment, eligible_positions, region, description)
      values (p.new_title, 'committee', 'ongoing', p.new_eligible, 'group_wide',
              'Details coming soon from the committee lead.')
      returning id into v_opp;
      insert into public.opportunity_categories (opportunity_id, category_id)
      select v_opp, id from public.interest_categories where name = any (coalesce(p.new_topics, '{}'))
      on conflict do nothing;
    end if;

    -- Owners: exactly the listed leads.
    delete from public.opportunity_owners ow
    using public.profiles pr
    where ow.opportunity_id = v_opp and pr.id = ow.user_id and not (pr.email = any (p.emails));
    delete from public.owner_presets
    where opportunity_id = v_opp and not (email = any (p.emails));
    insert into public.opportunity_owners (opportunity_id, user_id)
    select v_opp, pr.id from public.profiles pr where pr.email = any (p.emails)
    on conflict do nothing;
    insert into public.owner_presets (email, opportunity_id)
    select e, v_opp from unnest(p.emails) e
    where not exists (select 1 from public.profiles pr where pr.email = e)
    on conflict do nothing;

    -- Contacts: the leads, in list order (names for those who signed in).
    select jsonb_agg(jsonb_build_object('name', coalesce(nullif(trim(pr.full_name), ''), ''), 'email', t.e) order by t.i)
    into v_contacts
    from unnest(p.emails) with ordinality as t (e, i)
    left join public.profiles pr on pr.email = t.e;
    update public.opportunities
    set contacts = v_contacts,
        contact_name = coalesce(v_contacts -> 0 ->> 'name', ''),
        contact_email = coalesce(v_contacts -> 0 ->> 'email', '')
    where id = v_opp and contacts is distinct from v_contacts;
  end loop;
end;
$$;

select committee, post, lead, email, result from leads_report order by n;
