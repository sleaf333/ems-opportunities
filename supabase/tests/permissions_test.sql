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
update public.profiles set position = 'partner' where id = auth.uid();
select tests.eq((select position::text from public.profiles where id = auth.uid()), 'partner', 'member can choose shareholder');
select tests.expect_error($$update public.profiles set role = 'admin' where id = auth.uid()$$, 'permission denied%');
update public.profiles set position = 'employed_physician' where id = auth.uid();
reset role;

set request.jwt.claim.sub = :'partner';
set role authenticated;
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
select tests.expect_error(format($$select public.set_opportunity_categories(%L, '{}')$$, :'finance_id'), 'Only the post''s owners or an admin%');
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
-- Who can sign up for what
-- ---------------------------------------------------------------------------

\set staffer 'a0000000-0000-0000-0000-000000000008'
insert into auth.users (id, email) values (:'staffer', 'staffer@ems-wi.com');
update public.profiles set full_name = 'Office Staff', position = 'admin_staff' where id = :'staffer';

insert into public.opportunities (title, region, eligible_positions)
values
  ('Shareholder track retreat', 'fox_valley', '{partnership_track,partner}'),
  ('Front office project', 'watertown', '{admin_staff}');
select id as track_id from public.opportunities where title = 'Shareholder track retreat' \gset
select id as office_id from public.opportunities where title = 'Front office project' \gset
select id as wellness_opp_id from public.opportunities where title = 'Wellness Committee' \gset

select tests.expect_error($$insert into public.opportunities (title, region, eligible_positions) values ('Nobody', 'milwaukee', '{}')$$, '%violates check constraint%');
select tests.eq((select array_to_string(eligible_positions, ',') from public.opportunities where title = 'Wellness Committee'), 'employed_physician,partnership_track,partner,apc,admin_staff', 'everyone committees open to all five');
select tests.eq((select array_to_string(eligible_positions, ',') from public.opportunities where title = 'Finance Committee'), 'partner', 'shareholder committees open to shareholders');

-- Not eligible: view only (no interest, no commitment).
set request.jwt.claim.sub = :'apc';
set role authenticated;
select tests.eq((select count(*)::text from public.opportunities where id = :'finance_id'), '1', 'ineligible can still view');
select tests.expect_error(format($$select public.set_my_signup(%L, 'committed')$$, :'trauma_id'), 'This opportunity is not open to your position%');
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'trauma_id'), 'This opportunity is not open to your position%');
reset role;

set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.eq(public.set_my_signup(:'trauma_id', 'committed')::text, 'committed', 'employed physician joins physician committee');
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'finance_id'), 'This opportunity is not open to your position%');
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'track_id'), 'This opportunity is not open to your position%');
reset role;

set request.jwt.claim.sub = :'poster';
set role authenticated;
select tests.eq(public.set_my_signup(:'trauma_id', 'committed')::text, 'committed', 'shareholder track joins physician committee');
select tests.eq(public.set_my_signup(:'track_id', 'committed')::text, 'committed', 'shareholder track joins track post');
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'finance_id'), 'This opportunity is not open to your position%');
reset role;

set request.jwt.claim.sub = :'partner';
set role authenticated;
select tests.eq(public.set_my_signup(:'finance_id', 'committed')::text, 'committed', 'shareholder joins shareholder committee');
select tests.eq(public.set_my_signup(:'track_id', 'interested')::text, 'interested', 'shareholder joins track post');
select tests.eq(public.set_my_signup(:'trauma_id', 'committed')::text, 'committed', 'shareholder counts as physician');
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'office_id'), 'This opportunity is not open to your position%');
reset role;

set request.jwt.claim.sub = :'staffer';
set role authenticated;
select tests.eq(public.set_my_signup(:'office_id', 'committed')::text, 'committed', 'administrative staff join admin-office post');
select tests.eq(public.set_my_signup(:'wellness_opp_id', 'interested')::text, 'interested', 'administrative staff join everyone committees');
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'trauma_id'), 'This opportunity is not open to your position%');
reset role;

-- APCs-only posts: APCs yes; no physician position, including shareholders.
insert into public.opportunities (title, region, eligible_positions) values ('APC skills lab', 'milwaukee', '{apc}');
select id as apc_only_id from public.opportunities where title = 'APC skills lab' \gset
set request.jwt.claim.sub = :'apc';
set role authenticated;
select tests.eq(public.set_my_signup(:'apc_only_id', 'committed')::text, 'committed', 'APC joins APC-only post');
reset role;
set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'apc_only_id'), 'This opportunity is not open to your position%');
reset role;
set request.jwt.claim.sub = :'partner';
set role authenticated;
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'apc_only_id'), 'This opportunity is not open to your position%');
reset role;

