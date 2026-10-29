-- =============================================================================
-- KernelMiners · 0006 programme rules
--
-- Locks the published programme terms into the database so the app, the RPCs
-- and the marketing copy cannot drift apart:
--
--   Welcome bonus ............ 1,000 UGX, once per account
--   Minimum deposit .......... 30,000 UGX
--   Minimum withdrawal ....... 5,000 UGX
--   Withdrawal charge ........ 17% of the requested amount
--   Referral commission ...... 19% level 1 · 1% level 2
--   Task commission .......... capped at 500,000 UGX per member
--   Daily earnings ........... released at local midnight (Africa/Kampala),
--                              not 24 hours after the purchase minute
--
-- Run order: 0001 → 0002 → 0003 → 0004 → 0005 → 0006.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Rule book: every published figure lives in one table
-- -----------------------------------------------------------------------------
create table if not exists public.km_config (
  key        text primary key,
  value      bigint not null,
  note       text,
  updated_at timestamptz not null default now()
);

insert into public.km_config (key, value, note) values
  ('welcome_bonus',       1000,    'One-off credit granted on account creation'),
  ('min_deposit',         30000,   'Smallest accepted mobile-money collection'),
  ('max_deposit',         2000000, 'Largest single collection'),
  ('min_withdrawal',      5000,    'Smallest withdrawal request'),
  ('withdrawal_fee_pct',  17,      'Service charge withheld from the request'),
  ('referral_l1_pct',     19,      'Commission on an invitee''s pack purchase'),
  ('referral_l2_pct',     1,       'Commission on a level-2 pack purchase'),
  ('task_commission_cap', 500000,  'Lifetime task-center commission per member')
on conflict (key) do update
  set value      = excluded.value,
      note       = excluded.note,
      updated_at = now();

alter table public.km_config enable row level security;
revoke all on table public.km_config from anon, authenticated;

create or replace function public.km_rule(p_key text, p_default bigint default 0)
returns bigint
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((select c.value from public.km_config c where c.key = p_key), p_default);
$$;

-- -----------------------------------------------------------------------------
-- Payout clock
--   The programme releases earnings at local midnight, so a pack bought in the
--   afternoon is paid the same night. Uganda keeps EAT (UTC+3) all year, which
--   makes a fixed zone safe to pin here.
-- -----------------------------------------------------------------------------

