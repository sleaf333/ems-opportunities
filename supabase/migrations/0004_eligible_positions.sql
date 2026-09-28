-- EMS Opportunities Portal: choose exactly which positions can sign up.
--
-- Run once in the Supabase SQL editor, after 0003.
--
-- Replaces the three fixed groups (everyone / physicians / shareholders) with
-- a per-post list of eligible positions. Everyone can still SEE every post;
-- only eligible positions can mark Interested or Commit.
--
-- Existing posts are converted:
--   everyone     -> all five positions (including administrative staff)
--   physicians   -> employed physician, shareholder track, shareholder
--   shareholders -> shareholder
-- (The database calls shareholders 'partner' and shareholder track
-- 'partnership_track'; the site shows the company's titles.)

alter table public.opportunities
  add column eligible_positions public.member_position[] not null
    default '{employed_physician,partnership_track,partner,apc,admin_staff}'
    check (cardinality(eligible_positions) > 0);

update public.opportunities
set eligible_positions = case audience
  when 'all' then '{employed_physician,partnership_track,partner,apc,admin_staff}'::public.member_position[]
  when 'physicians' then '{employed_physician,partnership_track,partner}'::public.member_position[]
  when 'partners' then '{partner}'::public.member_position[]
end;

alter table public.opportunities drop column audience;
drop type public.opp_audience;

grant update (eligible_positions) on public.opportunities to authenticated;

-- Sign-ups: only eligible positions may mark Interested or Commit. Anyone
-- may still withdraw (for example after changing position).
create or replace function public.set_my_signup(p_opportunity_id uuid, p_status public.signup_status)
returns public.signup_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_opp public.opportunities;
  v_current public.signup_status;
  v_new public.signup_status;
  v_committed integer;
begin
  if v_uid is null then
    raise exception 'Please sign in first';
  end if;

  if p_status not in ('interested', 'committed', 'withdrawn') then
    raise exception 'That choice is not allowed';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is null or v_profile.position is null or trim(v_profile.full_name) = '' then
    raise exception 'Please complete your profile first';
  end if;

  -- Lock the opportunity so two people cannot take the last spot at once.
  select * into v_opp from public.opportunities where id = p_opportunity_id for update;
  if v_opp.id is null or (v_opp.status = 'draft' and v_opp.created_by is distinct from v_uid) then
    raise exception 'Opportunity not found';
  end if;

  select status into v_current
  from public.signups
  where opportunity_id = p_opportunity_id and user_id = v_uid;

  if v_current in ('completed', 'no_show') then
    raise exception 'Attendance has already been recorded for this opportunity';
  end if;

  if p_status = 'withdrawn' then
    if v_current is null or v_current = 'withdrawn' then
      return v_current;
    end if;
    update public.signups set status = 'withdrawn'
    where opportunity_id = p_opportunity_id and user_id = v_uid;
    if v_current = 'committed' then
      perform public.promote_waitlist(p_opportunity_id);
    end if;
    return 'withdrawn';
  end if;

  if not (v_profile.position = any (v_opp.eligible_positions)) then
    raise exception 'This opportunity is not open to your position. You can still view it.';
  end if;
  if v_opp.status <> 'open' then
    raise exception 'This opportunity is not open for sign-ups';
  end if;
  if v_opp.visible_until is not null and v_opp.visible_until < public.local_today() then
    raise exception 'This opportunity is no longer posted';
  end if;
  if v_opp.signup_deadline is not null and v_opp.signup_deadline < public.local_today() then
    raise exception 'The sign-up deadline has passed';
  end if;

  if p_status = 'interested' then
    if v_current = 'interested' then
      return v_current;
    end if;
    insert into public.signups (opportunity_id, user_id, status)
    values (p_opportunity_id, v_uid, 'interested')
    on conflict (opportunity_id, user_id) do update set status = excluded.status;
    if v_current = 'committed' then
      perform public.promote_waitlist(p_opportunity_id);
    end if;
    return 'interested';
  end if;

  -- p_status = 'committed'
  if v_current in ('committed', 'waitlisted') then
    return v_current;
  end if;

  v_new := 'committed';
  if v_opp.capacity is not null then
    select count(*) into v_committed
    from public.signups
    where opportunity_id = p_opportunity_id and status = 'committed';
    if v_committed >= v_opp.capacity then
      v_new := 'waitlisted';
    end if;
  end if;

  insert into public.signups (opportunity_id, user_id, status)
  values (p_opportunity_id, v_uid, v_new)
  on conflict (opportunity_id, user_id) do update set status = excluded.status;

  return v_new;
end;
$$;

-- create or replace keeps existing grants, but lock functions down again in
-- case this runs where defaults differ.
revoke execute on function public.set_my_signup(uuid, public.signup_status) from public, anon;
grant execute on function public.set_my_signup(uuid, public.signup_status) to authenticated;
