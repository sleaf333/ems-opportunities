-- Schema and permission tests. Run with: npm run test:db
-- Each block acts as a specific user by setting the JWT user id and
-- switching to the "authenticated" role, the way Supabase does.

\o /dev/null

\set admin 'a0000000-0000-0000-0000-000000000001'
\set poster 'a0000000-0000-0000-0000-000000000002'
\set doc 'a0000000-0000-0000-0000-000000000003'
\set apc 'a0000000-0000-0000-0000-000000000004'
\set holder 'a0000000-0000-0000-0000-000000000005'
\set newbie 'a0000000-0000-0000-0000-000000000006'
\set future 'a0000000-0000-0000-0000-000000000007'

-- ---------------------------------------------------------------------------
-- Account creation (runs as the auth service would)
-- ---------------------------------------------------------------------------

-- The first admin is set up by a preset before they sign in.
insert into public.member_presets (email, role) values ('boss@ems-wi.com', 'admin');
insert into public.member_presets (email, is_shareholder) values ('holder@ems-wi.com', true);

insert into auth.users (id, email) values
  (:'admin', 'Boss@EMS-WI.com'),
  (:'poster', 'poster@ems-wi.com'),
  (:'doc', 'doc@ems-wi.com'),
  (:'apc', 'apc@ems-wi.com'),
  (:'holder', 'holder@ems-wi.com'),
  (:'newbie', 'newbie@ems-wi.com');

select tests.expect_error($$insert into auth.users (email) values ('someone@gmail.com')$$, 'Only @ems-wi.com%');
select tests.expect_error($$insert into auth.users (email) values ('x@sub.ems-wi.com')$$, 'Only @ems-wi.com%');
select tests.expect_error($$insert into auth.users (email) values ('x@ems-wi.com.evil.com')$$, 'Only @ems-wi.com%');
select tests.expect_error($$insert into auth.users (email) values (null)$$, 'Only @ems-wi.com%');

select tests.eq((select email from public.profiles where id = :'admin'), 'boss@ems-wi.com', 'email stored lowercase');
select tests.eq((select role::text from public.profiles where id = :'admin'), 'admin', 'admin preset applied');
select tests.eq((select is_shareholder::text from public.profiles where id = :'holder'), 'true', 'shareholder preset applied');
select tests.eq((select role::text from public.profiles where id = :'doc'), 'member', 'default role is member');
select tests.eq((select count(*)::text from public.member_presets), '0', 'presets removed once applied');
select tests.eq((select count(*)::text from public.member_interests), '6', 'interests row created per user');

-- Starting content.
\ir ../seed.sql
select tests.eq((select count(*)::text from public.opportunities), '15', 'seed committees loaded');

-- ---------------------------------------------------------------------------
-- Signed-out visitors get nothing
-- ---------------------------------------------------------------------------

set role anon;
select tests.expect_error('select * from public.opportunities', 'permission denied%');
select tests.expect_error('select * from public.profiles', 'permission denied%');
select tests.expect_error($$select public.set_my_signup(gen_random_uuid(), 'interested')$$, 'permission denied%');
reset role;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = :'doc';
set role authenticated;
update public.profiles set full_name = 'Dr. Doc', position = 'physician' where id = auth.uid();
select tests.eq((select full_name from public.profiles where id = auth.uid()), 'Dr. Doc', 'member edits own name');
select tests.expect_error($$update public.profiles set role = 'admin' where id = auth.uid()$$, 'permission denied%');
select tests.expect_error($$update public.profiles set is_shareholder = true where id = auth.uid()$$, 'permission denied%');
update public.profiles set full_name = 'Hacked' where id = :'apc';
reset role;
select tests.eq((select full_name from public.profiles where id = :'apc'), '', 'cannot edit someone else''s profile');

-- Complete the other test profiles.
update public.profiles set full_name = 'Boss', position = 'physician' where id = :'admin';
update public.profiles set full_name = 'Poster', position = 'physician' where id = :'poster';
update public.profiles set full_name = 'APC Person', position = 'apc' where id = :'apc';
update public.profiles set full_name = 'Holder', position = 'physician' where id = :'holder';

-- Private interests: only the member and admins.
set request.jwt.claim.sub = :'doc';
set role authenticated;
update public.member_interests set interests = '{wellness}', leadership_goals = 'Lead wellness' where user_id = auth.uid();
reset role;
set request.jwt.claim.sub = :'apc';
set role authenticated;
select tests.eq((select count(*)::text from public.member_interests), '1', 'member sees only own interests');
reset role;
set request.jwt.claim.sub = :'admin';
set role authenticated;
select tests.eq((select count(*)::text from public.member_interests), '6', 'admin sees all interests');
select tests.eq((select leadership_goals from public.member_interests where user_id = :'doc'), 'Lead wellness', 'admin reads goals');
reset role;

-- ---------------------------------------------------------------------------
-- Admin member management
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.expect_error($$select public.admin_set_member('poster@ems-wi.com', 'poster', false)$$, 'Only admins%');
select tests.expect_error($$select public.promote_waitlist(gen_random_uuid())$$, 'permission denied%');
select tests.eq((select count(*)::text from public.member_presets), '0', 'member cannot see presets');
reset role;

