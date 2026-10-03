-- Clear the pilot testers' activity before a wider launch, so test clicks and
-- test posts don't show on the site or in Insights.
--
-- Run in the Supabase SQL editor. Paste the testers' emails between the two
-- $list$ lines, in any format (Outlook is fine; names and repeats are
-- ignored). Check the two settings just below the list. Download a full
-- backup first: this cannot be undone.
--
-- Removed: every sign-up those people made (and its history), and, if the
-- first setting is on, every post they created (with all sign-ups on it).
-- Kept: their accounts, positions, interests and goals; every post they did
-- not create (including posts they co-own); everyone else's sign-ups. If a
-- tester held a spot on a post with limited spots, the waitlist moves up.
--
-- Safe to run twice: a second run finds nothing left to clear.
drop table if exists pg_temp.pilot_clear_result;
create temp table pilot_clear_result (
  emails_found integer, testers_signed_in integer, signups_cleared integer,
  history_cleared integer, posts_erased integer, erased_post_titles text, made_members_again integer
);

do $$
declare
  v_emails text[];
  -- SETTINGS: change true/false here if needed.
  v_erase_their_posts boolean := true;     -- erase posts the testers created
  v_make_members_again boolean := false;   -- turn tester posters back into members (site admins are never changed)
  v_users uuid[];
  v_opps uuid[];
  v_opp uuid;
  v_post record;
  v_titles text[] := '{}';
  v_signups integer := 0;
  v_events integer := 0;
  v_members integer := 0;
begin
  select array_agg(distinct lower(m[1])) into v_emails
  from regexp_matches($list$
PASTE THE TESTERS' EMAILS HERE
$list$, '([A-Za-z0-9._%+-]+@ems-wi\.com)', 'gi') as m;

  select array_agg(id) into v_users from public.profiles where email = any (coalesce(v_emails, '{}'));

  -- Test posts first (this also removes every sign-up on them).
  if v_erase_their_posts then
    for v_post in
      select id, title from public.opportunities where created_by = any (coalesce(v_users, '{}')) order by created_at
    loop
      perform public.erase_opportunity_permanently(v_post.id);
      v_titles := v_titles || v_post.title;
    end loop;
  end if;

  -- Then the testers' sign-ups on everyone else's posts.
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

  if v_make_members_again then
    update public.profiles set role = 'member'
    where id = any (coalesce(v_users, '{}')) and role = 'poster';
    get diagnostics v_members = row_count;
  end if;

  insert into pilot_clear_result values (
    coalesce(array_length(v_emails, 1), 0), coalesce(array_length(v_users, 1), 0), v_signups, v_events,
    coalesce(array_length(v_titles, 1), 0), array_to_string(v_titles, '; '), v_members);
end;
$$;

select * from pilot_clear_result;