-- Changing position does not trap anyone: they can still withdraw.
update public.profiles set position = 'employed_physician' where id = :'partner';
set request.jwt.claim.sub = :'partner';
set role authenticated;
select tests.eq(public.set_my_signup(:'finance_id', 'withdrawn')::text, 'withdrawn', 'ineligible can still withdraw');
reset role;

-- ---------------------------------------------------------------------------
-- Post owners (co-owners added by admins)
-- ---------------------------------------------------------------------------

\set owner2 'a0000000-0000-0000-0000-000000000009'
insert into auth.users (id, email) values (:'owner2', 'cochair@ems-wi.com');
update public.profiles set full_name = 'Co Chair', position = 'employed_physician' where id = :'owner2';

select tests.eq((select string_agg(user_id::text, ',') from public.opportunity_owners where opportunity_id = :'fair_id'), :'poster', 'creator is the first owner');
select tests.eq((select count(*)::text from public.opportunity_owners where opportunity_id = :'finance_id'), '0', 'seeded posts start with no owner');

-- Only admins can add or remove owners, and nobody writes the table directly.
set request.jwt.claim.sub = :'poster';
set role authenticated;
select tests.expect_error(format($$select public.admin_add_opportunity_owner(%L, 'cochair@ems-wi.com')$$, :'fair_id'), 'Only admins%');
select tests.expect_error(format($$select public.admin_remove_opportunity_owner(%L, %L)$$, :'fair_id', :'poster'), 'Only admins%');
select tests.expect_error(format($$insert into public.opportunity_owners (opportunity_id, user_id) values (%L, %L)$$, :'finance_id', :'poster'), 'permission denied%');
select tests.expect_error(format($$delete from public.opportunity_owners where opportunity_id = %L$$, :'fair_id'), 'permission denied%');
reset role;

set request.jwt.claim.sub = :'owner2';
set role authenticated;
select tests.eq((select count(*)::text from public.signups where opportunity_id = :'fair_id'), '2', 'before: co-chair sees only active names (names on)');
update public.opportunities set show_names = false where id = :'fair_id';
reset role;
select tests.eq((select show_names::text from public.opportunities where id = :'fair_id'), 'true', 'non-owner cannot edit');

set request.jwt.claim.sub = :'admin';
set role authenticated;
select tests.expect_error(format($$select public.admin_add_opportunity_owner(%L, 'nobody@ems-wi.com')$$, :'fair_id'), 'This person has not signed in yet%');
select tests.expect_error($$select public.admin_add_opportunity_owner(gen_random_uuid(), 'cochair@ems-wi.com')$$, 'Opportunity not found%');
select tests.eq(public.admin_add_opportunity_owner(:'fair_id', ' CoChair@EMS-WI.com '), 'added_poster', 'admin adds a member as co-owner');
select tests.eq(public.admin_add_opportunity_owner(:'fair_id', 'cochair@ems-wi.com'), 'already', 'adding twice is harmless');
select tests.eq(public.admin_add_opportunity_owner(:'finance_id', 'boss@ems-wi.com'), 'added', 'admin adds an admin as owner');
reset role;
select tests.eq((select role::text from public.profiles where id = :'owner2'), 'poster', 'new owner became a poster');
select tests.eq((select role::text from public.profiles where id = :'admin'), 'admin', 'admins stay admins');
select tests.eq((select added_by::text from public.opportunity_owners where opportunity_id = :'fair_id' and user_id = :'owner2'), :'admin', 'who added the owner is recorded');

-- A co-owner has the same powers as the creator.
set request.jwt.claim.sub = :'owner2';
set role authenticated;
select tests.eq((select count(*)::text from public.signups where opportunity_id = :'fair_id'), '3', 'co-owner sees everyone, including withdrawals');
update public.opportunities set show_names = false where id = :'fair_id';
select tests.eq((select show_names::text from public.opportunities where id = :'fair_id'), 'false', 'co-owner edits the post');
select public.set_opportunity_categories(:'fair_id', array[:'wellness_id']::uuid[]);
select tests.eq((select public.is_opp_owner(:'fair_id')::text), 'true', 'co-owner is an owner');
update public.opportunities set title = 'Changed' where id = :'finance_id';
reset role;
select tests.eq((select title from public.opportunities where id = :'finance_id'), 'Finance Committee', 'co-owner of one post cannot edit another');

-- Co-owners see a draft they own.
update public.opportunities set status = 'draft' where id = :'fair_id';
set request.jwt.claim.sub = :'owner2';
set role authenticated;
select tests.eq((select count(*)::text from public.opportunities where id = :'fair_id'), '1', 'co-owner sees own draft');
select tests.eq((select committed::text from public.opportunity_counts() where opportunity_id = :'fair_id'), '1', 'co-owner sees counts on own draft');
reset role;
set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.eq((select count(*)::text from public.opportunities where id = :'fair_id'), '0', 'others still cannot see the draft');
reset role;
update public.opportunities set status = 'open' where id = :'fair_id';

