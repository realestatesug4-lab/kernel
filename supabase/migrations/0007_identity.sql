-- =============================================================================
-- KernelMiners · 0007 identity
--
-- Sign-up and sign-in stop using email:
--
--   registration : full name + username + phone (+ password, 4-digit PIN)
--   sign-in      : username + password
--
-- Supabase Auth still stores an email-shaped identity, so every account carries
-- a private login address: `<username>@users.kernelminers.app`. Members never
-- type or see it; `km_login_handle()` resolves the username they do type to the
-- address the client hands to `signInWithPassword`. Accounts created before the
-- switch keep their real address and are resolved by their username instead.
--
-- Run order: 0001 → 0002 → 0003 → 0004 → 0005 → 0006 → 0007.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Handles: normalisation, validation, masking
-- -----------------------------------------------------------------------------

-- Private address domain. Changing it invalidates nothing: km_login_handle()
-- always returns the address actually stored on the profile.
create or replace function public.km_login_domain()
returns text
language sql
immutable
as $$ select 'users.kernelminers.app'::text $$;

create or replace function public.km_login_email(p_username text)
returns text
language sql
immutable
as $$ select lower(trim(both from coalesce(p_username, ''))) || '@' || public.km_login_domain() $$;

-- Usernames are lowercase, 3-20 characters of a-z, 0-9 and underscore.
create or replace function public.km_normalize_username(p_input text)
returns text
language sql
immutable
as $$
  select nullif(lower(regexp_replace(trim(both from coalesce(p_input, '')), '\s+', '_', 'g')), '');
$$;

create or replace function public.km_username_ok(p_input text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_input ~ '^[a-z0-9_]{3,20}$', false);
$$;

-- Ugandan mobile numbers collapse to the 256XXXXXXXXX form SHASHURA already uses.
create or replace function public.km_normalize_phone(p_input text)
returns text
language sql
immutable
as $$
  select case
    when d ~ '^256[0-9]{9}$' then d
    when d ~ '^0[0-9]{9}$'   then '256' || substr(d, 2)
    when d ~ '^[37][0-9]{8}$' then '256' || d
    else null
  end
  from (select regexp_replace(coalesce(p_input, ''), '[^0-9]', '', 'g') as d) s;
$$;

-- Member-facing label for team lists: "jo*****".
create or replace function public.km_mask_handle(p_username text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_username, '') = '' then 'KernelMiner'
    when length(p_username) <= 2 then p_username || '***'
    else left(p_username, 2) || repeat('*', greatest(1, length(p_username) - 2))
  end;
$$;

-- -----------------------------------------------------------------------------
-- Profile identity columns
-- -----------------------------------------------------------------------------
alter table public.km_profile add column if not exists username text;
alter table public.km_profile add column if not exists phone    text;

-- Backfill existing accounts from the legacy address so nobody is locked out.
with candidate as (
  select p.id,
         public.km_normalize_username(split_part(coalesce(nullif(p.email, ''), ''), '@', 1)) as base
    from public.km_profile p
   where p.username is null
),
cleaned as (
  select c.id,
         case
           when public.km_username_ok(c.base) then c.base
           else 'miner_' || left(replace(c.id::text, '-', ''), 6)
         end as base
    from candidate c
),
numbered as (
  select c.id,
         c.base,
         row_number() over (partition by c.base order by c.id) as rn
    from cleaned c
)
update public.km_profile p
   set username = case
                    when n.rn = 1 then n.base
                    else left(n.base, 13) || '_' || lpad(n.rn::text, 3, '0')
                  end
  from numbered n
 where p.id = n.id
   and p.username is null;

-- The phone number doubles as the mobile-money destination, so it has to match
-- what the gateway accepts. Legacy rows keep NULL until the member sets one.
update public.km_profile
   set phone = public.km_normalize_phone(phone)
 where phone is not null
   and phone is distinct from public.km_normalize_phone(phone);

alter table public.km_profile alter column username set not null;

alter table public.km_profile drop constraint if exists km_profile_username_format;
alter table public.km_profile add constraint km_profile_username_format
  check (username ~ '^[a-z0-9_]{3,20}$');

alter table public.km_profile drop constraint if exists km_profile_phone_format;
alter table public.km_profile add constraint km_profile_phone_format
  check (phone is null or phone ~ '^256[0-9]{9}$');

create unique index if not exists km_profile_username_key on public.km_profile (username);
create unique index if not exists km_profile_phone_key    on public.km_profile (phone) where phone is not null;

