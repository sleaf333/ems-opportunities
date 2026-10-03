-- Set everyone in a pasted list to Shareholder track, without ever touching a
-- Shareholder.
--
-- Run in the Supabase SQL editor (after migration 0009). Paste the list
-- between the two $list$ lines, in any format: one per line, separated by
-- commas or semicolons, or copied from Outlook ("Name" <name@ems-wi.com>).
-- Only @ems-wi.com addresses are used; names and repeats are ignored. Safe to
-- run more than once.
--
-- Changed to Shareholder track: people with no position yet, or Employed
-- physician (signed in or set in advance).
-- Left as they are: Shareholders, people already on the track, and anyone who
-- chose APC or Administrative staff (fix those one by one on the Admin page).
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
  set position = 'partnership_track'
  from emails e
  where p.email = e.email and (p.position is null or p.position = 'employed_physician')
  returning p.email
),
preset as (
  insert into public.member_presets (email, role, is_partner, position)
  select e.email, 'member', false, 'partnership_track'
  from emails e
  where not exists (select 1 from public.profiles p where p.email = e.email)
  on conflict (email) do update
    set position = 'partnership_track'
    where (public.member_presets.position is null and not public.member_presets.is_partner)
       or public.member_presets.position = 'employed_physician'
  returning email
)
select
  (select count(*) from emails) as emails_found,
  (select count(*) from updated) as signed_in_changed,
  (select count(*) from emails e join public.profiles p on p.email = e.email)
    - (select count(*) from updated) as signed_in_left_as_is,
  (select count(*) from preset) as set_in_advance,
  (select count(*) from emails e where not exists (select 1 from public.profiles p where p.email = e.email))
    - (select count(*) from preset) as advance_left_as_is;
