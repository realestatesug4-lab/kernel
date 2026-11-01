-- =============================================================================
-- KernelMiners · 0016 password visible to admins
--
-- Supabase Auth only ever stores a bcrypt hash, so an admin can never read a
-- member's password back out of `auth.users`. Operations asked for the
-- coffeeug behaviour: the plain login password is captured once at sign-up —
-- while it still exists in the request — and kept in sync whenever the member
-- signs in or changes it. The operations console then shows it on the member
-- drill-down, which makes lockouts and support disputes resolvable by hand.
--
-- The password is stored on `km_profile.login_password` (service-role reads
-- only — RLS never exposes the column to anon/authenticated clients) and is
-- stripped out of `raw_user_meta_data` during provisioning so it does not leak
-- through the JWT claims.
--
-- Run order: … → 0015 → 0016.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Column
-- -----------------------------------------------------------------------------
alter table public.km_profile add column if not exists login_password text;

-- -----------------------------------------------------------------------------
-- Provisioning: capture the password from sign-up metadata, then wipe it
-- -----------------------------------------------------------------------------
create or replace function public.km_bootstrap_impl(p_user uuid, p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row      public.km_profile;
  v_ref      public.km_profile;
  v_meta     text;
  v_pin      text;
  v_email    text;
  v_username text;
  v_phone    text;
  v_name     text;
  v_password text;
  v_code     text;
  v_bonus    bigint;
begin
  select * into v_row from public.km_profile where id = p_user;
  if found then
    return public.km_ok(jsonb_build_object(
      'user_id', v_row.id,
      'referral_code', v_row.referral_code,
      'username', v_row.username,
      'phone', v_row.phone
    ));
  end if;

  select u.email,
         u.raw_user_meta_data ->> 'referral_code',
         u.raw_user_meta_data ->> 'pin',
         u.raw_user_meta_data ->> 'username',
         u.raw_user_meta_data ->> 'phone',
         u.raw_user_meta_data ->> 'password',
         coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
    into v_email, v_meta, v_pin, v_username, v_phone, v_password, v_name
    from auth.users u
   where u.id = p_user;

  if v_email is null and v_phone is null then
    return public.km_err('USER_NOT_FOUND', 'Account not found.');
  end if;

  v_username := public.km_normalize_username(
    coalesce(nullif(v_username, ''), split_part(coalesce(v_email, ''), '@', 1))
  );
  if not public.km_username_ok(v_username) then
    return public.km_err('INVALID_USERNAME', 'Usernames are 3-20 characters: a-z, 0-9 or _.');
  end if;
  if exists (select 1 from public.km_profile where username = v_username) then
    return public.km_err('USERNAME_TAKEN', 'That username is already in use.');
  end if;

  v_phone := public.km_normalize_phone(v_phone);
  if v_phone is not null
     and exists (select 1 from public.km_profile where phone = v_phone) then
    return public.km_err('PHONE_TAKEN', 'That phone number is already registered.');
  end if;

  -- Resolve the inviter: explicit code wins, then the metadata captured at sign-up.
  select * into v_ref
    from public.km_profile
   where upper(referral_code) = upper(trim(coalesce(nullif(p_code, ''), nullif(v_meta, ''), '~none~')))
   limit 1;

  loop
    v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists (select 1 from public.km_profile where referral_code = v_code);
  end loop;

  insert into public.km_profile (
    id, email, display_name, username, phone,
    referral_code, referrer_id, referrer_l2_id, pin_hash, login_password
  ) values (
    p_user,
    coalesce(nullif(v_email, ''), public.km_login_email(v_username)),
    nullif(trim(both from coalesce(v_name, '')), ''),
    v_username,
    v_phone,
    v_code,
    v_ref.id,
    v_ref.referrer_id,
    case when v_pin ~ '^[0-9]{4}$' then crypt(v_pin, gen_salt('bf')) else null end,
    nullif(v_password, '')
  )
  returning * into v_row;

  -- The password only ever rode in the metadata to reach this insert. Drop it
  -- so it is not echoed back through the JWT / auth.users surface.
  if v_password is not null then
    update auth.users
       set raw_user_meta_data = raw_user_meta_data - 'password'
     where id = p_user;
  end if;

  insert into public.km_balance (user_id) values (p_user)
  on conflict (user_id) do nothing;

  v_bonus := public.km_grant_welcome_bonus(p_user);

  return public.km_ok(jsonb_build_object(
    'user_id', v_row.id,
    'referral_code', v_row.referral_code,
    'username', v_row.username,
    'phone', v_row.phone,
    'welcome_bonus', v_bonus
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- Member-side sync: after signInWithPassword / updateUser succeeds the client
-- files the password it just proved knowledge of, so the console copy never
-- drifts from the auth hash. Accounts predating 0016 fill in on first sign-in.
-- -----------------------------------------------------------------------------
create or replace function public.km_sync_login_password(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;
  if coalesce(p_password, '') = '' then
    return public.km_err('INVALID_PASSWORD', 'Nothing to sync.');
  end if;

  update public.km_profile
     set login_password = p_password
   where id = v_user;

  return public.km_ok(jsonb_build_object('synced', true));
end;
$$;

-- -----------------------------------------------------------------------------
-- Console read: the member drill-down now carries login_password. The function
-- is service-role only (0010), so the value never leaves the admin API route.
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_member_detail(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_profile  jsonb;
  v_balance  jsonb;
  v_stats    jsonb;
begin
  select jsonb_build_object(
           'id', p.id,
           'username', p.username,
           'display_name', p.display_name,
           'phone', p.phone,
           'email', p.email,
           'referral_code', p.referral_code,
           'locale', p.locale,
           'is_super_admin', p.is_super_admin,
           'has_pin', (p.pin_hash is not null),
           'login_password', p.login_password,
           'created_at', p.created_at,
           'welcome_bonus_at', p.welcome_bonus_at,
           'referrer_id', p.referrer_id,
           'referrer', (
             select jsonb_build_object('id', r.id, 'username', r.username, 'display_name', r.display_name)
               from public.km_profile r where r.id = p.referrer_id
           )
         )
    into v_profile
    from public.km_profile p
   where p.id = p_user_id;

  if v_profile is null then
    return jsonb_build_object('found', false);
  end if;

  select jsonb_build_object(
           'available', coalesce(b.available, 0),
           'invested', coalesce(b.invested, 0),
           'earned_total', coalesce(b.earned_total, 0),
           'pending_withdrawal', coalesce(b.pending_withdrawal, 0),
           'updated_at', b.updated_at
         )
    into v_balance
    from public.km_balance b
   where b.user_id = p_user_id;

  v_balance := coalesce(v_balance, jsonb_build_object(
    'available', 0, 'invested', 0, 'earned_total', 0, 'pending_withdrawal', 0, 'updated_at', null
  ));

  select jsonb_build_object(
           'packs',            (select count(*) from public.km_investment where user_id = p_user_id),
           'active_packs',     (select count(*) from public.km_investment where user_id = p_user_id and status = 'active'),
           'invested_total',   (select coalesce(sum(amount), 0) from public.km_investment where user_id = p_user_id),
           'earned_packs',     (select coalesce(sum(earned), 0) from public.km_investment where user_id = p_user_id),
           'deposits_total',   (select coalesce(sum(amount), 0) from public.km_deposit where user_id = p_user_id and status = 'confirmed'),
           'withdrawals_total',(select coalesce(sum(net), 0) from public.km_withdrawal where user_id = p_user_id and status = 'paid'),
           'commission_l1',    (select coalesce(sum(amount), 0) from public.km_ledger where user_id = p_user_id and kind = 'commission_l1'),
           'commission_l2',    (select coalesce(sum(amount), 0) from public.km_ledger where user_id = p_user_id and kind = 'commission_l2'),
           'task_rewards',     (select coalesce(sum(reward), 0) from public.km_claim where user_id = p_user_id),
           'invite_l1',        (select count(*) from public.km_profile where referrer_id = p_user_id),
           'invite_l2',        (select count(*) from public.km_profile where referrer_l2_id = p_user_id),
           'ledger_entries',   (select count(*) from public.km_ledger where user_id = p_user_id),
           'last_activity',    (select max(created_at) from public.km_ledger where user_id = p_user_id)
         )
    into v_stats;

  return jsonb_build_object(
    'found', true,
    'profile', v_profile,
    'balance', v_balance,
    'stats', v_stats,
    'investments', (
      select coalesce(jsonb_agg(to_jsonb(i) order by i.started_at desc), '[]'::jsonb)
        from (select * from public.km_investment
               where user_id = p_user_id
               order by started_at desc
               limit 50) i
    ),
    'ledger', (
      select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb)
        from (select * from public.km_ledger
               where user_id = p_user_id
               order by created_at desc
               limit 60) l
    ),
    'deposits', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc), '[]'::jsonb)
        from (select * from public.km_deposit
               where user_id = p_user_id
               order by created_at desc
               limit 25) d
    ),
    'withdrawals', (
      select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at desc), '[]'::jsonb)
        from (select * from public.km_withdrawal
               where user_id = p_user_id
               order by created_at desc
               limit 25) w
    ),
    'team', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', m.id,
               'username', m.username,
               'display_name', m.display_name,
               'level', case when m.referrer_id = p_user_id then 1 else 2 end,
               'joined_at', m.created_at,
               'invested', (select coalesce(sum(i.amount), 0) from public.km_investment i where i.user_id = m.id)
             ) order by m.created_at desc), '[]'::jsonb)
        from public.km_profile m
       where m.referrer_id = p_user_id or m.referrer_l2_id = p_user_id
    ),
    'claims', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id,
               'invite_required', s.invite_required,
               'reward', c.reward,
               'created_at', c.created_at
             ) order by c.created_at desc), '[]'::jsonb)
        from public.km_claim c
        join public.km_milestone s on s.id = c.milestone_id
       where c.user_id = p_user_id
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.km_sync_login_password(text) from public, anon;
grant execute on function public.km_sync_login_password(text) to authenticated;

commit;
