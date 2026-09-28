-- Schema and permission tests on a fresh install (all migrations + seed.sql).
-- Run with: npm run test:db
-- Each block acts as a specific user by setting the JWT user id and
-- switching to the "authenticated" role, the way Supabase does.

\o /dev/null

\set admin 'a0000000-0000-0000-0000-000000000001'
\set poster 'a0000000-0000-0000-0000-000000000002'
\set doc 'a0000000-0000-0000-0000-000000000003'
\set apc 'a0000000-0000-0000-0000-000000000004'
\set partner 'a0000000-0000-0000-0000-000000000005'
\set newbie 'a0000000-0000-0000-0000-000000000006'
\set future 'a0000000-0000-0000-0000-000000000007'

select tests.eq((select count(*)::text from public.opportunities), '15', 'seed committees loaded');
select tests.eq((select count(*)::text from public.interest_categories), '16', 'seed categories loaded');
select tests.eq((select count(*)::text from public.opportunity_categories), '31', 'seed topics linked');

-- ---------------------------------------------------------------------------
-- Account creation (runs as the auth service would)
-- ---------------------------------------------------------------------------

insert into public.member_presets (email, role) values ('boss@ems-wi.com', 'admin');
insert into public.member_presets (email, is_partner) values ('partner@ems-wi.com', true);

insert into auth.users (id, email) values
  (:'admin', 'Boss@EMS-WI.com'),
  (:'poster', 'poster@ems-wi.com'),
  (:'doc', 'doc@ems-wi.com'),
  (:'apc', 'apc@ems-wi.com'),
  (:'partner', 'partner@ems-wi.com'),
  (:'newbie', 'newbie@ems-wi.com');

select tests.expect_error($$insert into auth.users (email) values ('someone@gmail.com')$$, 'Only @ems-wi.com%');
select tests.expect_error($$insert into auth.users (email) values ('x@sub.ems-wi.com')$$, 'Only @ems-wi.com%');
select tests.expect_error($$insert into auth.users (email) values ('x@ems-wi.com.evil.com')$$, 'Only @ems-wi.com%');

select tests.eq((select email from public.profiles where id = :'admin'), 'boss@ems-wi.com', 'email stored lowercase');
select tests.eq((select role::text from public.profiles where id = :'admin'), 'admin', 'admin preset applied');
select tests.eq((select position::text from public.profiles where id = :'partner'), 'partner', 'partner preset applied');
select tests.eq((select coalesce(position::text, '-') from public.profiles where id = :'doc'), '-', 'others pick their own position');
select tests.eq((select count(*)::text from public.member_presets), '0', 'presets removed once applied');

-- ---------------------------------------------------------------------------
-- Signed-out visitors get nothing
-- ---------------------------------------------------------------------------

set role anon;
select tests.expect_error('select * from public.opportunities', 'permission denied%');
select tests.expect_error('select * from public.interest_categories', 'permission denied%');
select tests.expect_error('select * from public.opportunity_counts()', 'permission denied%');
reset role;

-- ---------------------------------------------------------------------------
-- Profiles and positions
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = :'doc';
set role authenticated;
update public.profiles set full_name = 'Dr. Doc', position = 'employed_physician' where id = auth.uid();
select tests.eq((select position::text from public.profiles where id = auth.uid()), 'employed_physician', 'member picks own position');
update public.profiles set position = 'partnership_track' where id = auth.uid();
select tests.eq((select position::text from public.profiles where id = auth.uid()), 'partnership_track', 'member changes own position');
select tests.expect_error($$update public.profiles set position = 'partner' where id = auth.uid()$$, 'Only an admin can set or remove the Partner%');
select tests.expect_error($$update public.profiles set role = 'admin' where id = auth.uid()$$, 'permission denied%');
update public.profiles set position = 'employed_physician' where id = auth.uid();
reset role;

set request.jwt.claim.sub = :'partner';
set role authenticated;
select tests.expect_error($$update public.profiles set position = 'employed_physician' where id = auth.uid()$$, 'Only an admin can set or remove the Partner%');
update public.profiles set full_name = 'Pat Partner' where id = auth.uid();
reset role;

