-- =============================================================================
-- KernelMiners · 0012 manual wallet adjustments + the payout approval gate
--
-- Two operator powers that were missing from the console:
--
--   * km_admin_adjust_wallet — credit or debit one wallet by hand. The movement
--     always lands in km_ledger (kinds admin_credit / admin_debit) so the member
--     sees it in their own history and the console can filter for it.
--
--   * km_admin_begin_payout — the second half of the withdrawal gate. 0005 let an
--     admin flip a request to `approved`; until now the same HTTP call also
--     pushed the payout. From 0012 a request must be approved first, and only
--     then may a route handler hand it to SHASHURA. `approved_by` records which
--     admin opened the gate.
--
-- Run order: 0001 → … → 0011 → 0012.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Manual movements get their own ledger kinds
-- -----------------------------------------------------------------------------
alter table public.km_ledger drop constraint if exists km_ledger_kind_check;
alter table public.km_ledger add constraint km_ledger_kind_check check (kind in (
  'deposit', 'investment', 'daily_reward', 'commission_l1', 'commission_l2',
  'task_reward', 'investment_return', 'withdrawal', 'withdrawal_refund',
  'transfer_in', 'transfer_out', 'bonus', 'admin_credit', 'admin_debit'
));

-- -----------------------------------------------------------------------------
-- Who approved a payout
-- -----------------------------------------------------------------------------
alter table public.km_withdrawal add column if not exists approved_by text;