set request.jwt.claim.sub = :'admin';
set role authenticated;
select tests.eq(public.admin_set_member(' Poster@ems-wi.com ', 'poster', false), 'updated', 'admin promotes existing member');
select tests.eq(public.admin_set_member('future@ems-wi.com', 'poster', true), 'saved', 'admin presets future member');
select tests.expect_error($$select public.admin_set_member('someone@gmail.com', 'poster', false)$$, 'Email must end in @ems-wi.com%');
select tests.expect_error($$select public.admin_set_member('boss@ems-wi.com', 'member', false)$$, 'You cannot remove the last admin%');
select tests.eq((select count(*)::text from public.member_presets), '1', 'admin sees presets');
reset role;

select tests.eq((select role::text from public.profiles where id = :'poster'), 'poster', 'poster role set');
insert into auth.users (id, email) values (:'future', 'future@ems-wi.com');
select tests.eq((select role::text || ',' || is_shareholder::text from public.profiles where id = :'future'), 'poster,true', 'preset applied on first sign-in');

-- ---------------------------------------------------------------------------
-- Posting opportunities
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.expect_error($$insert into public.opportunities (title) values ('Not allowed')$$, '%row-level security%');
select tests.eq((select count(*)::text from public.opportunities), '15', 'member sees all open opportunities');
reset role;

set request.jwt.claim.sub = :'poster';
set role authenticated;
insert into public.opportunities (title, type, commitment, capacity)
  values ('Career fair booth', 'event', 'one_time', 1);
insert into public.opportunities (title, status) values ('Secret draft', 'draft');
select tests.expect_error(
  format($$insert into public.opportunities (title, created_by) values ('Spoof', %L)$$, :'doc'),
  '%row-level security%');
select tests.expect_error($$update public.opportunities set created_by = null where title = 'Career fair booth'$$, 'permission denied%');
-- Poster cannot edit someone else's (seeded) post or delete anything.
update public.opportunities set title = 'Changed' where title = 'Finance Committee';
delete from public.opportunities where title = 'Career fair booth';
reset role;
select tests.eq((select count(*)::text from public.opportunities where title = 'Finance Committee'), '1', 'poster cannot edit others'' posts');
select tests.eq((select count(*)::text from public.opportunities where title = 'Career fair booth'), '1', 'poster cannot delete');
select tests.eq((select created_by::text from public.opportunities where title = 'Career fair booth'), :'poster', 'created_by defaults to poster');

-- Drafts are hidden from others.
set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.eq((select count(*)::text from public.opportunities where title = 'Secret draft'), '0', 'others cannot see drafts');
reset role;
select id as draft_id from public.opportunities where title = 'Secret draft' \gset
set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'draft_id'), 'Opportunity not found%');
reset role;

-- ---------------------------------------------------------------------------
-- Sign-ups, spots and the waitlist
-- ---------------------------------------------------------------------------

select id as fair_id from public.opportunities where title = 'Career fair booth' \gset

select tests.eq((select count(*)::text from public.signups), '0', 'no sign-ups yet');

-- Incomplete profile.
set request.jwt.claim.sub = :'newbie';
set role authenticated;
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'fair_id'), 'Please complete your profile%');
reset role;

-- Direct writes are blocked; everything goes through set_my_signup.
set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.expect_error(format($$insert into public.signups (opportunity_id, user_id, status) values (%L, auth.uid(), 'completed')$$, :'fair_id'), 'permission denied%');
select tests.expect_error(format($$select public.set_my_signup(%L, 'completed')$$, :'fair_id'), 'That choice is not allowed%');
select tests.eq(public.set_my_signup(:'fair_id', 'committed')::text, 'committed', 'first commit takes the spot');
select tests.eq(public.set_my_signup(:'fair_id', 'committed')::text, 'committed', 'committing twice is harmless');
reset role;

set request.jwt.claim.sub = :'apc';
set role authenticated;
select tests.eq(public.set_my_signup(:'fair_id', 'committed')::text, 'waitlisted', 'second commit is waitlisted');
reset role;

set request.jwt.claim.sub = :'holder';
set role authenticated;
select tests.eq(public.set_my_signup(:'fair_id', 'committed')::text, 'waitlisted', 'third commit is waitlisted');
reset role;

-- Doc steps back to "interested": first person on the waitlist moves up.
set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.eq(public.set_my_signup(:'fair_id', 'interested')::text, 'interested', 'doc steps back to interested');
reset role;
select tests.eq((select status::text from public.signups where user_id = :'apc' and opportunity_id = :'fair_id'), 'committed', 'waitlist promotes first in line');
select tests.eq((select status::text from public.signups where user_id = :'holder' and opportunity_id = :'fair_id'), 'waitlisted', 'second in line still waiting');