-- Removing an owner takes the powers away (their role stays).
set request.jwt.claim.sub = :'admin';
set role authenticated;
select public.admin_remove_opportunity_owner(:'fair_id', :'poster');
reset role;
set request.jwt.claim.sub = :'poster';
set role authenticated;
update public.opportunities set show_names = true where id = :'fair_id';
select tests.expect_error(format($$select public.set_opportunity_categories(%L, '{}')$$, :'fair_id'), 'Only the post''s owners or an admin%');
select tests.eq((select count(*)::text from public.signups where opportunity_id = :'fair_id'), '0', 'removed owner no longer sees names');
reset role;
select tests.eq((select show_names::text from public.opportunities where id = :'fair_id'), 'false', 'removed owner cannot edit');
select tests.eq((select role::text from public.profiles where id = :'poster'), 'poster', 'removed owner keeps their role');

-- A member demoted by an admin keeps ownership but cannot edit until a poster again.
update public.profiles set role = 'member' where id = :'owner2';
set request.jwt.claim.sub = :'owner2';
set role authenticated;
update public.opportunities set show_names = true where id = :'fair_id';
reset role;
select tests.eq((select show_names::text from public.opportunities where id = :'fair_id'), 'false', 'owners must be posters to edit');
update public.profiles set role = 'poster' where id = :'owner2';

-- New posts: the creator becomes owner automatically.
set request.jwt.claim.sub = :'owner2';
set role authenticated;
insert into public.opportunities (title, region) values ('Co-chair event', 'fox_valley');
select tests.eq((select count(*)::text from public.opportunity_owners o join public.opportunities p on p.id = o.opportunity_id where p.title = 'Co-chair event' and o.user_id = auth.uid()), '1', 'new post owned by its creator');
reset role;

set role anon;
select tests.expect_error('select * from public.opportunity_owners', 'permission denied%');
reset role;

-- ---------------------------------------------------------------------------
-- Safety net (0006): edit history, role log, backups, blocked cascades
-- ---------------------------------------------------------------------------

-- Edit history keeps the changed fields and old values; no-op saves add nothing.
set request.jwt.claim.sub = :'admin';
set role authenticated;
update public.opportunities set site = 'Froedtert Main' where id = :'fair_id';
update public.opportunities set site = 'Froedtert Main' where id = :'fair_id';
reset role;
select tests.eq(
  (select count(*)::text from public.opportunity_history where opportunity_id = :'fair_id' and changed_fields = '{site}'),
  '1', 'edit saved to history once; unchanged saves skipped');
select tests.eq(
  (select (old_values ->> 'site') || ' by ' || changed_by from public.opportunity_history where opportunity_id = :'fair_id' and changed_fields = '{site}'),
  'Froedtert by ' || :'admin', 'history keeps the old value and who changed it');

-- Role changes are logged, including roles set in advance by an admin.
select tests.eq((select new_role || ' by ' || changed_by from public.role_changes where user_id = :'future'), 'poster by ' || :'admin', 'preset role logged with the admin who set it');
select tests.eq(
  (select old_role || '>' || new_role || ' by ' || changed_by from public.role_changes where user_id = :'poster' order by id limit 1),
  'member>poster by ' || :'admin', 'role change logged with the admin who made it');
select tests.eq((select count(*)::text from public.role_changes where user_id = :'owner2'), '3', 'owner promotion and later changes logged');

-- Something private to find, then check non-admins cannot find it.
set request.jwt.claim.sub = :'admin';
set role authenticated;
select public.admin_set_member('later@ems-wi.com', 'poster', false);
reset role;

set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.eq((select count(*)::text from public.member_presets), '0', 'member: no presets');
select tests.eq((select count(*)::text from public.member_interests where user_id <> auth.uid()), '0', 'member: no one else''s interests or goals');
select tests.eq((select count(*)::text from public.member_interest_categories where user_id <> auth.uid()), '0', 'member: no one else''s topics');
select tests.eq((select count(*)::text from public.signup_events where user_id <> auth.uid()), '0', 'member: no one else''s history');
select tests.eq((select count(*)::text from public.opportunity_history), '0', 'member: no edit history');
select tests.eq((select count(*)::text from public.role_changes), '0', 'member: no role log');
select tests.eq((select count(*)::text from public.backup_log), '0', 'member: no backup log');
select tests.expect_error('select public.admin_export_all()', 'Only admins can download a full backup%');
select tests.expect_error($$select public.erase_member_permanently('doc@ems-wi.com')$$, 'permission denied%');
select tests.expect_error(format($$select public.erase_opportunity_permanently(%L)$$, :'fair_id'), 'permission denied%');
select tests.expect_error(format($$insert into public.opportunity_history (opportunity_id, changed_fields, old_values) values (%L, '{}', '{}')$$, :'fair_id'), 'permission denied%');
select tests.expect_error($$insert into public.backup_log (downloaded_by) values (auth.uid())$$, 'permission denied%');
reset role;

