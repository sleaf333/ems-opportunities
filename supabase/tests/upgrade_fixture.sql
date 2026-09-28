-- Data shaped like a live project that ran 0001_init.sql and the original
-- seed, before 0002. Loaded by run-local.sh, then 0002 is applied on top.

\o /dev/null
\ir fixtures/seed_0001.sql

insert into public.member_presets (email, role, is_shareholder) values
  ('boss@ems-wi.com', 'admin', false),
  ('holder@ems-wi.com', 'member', true),
  ('pending@ems-wi.com', 'poster', true);

insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-000000000001', 'boss@ems-wi.com'),
  ('b0000000-0000-0000-0000-000000000002', 'doc@ems-wi.com'),
  ('b0000000-0000-0000-0000-000000000003', 'apc@ems-wi.com'),
  ('b0000000-0000-0000-0000-000000000004', 'staffer@ems-wi.com'),
  ('b0000000-0000-0000-0000-000000000005', 'holder@ems-wi.com');

update public.profiles set full_name = 'Boss', position = 'physician' where email = 'boss@ems-wi.com';
update public.profiles set full_name = 'Doc', position = 'physician' where email = 'doc@ems-wi.com';
update public.profiles set full_name = 'APC', position = 'apc' where email = 'apc@ems-wi.com';
update public.profiles set full_name = 'Staffer', position = 'staff' where email = 'staffer@ems-wi.com';
update public.profiles set full_name = 'Holder', position = 'physician' where email = 'holder@ems-wi.com';

update public.member_interests
set interests = '{wellness,Simulation,peer support}', leadership_goals = 'Lead wellness'
where user_id = 'b0000000-0000-0000-0000-000000000002';

insert into public.signups (opportunity_id, user_id, status)
select id, 'b0000000-0000-0000-0000-000000000005', 'committed'
from public.opportunities where title = 'Finance Committee';
\o