-- Start of the local day that contains p_at.
create or replace function public.km_day_start(p_at timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select (date_trunc('day', coalesce(p_at, now()) at time zone 'Africa/Kampala')
          at time zone 'Africa/Kampala');
$$;

-- First payout boundary for anything started at p_from.
create or replace function public.km_next_payout_at(p_from timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select (date_trunc('day', coalesce(p_from, now()) at time zone 'Africa/Kampala')
          at time zone 'Africa/Kampala') + interval '1 day';
$$;

-- Local midnights crossed since p_started: the number of daily payouts due.
create or replace function public.km_payout_cycles(
  p_started timestamptz,
  p_now timestamptz default now()
)
returns int
language sql
stable
as $$
  select greatest(
    0,
    date_trunc('day', coalesce(p_now, now()) at time zone 'Africa/Kampala')::date
      - date_trunc('day', p_started at time zone 'Africa/Kampala')::date
  );
$$;

-- -----------------------------------------------------------------------------
-- Welcome bonus
-- -----------------------------------------------------------------------------
alter table public.km_profile add column if not exists welcome_bonus_at timestamptz;

create or replace function public.km_grant_welcome_bonus(p_user uuid)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_amount bigint := public.km_rule('welcome_bonus', 1000);
  v_flag   timestamptz;
begin
  if p_user is null or v_amount <= 0 then
    return 0;
  end if;

  select welcome_bonus_at into v_flag
    from public.km_profile
   where id = p_user
   for update;

  if not found or v_flag is not null then
    return 0;
  end if;

  update public.km_profile set welcome_bonus_at = now() where id = p_user;

  insert into public.km_balance (user_id, available) values (p_user, v_amount)
  on conflict (user_id) do update
    set available  = public.km_balance.available + excluded.available,
        updated_at = now();

  insert into public.km_ledger (user_id, kind, amount, memo)
  values (p_user, 'bonus', v_amount, 'Welcome bonus');

  return v_amount;
end;
$$;

-- Pay the bonus to accounts that were created before this migration.
do $$
declare
  r record;
begin
  for r in select id from public.km_profile where welcome_bonus_at is null loop
    perform public.km_grant_welcome_bonus(r.id);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Account provisioning now hands out the welcome bonus
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
  v_bonus bigint;
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

  v_bonus := public.km_grant_welcome_bonus(p_user);

  return jsonb_build_object(
    'user_id', v_row.id,
    'referral_code', v_row.referral_code,
    'welcome_bonus', v_bonus
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Daily accrual: one payout per local midnight crossed, capped by the duration
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
    v_cycle := least(r.duration_days, public.km_payout_cycles(r.started_at));
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
      format('%s · midnight payout %s-%s of %s', r.product_name, r.paid_cycles + 1, v_cycle, r.duration_days),
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

-- Scheduled sweep: credits every active pack right after local midnight.
create or replace function public.km_accrue_all()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user    uuid;
  v_members int := 0;
  v_total   bigint := 0;
  v_credit  bigint;
begin
  for v_user in
    select distinct user_id
      from public.km_investment
     where status = 'active'
     order by user_id
  loop
    v_credit := public.km_accrue_impl(v_user);
    if v_credit > 0 then
      v_members := v_members + 1;
      v_total := v_total + v_credit;
    end if;
  end loop;

  return public.km_ok(jsonb_build_object(
    'credited', v_total,
    'members', v_members,
    'ran_at', now()
  ));
end;
$$;

-- Move existing active packs onto the midnight clock.
update public.km_investment
   set ends_at = public.km_next_payout_at(started_at) + make_interval(days => duration_days - 1)
 where status = 'active';

-- -----------------------------------------------------------------------------
-- Buy a pack: 19% / 1% commission, first payout at the coming midnight
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
  v_first timestamptz;
  v_ends  timestamptz;
  v_l1    uuid;
  v_l2    uuid;
  v_pct   bigint;
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

  -- Payouts run on the midnight clock, so the pack ends on its final midnight.
  v_first := public.km_next_payout_at(now());
  v_ends  := v_first + make_interval(days => v_prod.duration_days - 1);

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

  -- Referral commission: 19% level 1, 1% level 2 (km_config).
  select referrer_id, referrer_l2_id into v_l1, v_l2
    from public.km_profile where id = v_user;

  v_pct := public.km_rule('referral_l1_pct', 19);
  v_comm := floor(v_prod.price * v_pct / 100.0)::bigint;

  if v_l1 is not null and v_comm > 0 then
    update public.km_balance
       set available = available + v_comm, updated_at = now()
     where user_id = v_l1;
    insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
    values (v_l1, 'commission_l1', v_comm, format('Level 1 · %s (%s%%)', v_prod.name, v_pct), v_user);
  end if;

  v_pct := public.km_rule('referral_l2_pct', 1);
  v_comm := floor(v_prod.price * v_pct / 100.0)::bigint;

  if v_l2 is not null and v_comm > 0 then
    update public.km_balance
       set available = available + v_comm, updated_at = now()
     where user_id = v_l2;
    insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
    values (v_l2, 'commission_l2', v_comm, format('Level 2 · %s (%s%%)', v_prod.name, v_pct), v_user);
  end if;

  return public.km_ok(jsonb_build_object(
    'investment_id', v_inv,
    'amount', v_prod.price,
    'first_payout_at', v_first,
    'ends_at', v_ends
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- Deposits: 30,000 minimum, 2,000,000 maximum
-- -----------------------------------------------------------------------------
create or replace function public.km_request_deposit(p_amount bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_min  bigint := public.km_rule('min_deposit', 30000);
  v_max  bigint := public.km_rule('max_deposit', 2000000);
  v_id   uuid;
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;
  if p_amount is null or p_amount < v_min then
    return public.km_err('AMOUNT_TOO_SMALL', format('Minimum deposit is %s UGX.', to_char(v_min, 'FM999G999G999')));
  end if;
  if p_amount > v_max then
    return public.km_err('AMOUNT_TOO_LARGE', format('Maximum deposit is %s UGX per request.', to_char(v_max, 'FM999G999G999')));
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

create or replace function public.km_create_deposit(p_amount bigint, p_msisdn text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_min  bigint := public.km_rule('min_deposit', 30000);
  v_max  bigint := public.km_rule('max_deposit', 2000000);
  v_row  public.km_deposit;
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;
  if p_amount is null or p_amount < v_min then
    return public.km_err('AMOUNT_TOO_SMALL', format('Minimum deposit is %s UGX.', to_char(v_min, 'FM999G999G999')));
  end if;
  if p_amount > v_max then
    return public.km_err('AMOUNT_TOO_LARGE', format('Maximum deposit is %s UGX per request.', to_char(v_max, 'FM999G999G999')));
  end if;
  if p_msisdn is null or p_msisdn !~ '^256[0-9]{9}$' then
    return public.km_err('INVALID_MSISDN', 'Enter a valid Ugandan mobile-money number.');
  end if;

  insert into public.km_deposit (user_id, amount, status, msisdn)
  values (v_user, p_amount, 'pending', p_msisdn)
  returning * into v_row;

  return public.km_ok(jsonb_build_object(
    'deposit_id', v_row.id,
    'reference', v_row.reference,
    'amount', v_row.amount,
    'msisdn', v_row.msisdn
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- Withdrawals: 5,000 minimum, 17% charge
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
  v_min  bigint := public.km_rule('min_withdrawal', 5000);
  v_pct  bigint := public.km_rule('withdrawal_fee_pct', 17);
  v_pin  text;
  v_bal  public.km_balance;
  v_row  public.km_withdrawal;
  v_fee  bigint;
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;
  if p_amount is null or p_amount < v_min then
    return public.km_err('AMOUNT_TOO_SMALL', format('Minimum withdrawal is %s UGX.', to_char(v_min, 'FM999G999G999')));
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

  v_fee := floor(p_amount * v_pct / 100.0)::bigint;

  update public.km_balance
     set available = available - p_amount,
         pending_withdrawal = pending_withdrawal + p_amount,
         updated_at = now()
   where user_id = v_user;

  insert into public.km_withdrawal (user_id, amount, fee, net, destination)
  values (v_user, p_amount, v_fee, p_amount - v_fee, trim(p_destination))
  returning * into v_row;

  insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
  values (v_user, 'withdrawal', -p_amount,
          format('To %s · %s%% fee', trim(p_destination), v_pct), v_row.id);

  return public.km_ok(to_jsonb(v_row));
end;
$$;

-- -----------------------------------------------------------------------------
-- Task center: referral commission capped at 500,000 UGX per member
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
  v_cap      bigint := public.km_rule('task_commission_cap', 500000);
  v_claimed  bigint;
  v_reward   bigint;
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

  select coalesce(sum(reward), 0) into v_claimed
    from public.km_claim
   where user_id = v_user;

  if v_claimed >= v_cap then
    return public.km_err(
      'TASK_CAP_REACHED',
      format('The task commission limit of %s UGX is already reached.', to_char(v_cap, 'FM999G999G999'))
    );
  end if;

  v_reward := least(v_ms.extra_reward, v_cap - v_claimed);

  insert into public.km_claim (user_id, milestone_id, reward)
  values (v_user, v_ms.id, v_reward);

  update public.km_balance
     set available = available + v_reward,
         earned_total = earned_total + v_reward,
         updated_at = now()
   where user_id = v_user;

  insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
  values (v_user, 'task_reward', v_reward,
          format('Invite %s friends', v_ms.invite_required), v_ms.id);

  return public.km_ok(jsonb_build_object('reward', v_reward));
end;
$$;

-- Re-seed the milestones so the four payouts add up to the 500,000 ceiling.
insert into public.km_milestone (invite_required, unlock_amount, extra_reward, sort)
values
  (8,   30000,  10000, 1),
  (28,  50000,  40000, 2),
  (68,  80000, 100000, 3),
  (128, 200000, 350000, 4)
on conflict (invite_required) do update
  set unlock_amount = excluded.unlock_amount,
      extra_reward  = excluded.extra_reward,
      sort          = excluded.sort;

-- -----------------------------------------------------------------------------
-- Dashboard: "today" now means the local day that the midnight payout closes
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

-- -----------------------------------------------------------------------------
-- Rule book for the client (`api.rules()` → same numbers as km_config)
-- -----------------------------------------------------------------------------
create or replace function public.km_get_rules()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'welcome_bonus',       public.km_rule('welcome_bonus', 1000),
    'min_deposit',         public.km_rule('min_deposit', 30000),
    'max_deposit',         public.km_rule('max_deposit', 2000000),
    'min_withdrawal',      public.km_rule('min_withdrawal', 5000),
    'withdrawal_fee_pct',  public.km_rule('withdrawal_fee_pct', 17),
    'referral_l1_pct',     public.km_rule('referral_l1_pct', 19),
    'referral_l2_pct',     public.km_rule('referral_l2_pct', 1),
    'task_commission_cap', public.km_rule('task_commission_cap', 500000),
    'payout_timezone',     'Africa/Kampala',
    'payout_hour',         0
  );
$$;

-- -----------------------------------------------------------------------------
-- Notices: keep the published copy in step with the rule book
-- -----------------------------------------------------------------------------
update public.km_notice
   set body = 'Buy a mining pack once and receive a fixed payout every midnight (East Africa Time) for the pack duration. Earnings are credited automatically — no claim step.',
       title = 'Welcome to KernelMiners'
 where id = '00000000-0000-4000-8000-000000000001';

update public.km_notice
   set body = 'Withdrawals require your 4-digit security PIN. The minimum is 5,000 UGX and a 17% service charge applies. Requests are reviewed before payout to your mobile-money number.'
 where id = '00000000-0000-4000-8000-000000000004';

update public.km_notice
   set body = 'Invite 8, 28, 68 or 128 friends on level 1 to unlock each milestone. Task commission is capped at 500,000 UGX per member.'
 where id = '00000000-0000-4000-8000-000000000003';

insert into public.km_notice (id, title, body, kind, published)
values
  (
    '00000000-0000-4000-8000-000000000005',
    'Midnight payouts',
    'Daily earnings are released at midnight East Africa Time, every day, for the whole pack duration. A pack bought in the afternoon pays out the same night.',
    'update',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000006',
    'Welcome bonus and minimums',
    'Every new member starts with a 1,000 UGX welcome bonus. Deposits start at 30,000 UGX and withdrawals start at 5,000 UGX.',
    'promotion',
    true
  )
on conflict (id) do update
  set title = excluded.title,
      body = excluded.body,
      kind = excluded.kind,
      published = excluded.published;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.km_rule(text, bigint) from public, anon, authenticated;
revoke all on function public.km_grant_welcome_bonus(uuid) from public, anon, authenticated;
revoke all on function public.km_accrue_all() from public, anon, authenticated;
grant execute on function public.km_accrue_all() to service_role;

revoke all on function public.km_get_rules() from public;
grant execute on function public.km_get_rules() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Schedule the midnight sweep (21:00 UTC = 00:00 EAT).
-- pg_cron is optional: on projects where it is unavailable the lazily-accruing
-- RPCs (km_dashboard, km_list_investments, km_invest) still settle every read.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
    exception when others then
      raise notice 'pg_cron extension not created: %', sqlerrm;
    end;
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'km-midnight-accrual';
    perform cron.schedule(
      'km-midnight-accrual',
      '0 21 * * *',
      'select public.km_accrue_all()'
    );
  else
    raise notice 'pg_cron unavailable — midnight payouts settle on the next RPC read.';
  end if;
exception when others then
  raise notice 'Midnight sweep not scheduled: %', sqlerrm;
end $$;

commit;