update public.profiles set full_name = 'Boss', position = 'employed_physician' where id = :'admin';
update public.profiles set full_name = 'Poster', position = 'partnership_track' where id = :'poster';
update public.profiles set full_name = 'APC Person', position = 'apc' where id = :'apc';

-- ---------------------------------------------------------------------------
-- Admin member management
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.expect_error($$select public.admin_set_member('poster@ems-wi.com', 'poster', false)$$, 'Only admins%');
select tests.expect_error($$select public.promote_waitlist(gen_random_uuid())$$, 'permission denied%');
reset role;

set request.jwt.claim.sub = :'admin';
set role authenticated;
select tests.eq(public.admin_set_member(' Poster@ems-wi.com ', 'poster', false), 'updated', 'admin promotes existing member');
select tests.eq(public.admin_set_member('future@ems-wi.com', 'poster', true), 'saved', 'admin presets future partner');
select tests.eq(public.admin_set_member('apc@ems-wi.com', 'member', true), 'updated', 'admin makes someone a partner');
select tests.eq((select position::text from public.profiles where id = :'apc'), 'partner', 'partner set by admin');
select tests.eq(public.admin_set_member('apc@ems-wi.com', 'member', false), 'updated', 'admin removes partner');
select tests.eq((select coalesce(position::text, '-') from public.profiles where id = :'apc'), '-', 'removing partner clears position');
select tests.expect_error($$select public.admin_set_member('boss@ems-wi.com', 'member', false)$$, 'You cannot remove the last admin%');
reset role;
update public.profiles set position = 'apc' where id = :'apc';

insert into auth.users (id, email) values (:'future', 'future@ems-wi.com');
select tests.eq((select role::text || ',' || position::text from public.profiles where id = :'future'), 'poster,partner', 'preset applied on first sign-in');

-- ---------------------------------------------------------------------------
-- Interest categories and member interests
-- ---------------------------------------------------------------------------

select id as wellness_id from public.interest_categories where name = 'Wellness' \gset
select id as research_id from public.interest_categories where name = 'Research' \gset

set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.expect_error($$insert into public.interest_categories (name) values ('Sneaky')$$, '%row-level security%');
update public.interest_categories set name = 'Renamed' where name = 'Wellness';
select tests.eq((select count(*)::text from public.interest_categories where name = 'Wellness'), '1', 'members cannot rename categories');
select tests.expect_error(format($$insert into public.member_interest_categories (user_id, category_id) values (auth.uid(), %L)$$, :'wellness_id'), 'permission denied%');
select public.set_my_interests(array[:'wellness_id', :'research_id']::uuid[], 'Simulation', 'Lead wellness');
select tests.eq((select count(*)::text from public.member_interest_categories), '2', 'member saves interests');
select public.set_my_interests(array[:'wellness_id']::uuid[], 'Simulation', 'Lead wellness');
select tests.eq((select count(*)::text from public.member_interest_categories), '1', 'member removes an interest');
reset role;

set request.jwt.claim.sub = :'apc';
set role authenticated;
select tests.eq((select count(*)::text from public.member_interest_categories), '0', 'others cannot see my interests');
select tests.eq((select count(*)::text from public.member_interests where other_interests <> ''), '0', 'others cannot see my free-text interests');
reset role;

set request.jwt.claim.sub = :'admin';
set role authenticated;
select tests.eq((select count(*)::text from public.member_interest_categories), '1', 'admin sees everyone''s interests');
select tests.eq((select other_interests from public.member_interests where user_id = :'doc'), 'Simulation', 'admin sees free-text interests');
insert into public.interest_categories (name) values ('Simulation');
select tests.expect_error($$insert into public.interest_categories (name) values ('simulation')$$, '%duplicate key%');
update public.interest_categories set active = false where name = 'Simulation';
select tests.expect_error($$delete from public.interest_categories where name = 'Simulation'$$, 'permission denied%');
reset role;

