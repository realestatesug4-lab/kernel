-- =============================================================================
-- KernelMiners · 0002 helpers, mutations and triggers
-- Every function returns a jsonb envelope: {ok:true,data:...} | {ok:false,code,message}
-- so the browser only ever calls `supabase.rpc(name, args)`.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Envelope helpers
-- -----------------------------------------------------------------------------
create or replace function public.km_ok(payload jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('ok', true, 'data', coalesce(payload, 'null'::jsonb));
$$;

create or replace function public.km_err(p_code text, p_message text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('ok', false, 'code', p_code, 'message', p_message);
$$;

-- Masked member label for team lists ("jo***@mail.com").
create or replace function public.km_mask_email(p_email text)
returns text
language sql
immutable
as $$
  select case
    when p_email is null or p_email = '' then 'KernelMiner'
    when position('@' in p_email) > 1 then
      left(p_email, 2)
      || repeat('*', greatest(1, position('@' in p_email) - 3))
      || substr(p_email, position('@' in p_email))
    else left(p_email, 2) || '***'
  end;
$$;

-- -----------------------------------------------------------------------------
-- Account provisioning (idempotent)
--   * generates a unique referral code
--   * links the two-level referral chain from the invite code
--   * hashes the 4-digit PIN captured at sign-up
-- -----------------------------------------------------------------------------
create or replace function public.km_bootstrap_impl(p_user uuid, p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row  public.km_profile;
  v_ref  public.km_profile;
  v_meta text;
  v_pin  text;
  v_email text;
  v_code text;
begin
  select * into v_row from public.km_profile where id = p_user;
  if found then
    return jsonb_build_object('user_id', v_row.id, 'referral_code', v_row.referral_code);
  end if;

  select u.email,
         u.raw_user_meta_data ->> 'referral_code',
         u.raw_user_meta_data ->> 'pin'
    into v_email, v_meta, v_pin
    from auth.users u
   where u.id = p_user;

  if v_email is null then
    return public.km_err('USER_NOT_FOUND', 'Account not found.');
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
    id, email, display_name, referral_code, referrer_id, referrer_l2_id, pin_hash
  ) values (
    p_user,
    v_email,
    split_part(v_email, '@', 1),
    v_code,
    v_ref.id,
    v_ref.referrer_id,
    case when v_pin ~ '^[0-9]{4}$' then crypt(v_pin, gen_salt('bf')) else null end
  )
  returning * into v_row;

  insert into public.km_balance (user_id) values (p_user)
  on conflict (user_id) do nothing;

  return jsonb_build_object('user_id', v_row.id, 'referral_code', v_row.referral_code);
end;
$$;

-- Auto-provision every new auth user, even if the client never calls the RPC.
create or replace function public.km_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public.km_bootstrap_impl(new.id, new.raw_user_meta_data ->> 'referral_code');
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
  return public.km_ok(public.km_bootstrap_impl(v_user, p_referral_code));
end;
$$;

-- -----------------------------------------------------------------------------
-- Daily accrual: one payout per 24h cycle measured from started_at.
-- Returns the amount credited in this call.
-- -----------------------------------------------------------------------------
create or replace function public.km_accrue_impl(p_user uuid)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r        record;
  v_cycle  int;
  v_delta  int;
  v_credit bigint;
  v_total  bigint := 0;
  v_done   boolean;
begin
  for r in
    select *
      from public.km_investment
     where user_id = p_user
       and status = 'active'
     order by started_at
     for update
  loop
    v_cycle := least(
      r.duration_days,
      greatest(0, floor(extract(epoch from (now() - r.started_at)) / 86400)::int)
    );
    v_delta := v_cycle - r.paid_cycles;

    if v_delta <= 0 then
      continue;
    end if;

    v_credit := v_delta * r.daily;
    v_done := v_cycle >= r.duration_days;

    update public.km_investment
       set paid_cycles = v_cycle,
           earned = earned + v_credit,
           status = case when v_done then 'completed' else 'active' end
     where id = r.id;

    insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
    values (
      p_user, 'daily_reward', v_credit,
      format('%s · cycle %s-%s of %s', r.product_name, r.paid_cycles + 1, v_cycle, r.duration_days),
      r.id
    );

    if v_done then
      -- Principal is consumed by the payouts; release the locked amount.
      update public.km_balance
         set available = available + v_credit,
             invested = greatest(0, invested - r.amount),
             earned_total = earned_total + v_credit,
             updated_at = now()
       where user_id = p_user;

      insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
      values (p_user, 'investment_return', 0,
              format('%s completed after %s days', r.product_name, r.duration_days), r.id);
    else
      update public.km_balance
         set available = available + v_credit,
             earned_total = earned_total + v_credit,
             updated_at = now()
       where user_id = p_user;
    end if;

    v_total := v_total + v_credit;
  end loop;

  return v_total;
end;
$$;

create or replace function public.km_accrue()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_credit bigint;
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;
  v_credit := public.km_accrue_impl(v_user);
  return public.km_ok(jsonb_build_object('credited', v_credit));
end;
$$;

-- -----------------------------------------------------------------------------
-- Buy a mining pack + pay 1% / 1% referral commission on success
-- -----------------------------------------------------------------------------
create or replace function public.km_invest(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_prod  public.km_product;
  v_bal   public.km_balance;
  v_inv   uuid;
  v_ends  timestamptz;
  v_l1    uuid;
  v_l2    uuid;
  v_comm  bigint;
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;

  perform public.km_accrue_impl(v_user);

  select * into v_prod from public.km_product where id = p_product_id and active;
  if not found then
    return public.km_err('PRODUCT_NOT_FOUND', 'That mining pack is no longer available.');
  end if;

  insert into public.km_balance (user_id) values (v_user)
  on conflict (user_id) do nothing;

  select * into v_bal from public.km_balance where user_id = v_user for update;

  if v_bal.available < v_prod.price then
    return public.km_err('INSUFFICIENT_FUNDS', 'Add funds before buying this pack.');
  end if;

  v_ends := now() + make_interval(days => v_prod.duration_days);

  insert into public.km_investment (
    user_id, product_id, product_name, product_no, amount, daily, duration_days, started_at, ends_at
  ) values (
    v_user, v_prod.id, v_prod.name, v_prod.no, v_prod.price, v_prod.daily,
    v_prod.duration_days, now(), v_ends
  )
  returning id into v_inv;

  update public.km_balance
     set available = available - v_prod.price,
         invested = invested + v_prod.price,
         updated_at = now()
   where user_id = v_user;

  insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
  values (v_user, 'investment', -v_prod.price, v_prod.name, v_inv);

  -- Referral commission: 19% level 1, 1% level 2 (mirrors rules.referral in the app).
  select referrer_id, referrer_l2_id into v_l1, v_l2
    from public.km_profile where id = v_user;

  v_comm := floor(v_prod.price * 19 / 100.0)::bigint;

  if v_l1 is not null and v_comm > 0 then
    update public.km_balance
       set available = available + v_comm, updated_at = now()
     where user_id = v_l1;
    insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
    values (v_l1, 'commission_l1', v_comm, 'Level 1 · ' || v_prod.name, v_user);
  end if;

  v_comm := floor(v_prod.price * 1 / 100.0)::bigint;

  if v_l2 is not null and v_comm > 0 then
    update public.km_balance
       set available = available + v_comm, updated_at = now()
     where user_id = v_l2;
    insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
    values (v_l2, 'commission_l2', v_comm, 'Level 2 · ' || v_prod.name, v_user);
  end if;

  return public.km_ok(jsonb_build_object(
    'investment_id', v_inv,
    'amount', v_prod.price,
    'ends_at', v_ends
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- Deposit (credited instantly in demo mode)
-- -----------------------------------------------------------------------------
create or replace function public.km_request_deposit(p_amount bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;
  if p_amount is null or p_amount < 30000 then
    return public.km_err('AMOUNT_TOO_SMALL', 'Minimum deposit is 30,000 UGX.');
  end if;

  insert into public.km_deposit (user_id, amount, status)
  values (v_user, p_amount, 'confirmed')
  returning id into v_id;

  insert into public.km_balance (user_id, available) values (v_user, p_amount)
  on conflict (user_id) do update
    set available = public.km_balance.available + excluded.available,
        updated_at = now();

  insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
  values (v_user, 'deposit', p_amount, 'Deposit confirmed', v_id);

  return public.km_ok(jsonb_build_object('deposit_id', v_id, 'amount', p_amount));
end;
$$;

-- -----------------------------------------------------------------------------
-- Withdrawal request (PIN protected, 1% fee, min 30,000)
-- -----------------------------------------------------------------------------
create or replace function public.km_request_withdrawal(
  p_amount bigint,
  p_destination text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_pin  text;
  v_bal  public.km_balance;
  v_row  public.km_withdrawal;
  v_fee  bigint;
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;
  if p_amount is null or p_amount < 30000 then
    return public.km_err('AMOUNT_TOO_SMALL', 'Minimum withdrawal is 30,000 UGX.');
  end if;
  if p_destination is null or length(trim(p_destination)) < 6 then
    return public.km_err('INVALID_DESTINATION', 'Enter a valid mobile-money number or address.');
  end if;

  select pin_hash into v_pin from public.km_profile where id = v_user;
  if v_pin is null then
    return public.km_err('PIN_REQUIRED', 'Set a security PIN before withdrawing.');
  end if;
  if p_pin is null or crypt(p_pin, v_pin) <> v_pin then
    return public.km_err('INVALID_PIN', 'Incorrect security PIN.');
  end if;

  select * into v_bal from public.km_balance where user_id = v_user for update;
  if not found or v_bal.available < p_amount then
    return public.km_err('INSUFFICIENT_FUNDS', 'Amount exceeds your available balance.');
  end if;

  v_fee := floor(p_amount * 1 / 100.0)::bigint;

  update public.km_balance
     set available = available - p_amount,
         pending_withdrawal = pending_withdrawal + p_amount,
         updated_at = now()
   where user_id = v_user;

  insert into public.km_withdrawal (user_id, amount, fee, net, destination)
  values (v_user, p_amount, v_fee, p_amount - v_fee, trim(p_destination))
  returning * into v_row;

  insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
  values (v_user, 'withdrawal', -p_amount, 'To ' || trim(p_destination), v_row.id);

  return public.km_ok(to_jsonb(v_row));
end;
$$;

create or replace function public.km_list_withdrawals()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'id', w.id, 'amount', w.amount, 'fee', w.fee, 'net', w.net,
        'destination', w.destination, 'status', w.status, 'created_at', w.created_at
      ) order by w.created_at desc),
      '[]'::jsonb
    )
    from public.km_withdrawal w
    where w.user_id = v_user
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Internal transfer by referral code (PIN protected, instant, free)
-- -----------------------------------------------------------------------------
create or replace function public.km_transfer(
  p_to_referral_code text,
  p_amount bigint,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_target public.km_profile;
  v_pin    text;
  v_bal    public.km_balance;
  v_tx     uuid;
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return public.km_err('INVALID_AMOUNT', 'Enter an amount to send.');
  end if;

  select * into v_target
    from public.km_profile
   where upper(referral_code) = upper(trim(coalesce(p_to_referral_code, '')))
   limit 1;
  if not found then
    return public.km_err('RECIPIENT_NOT_FOUND', 'No member matches that referral code.');
  end if;
  if v_target.id = v_user then
    return public.km_err('SELF_TRANSFER', 'You cannot transfer to yourself.');
  end if;

  select pin_hash into v_pin from public.km_profile where id = v_user;
  if v_pin is null then
    return public.km_err('PIN_REQUIRED', 'Set a security PIN before transferring.');
  end if;
  if p_pin is null or crypt(p_pin, v_pin) <> v_pin then
    return public.km_err('INVALID_PIN', 'Incorrect security PIN.');
  end if;

  -- Lock both wallets in a deterministic order to avoid deadlocks.
  perform 1 from public.km_balance
   where user_id in (v_user, v_target.id)
   order by user_id
   for update;

  select * into v_bal from public.km_balance where user_id = v_user;
  if not found or v_bal.available < p_amount then
    return public.km_err('INSUFFICIENT_FUNDS', 'Amount exceeds your available balance.');
  end if;

  update public.km_balance
     set available = available - p_amount, updated_at = now()
   where user_id = v_user;

  update public.km_balance
     set available = available + p_amount, updated_at = now()
   where user_id = v_target.id;

  insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
  values (v_user, 'transfer_out', -p_amount, 'To ' || v_target.referral_code, v_target.id)
  returning id into v_tx;

  insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
  values (v_target.id, 'transfer_in', p_amount, 'From member', v_user);

  return public.km_ok(jsonb_build_object('tx_id', v_tx));
end;
$$;

-- -----------------------------------------------------------------------------
-- Invite milestone claim
-- -----------------------------------------------------------------------------
create or replace function public.km_claim_milestone(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_ms       public.km_milestone;
  v_invites  int;
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;

  select * into v_ms from public.km_milestone where id = p_id;
  if not found then
    return public.km_err('MILESTONE_NOT_FOUND', 'That task no longer exists.');
  end if;

  select count(*) into v_invites from public.km_profile where referrer_id = v_user;

  if v_invites < v_ms.invite_required then
    return public.km_err(
      'TASK_LOCKED',
      format('Invite %s friends first (%s so far).', v_ms.invite_required, v_invites)
    );
  end if;

  if exists (select 1 from public.km_claim where user_id = v_user and milestone_id = v_ms.id) then
    return public.km_err('ALREADY_CLAIMED', 'Reward already claimed.');
  end if;

  insert into public.km_claim (user_id, milestone_id, reward)
  values (v_user, v_ms.id, v_ms.extra_reward);

  update public.km_balance
     set available = available + v_ms.extra_reward,
         earned_total = earned_total + v_ms.extra_reward,
         updated_at = now()
   where user_id = v_user;

  insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
  values (v_user, 'task_reward', v_ms.extra_reward,
          format('Invite %s friends', v_ms.invite_required), v_ms.id);

  return public.km_ok(jsonb_build_object('reward', v_ms.extra_reward));
end;
$$;

-- -----------------------------------------------------------------------------
-- Profile settings
-- -----------------------------------------------------------------------------
create or replace function public.km_set_pin(p_pin text)
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
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return public.km_err('INVALID_PIN', 'PIN must be 4 digits.');
  end if;

  update public.km_profile
     set pin_hash = crypt(p_pin, gen_salt('bf'))
   where id = v_user;

  return public.km_ok('true'::jsonb);
end;
$$;

create or replace function public.km_set_locale(p_locale text)
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
  if p_locale is null or length(p_locale) > 8 then
    return public.km_err('INVALID_LOCALE', 'Unsupported language.');
  end if;

  update public.km_profile set locale = p_locale where id = v_user;
  return public.km_ok('true'::jsonb);
end;
$$;

create or replace function public.km_update_profile(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;

  v_name := nullif(trim(coalesce(p_display_name, '')), '');
  if v_name is null or length(v_name) > 40 then
    return public.km_err('INVALID_NAME', 'Choose a name under 40 characters.');
  end if;

  update public.km_profile set display_name = v_name where id = v_user;
  return public.km_ok('true'::jsonb);
end;
$$;

commit;
