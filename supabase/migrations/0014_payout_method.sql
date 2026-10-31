-- =============================================================================
-- KernelMiners · 0014 payout method at approval + minimum withdrawal 5,000
--
--   1. The admin chooses HOW a withdrawal is paid at the moment of approval:
--        manual — the admin sends the mobile money themselves and then
--                 confirms the payout on the console (km_admin_settle_manual_payout)
--        api    — the route handler pushes the payout through SHASHURA
--      The stored method locks the second step: a `manual` request can never
--      be released to the gateway and a `api` request can never be settled by
--      hand, so one approval cannot produce two payouts.
--
--   2. Minimum withdrawal goes back to 5,000 UGX (0013 had raised it to 10,000).
--
-- Idempotent: safe to re-run. Restates the 0012 functions with the new step.
-- Run order: 0001 → … → 0013 → 0014.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. How the payout is delivered, and who confirmed a manual one
-- -----------------------------------------------------------------------------
alter table public.km_withdrawal add column if not exists payout_method text;
alter table public.km_withdrawal add column if not exists paid_by text;

alter table public.km_withdrawal drop constraint if exists km_withdrawal_payout_method_check;
alter table public.km_withdrawal add constraint km_withdrawal_payout_method_check
  check (payout_method is null or payout_method in ('manual', 'api'));

-- -----------------------------------------------------------------------------
-- 2. Minimum withdrawal: 5,000 UGX
--    km_request_withdrawal reads the floor through km_rule('min_withdrawal', …).
-- -----------------------------------------------------------------------------
insert into public.km_config (key, value, note) values
  ('min_withdrawal', 5000, 'Smallest withdrawal request')
on conflict (key) do update
  set value      = excluded.value,
      note       = excluded.note,
      updated_at = now();

-- -----------------------------------------------------------------------------
-- 3. Approve = queue only, and it now records the chosen payout method
--
--    The method is mandatory. Re-approving an approved request stays a no-op
--    (safe retry) and keeps the method recorded by the first approval.
-- -----------------------------------------------------------------------------
drop function if exists public.km_admin_approve_withdrawal(uuid, text);

create or replace function public.km_admin_approve_withdrawal(
  p_id     uuid,
  p_admin  text default null,
  p_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_wd    public.km_withdrawal;
  v_admin  text := nullif(trim(both from coalesce(p_admin, '')), '');
  v_method text := lower(trim(both from coalesce(p_method, '')));
begin
  if v_method not in ('manual', 'api') then
    return public.km_err('BAD_METHOD', 'Payout method must be manual or api.');
  end if;

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
           approved_by = coalesce(v_admin, approved_by),
           payout_method = v_method
     where id = p_id
     returning * into v_wd;
  elsif v_wd.payout_method is null then
    -- Requests approved before 0014: the retry backfills the method.
    update public.km_withdrawal
       set payout_method = v_method
     where id = p_id
     returning * into v_wd;
  end if;

  return public.km_ok(jsonb_build_object(
    'id', v_wd.id, 'amount', v_wd.amount, 'net', v_wd.net,
    'destination', v_wd.destination, 'reference', v_wd.reference,
    'provider_ref', v_wd.provider_ref, 'status', v_wd.status,
    'payout_method', v_wd.payout_method,
    'approved_at', v_wd.approved_at, 'approved_by', v_wd.approved_by
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. The gateway gate: only an approved, unsent *api* request may be released
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
  if v_wd.payout_method = 'manual' then
    return public.km_err('MANUAL_METHOD', 'This request was approved as a manual payout — confirm it by hand instead.');
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
-- 5. Confirming a manual payout
--
--    The admin has already moved the money outside the platform. This closes
--    the request like km_admin_mark_withdrawal_paid does, but only for an
--    approved `manual` request that has never touched the gateway, and it
--    records who confirmed it.
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_settle_manual_payout(p_id uuid, p_admin text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_wd   public.km_withdrawal;
  v_admin text := nullif(trim(both from coalesce(p_admin, '')), '');
begin
  select * into v_wd from public.km_withdrawal where id = p_id for update;
  if not found then
    return public.km_err('WITHDRAWAL_NOT_FOUND', 'Withdrawal not found.');
  end if;
  if v_wd.status <> 'approved' then
    return public.km_err('INVALID_STATUS', 'Only approved requests can be confirmed as paid.');
  end if;
  if v_wd.payout_method <> 'manual' then
    return public.km_err('NOT_MANUAL', 'This request is not a manual payout.');
  end if;
  if nullif(trim(both from coalesce(v_wd.provider_ref, '')), '') is not null then
    return public.km_err('PAYOUT_EXISTS', 'This payout was already submitted to the network.');
  end if;

  update public.km_withdrawal
     set status = 'paid',
         provider_ref = 'MANUAL',
         paid_by = coalesce(v_admin, paid_by),
         processed_at = now()
   where id = p_id
   returning * into v_wd;

  -- The hold is consumed: the money left the wallet when the member requested.
  update public.km_balance
     set pending_withdrawal = greatest(0, pending_withdrawal - v_wd.amount),
         updated_at = now()
   where user_id = v_wd.user_id;

  return public.km_ok(jsonb_build_object('id', v_wd.id, 'status', 'paid', 'paid_by', v_wd.paid_by));
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. The queue now also carries the payout method and who confirmed a manual one
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
        'approved_at', w.approved_at, 'approved_by', w.approved_by,
        'payout_method', w.payout_method, 'paid_by', w.paid_by
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
revoke all on function public.km_admin_approve_withdrawal(uuid, text, text) from public, anon, authenticated;
revoke all on function public.km_admin_settle_manual_payout(uuid, text) from public, anon, authenticated;

grant execute on function public.km_admin_approve_withdrawal(uuid, text, text) to service_role;
grant execute on function public.km_admin_settle_manual_payout(uuid, text) to service_role;

commit;