set request.jwt.claim.sub = :'poster';
set role authenticated;
select tests.eq((select count(*)::text from public.member_presets), '0', 'poster: no presets');
select tests.eq((select count(*)::text from public.member_interests where user_id <> auth.uid()), '0', 'poster: no one else''s interests or goals');
select tests.eq((select count(*)::text from public.signup_events where user_id <> auth.uid()), '0', 'poster: no one else''s history');
select tests.eq((select count(*)::text from public.opportunity_history), '0', 'poster: no edit history');
select tests.eq((select count(*)::text from public.role_changes), '0', 'poster: no role log');
select tests.expect_error('select public.admin_export_all()', 'Only admins can download a full backup%');
reset role;

set role anon;
select tests.expect_error('select * from public.opportunity_history', 'permission denied%');
select tests.expect_error('select public.admin_export_all()', 'permission denied%');
reset role;

-- Full backup: every table, recorded in the log.
set request.jwt.claim.sub = :'admin';
set role authenticated;
select tests.eq(
  (select string_agg(k, ',' order by k) from jsonb_object_keys(public.admin_export_all()) k),
  'backup_log,exported_at,interest_categories,member_interest_categories,member_interests,member_presets,opportunities,opportunity_categories,opportunity_history,opportunity_owners,profiles,role_changes,schema_version,signup_events,signups',
  'backup has every table');
select tests.eq(
  (select jsonb_array_length(public.admin_export_all() -> 'signup_events')::text),
  (select count(*)::text from public.signup_events), 'backup has every history row');
select tests.eq((select count(*)::text from public.backup_log where downloaded_by = auth.uid()), '2', 'each backup download is logged');
reset role;
-- If this fails, a new table was added: put it in admin_export_all.
select tests.eq(
  (select count(*)::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'),
  '13', 'backup covers every table in the database');

-- Deleting people or posts with activity is blocked (as the Supabase dashboard would).
select tests.expect_error(format($$delete from auth.users where id = %L$$, :'doc'), '%violates foreign key constraint%');
select tests.eq((select count(*)::text from public.profiles where id = :'doc'), '1', 'member with history survives Delete user');
select tests.expect_error(format($$delete from public.opportunities where id = %L$$, :'fair_id'), '%violates foreign key constraint%');
select tests.expect_error($$delete from public.signups$$, '%violates foreign key constraint%');
delete from auth.users where id = :'newbie';
select tests.eq((select count(*)::text from public.profiles where id = :'newbie'), '0', 'member with no activity can still be deleted');
delete from public.opportunities where title = 'Co-chair event';
select tests.eq((select count(*)::text from public.opportunities where title = 'Co-chair event'), '0', 'post with no activity can still be deleted');

-- Deliberate erase: everything goes, and the waitlist moves up.
insert into public.opportunities (title, region, capacity) values ('Erase test', 'milwaukee', 1);
select id as erase_id from public.opportunities where title = 'Erase test' \gset
set request.jwt.claim.sub = :'apc';
set role authenticated;
select public.set_my_signup(:'erase_id', 'committed');
reset role;
set request.jwt.claim.sub = :'staffer';
set role authenticated;
select tests.eq(public.set_my_signup(:'erase_id', 'committed')::text, 'waitlisted', 'second in line is waitlisted');
reset role;
select tests.eq(left(public.erase_member_permanently(' APC@ems-wi.com '), 30), 'Erased apc@ems-wi.com and thei', 'erase member reports what it did');
select tests.eq((select count(*)::text from public.profiles where id = :'apc'), '0', 'erased member is gone');
select tests.eq((select count(*)::text from public.signups where user_id = :'apc'), '0', 'erased member''s sign-ups are gone');
select tests.eq((select count(*)::text from public.signup_events where user_id = :'apc'), '0', 'erased member''s history is gone');
select tests.eq((select status::text from public.signups where user_id = :'staffer' and opportunity_id = :'erase_id'), 'committed', 'waitlist moves up after erase');
select tests.expect_error($$select public.erase_member_permanently('nobody@ems-wi.com')$$, 'No member with the email%');

select tests.eq(left(public.erase_opportunity_permanently(:'fair_id'), 8), 'Erased "', 'erase post reports what it did');
select tests.eq((select count(*)::text from public.opportunities where id = :'fair_id'), '0', 'erased post is gone');
select tests.eq((select count(*)::text from public.opportunity_history where opportunity_id = :'fair_id'), '0', 'erased post''s history is gone');
select tests.eq((select count(*)::text from public.signup_events where opportunity_id = :'fair_id'), '0', 'erased post''s sign-up history is gone');

\o