-- -----------------------------------------------------------------------------
-- Sign-up helpers (anon callable: the register form checks before submitting)
-- -----------------------------------------------------------------------------
create or replace function public.km_handle_available(
  p_username text default null,
  p_phone    text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_username text := public.km_normalize_username(p_username);
  v_phone    text := public.km_normalize_phone(p_phone);
begin
  return jsonb_build_object(
    'username_valid', v_username is null or public.km_username_ok(v_username),
    'username_free',  v_username is not null
                        and not exists (select 1 from public.km_profile where username = v_username),
    'phone_valid',    p_phone is null or v_phone is not null,
    'phone_free',     v_phone is not null
                        and not exists (select 1 from public.km_profile where phone = v_phone)
  );
end;
$$;

-- Username (or the registered number) → the address signInWithPassword() needs.
create or replace function public.km_login_handle(p_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_raw      text := trim(both from coalesce(p_handle, ''));
  v_username text := public.km_normalize_username(p_handle);
  v_phone    text := public.km_normalize_phone(p_handle);
  v_row      public.km_profile;
begin
  if v_raw = '' then
    return public.km_err('INVALID_HANDLE', 'Enter your username.');
  end if;

  -- A full address keeps working for members who still sign in the old way.
  if position('@' in v_raw) > 1 then
    select * into v_row
      from public.km_profile
     where lower(email) = lower(v_raw)
     limit 1;
  end if;

  if v_row.id is null then
    select * into v_row
      from public.km_profile p
     where (v_username is not null and p.username = v_username)
        or (v_phone    is not null and p.phone    = v_phone)
     limit 1;
  end if;

  if v_row.id is null then
    return public.km_err('ACCOUNT_NOT_FOUND', 'No account matches that username or number.');
  end if;

  return public.km_ok(jsonb_build_object(
    'email', coalesce(nullif(v_row.email, ''), public.km_login_email(v_row.username)),
    'username', v_row.username
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- Account provisioning now builds the username/phone identity
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
         coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
    into v_email, v_meta, v_pin, v_username, v_phone, v_name
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
    referral_code, referrer_id, referrer_l2_id, pin_hash
  ) values (
    p_user,
    coalesce(nullif(v_email, ''), public.km_login_email(v_username)),
    nullif(trim(both from coalesce(v_name, '')), ''),
    v_username,
    v_phone,
    v_code,
    v_ref.id,
    v_ref.referrer_id,
    case when v_pin ~ '^[0-9]{4}$' then crypt(v_pin, gen_salt('bf')) else null end
  )
  returning * into v_row;

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

-- The trigger must abort the auth insert when the handle cannot be provisioned,
-- otherwise Supabase reports success for an account that can never sign in.
create or replace function public.km_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.km_bootstrap_impl(new.id, new.raw_user_meta_data ->> 'referral_code');

  if not coalesce((v_result ->> 'ok')::boolean, false) then
    raise exception 'KernelMiners: %', coalesce(v_result ->> 'message', 'Could not create the profile.')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists km_auth_user_created on auth.users;
create trigger km_auth_user_created
  after insert on auth.users
  for each row execute function public.km_on_auth_user_created();

create or replace function public.km_bootstrap_account(p_referral_code text default null)
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
  return public.km_bootstrap_impl(v_user, p_referral_code);
end;
$$;

-- Fill in contact details the member skipped at sign-up (or that predate 0007).
create or replace function public.km_set_contact(
  p_username text default null,
  p_phone    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_username text := public.km_normalize_username(nullif(trim(both from coalesce(p_username, '')), ''));
  v_phone    text;
  v_phone_in text := nullif(trim(both from coalesce(p_phone, '')), '');
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;

  if v_phone_in is not null then
    v_phone := public.km_normalize_phone(v_phone_in);
    if v_phone is null then
      return public.km_err('INVALID_PHONE', 'Enter a Ugandan mobile-money number.');
    end if;
  end if;

  if v_username is not null then
    if not public.km_username_ok(v_username) then
      return public.km_err('INVALID_USERNAME', 'Usernames are 3-20 characters: a-z, 0-9 or _.');
    end if;
    if exists (select 1 from public.km_profile where username = v_username and id <> v_user) then
      return public.km_err('USERNAME_TAKEN', 'That username is already in use.');
    end if;
  end if;

  if v_phone is not null
     and exists (select 1 from public.km_profile where phone = v_phone and id <> v_user) then
    return public.km_err('PHONE_TAKEN', 'That phone number is already registered.');
  end if;

  update public.km_profile
     set username = coalesce(v_username, username),
         phone    = coalesce(v_phone, phone)
   where id = v_user;

  return public.km_ok(jsonb_build_object('username', v_username, 'phone', v_phone));
end;
$$;

-- -----------------------------------------------------------------------------
-- Reads that show the identity
-- -----------------------------------------------------------------------------
create or replace function public.km_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user        uuid := auth.uid();
  v_account     jsonb;
  v_balance     jsonb;
  v_stats       jsonb;
  v_investments jsonb;
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;

  perform public.km_bootstrap_impl(v_user, null);
  perform public.km_accrue_impl(v_user);

  select jsonb_build_object(
           'id', p.id,
           'email', p.email,
           'display_name', p.display_name,
           'username', p.username,
           'phone', p.phone,
           'referral_code', p.referral_code,
           'referrer_id', p.referrer_id,
           'referrer_l2_id', p.referrer_l2_id,
           'has_pin', (p.pin_hash is not null),
           'locale', p.locale,
           'created_at', p.created_at
         )
    into v_account
    from public.km_profile p
   where p.id = v_user;

  select jsonb_build_object(
           'available', b.available,
           'invested', b.invested,
           'earned_total', b.earned_total,
           'pending_withdrawal', b.pending_withdrawal
         )
    into v_balance
    from public.km_balance b
   where b.user_id = v_user;

  v_balance := coalesce(
    v_balance,
    jsonb_build_object('available', 0, 'invested', 0, 'earned_total', 0, 'pending_withdrawal', 0)
  );

  select jsonb_build_object(
           'active_investments', (
             select count(*) from public.km_investment
              where user_id = v_user and status = 'active'
           ),
           'total_invested', (
             select coalesce(sum(amount), 0) from public.km_investment where user_id = v_user
           ),
           'total_earned', (
             select coalesce(sum(earned), 0) from public.km_investment where user_id = v_user
           ),
           'today_earned', (
             select coalesce(sum(amount), 0) from public.km_ledger
              where user_id = v_user
                and kind in ('daily_reward', 'commission_l1', 'commission_l2', 'task_reward')
                and created_at >= public.km_day_start(now())
           ),
           'direct_referrals', (
             select count(*) from public.km_profile where referrer_id = v_user
           ),
           'network_size', (
             select count(*) from public.km_profile
              where referrer_id = v_user or referrer_l2_id = v_user
           )
         )
    into v_stats;

  select coalesce(
           jsonb_agg(to_jsonb(i) order by i.started_at desc),
           '[]'::jsonb
         )
    into v_investments
    from public.km_investment i
   where i.user_id = v_user
     and i.status = 'active';

  return public.km_ok(jsonb_build_object(
    'account', v_account,
    'balance', v_balance,
    'stats', v_stats,
    'investments', v_investments,
    'milestones', public.km_milestones_json(v_user)
  ));
end;
$$;

-- Team lists show a masked username instead of a masked address.
create or replace function public.km_team_members(p_level int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_level int;
begin
  if v_user is null then
    return '[]'::jsonb;
  end if;

  v_level := case when coalesce(p_level, 1) = 2 then 2 else 1 end;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'label', public.km_mask_handle(m.username),
          'level', v_level,
          'joined_at', m.created_at,
          'invested', (
            select coalesce(sum(i.amount), 0)
              from public.km_investment i
             where i.user_id = m.id
          ),
          'commission', (
            select coalesce(sum(l.amount), 0)
              from public.km_ledger l
             where l.user_id = v_user
               and l.kind = 'commission_l' || v_level
               and l.ref_id = m.id
          )
        )
        order by m.created_at desc
      ),
      '[]'::jsonb
    )
    from public.km_profile m
    where (v_level = 1 and m.referrer_id = v_user)
       or (v_level = 2 and m.referrer_l2_id = v_user)
  );
end;
$$;

-- Admins release payouts by handle, so the queue carries the username and number.
create or replace function public.km_admin_list_withdrawals(p_status text default 'pending')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  return (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'id', w.id,
        'email', p.email,
        'username', p.username,
        'phone', p.phone,
        'display_name', p.display_name,
        'referral_code', p.referral_code,
        'amount', w.amount, 'fee', w.fee, 'net', w.net, 'destination', w.destination,
        'status', w.status, 'reference', w.reference, 'provider_ref', w.provider_ref,
        'failure_reason', w.failure_reason, 'created_at', w.created_at
      ) order by w.created_at),
      '[]'::jsonb
    )
    from public.km_withdrawal w
    join public.km_profile p on p.id = w.user_id
    where coalesce(p_status, '') in ('', 'all') or w.status = p_status
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.km_login_handle(text) from public;
grant execute on function public.km_login_handle(text) to anon, authenticated;

revoke all on function public.km_handle_available(text, text) from public;
grant execute on function public.km_handle_available(text, text) to anon, authenticated;

revoke all on function public.km_set_contact(text, text) from public, anon;
grant execute on function public.km_set_contact(text, text) to authenticated;

revoke all on function public.km_bootstrap_impl(uuid, text) from public, anon, authenticated;

commit;