-- -----------------------------------------------------------------------------
-- Credit / debit a wallet by hand
--
--   credit → available + amount, ledger +amount, kind admin_credit
--   debit  → available - amount, ledger -amount, kind admin_debit
--
-- `earned_total` is deliberately untouched: a manual credit is not mining
-- income, so it must not inflate the "Earned" figure members compare against
-- the packs. The ledger entry is the record; the memo carries the reason and
-- the admin who moved the money.
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_adjust_wallet(
  p_user_id   uuid,
  p_direction text,
  p_amount    bigint,
  p_note      text default null,
  p_admin     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_dir     text   := lower(trim(both from coalesce(p_direction, '')));
  v_amount  bigint := coalesce(p_amount, 0);
  v_admin   text   := nullif(trim(both from coalesce(p_admin, '')), '');
  v_memo    text;
  v_balance public.km_balance;
  v_ledger  uuid;
begin
  if v_dir not in ('credit', 'debit') then
    return public.km_err('BAD_DIRECTION', 'Direction must be credit or debit.');
  end if;
  if v_amount <= 0 then
    return public.km_err('BAD_AMOUNT', 'Enter an amount greater than zero.');
  end if;
  -- Money typed by hand is the easiest place to add a zero: cap one movement.
  if v_amount > 1000000000 then
    return public.km_err('AMOUNT_TOO_LARGE', 'A single adjustment cannot exceed 1,000,000,000 UGX.');
  end if;
  if not exists (select 1 from public.km_profile where id = p_user_id) then
    return public.km_err('MEMBER_NOT_FOUND', 'That member is not in the register.');
  end if;

  -- Registration creates the wallet row; this keeps repairs and imports safe.
  insert into public.km_balance (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_balance from public.km_balance where user_id = p_user_id for update;
  if not found then
    return public.km_err('WALLET_MISSING', 'This member has no wallet yet.');
  end if;

  if v_dir = 'debit' and v_balance.available < v_amount then
    return public.km_err(
      'INSUFFICIENT_FUNDS',
      'This wallet only has ' || v_balance.available::text ||
      ' UGX available. Reduce the amount or credit the wallet first.'
    );
  end if;

  v_memo := coalesce(
    nullif(trim(both from coalesce(p_note, '')), ''),
    case when v_dir = 'credit' then 'Manual credit' else 'Manual debit' end
  );
  if v_admin is not null then
    v_memo := v_memo || ' · by ' || v_admin;
  end if;

  update public.km_balance
     set available = available + case when v_dir = 'credit' then v_amount else -v_amount end,
         updated_at = now()
   where user_id = p_user_id
   returning * into v_balance;

  insert into public.km_ledger (user_id, kind, amount, memo)
  values (
    p_user_id,
    case when v_dir = 'credit' then 'admin_credit' else 'admin_debit' end,
    case when v_dir = 'credit' then v_amount else -v_amount end,
    v_memo
  )
  returning id into v_ledger;

  return public.km_ok(jsonb_build_object(
    'ledger_id', v_ledger,
    'direction', v_dir,
    'amount', v_amount,
    'memo', v_memo,
    'available', v_balance.available,
    'invested', v_balance.invested,
    'earned_total', v_balance.earned_total,
    'pending_withdrawal', v_balance.pending_withdrawal
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- Approve = queue only. No money moves here.
--
-- Re-approving an approved request stays a no-op (safe retry), and the first
-- approval is the one that records `approved_by`.
-- -----------------------------------------------------------------------------
drop function if exists public.km_admin_approve_withdrawal(uuid);

create or replace function public.km_admin_approve_withdrawal(p_id uuid, p_admin text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_wd    public.km_withdrawal;
  v_admin text := nullif(trim(both from coalesce(p_admin, '')), '');
begin
  select * into v_wd from public.km_withdrawal where id = p_id for update;
  if not found then
    return public.km_err('WITHDRAWAL_NOT_FOUND', 'Withdrawal not found.');
  end if;
  if v_wd.status not in ('pending', 'approved') then
    return public.km_err('INVALID_STATUS', 'Only pending requests can be approved.');
  end if;

  if v_wd.status = 'pending' then
    update public.km_withdrawal
       set status = 'approved',
           approved_at = now(),
           approved_by = coalesce(v_admin, approved_by)
     where id = p_id
     returning * into v_wd;
  end if;

  return public.km_ok(jsonb_build_object(
    'id', v_wd.id, 'amount', v_wd.amount, 'net', v_wd.net,
    'destination', v_wd.destination, 'reference', v_wd.reference,
    'provider_ref', v_wd.provider_ref, 'status', v_wd.status,
    'approved_at', v_wd.approved_at, 'approved_by', v_wd.approved_by
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- The gateway gate: only an approved, unsent request may be released
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_begin_payout(p_id uuid)
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

  if v_wd.status = 'paid' then
    return public.km_err('ALREADY_PAID', 'This request has already been paid.');
  end if;
  if nullif(trim(both from coalesce(v_wd.provider_ref, '')), '') is not null then
    return public.km_err('PAYOUT_EXISTS', 'This payout was already submitted to the network.');
  end if;
  if v_wd.status in ('rejected', 'failed') then
    return public.km_err('INVALID_STATUS', 'This request is already settled.');
  end if;
  if v_wd.status <> 'approved' then
    return public.km_err('NOT_APPROVED', 'Approve this request before it is sent to the gateway.');
  end if;

  return public.km_ok(jsonb_build_object(
    'id', v_wd.id, 'amount', v_wd.amount, 'net', v_wd.net,
    'destination', v_wd.destination, 'reference', v_wd.reference,
    'status', v_wd.status, 'approved_at', v_wd.approved_at,
    'approved_by', v_wd.approved_by
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- The queue now carries who approved and when (and the member id, so the
-- console can link a row straight to the 360 view)
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
        'id', w.id, 'user_id', w.user_id, 'email', p.email, 'referral_code', p.referral_code,
        'amount', w.amount, 'fee', w.fee, 'net', w.net, 'destination', w.destination,
        'status', w.status, 'reference', w.reference, 'provider_ref', w.provider_ref,
        'failure_reason', w.failure_reason, 'created_at', w.created_at,
        'approved_at', w.approved_at, 'approved_by', w.approved_by
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
-- Privileges: operator functions stay behind the service role
-- -----------------------------------------------------------------------------
revoke all on function public.km_admin_adjust_wallet(uuid, text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.km_admin_begin_payout(uuid) from public, anon, authenticated;
revoke all on function public.km_admin_approve_withdrawal(uuid, text) from public, anon, authenticated;

grant execute on function public.km_admin_adjust_wallet(uuid, text, bigint, text, text) to service_role;
grant execute on function public.km_admin_begin_payout(uuid) to service_role;
grant execute on function public.km_admin_approve_withdrawal(uuid, text) to service_role;

commit;
