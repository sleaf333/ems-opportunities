-- EMS Opportunities Portal: more than one contact per post.
--
-- Run once in the Supabase SQL editor, after 0007. Safe to run twice.
--
-- Each post had room for one contact (contact_name, contact_email). Now it
-- has a list (opportunities.contacts, up to 10 people, each a name and an
-- email). Contacts can be anyone, including people who are not site users;
-- they are separate from owners (owners can edit, contacts are who to ask).
--
-- Existing posts get their current contact as the first entry in the list.
-- The old columns stay: the site keeps the first contact copied there, so
-- anything that still reads them keeps working.

alter table public.opportunities
  add column if not exists contacts jsonb not null default '[]'::jsonb;

alter table public.opportunities
  drop constraint if exists opportunities_contacts_check,
  add constraint opportunities_contacts_check
    check (jsonb_typeof(contacts) = 'array' and jsonb_array_length(contacts) <= 10);

-- Copy each post's single contact into the list. The edit-history trigger is
-- paused so this one-time copy is not recorded as an edit to every post.
alter table public.opportunities disable trigger opportunities_log_change;

update public.opportunities
set contacts = jsonb_build_array(jsonb_build_object('name', contact_name, 'email', contact_email))
where contacts = '[]'::jsonb
  and (coalesce(contact_name, '') <> '' or coalesce(contact_email, '') <> '');

alter table public.opportunities enable trigger opportunities_log_change;

-- Owners and admins edit the list (row-level security still decides who).
grant update (contacts) on public.opportunities to authenticated;
