-- EMS Opportunities Portal: let members choose Shareholder themselves.
--
-- Run once in the Supabase SQL editor, after 0002. (The database calls this
-- position 'partner'; the site shows it as "Shareholder".)
--
-- Before this, only an admin could set or remove the Shareholder position.
-- Admins can still set it for anyone from the Admin page.

drop trigger profiles_guard_partner on public.profiles;
drop function public.guard_partner_position();