select id as sim_id from public.interest_categories where name = 'Simulation' \gset
set request.jwt.claim.sub = :'doc';
set role authenticated;
select public.set_my_interests(array[:'wellness_id', :'sim_id']::uuid[], '', '');
select tests.eq((select count(*)::text from public.member_interest_categories), '1', 'retired categories cannot be picked');
reset role;

-- ---------------------------------------------------------------------------
-- Posting opportunities
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.expect_error($$insert into public.opportunities (title, region) values ('Not allowed', 'milwaukee')$$, '%row-level security%');
reset role;

set request.jwt.claim.sub = :'poster';
set role authenticated;
select tests.expect_error($$insert into public.opportunities (title) values ('No location')$$, '%null value in column "region"%');
insert into public.opportunities (title, type, commitment, capacity, region, site, format, visible_until)
  values ('Career fair booth', 'event', 'one_time', 1, 'milwaukee', 'Froedtert', 'in_person', public.local_today() + 180);
insert into public.opportunities (title, status, region) values ('Secret draft', 'draft', 'watertown');
select tests.expect_error(
  format($$insert into public.opportunities (title, region, created_by) values ('Spoof', 'milwaukee', %L)$$, :'doc'),
  '%row-level security%');
update public.opportunities set title = 'Changed' where title = 'Finance Committee';
select tests.expect_error($$delete from public.opportunities where title = 'Career fair booth'$$, 'permission denied%');
reset role;
select tests.eq((select count(*)::text from public.opportunities where title = 'Finance Committee'), '1', 'poster cannot edit others'' posts');

select id as fair_id from public.opportunities where title = 'Career fair booth' \gset
select id as finance_id from public.opportunities where title = 'Finance Committee' \gset
select id as trauma_id from public.opportunities where title = 'Trauma' \gset
select id as draft_id from public.opportunities where title = 'Secret draft' \gset

-- Topics.
set request.jwt.claim.sub = :'poster';
set role authenticated;
select public.set_opportunity_categories(:'fair_id', array[:'wellness_id', :'sim_id']::uuid[]);
select tests.eq((select count(*)::text from public.opportunity_categories where opportunity_id = :'fair_id'), '1', 'poster sets topics; retired ones skipped');
select tests.expect_error(format($$select public.set_opportunity_categories(%L, '{}')$$, :'finance_id'), 'Only the poster or an admin%');
reset role;

-- Nobody can delete, not even admins.
set request.jwt.claim.sub = :'admin';
set role authenticated;
select tests.expect_error(format($$delete from public.opportunities where id = %L$$, :'fair_id'), 'permission denied%');
update public.opportunities set title = 'Finance Committee' where id = :'finance_id';
reset role;

-- Drafts are hidden from others.
set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.eq((select count(*)::text from public.opportunities where title = 'Secret draft'), '0', 'others cannot see drafts');
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'draft_id'), 'Opportunity not found%');
reset role;

-- ---------------------------------------------------------------------------
-- Sign-ups, spots and the waitlist
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = :'newbie';
set role authenticated;
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'fair_id'), 'Please complete your profile%');
reset role;

set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.expect_error(format($$insert into public.signups (opportunity_id, user_id, status) values (%L, auth.uid(), 'completed')$$, :'fair_id'), 'permission denied%');
select tests.eq(public.set_my_signup(:'fair_id', 'committed')::text, 'committed', 'first commit takes the spot');
reset role;

set request.jwt.claim.sub = :'apc';
set role authenticated;
select tests.eq(public.set_my_signup(:'fair_id', 'committed')::text, 'waitlisted', 'second commit is waitlisted');
reset role;

set request.jwt.claim.sub = :'partner';
set role authenticated;
select tests.eq(public.set_my_signup(:'fair_id', 'interested')::text, 'interested', 'partner shows interest');
reset role;

set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.eq(public.set_my_signup(:'fair_id', 'withdrawn')::text, 'withdrawn', 'doc withdraws');
reset role;
select tests.eq((select status::text from public.signups where user_id = :'apc' and opportunity_id = :'fair_id'), 'committed', 'waitlist promotes first in line');

