-- Fill in APC for everyone in a pasted list who has no position yet. Never
-- changes anyone who already has one.
--
-- Run in the Supabase SQL editor (after migration 0009). Paste the list
-- between the two $list$ lines, in any format: one per line, separated by
-- commas or semicolons, or copied from Outlook ("Name" <name@ems-wi.com>).
-- Only @ems-wi.com addresses are used; names and repeats are ignored. Safe to
-- run more than once.
--
-- Changed to APC: people with no position yet (signed in, or set in advance
-- with only a role, or not listed at all yet).
-- Left as they are: anyone with a position already. The last column counts
-- people on this list who are currently set as a physician (any physician
-- position), in case a merged Outlook group mixed someone in; check those by
-- hand on the Admin page.
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
  set position = 'apc'
  from emails e
  where p.email = e.email and p.position is null
  returning p.email
),
preset as (
  insert into public.member_presets (email, role, is_partner, position)
  select e.email, 'member', false, 'apc'
  from emails e
  where not exists (select 1 from public.profiles p where p.email = e.email)
  on conflict (email) do update
    set position = 'apc'
    where public.member_presets.position is null and not public.member_presets.is_partner
  returning email
)
select
  (select count(*) from emails) as emails_found,
  (select count(*) from updated) as signed_in_changed,
  (select count(*) from emails e join public.profiles p on p.email = e.email)
    - (select count(*) from updated) as signed_in_left_as_is,
  (select count(*) from preset) as set_in_advance,
  (select count(*) from emails e where not exists (select 1 from public.profiles p where p.email = e.email))
    - (select count(*) from preset) as advance_left_as_is,
  (select count(*) from emails e
   where exists (select 1 from public.profiles p where p.email = e.email
                 and p.position in ('employed_physician', 'partnership_track', 'partner'))
      or exists (select 1 from public.member_presets m where m.email = e.email
                 and (m.is_partner or m.position in ('employed_physician', 'partnership_track', 'partner')))
  ) as listed_but_set_as_physician;
