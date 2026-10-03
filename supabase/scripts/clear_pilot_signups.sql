-- Clear the pilot testers' sign-ups (and their sign-up history) before a
-- wider launch, so test clicks don't show up on posts or in Insights.
--
-- Run in the Supabase SQL editor. Paste the testers' emails between the two
-- $list$ lines, in any format (Outlook is fine; names and repeats are
-- ignored). Download a full backup first: this cannot be undone.
--
-- Removed: every sign-up those people made, and its history.
-- Kept: their accounts, names, positions, interests and goals, all posts
-- (including any they created), and everyone else's sign-ups. If a tester
-- held a spot on a post with limited spots, the waitlist moves up.
--
-- Run it once: a second run finds nothing left to clear.
drop table if exists pg_temp.pilot_clear_result;
create temp table pilot_clear_result (
  emails_found integer, testers_signed_in integer, signups_cleared integer, history_cleared integer
);

do $$
declare
  v_emails text[];
  v_users uuid[];
  v_opps uuid[];
  v_opp uuid;
  v_signups integer;
  v_events integer;
begin
  select array_agg(distinct lower(m[1])) into v_emails
  from regexp_matches($list$
PASTE THE TESTERS' EMAILS HERE
$list$, '([A-Za-z0-9._%+-]+@ems-wi\.com)', 'gi') as m;

  select array_agg(id) into v_users from public.profiles where email = any (coalesce(v_emails, '{}'));

  select array_agg(distinct opportunity_id) into v_opps
  from public.signups where user_id = any (coalesce(v_users, '{}'));

  delete from public.signup_events
  where user_id = any (coalesce(v_users, '{}'))
     or signup_id in (select id from public.signups where user_id = any (coalesce(v_users, '{}')));
  get diagnostics v_events = row_count;

  delete from public.signups where user_id = any (coalesce(v_users, '{}'));
  get diagnostics v_signups = row_count;

  foreach v_opp in array coalesce(v_opps, '{}') loop
    perform public.promote_waitlist(v_opp);
  end loop;

  insert into pilot_clear_result values (
    coalesce(array_length(v_emails, 1), 0), coalesce(array_length(v_users, 1), 0), v_signups, v_events);
end;
$$;

select * from pilot_clear_result;