-- ---------------------------------------------------------------------------
-- Who can see names
-- ---------------------------------------------------------------------------

-- Names hidden by default: members see only their own row, plus counts.
set request.jwt.claim.sub = :'partner';
set role authenticated;
select tests.eq((select count(*)::text from public.signups where opportunity_id = :'fair_id'), '1', 'names hidden: members see only themselves');
select tests.eq(
  (select committed || '/' || interested || '/' || waitlisted from public.opportunity_counts() where opportunity_id = :'fair_id'),
  '1/1/0', 'members still see counts');
reset role;

set request.jwt.claim.sub = :'poster';
set role authenticated;
select tests.eq((select count(*)::text from public.signups where opportunity_id = :'fair_id'), '3', 'poster sees everyone on own post, including withdrawals');
update public.opportunities set show_names = true where id = :'fair_id';
reset role;

set request.jwt.claim.sub = :'admin';
set role authenticated;
select tests.eq((select count(*)::text from public.signups where opportunity_id = :'fair_id'), '3', 'admin sees everyone');
reset role;

-- Poster turned names on: members see names but not withdrawals.
set request.jwt.claim.sub = :'partner';
set role authenticated;
select tests.eq((select count(*)::text from public.signups where opportunity_id = :'fair_id'), '2', 'names shown: members see active sign-ups only');
reset role;

-- History.
set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.eq((select count(distinct user_id)::text from public.signup_events), '1', 'members see only own history');
reset role;

-- ---------------------------------------------------------------------------
-- Posting window, deadlines and closed posts
-- ---------------------------------------------------------------------------

update public.opportunities set visible_until = public.local_today() - 1 where id = :'fair_id';
set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'fair_id'), 'This opportunity is no longer posted%');
reset role;
set request.jwt.claim.sub = :'partner';
set role authenticated;
select tests.eq(public.set_my_signup(:'fair_id', 'withdrawn')::text, 'withdrawn', 'withdraw after it expires');
reset role;
update public.opportunities set visible_until = public.local_today() where id = :'fair_id';
set request.jwt.claim.sub = :'partner';
set role authenticated;
select tests.eq(public.set_my_signup(:'fair_id', 'interested')::text, 'interested', 'last day of the posting window is still open');
reset role;

update public.opportunities set signup_deadline = public.local_today() - 1 where id = :'fair_id';
set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'fair_id'), 'The sign-up deadline has passed%');
reset role;

update public.opportunities set status = 'closed', signup_deadline = null where id = :'fair_id';
set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.expect_error(format($$select public.set_my_signup(%L, 'committed')$$, :'fair_id'), 'This opportunity is not open%');
reset role;

-- ---------------------------------------------------------------------------
-- Who can commit to what
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = :'apc';
set role authenticated;
select tests.expect_error(format($$select public.set_my_signup(%L, 'committed')$$, :'trauma_id'), 'This opportunity is open to physicians only%');
select tests.eq(public.set_my_signup(:'trauma_id', 'interested')::text, 'interested', 'anyone can show interest');
reset role;

set request.jwt.claim.sub = :'poster';
set role authenticated;
select tests.eq(public.set_my_signup(:'trauma_id', 'committed')::text, 'committed', 'partnership track counts as physician');
reset role;

set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.eq(public.set_my_signup(:'trauma_id', 'committed')::text, 'committed', 'employed physician counts as physician');
select tests.expect_error(format($$select public.set_my_signup(%L, 'committed')$$, :'finance_id'), 'This opportunity is open to partners only%');
select tests.eq(public.set_my_signup(:'finance_id', 'interested')::text, 'interested', 'non-partner can show interest');
reset role;

set request.jwt.claim.sub = :'partner';
set role authenticated;
select tests.eq(public.set_my_signup(:'finance_id', 'committed')::text, 'committed', 'partner commits to partners-only');
select tests.eq(public.set_my_signup(:'trauma_id', 'committed')::text, 'committed', 'partner counts as physician');
reset role;

\o
