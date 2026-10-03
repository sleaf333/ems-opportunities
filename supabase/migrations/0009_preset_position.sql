-- EMS Opportunities Portal: set any position in advance.
--
-- Run once in the Supabase SQL editor, after 0008. Safe to run twice.
--
-- Advance settings (member_presets, for people who have not signed in yet)
-- could only say "this person is a Shareholder". Now they can hold any
-- position (Shareholder, Shareholder track, Employed physician, ...), which is
-- applied the first time the person signs in. Existing Shareholder settings
-- carry over. is_partner stays and is kept in step for compatibility.

alter table public.member_presets
  add column if not exists position public.member_position;

update public.member_presets
set position = 'partner'
where is_partner and position is null;

-- First sign-in: use the preset position (or Shareholder from the older flag).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(new.email);
  v_preset public.member_presets;
begin
  select * into v_preset from public.member_presets where email = v_email;

  insert into public.profiles (id, email, role, position)
  values (
    new.id,
    v_email,
    coalesce(v_preset.role, 'member'),
    coalesce(v_preset.position, case when v_preset.is_partner then 'partner'::public.member_position end)
  );

  insert into public.member_interests (user_id) values (new.id);

  delete from public.member_presets where email = v_email;
  return new;
end;
$$;

-- The Admin page's Shareholder checkbox, for people not signed in yet, now
-- keeps the preset position in step: ticking sets Shareholder; unticking clears
-- Shareholder but keeps any other position (for example Shareholder track).
create or replace function public.admin_set_member(p_email text, p_role public.user_role, p_is_partner boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this';
  end if;

  if v_email not like '_%@' || public.allowed_email_domain() then
    raise exception 'Email must end in @%', public.allowed_email_domain();
  end if;

  select * into v_profile from public.profiles where email = v_email for update;

  if v_profile.id is not null then
    if v_profile.role = 'admin' and p_role <> 'admin'
       and (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'You cannot remove the last admin';
    end if;
    update public.profiles
    set role = p_role,
        -- Removing partner status clears the position so they pick a new one.
        position = case
          when p_is_partner then 'partner'::public.member_position
          when v_profile.position = 'partner' then null
          else v_profile.position
        end
    where id = v_profile.id;
    return 'updated';
  end if;

  insert into public.member_presets (email, role, is_partner, position, created_by)
  values (v_email, p_role, p_is_partner, case when p_is_partner then 'partner'::public.member_position end, auth.uid())
  on conflict (email) do update
    set role = excluded.role,
        is_partner = excluded.is_partner,
        position = case
          when excluded.is_partner then 'partner'::public.member_position
          when public.member_presets.position = 'partner' then null
          else public.member_presets.position
        end;
  return 'saved';
end;
$$;
