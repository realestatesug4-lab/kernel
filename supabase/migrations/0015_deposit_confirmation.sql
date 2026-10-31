-- =============================================================================
-- KernelMiners · 0015 admin deposit confirmation + deposit metrics
--
--   1. km_admin_confirm_deposit — the console can close a stuck or wrongly
--      failed collection by hand once the admin has seen the money arrive at
--      the operator. This is the deposit twin of the manual payout confirmation
--      in 0014: the admin attests the cash, the function credits the wallet,
--      writes the ledger row, and records who did it.
--
--      Safety: only a `pending`/`failed` deposit can be confirmed, and the
--      credit happens inside the same status flip, so a row can only ever be
--      credited once. km_settle_payment already skips a deposit that is no
--      longer open, so a callback that arrives late after a manual confirmation
--      is a harmless no-op.
--
--   2. km_admin_list_deposits now answers the metrics question directly —
--      per-status counts and sums next to the page of rows — and carries
--      `confirmed_by` so a hand-confirmed deposit is distinguishable from one
--      the gateway settled.
--
--   3. km_admin_list_withdrawals gets its member identity back. 0012 rewrote
--      the function and dropped username / display_name / phone, which left
--      the payouts queue showing raw emails; the console shows name + handle
--      exactly like the deposits queue.
--
-- Idempotent: safe to re-run. Run order: 0001 → … → 0014 → 0015.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Who confirmed a deposit, and is it still recorded when the admin typed it
-- -----------------------------------------------------------------------------
alter table public.km_deposit add column if not exists confirmed_by text;

-- -----------------------------------------------------------------------------
-- 2. Confirm a deposit by hand: credit the wallet, flip the status, log it
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_confirm_deposit(p_id uuid, p_admin text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_dep    public.km_deposit;
  v_admin  text := nullif(trim(both from coalesce(p_admin, '')), '');
  v_memo   text;
begin
  select * into v_dep from public.km_deposit where id = p_id for update;
  if not found then
    return public.km_err('DEPOSIT_NOT_FOUND', 'Deposit not found.');
  end if;

  -- Already closed: re-confirming stays a no-op (safe double-click / retry).
  if v_dep.status = 'confirmed' then
    return public.km_ok(jsonb_build_object(
      'id', v_dep.id, 'status', v_dep.status, 'amount', v_dep.amount,
      'credited', false, 'confirmed_at', v_dep.confirmed_at,
      'confirmed_by', v_dep.confirmed_by
    ));
  end if;
  if v_dep.status not in ('pending', 'failed') then
    return public.km_err('INVALID_STATUS', 'Only open deposits can be confirmed.');
  end if;

  v_memo := 'Mobile money top-up' || case when v_admin is not null then ' · confirmed by ' || v_admin else '' end;

  update public.km_deposit
     set status = 'confirmed',
         confirmed_at = coalesce(confirmed_at, now()),
         confirmed_by = coalesce(v_admin, confirmed_by),
         updated_at = now()
   where id = p_id
   returning * into v_dep;

  -- Registration creates the wallet row; this keeps older/imported members safe.
  insert into public.km_balance (user_id) values (v_dep.user_id)
  on conflict (user_id) do nothing;

  update public.km_balance
     set available = available + v_dep.amount,
         updated_at = now()
   where user_id = v_dep.user_id;

  insert into public.km_ledger (user_id, kind, amount, memo, ref_id)
  values (v_dep.user_id, 'deposit', v_dep.amount, v_memo, v_dep.id);

  return public.km_ok(jsonb_build_object(
    'id', v_dep.id, 'status', v_dep.status, 'amount', v_dep.amount,
    'credited', true, 'confirmed_at', v_dep.confirmed_at,
    'confirmed_by', v_dep.confirmed_by
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. The deposits queue: same rows, plus who confirmed them and the per-status
--    breakdown. The stats ignore the status tab (they describe the whole
--    search result) so the console can show pending/confirmed/failed at a glance.
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_list_deposits(
  p_status text default 'all',
  p_search text default null,
  p_limit  int  default 100,
  p_offset int  default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_status text := coalesce(nullif(trim(coalesce(p_status, '')), ''), 'all');
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_limit  int  := least(greatest(coalesce(p_limit, 100), 1), 300);
  v_offset int  := greatest(coalesce(p_offset, 0), 0);
  v_rows   jsonb;
  v_total  bigint;
  v_stats  jsonb;
begin
  -- Stats + total come from the same filtered set (status filter only affects
  -- the rows and `total`, never the breakdown).
  select count(*) into v_total
    from public.km_deposit d
    join public.km_profile p on p.id = d.user_id
   where (v_status in ('', 'all') or d.status = v_status)
     and (v_search is null
          or p.username ilike '%' || v_search || '%'
          or coalesce(d.reference, '') ilike '%' || v_search || '%'
          or coalesce(d.msisdn, '') ilike '%' || v_search || '%'
          or coalesce(d.provider_ref, '') ilike '%' || v_search || '%');

  select coalesce(
    jsonb_object_agg(
      s.status,
      jsonb_build_object('count', s.entries, 'total', s.amount)
    ),
    '{}'::jsonb
  ) into v_stats
    from (
      select d.status, count(*) as entries, coalesce(sum(d.amount), 0) as amount
        from public.km_deposit d
        join public.km_profile p on p.id = d.user_id
       where (v_search is null
              or p.username ilike '%' || v_search || '%'
              or coalesce(d.reference, '') ilike '%' || v_search || '%'
              or coalesce(d.msisdn, '') ilike '%' || v_search || '%'
              or coalesce(d.provider_ref, '') ilike '%' || v_search || '%')
       group by d.status
    ) s;

  select coalesce(jsonb_agg(s.row_json order by s.created_at desc), '[]'::jsonb) into v_rows
    from (
      select
        jsonb_build_object(
          'id', d.id,
          'reference', d.reference,
          'amount', d.amount,
          'status', d.status,
          'msisdn', d.msisdn,
          'provider_ref', d.provider_ref,
          'created_at', d.created_at,
          'confirmed_at', d.confirmed_at,
          'confirmed_by', d.confirmed_by,
          'user_id', p.id,
          'username', p.username,
          'display_name', p.display_name,
          'phone', p.phone
        ) as row_json,
        d.created_at
        from public.km_deposit d
        join public.km_profile p on p.id = d.user_id
       where (v_status in ('', 'all') or d.status = v_status)
         and (v_search is null
              or p.username ilike '%' || v_search || '%'
              or coalesce(d.reference, '') ilike '%' || v_search || '%'
              or coalesce(d.msisdn, '') ilike '%' || v_search || '%'
              or coalesce(d.provider_ref, '') ilike '%' || v_search || '%')
       order by d.created_at desc
       limit v_limit offset v_offset
    ) s;

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'stats', jsonb_build_object(
      'confirmed', coalesce(v_stats -> 'confirmed', jsonb_build_object('count', 0, 'total', 0)),
      'pending',   coalesce(v_stats -> 'pending',   jsonb_build_object('count', 0, 'total', 0)),
      'failed',    coalesce(v_stats -> 'failed',    jsonb_build_object('count', 0, 'total', 0))
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. The payout queue keeps 0014's extra columns and the member identity
--    (name + handle + number) the console renders in the Member column.
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
        'username', p.username, 'display_name', p.display_name, 'phone', p.phone,
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
revoke all on function public.km_admin_confirm_deposit(uuid, text) from public, anon, authenticated;
grant execute on function public.km_admin_confirm_deposit(uuid, text) to service_role;

commit;
