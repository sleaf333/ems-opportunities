-- Checks that 0002 carried over data from a 0001-era project correctly.

\o /dev/null

select tests.eq((select coalesce(position::text, '-') from public.profiles where email = 'doc@ems-wi.com'), '-', 'physicians re-pick their new position');
select tests.eq((select position::text from public.profiles where email = 'apc@ems-wi.com'), 'apc', 'APC kept');
select tests.eq((select position::text from public.profiles where email = 'staffer@ems-wi.com'), 'admin_staff', 'staff became administrative staff');
select tests.eq((select position::text from public.profiles where email = 'holder@ems-wi.com'), 'partner', 'shareholder became partner');
select tests.eq((select role::text from public.profiles where email = 'boss@ems-wi.com'), 'admin', 'admin kept');
select tests.eq((select is_partner::text from public.member_presets where email = 'pending@ems-wi.com'), 'true', 'pending shareholder preset became partner preset');
select tests.eq((select count(*)::text from information_schema.columns where table_name = 'profiles' and column_name = 'is_shareholder'), '0', 'shareholder column removed');

select tests.eq((select array_to_string(eligible_positions, ',') from public.opportunities where title = 'Finance Committee'), 'partner', 'shareholders-only became shareholder position only');
select tests.eq((select array_to_string(eligible_positions, ',') from public.opportunities where title = 'Trauma'), 'employed_physician,partnership_track,partner', 'physicians-only became the three physician positions');
select tests.eq((select array_to_string(eligible_positions, ',') from public.opportunities where title = 'Wellness Committee'), 'employed_physician,partnership_track,partner,apc,admin_staff', 'everyone became all five positions');
select tests.eq((select count(*)::text from information_schema.columns where table_name = 'opportunities' and column_name = 'audience'), '0', 'old audience column removed');
select tests.eq((select count(*)::text from public.opportunities), '15', 'all opportunities kept');
select tests.eq((select count(*)::text from public.opportunities where region = 'group_wide' and visible_until is null and not show_names), '15', 'existing posts: group-wide, indefinite, names hidden');

select tests.eq((select count(*)::text from public.interest_categories), '16', 'one category per distinct topic');
select tests.eq((select string_agg(name, ',' order by name) from public.interest_categories where name like 'P%'), 'Peer Support,Prehospital', 'category names are capitalized');
select tests.eq((select count(*)::text from public.opportunity_categories), '31', 'every topic linked to its opportunity');
select tests.eq(
  (select string_agg(c.name, ',' order by c.name)
   from public.member_interest_categories m join public.interest_categories c on c.id = m.category_id
   where m.user_id = 'b0000000-0000-0000-0000-000000000002'),
  'Peer Support,Wellness', 'member interests matched to categories');
select tests.eq((select other_interests from public.member_interests where user_id = 'b0000000-0000-0000-0000-000000000002'), 'Simulation', 'unmatched interests kept as free text');
select tests.eq((select leadership_goals from public.member_interests where user_id = 'b0000000-0000-0000-0000-000000000002'), 'Lead wellness', 'goals kept');

select tests.eq((select count(*)::text from public.signups where status = 'committed'), '1', 'sign-ups kept');
select tests.eq((select count(*)::text from public.signup_events), '1', 'history kept');

select tests.eq(
  (select string_agg(p.title, ',') from public.opportunity_owners o join public.opportunities p on p.id = o.opportunity_id
   where o.user_id = 'b0000000-0000-0000-0000-000000000001'),
  'Trauma', 'existing posts: creator became owner');
select tests.eq((select count(*)::text from public.opportunity_owners), '1', 'posts without a creator have no owner');

select tests.eq(
  (select string_agg(conname || '=' || confdeltype::text, ',' order by conname) from pg_constraint
   where conname in ('signups_user_id_fkey', 'signups_opportunity_id_fkey', 'signup_events_user_id_fkey',
                     'signup_events_opportunity_id_fkey', 'signup_events_signup_id_fkey', 'member_interest_categories_user_id_fkey')),
  'member_interest_categories_user_id_fkey=r,signup_events_opportunity_id_fkey=r,signup_events_signup_id_fkey=r,signup_events_user_id_fkey=r,signups_opportunity_id_fkey=r,signups_user_id_fkey=r',
  'existing data: deletes with history now blocked');
select tests.expect_error($$delete from auth.users where email = 'holder@ems-wi.com'$$, '%violates foreign key constraint%');

\o
