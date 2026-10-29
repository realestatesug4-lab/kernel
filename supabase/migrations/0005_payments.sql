-- =============================================================================
-- 0005_payments.sql — SHASHURA mobile-money bridge
--
--   Deposits  : a collection is pushed to the payer's phone (requestToPay).
--               The SHASHURA callback confirms it and the balance is credited
--               automatically — no admin step.
--   Withdrawals: funds are held on request, an admin releases them, and the
--               payout (disburse) is executed server-side. A failed payout is
--               refunded to the member's available balance.
--
--   Privileged functions (km_settle_payment, km_admin_*) are executable by the
--   service_role only; the browser can never call them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Payment columns
-- -----------------------------------------------------------------------------
alter table public.km_deposit
  add column if not exists reference text
    default ('DEP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)));
alter table public.km_deposit add column if not exists msisdn text;
alter table public.km_deposit add column if not exists provider text not null default 'shashura';
alter table public.km_deposit add column if not exists provider_ref text;
alter table public.km_deposit add column if not exists confirmed_at timestamptz;
alter table public.km_deposit add column if not exists updated_at timestamptz not null default now();

create unique index if not exists km_deposit_reference_key
  on public.km_deposit (reference) where reference is not null;
create index if not exists km_deposit_status_idx
  on public.km_deposit (status, created_at desc);

alter table public.km_withdrawal
  add column if not exists reference text
    default ('WD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)));
alter table public.km_withdrawal add column if not exists provider text not null default 'shashura';
alter table public.km_withdrawal add column if not exists provider_ref text;
alter table public.km_withdrawal add column if not exists failure_reason text;
alter table public.km_withdrawal add column if not exists approved_at timestamptz;

create unique index if not exists km_withdrawal_reference_key
  on public.km_withdrawal (reference) where reference is not null;
create index if not exists km_withdrawal_status_idx
  on public.km_withdrawal (status, created_at);

alter table public.km_withdrawal drop constraint if exists km_withdrawal_status_check;
alter table public.km_withdrawal add constraint km_withdrawal_status_check
  check (status in ('pending', 'approved', 'paid', 'failed', 'rejected'));

-- A payout that fails at the network returns the held amount to the wallet.
alter table public.km_ledger drop constraint if exists km_ledger_kind_check;
alter table public.km_ledger add constraint km_ledger_kind_check check (kind in (
  'deposit', 'investment', 'daily_reward', 'commission_l1', 'commission_l2',
  'task_reward', 'investment_return', 'withdrawal', 'withdrawal_refund',
  'transfer_in', 'transfer_out', 'bonus'
));

-- -----------------------------------------------------------------------------
-- Open a deposit (pending until SHASHURA confirms the collection)
-- -----------------------------------------------------------------------------
create or replace function public.km_create_deposit(p_amount bigint, p_msisdn text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.km_deposit;
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;
  if p_amount is null or p_amount < 30000 then
    return public.km_err('AMOUNT_TOO_SMALL', 'Minimum deposit is 30,000 UGX.');
  end if;
  if p_amount > 2000000 then
    return public.km_err('AMOUNT_TOO_LARGE', 'Maximum deposit is 2,000,000 UGX per request.');
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
-- Attach the gateway reference after the collection request was accepted
-- -----------------------------------------------------------------------------
create or replace function public.km_attach_deposit(
  p_deposit_id uuid,
  p_provider_ref text,
  p_status text default 'pending'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.km_deposit;
begin
  if v_user is null then
    return public.km_err('NOT_AUTHENTICATED', 'Sign in first.');
  end if;
  if coalesce(p_status, 'pending') not in ('pending', 'failed') then
    return public.km_err('INVALID_STATUS', 'Unsupported deposit status.');
  end if;

  select * into v_row
    from public.km_deposit
   where id = p_deposit_id and user_id = v_user
   for update;
  if not found then
    return public.km_err('DEPOSIT_NOT_FOUND', 'Deposit not found.');
  end if;

  update public.km_deposit
     set provider_ref = coalesce(nullif(trim(coalesce(p_provider_ref, '')), ''), provider_ref),
         status = case when status = 'confirmed' then status else coalesce(p_status, 'pending') end,
         updated_at = now()
   where id = v_row.id
   returning * into v_row;

  return public.km_ok(to_jsonb(v_row));
end;
$$;

-- -----------------------------------------------------------------------------
-- Member's own deposit history (the deposit screen polls this)
-- -----------------------------------------------------------------------------
create or replace function public.km_list_deposits(p_limit int default 10)
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
        'id', d.id, 'amount', d.amount, 'status', d.status, 'reference', d.reference,
        'msisdn', d.msisdn, 'provider_ref', d.provider_ref,
        'created_at', d.created_at, 'confirmed_at', d.confirmed_at
      ) order by d.created_at desc),
      '[]'::jsonb
    )
    from (
      select * from public.km_deposit
       where user_id = v_user
       order by created_at desc
       limit least(greatest(coalesce(p_limit, 10), 1), 50)
    ) d
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Member's withdrawal history, now with the payout reference and failure note
-- -----------------------------------------------------------------------------
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
        'destination', w.destination, 'status', w.status,
        'reference', w.reference, 'failure_reason', w.failure_reason,
        'created_at', w.created_at
      ) order by w.created_at desc),
      '[]'::jsonb
    )
    from public.km_withdrawal w
    where w.user_id = v_user
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Callback settlement — idempotent, service_role only
-- -----------------------------------------------------------------------------
create or replace function public.km_settle_payment(
  p_reference text,
  p_kind text,
  p_status text,
  p_tid text,
  p_amount bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_kind     text := upper(coalesce(p_kind, ''));
  v_state    text := upper(coalesce(p_status, ''));
  v_dep      public.km_deposit;
  v_wd       public.km_withdrawal;
  v_credited boolean := false;
begin
  if p_reference is null or length(trim(p_reference)) = 0 then
    return public.km_err('INVALID_REFERENCE', 'Missing transaction reference.');
  end if;

  if v_kind = 'COLLECTION' then
    select * into v_dep from public.km_deposit where reference = p_reference for update;
    if not found then
      return public.km_err('DEPOSIT_NOT_FOUND', 'No deposit matches that reference.');
    end if;

    if v_state = 'SUCCESSFUL' then
      if v_dep.status <> 'confirmed' then
        update public.km_deposit
           set status = 'confirmed',
               provider_ref = coalesce(nullif(trim(coalesce(p_tid, '')), ''), provider_ref),
               confirmed_at = now(),
               updated_at = now()
         where id = v_dep.id;

        insert into public.km_balance (user_id, available) values (v_dep.user_id, v_dep.amount)
        on conflict (user_id) do update
          set available = public.km_balance.available + excluded.available,
              updated_at = now();

        insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
        values (v_dep.user_id, 'deposit', v_dep.amount, 'Mobile money top-up', v_dep.id);

        v_credited := true;
      end if;

      return public.km_ok(jsonb_build_object(
        'kind', 'deposit', 'status', 'confirmed', 'amount', v_dep.amount, 'credited', v_credited
      ));
    end if;

    update public.km_deposit
       set status = 'failed',
           provider_ref = coalesce(nullif(trim(coalesce(p_tid, '')), ''), provider_ref),
           updated_at = now()
     where id = v_dep.id and status <> 'confirmed';

    return public.km_ok(jsonb_build_object(
      'kind', 'deposit', 'status', 'failed', 'amount', v_dep.amount
    ));
  end if;

  if v_kind = 'DISBURSEMENT' then
    select * into v_wd from public.km_withdrawal where reference = p_reference for update;
    if not found then
      return public.km_err('WITHDRAWAL_NOT_FOUND', 'No withdrawal matches that reference.');
    end if;

    if v_state = 'SUCCESSFUL' then
      if v_wd.status <> 'paid' then
        update public.km_withdrawal
           set status = 'paid',
               provider_ref = coalesce(nullif(trim(coalesce(p_tid, '')), ''), provider_ref),
               processed_at = now()
         where id = v_wd.id;

        update public.km_balance
           set pending_withdrawal = greatest(0, pending_withdrawal - v_wd.amount),
               updated_at = now()
         where user_id = v_wd.user_id;
      end if;

      return public.km_ok(jsonb_build_object(
        'kind', 'withdrawal', 'status', 'paid', 'amount', v_wd.net
      ));
    end if;

    if v_wd.status in ('pending', 'approved') then
      update public.km_withdrawal
         set status = 'failed',
             provider_ref = coalesce(nullif(trim(coalesce(p_tid, '')), ''), provider_ref),
             failure_reason = coalesce(failure_reason, 'Payout failed at the network'),
             processed_at = now()
       where id = v_wd.id;

      update public.km_balance
         set pending_withdrawal = greatest(0, pending_withdrawal - v_wd.amount),
             available = available + v_wd.amount,
             updated_at = now()
       where user_id = v_wd.user_id;

      insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
      values (v_wd.user_id, 'withdrawal_refund', v_wd.amount, 'Payout failed · refunded', v_wd.id);
    end if;

    return public.km_ok(jsonb_build_object(
      'kind', 'withdrawal', 'status', 'failed', 'amount', v_wd.amount
    ));
  end if;

  return public.km_err('UNKNOWN_KIND', 'Unsupported transaction type.');
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin queue (service_role only; the route handler checks ADMIN_EMAILS first)
-- -----------------------------------------------------------------------------
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
        'id', w.id, 'email', p.email, 'referral_code', p.referral_code,
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

create or replace function public.km_admin_approve_withdrawal(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_wd public.km_withdrawal;
begin
  select * into v_wd from public.km_withdrawal where id = p_id for update;
  if not found then
    return public.km_err('WITHDRAWAL_NOT_FOUND', 'Withdrawal not found.');
  end if;
  if v_wd.status not in ('pending', 'approved') then
    return public.km_err('INVALID_STATUS', 'Only pending requests can be approved.');
  end if;

  -- Re-approving an approved request is a no-op (safe retry if the payout call
  -- was interrupted); the unique reference stops a duplicate disbursement.
  if v_wd.status = 'pending' then
    update public.km_withdrawal
       set status = 'approved', approved_at = now()
     where id = p_id
     returning * into v_wd;
  end if;

  return public.km_ok(jsonb_build_object(
    'id', v_wd.id, 'amount', v_wd.amount, 'net', v_wd.net,
    'destination', v_wd.destination, 'reference', v_wd.reference,
    'provider_ref', v_wd.provider_ref, 'status', v_wd.status
  ));
end;
$$;

create or replace function public.km_admin_reject_withdrawal(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_wd public.km_withdrawal;
begin
  select * into v_wd from public.km_withdrawal where id = p_id for update;
  if not found then
    return public.km_err('WITHDRAWAL_NOT_FOUND', 'Withdrawal not found.');
  end if;
  if v_wd.status not in ('pending', 'approved') then
    return public.km_err('INVALID_STATUS', 'This request is already settled.');
  end if;

  update public.km_withdrawal
     set status = 'rejected',
         failure_reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Rejected by admin'),
         processed_at = now()
   where id = p_id;

  update public.km_balance
     set pending_withdrawal = greatest(0, pending_withdrawal - v_wd.amount),
         available = available + v_wd.amount,
         updated_at = now()
   where user_id = v_wd.user_id;

  insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
  values (v_wd.user_id, 'withdrawal_refund', v_wd.amount, 'Withdrawal rejected · refunded', v_wd.id);

  return public.km_ok(jsonb_build_object('id', v_wd.id, 'status', 'rejected'));
end;
$$;

create or replace function public.km_admin_attach_payout(p_id uuid, p_provider_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_wd public.km_withdrawal;
begin
  update public.km_withdrawal
     set provider_ref = coalesce(nullif(trim(coalesce(p_provider_ref, '')), ''), provider_ref)
   where id = p_id
   returning * into v_wd;

  if v_wd.id is null then
    return public.km_err('WITHDRAWAL_NOT_FOUND', 'Withdrawal not found.');
  end if;

  return public.km_ok(jsonb_build_object('id', v_wd.id, 'provider_ref', v_wd.provider_ref));
end;
$$;

-- Used when the gateway is not configured (local/demo): settles without a payout.
create or replace function public.km_admin_mark_withdrawal_paid(p_id uuid, p_provider_ref text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_wd public.km_withdrawal;
begin
  select * into v_wd from public.km_withdrawal where id = p_id for update;
  if not found then
    return public.km_err('WITHDRAWAL_NOT_FOUND', 'Withdrawal not found.');
  end if;
  if v_wd.status not in ('pending', 'approved') then
    return public.km_err('INVALID_STATUS', 'This request is already settled.');
  end if;

  update public.km_withdrawal
     set status = 'paid',
         provider_ref = coalesce(nullif(trim(coalesce(p_provider_ref, '')), ''), provider_ref),
         processed_at = now()
   where id = p_id
   returning * into v_wd;

  update public.km_balance
     set pending_withdrawal = greatest(0, pending_withdrawal - v_wd.amount),
         updated_at = now()
   where user_id = v_wd.user_id;

  return public.km_ok(jsonb_build_object('id', v_wd.id, 'status', 'paid'));
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges: member functions for authenticated users, the rest for service_role
-- -----------------------------------------------------------------------------
revoke all on function public.km_create_deposit(bigint, text) from public, anon;
grant execute on function public.km_create_deposit(bigint, text) to authenticated;
revoke all on function public.km_attach_deposit(uuid, text, text) from public, anon;
grant execute on function public.km_attach_deposit(uuid, text, text) to authenticated;
revoke all on function public.km_list_deposits(int) from public, anon;
grant execute on function public.km_list_deposits(int) to authenticated;

revoke all on function public.km_settle_payment(text, text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.km_admin_list_withdrawals(text) from public, anon, authenticated;
revoke all on function public.km_admin_approve_withdrawal(uuid) from public, anon, authenticated;
revoke all on function public.km_admin_reject_withdrawal(uuid, text) from public, anon, authenticated;
revoke all on function public.km_admin_attach_payout(uuid, text) from public, anon, authenticated;
revoke all on function public.km_admin_mark_withdrawal_paid(uuid, text) from public, anon, authenticated;

grant execute on function public.km_settle_payment(text, text, text, text, bigint) to service_role;
grant execute on function public.km_admin_list_withdrawals(text) to service_role;
grant execute on function public.km_admin_approve_withdrawal(uuid) to service_role;
grant execute on function public.km_admin_reject_withdrawal(uuid, text) to service_role;
grant execute on function public.km_admin_attach_payout(uuid, text) to service_role;
grant execute on function public.km_admin_mark_withdrawal_paid(uuid, text) to service_role;