-- Poster adds a spot: next in line moves up.
set request.jwt.claim.sub = :'poster';
set role authenticated;
update public.opportunities set capacity = 2 where id = :'fair_id';
reset role;
select tests.eq((select status::text from public.signups where user_id = :'holder' and opportunity_id = :'fair_id'), 'committed', 'added spot promotes waitlist');

-- APC withdraws. Withdrawals are hidden from other members.
set request.jwt.claim.sub = :'apc';
set role authenticated;
select tests.eq(public.set_my_signup(:'fair_id', 'withdrawn')::text, 'withdrawn', 'withdraw');
select tests.eq((select count(*)::text from public.signups where user_id = auth.uid()), '1', 'you see your own withdrawal');
reset role;
set request.jwt.claim.sub = :'holder';
set role authenticated;
select tests.eq((select count(*)::text from public.signups where opportunity_id = :'fair_id'), '2', 'others do not see withdrawals');
reset role;
set request.jwt.claim.sub = :'poster';
set role authenticated;
select tests.eq((select count(*)::text from public.signups where opportunity_id = :'fair_id'), '3', 'poster sees withdrawals on own post');
reset role;

-- History log.
select tests.eq(
  (select string_agg(coalesce(from_status::text, '-') || '>' || to_status::text, ' ' order by id)
   from public.signup_events where user_id = :'apc'),
  '->waitlisted waitlisted>committed committed>withdrawn',
  'history records every change');
set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.eq((select count(distinct user_id)::text from public.signup_events), '1', 'members see only own history');
reset role;
set request.jwt.claim.sub = :'admin';
set role authenticated;
select tests.eq((select count(distinct user_id)::text from public.signup_events), '3', 'admins see all history');
reset role;

-- Deadlines: closed after the deadline, but withdrawing still works.
update public.opportunities set signup_deadline = public.local_today() - 1 where id = :'fair_id';
set request.jwt.claim.sub = :'apc';
set role authenticated;
select tests.expect_error(format($$select public.set_my_signup(%L, 'interested')$$, :'fair_id'), 'The sign-up deadline has passed%');
reset role;
set request.jwt.claim.sub = :'holder';
set role authenticated;
select tests.eq(public.set_my_signup(:'fair_id', 'withdrawn')::text, 'withdrawn', 'withdraw after deadline');
reset role;
update public.opportunities set signup_deadline = public.local_today() where id = :'fair_id';
set request.jwt.claim.sub = :'holder';
set role authenticated;
select tests.eq(public.set_my_signup(:'fair_id', 'interested')::text, 'interested', 'deadline day itself is still open');
reset role;

-- Closed opportunities.
update public.opportunities set status = 'closed' where id = :'fair_id';
set request.jwt.claim.sub = :'apc';
set role authenticated;
select tests.expect_error(format($$select public.set_my_signup(%L, 'committed')$$, :'fair_id'), 'This opportunity is not open%');
reset role;

-- ---------------------------------------------------------------------------
-- Who can join what
-- ---------------------------------------------------------------------------

select id as trauma_id from public.opportunities where title = 'Trauma' \gset
select id as finance_id from public.opportunities where title = 'Finance Committee' \gset

set request.jwt.claim.sub = :'apc';
set role authenticated;
select tests.expect_error(format($$select public.set_my_signup(%L, 'committed')$$, :'trauma_id'), 'This opportunity is open to physicians only%');
select tests.eq(public.set_my_signup(:'trauma_id', 'interested')::text, 'interested', 'anyone can show interest');
reset role;

set request.jwt.claim.sub = :'doc';
set role authenticated;
select tests.eq(public.set_my_signup(:'trauma_id', 'committed')::text, 'committed', 'physician commits to physician committee');
select tests.expect_error(format($$select public.set_my_signup(%L, 'committed')$$, :'finance_id'), 'This opportunity is open to shareholders only%');
select tests.eq(public.set_my_signup(:'finance_id', 'interested')::text, 'interested', 'non-shareholder can show interest');
reset role;

set request.jwt.claim.sub = :'holder';
set role authenticated;
select tests.eq(public.set_my_signup(:'finance_id', 'committed')::text, 'committed', 'shareholder commits');
reset role;

-- ---------------------------------------------------------------------------
-- Admin powers and demoted posters
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = :'admin';
set role authenticated;
update public.opportunities set title = 'Finance Committee (updated)' where id = :'finance_id';
select tests.eq(public.admin_set_member('poster@ems-wi.com', 'member', false), 'updated', 'admin demotes poster');
reset role;
select tests.eq((select title from public.opportunities where id = :'finance_id'), 'Finance Committee (updated)', 'admin edits any post');

set request.jwt.claim.sub = :'poster';
set role authenticated;
update public.opportunities set title = 'Still mine?' where id = :'fair_id';
reset role;
select tests.eq((select title from public.opportunities where id = :'fair_id'), 'Career fair booth', 'demoted poster cannot edit');

set request.jwt.claim.sub = :'admin';
set role authenticated;
delete from public.opportunities where id = :'fair_id';
reset role;
select tests.eq((select count(*)::text from public.opportunities where id = :'fair_id'), '0', 'admin deletes');

\o
