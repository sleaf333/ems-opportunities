-- Set everyone in a pasted list to Shareholder.
--
-- Run in the Supabase SQL editor. Paste the list between the two $list$ lines,
-- in any format: one per line, separated by commas or semicolons, or copied
-- from Outlook ("Name" <name@ems-wi.com>). Only @ems-wi.com addresses are used;
-- names and repeats are ignored. Safe to run more than once.
--
-- Signed in: their position becomes Shareholder.
-- Not signed in yet: Shareholder is set in advance and applied at first
-- sign-in (an existing advance role such as Poster is kept).
-- Roles (member, poster, admin) are never changed.
with pasted as (
  select $list$
PASTE THE EMAILS HERE
$list$::text as raw
),
emails as (
  select distinct lower(m[1]) as email
  from pasted, regexp_matches(pasted.raw, '([A-Za-z0-9._%+-]+@ems-wi\.com)', 'gi') as m
),
updated as (
  update public.profiles p
  set position = 'partner'
  from emails e
  where p.email = e.email and p.position is distinct from 'partner'
  returning p.email
),
preset as (
  insert into public.member_presets (email, role, is_partner, position)
  select e.email, 'member', true, 'partner'
  from emails e
  where not exists (select 1 from public.profiles p where p.email = e.email)
  on conflict (email) do update
    set is_partner = true, position = 'partner'
    where public.member_presets.position is distinct from 'partner'
  returning email
)
select
  (select count(*) from emails) as emails_found,
  (select count(*) from updated) as signed_in_changed,
  (select count(*) from emails e join public.profiles p on p.email = e.email)
    - (select count(*) from updated) as signed_in_already_shareholder,
  (select count(*) from preset) as set_in_advance,
  (select count(*) from emails e where not exists (select 1 from public.profiles p where p.email = e.email))
    - (select count(*) from preset) as advance_already_shareholder;
