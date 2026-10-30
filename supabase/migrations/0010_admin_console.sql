-- =============================================================================
-- 0010 · Admin console
--
-- Everything the operations dashboard reads. Two rules shape this file:
--
--   1. The console never touches tables directly. `/api/admin/*` verifies the
--      caller with `getSessionContext()` (ADMIN_EMAILS or `is_super_admin`)
--      and only then calls these functions with the service-role key.
--   2. Aggregation happens in Postgres. The overview is one round trip, not a
--      dozen table scans in the browser.
--
-- Writes are limited to programme configuration, pack terms, notices and the
-- admin roster. Money movement stays in 0005 (`km_admin_*_withdrawal`), which
-- is already auditable through `km_ledger`.
--
-- Run order: 0001 → … → 0009 → 0010.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Overview: the 360° snapshot — members, money, mining, queue, 14-day series
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_day             timestamptz := public.km_day_start(now());
  v_week            timestamptz := public.km_day_start(now()) - interval '6 days';
  v_month           timestamptz := public.km_day_start(now()) - interval '29 days';
  v_deposits_total  bigint;
  v_payouts_total   bigint;
  v_members         jsonb;
  v_money           jsonb;
  v_mining          jsonb;
  v_queue           jsonb;
  v_series          jsonb;
  v_packs           jsonb;
  v_mix             jsonb;
  v_top             jsonb;
  v_recent          jsonb;
begin
  select coalesce(sum(amount), 0) into v_deposits_total
    from public.km_deposit
   where status = 'confirmed';

  select coalesce(sum(net), 0) into v_payouts_total
    from public.km_withdrawal
   where status = 'paid';

  -- Members ------------------------------------------------------------------
  select jsonb_build_object(
    'total',         (select count(*) from public.km_profile),
    'today',         (select count(*) from public.km_profile where created_at >= v_day),
    'week',          (select count(*) from public.km_profile where created_at >= v_week),
    'month',         (select count(*) from public.km_profile where created_at >= v_month),
    'funded',        (select count(distinct user_id) from public.km_investment),
    'active_miners', (select count(distinct user_id) from public.km_investment where status = 'active'),
    'with_phone',    (select count(*) from public.km_profile where phone is not null),
    'with_pin',      (select count(*) from public.km_profile where pin_hash is not null),
    'admins',        (select count(*) from public.km_profile where is_super_admin)
  ) into v_members;

  -- Money --------------------------------------------------------------------
  select jsonb_build_object(
    'deposits_total',   v_deposits_total,
    'deposits_today',   (select coalesce(sum(amount), 0) from public.km_deposit
                          where status = 'confirmed' and coalesce(confirmed_at, created_at) >= v_day),
    'deposits_pending', (select count(*) from public.km_deposit where status = 'pending'),
    'payouts_total',    v_payouts_total,
    'payouts_today',    (select coalesce(sum(net), 0) from public.km_withdrawal
                          where status = 'paid' and coalesce(processed_at, created_at) >= v_day),
    'payout_fees',      (select coalesce(sum(fee), 0) from public.km_withdrawal where status = 'paid'),
    'rewards_total',    (select coalesce(sum(amount), 0) from public.km_ledger
                          where kind in ('daily_reward', 'commission_l1', 'commission_l2',
                                         'task_reward', 'bonus')),
    'rewards_today',    (select coalesce(sum(amount), 0) from public.km_ledger
                          where kind in ('daily_reward', 'commission_l1', 'commission_l2',
                                         'task_reward', 'bonus')
                            and created_at >= v_day),
    'invested_total',   (select coalesce(sum(amount), 0) from public.km_investment),
    'wallet_available', (select coalesce(sum(available), 0) from public.km_balance),
    'wallet_invested',  (select coalesce(sum(invested), 0) from public.km_balance),
    'wallet_earned',    (select coalesce(sum(earned_total), 0) from public.km_balance),
    'wallet_pending',   (select coalesce(sum(pending_withdrawal), 0) from public.km_balance),
    'net_flow',         v_deposits_total - v_payouts_total
  ) into v_money;

  -- Mining -------------------------------------------------------------------
  select jsonb_build_object(
    'active_packs',    (select count(*) from public.km_investment where status = 'active'),
    'active_principal',(select coalesce(sum(amount), 0) from public.km_investment where status = 'active'),
    'completed_packs', (select count(*) from public.km_investment where status = 'completed'),
    'packs_sold',      (select count(*) from public.km_investment),
    -- What the platform owes at the next midnight for packs still running.
    'daily_obligation',(select coalesce(sum(daily), 0) from public.km_investment where status = 'active'),
    'avg_yield_pct',   (select coalesce(round(avg(daily * 100.0 / nullif(amount, 0)), 1), 0)
                          from public.km_investment)
  ) into v_mining;

  -- Work queue ---------------------------------------------------------------
  select jsonb_build_object(
    'withdrawals_pending', (select count(*) from public.km_withdrawal where status in ('pending', 'approved')),
    'withdrawals_amount',  (select coalesce(sum(amount), 0) from public.km_withdrawal where status in ('pending', 'approved')),
    'payout_failed_7d',    (select count(*) from public.km_withdrawal
                             where status = 'failed' and created_at >= now() - interval '7 days'),
    'deposits_pending',    (select count(*) from public.km_deposit where status = 'pending'),
    'pack_accrual_due',    (select count(*) from public.km_investment
                             where status = 'active'
                               and public.km_payout_cycles(started_at) > paid_cycles)
  ) into v_queue;

  -- 14-day series (signups, deposits, rewards, payouts) -----------------------
  select coalesce(jsonb_agg(s.row_json order by s.day), '[]'::jsonb) into v_series
    from (
      select
        d as day,
        jsonb_build_object(
          'day', to_char(d, 'YYYY-MM-DD'),
          'signups', (select count(*) from public.km_profile p
                       where p.created_at >= d and p.created_at < d + interval '1 day'),
          'deposits', (select coalesce(sum(amount), 0) from public.km_deposit
                        where status = 'confirmed'
                          and coalesce(confirmed_at, created_at) >= d
                          and coalesce(confirmed_at, created_at) < d + interval '1 day'),
          'rewards', (select coalesce(sum(amount), 0) from public.km_ledger
                       where kind in ('daily_reward', 'commission_l1', 'commission_l2',
                                      'task_reward', 'bonus')
                         and created_at >= d and created_at < d + interval '1 day'),
          'payouts', (select coalesce(sum(net), 0) from public.km_withdrawal
                       where status = 'paid'
                         and coalesce(processed_at, created_at) >= d
                         and coalesce(processed_at, created_at) < d + interval '1 day'),
          'invested', (select coalesce(sum(amount), 0) from public.km_investment
                        where started_at >= d and started_at < d + interval '1 day')
        ) as row_json
        from generate_series(v_day - interval '13 days', v_day, interval '1 day') as d
    ) s;

  -- Pack performance ---------------------------------------------------------
  select coalesce(jsonb_agg(s.row_json order by s.revenue desc), '[]'::jsonb) into v_packs
    from (
      select
        jsonb_build_object(
          'id', p.id, 'no', p.no, 'name', p.name, 'tier', p.tier,
          'price', p.price, 'daily', p.daily, 'duration_days', p.duration_days,
          'active', p.active,
          'purchases', (select count(*) from public.km_investment i where i.product_id = p.id),
          'revenue',   (select coalesce(sum(amount), 0) from public.km_investment i where i.product_id = p.id),
          'running',   (select count(*) from public.km_investment i
                         where i.product_id = p.id and status = 'active')
        ) as row_json,
        (select coalesce(sum(amount), 0) from public.km_investment i where i.product_id = p.id) as revenue
        from public.km_product p
    ) s;

  -- Ledger mix over 30 days --------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object('kind', k.kind, 'total', k.total, 'entries', k.n)
                            order by k.total desc), '[]'::jsonb)
    into v_mix
    from (
      select kind, sum(amount) as total, count(*) as n
        from public.km_ledger
       where created_at >= v_month
       group by kind
    ) k;

  -- Top earners --------------------------------------------------------------
  select coalesce(jsonb_agg(s.row_json order by s.earned_total desc), '[]'::jsonb) into v_top
    from (
      select
        jsonb_build_object(
          'id', p.id, 'username', p.username, 'display_name', p.display_name,
          'available', coalesce(b.available, 0),
          'invested', coalesce(b.invested, 0),
          'earned', coalesce(b.earned_total, 0),
          'packs', (select count(*) from public.km_investment i where i.user_id = p.id)
        ) as row_json,
        coalesce(b.earned_total, 0) as earned_total
        from public.km_profile p
        left join public.km_balance b on b.user_id = p.id
       order by coalesce(b.earned_total, 0) desc
       limit 6
    ) s;

  -- Recent activity ----------------------------------------------------------
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'kind', s.kind, 'at', s.happened_at, 'actor', s.actor,
               'amount', s.amount, 'memo', s.memo
             ) order by s.happened_at desc
           ),
           '[]'::jsonb
         )
    into v_recent
    from (
      select * from (
        (select 'signup'::text as kind, p.created_at as happened_at, p.username as actor,
                0::bigint as amount, 'New member joined'::text as memo
           from public.km_profile p
          order by p.created_at desc
          limit 8)
        union all
        (select 'deposit'::text, coalesce(d.confirmed_at, d.created_at), p.username,
                d.amount, 'Mobile-money deposit'::text
           from public.km_deposit d
           join public.km_profile p on p.id = d.user_id
          where d.status = 'confirmed'
          order by coalesce(d.confirmed_at, d.created_at) desc
          limit 8)
        union all
        (select 'withdrawal'::text, w.created_at, p.username, w.amount,
                'Withdrawal · ' || w.status
           from public.km_withdrawal w
           join public.km_profile p on p.id = w.user_id
          order by w.created_at desc
          limit 8)
        union all
        (select 'investment'::text, i.started_at, p.username, i.amount, i.product_name
           from public.km_investment i
           join public.km_profile p on p.id = i.user_id
          order by i.started_at desc
          limit 8)
      ) u
      order by happened_at desc
      limit 14
    ) s;

  return jsonb_build_object(
    'generated_at', now(),
    'members', v_members,
    'money', v_money,
    'mining', v_mining,
    'queue', v_queue,
    'series', v_series,
    'packs', v_packs,
    'mix', v_mix,
    'top', v_top,
    'recent', v_recent
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Member register: searchable, sortable, paginated
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_list_members(
  p_search text default null,
  p_sort   text default 'newest',
  p_limit  int  default 50,
  p_offset int  default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_sort   text := coalesce(nullif(trim(coalesce(p_sort, '')), ''), 'newest');
  v_limit  int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int  := greatest(coalesce(p_offset, 0), 0);
  v_rows   jsonb;
  v_total  bigint;
begin
  select count(*) into v_total
    from public.km_profile p
   where v_search is null
      or p.username ilike '%' || v_search || '%'
      or coalesce(p.display_name, '') ilike '%' || v_search || '%'
      or coalesce(p.phone, '') ilike '%' || v_search || '%'
      or coalesce(p.email, '') ilike '%' || v_search || '%'
      or upper(p.referral_code) = upper(v_search);

  select coalesce(jsonb_agg(s.row_json order by s.invested desc, s.created_at desc), '[]'::jsonb)
    into v_rows
    from (
      select
        jsonb_build_object(
          'id', p.id,
          'username', p.username,
          'display_name', p.display_name,
          'phone', p.phone,
          'email', p.email,
          'referral_code', p.referral_code,
          'created_at', p.created_at,
          'is_super_admin', p.is_super_admin,
          'has_pin', (p.pin_hash is not null),
          'available', coalesce(b.available, 0),
          'invested', coalesce(b.invested, 0),
          'earned', coalesce(b.earned_total, 0),
          'pending_withdrawal', coalesce(b.pending_withdrawal, 0),
          'active_packs', (select count(*) from public.km_investment i
                            where i.user_id = p.id and i.status = 'active'),
          'total_packs', (select count(*) from public.km_investment i where i.user_id = p.id),
          'invite_l1', (select count(*) from public.km_profile r where r.referrer_id = p.id),
          'invite_l2', (select count(*) from public.km_profile r where r.referrer_l2_id = p.id),
          'last_activity', (select max(l.created_at) from public.km_ledger l where l.user_id = p.id)
        ) as row_json,
        coalesce(b.invested, 0) as invested,
        p.created_at as created_at,
        coalesce(b.earned_total, 0) as earned,
        coalesce(b.available, 0) as available
        from public.km_profile p
        left join public.km_balance b on b.user_id = p.id
       where v_search is null
          or p.username ilike '%' || v_search || '%'
          or coalesce(p.display_name, '') ilike '%' || v_search || '%'
          or coalesce(p.phone, '') ilike '%' || v_search || '%'
          or coalesce(p.email, '') ilike '%' || v_search || '%'
          or upper(p.referral_code) = upper(v_search)
       order by
         case when v_sort = 'earned' then coalesce(b.earned_total, 0) else 0 end desc,
         case when v_sort = 'balance' then coalesce(b.available, 0) else 0 end desc,
         case when v_sort = 'invested' then coalesce(b.invested, 0) else 0 end desc,
         case when v_sort = 'newest' then p.created_at else now() end desc,
         case when v_sort = 'oldest' then p.created_at else now() end asc
       limit v_limit offset v_offset
    ) s;

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'sort', v_sort
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- One member, in full (the drill-down behind every list)
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
-- Deposits: every collection, with the member attached
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
begin
  select count(*) into v_total
    from public.km_deposit d
    join public.km_profile p on p.id = d.user_id
   where (v_status in ('', 'all') or d.status = v_status)
     and (v_search is null
          or p.username ilike '%' || v_search || '%'
          or coalesce(d.reference, '') ilike '%' || v_search || '%'
          or coalesce(d.msisdn, '') ilike '%' || v_search || '%'
          or coalesce(d.provider_ref, '') ilike '%' || v_search || '%');

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

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

-- -----------------------------------------------------------------------------
-- Mining packs in circulation
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_list_investments(
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
begin
  select count(*) into v_total
    from public.km_investment i
    join public.km_profile p on p.id = i.user_id
   where (v_status in ('', 'all') or i.status = v_status)
     and (v_search is null
          or p.username ilike '%' || v_search || '%'
          or i.product_name ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(s.row_json order by s.started_at desc), '[]'::jsonb) into v_rows
    from (
      select
        jsonb_build_object(
          'id', i.id,
          'user_id', p.id,
          'username', p.username,
          'display_name', p.display_name,
          'product_name', i.product_name,
          'product_no', i.product_no,
          'amount', i.amount,
          'daily', i.daily,
          'duration_days', i.duration_days,
          'paid_cycles', i.paid_cycles,
          'earned', i.earned,
          'status', i.status,
          'started_at', i.started_at,
          'ends_at', i.ends_at
        ) as row_json,
        i.started_at
        from public.km_investment i
        join public.km_profile p on p.id = i.user_id
       where (v_status in ('', 'all') or i.status = v_status)
         and (v_search is null
              or p.username ilike '%' || v_search || '%'
              or i.product_name ilike '%' || v_search || '%')
       order by i.started_at desc
       limit v_limit offset v_offset
    ) s;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

-- -----------------------------------------------------------------------------
-- Ledger: the money trail across every wallet
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_list_ledger(
  p_kind   text default 'all',
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
  v_kind   text := coalesce(nullif(trim(coalesce(p_kind, '')), ''), 'all');
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_limit  int  := least(greatest(coalesce(p_limit, 100), 1), 300);
  v_offset int  := greatest(coalesce(p_offset, 0), 0);
  v_rows   jsonb;
  v_total  bigint;
begin
  select count(*) into v_total
    from public.km_ledger l
    join public.km_profile p on p.id = l.user_id
   where (v_kind in ('', 'all') or l.kind = v_kind)
     and (v_search is null
          or p.username ilike '%' || v_search || '%'
          or coalesce(l.memo, '') ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(s.row_json order by s.created_at desc), '[]'::jsonb) into v_rows
    from (
      select
        jsonb_build_object(
          'id', l.id,
          'user_id', p.id,
          'username', p.username,
          'display_name', p.display_name,
          'kind', l.kind,
          'amount', l.amount,
          'memo', l.memo,
          'ref_id', l.ref_id,
          'created_at', l.created_at
        ) as row_json,
        l.created_at
        from public.km_ledger l
        join public.km_profile p on p.id = l.user_id
       where (v_kind in ('', 'all') or l.kind = v_kind)
         and (v_search is null
              or p.username ilike '%' || v_search || '%'
              or coalesce(l.memo, '') ilike '%' || v_search || '%')
       order by l.created_at desc
       limit v_limit offset v_offset
    ) s;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

-- -----------------------------------------------------------------------------
-- Pack catalogue: reads every pack (including retired), plus sales figures
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_list_products()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  return (
    select coalesce(jsonb_agg(s.row_json order by s.no), '[]'::jsonb)
      from (
        select
          jsonb_build_object(
            'id', p.id, 'no', p.no, 'name', p.name, 'tier', p.tier,
            'price', p.price, 'daily', p.daily, 'duration_days', p.duration_days,
            'total', p.total, 'image', p.image, 'active', p.active,
            'purchases', (select count(*) from public.km_investment i where i.product_id = p.id),
            'running',   (select count(*) from public.km_investment i
                           where i.product_id = p.id and status = 'active'),
            'revenue',   (select coalesce(sum(amount), 0) from public.km_investment i where i.product_id = p.id),
            'yield_pct', case when p.price > 0 then round(p.total * 100.0 / p.price, 1) else 0 end
          ) as row_json,
          p.no
          from public.km_product p
      ) s
  );
end;
$$;

-- Editing terms only affects packs sold from now on: `km_investment` copies
-- price/daily/duration at purchase time, so live contracts never change.
create or replace function public.km_admin_update_product(
  p_id            uuid,
  p_price         bigint  default null,
  p_daily         bigint  default null,
  p_duration_days int     default null,
  p_total         bigint  default null,
  p_active        boolean default null,
  p_name          text    default null,
  p_tier          text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row public.km_product;
begin
  select * into v_row from public.km_product where id = p_id for update;
  if not found then
    return public.km_err('PRODUCT_NOT_FOUND', 'That mining pack does not exist.');
  end if;

  if p_price is not null and p_price <= 0 then
    return public.km_err('INVALID_PRICE', 'The pack price must be greater than zero.');
  end if;
  if p_daily is not null and p_daily <= 0 then
    return public.km_err('INVALID_DAILY', 'The daily payout must be greater than zero.');
  end if;
  if p_duration_days is not null and p_duration_days <= 0 then
    return public.km_err('INVALID_DURATION', 'The duration must be at least one day.');
  end if;

  update public.km_product
     set price         = coalesce(p_price, price),
         daily         = coalesce(p_daily, daily),
         duration_days = coalesce(p_duration_days, duration_days),
         -- Keep the advertised total consistent when daily/duration moved
         -- without an explicit total being supplied.
         total         = coalesce(
                           p_total,
                           coalesce(p_daily, daily) * coalesce(p_duration_days, duration_days)
                         ),
         active        = coalesce(p_active, active),
         name          = coalesce(nullif(trim(p_name), ''), name),
         tier          = coalesce(nullif(trim(p_tier), ''), tier)
   where id = p_id
   returning * into v_row;

  return public.km_ok(to_jsonb(v_row));
end;
$$;

-- -----------------------------------------------------------------------------
-- Notices
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_list_notices()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  return (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'id', n.id, 'title', n.title, 'body', n.body, 'kind', n.kind,
        'published', n.published, 'created_at', n.created_at
      ) order by n.created_at desc),
      '[]'::jsonb
    )
    from public.km_notice n
  );
end;
$$;

create or replace function public.km_admin_save_notice(
  p_id        uuid    default null,
  p_title     text    default null,
  p_body      text    default null,
  p_kind      text    default 'system',
  p_published boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row public.km_notice;
begin
  if nullif(trim(coalesce(p_title, '')), '') is null then
    return public.km_err('TITLE_REQUIRED', 'Give the notice a title.');
  end if;
  if nullif(trim(coalesce(p_body, '')), '') is null then
    return public.km_err('BODY_REQUIRED', 'Give the notice some text.');
  end if;

  if p_id is null then
    insert into public.km_notice (title, body, kind, published)
    values (trim(p_title), trim(p_body), coalesce(nullif(trim(p_kind), ''), 'system'), coalesce(p_published, true))
    returning * into v_row;
  else
    update public.km_notice
       set title     = trim(p_title),
           body      = trim(p_body),
           kind      = coalesce(nullif(trim(p_kind), ''), kind),
           published = coalesce(p_published, published)
     where id = p_id
     returning * into v_row;

    if v_row.id is null then
      return public.km_err('NOTICE_NOT_FOUND', 'That notice no longer exists.');
    end if;
  end if;

  return public.km_ok(to_jsonb(v_row));
end;
$$;

create or replace function public.km_admin_delete_notice(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  delete from public.km_notice where id = p_id;
  if not found then
    return public.km_err('NOTICE_NOT_FOUND', 'That notice no longer exists.');
  end if;
  return public.km_ok(jsonb_build_object('id', p_id));
end;
$$;

-- -----------------------------------------------------------------------------
-- Programme rules: read + edit the same numbers the app enforces
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_list_config()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  return (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'key', c.key, 'value', c.value, 'note', c.note, 'updated_at', c.updated_at
      ) order by c.key),
      '[]'::jsonb
    )
    from public.km_config c
  );
end;
$$;

create or replace function public.km_admin_set_config(p_key text, p_value bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row public.km_config;
begin
  if p_value is null or p_value < 0 then
    return public.km_err('INVALID_VALUE', 'Enter a value of zero or more.');
  end if;

  update public.km_config
     set value = p_value, updated_at = now()
   where key = p_key
   returning * into v_row;

  if v_row.key is null then
    return public.km_err('UNKNOWN_RULE', 'That programme rule does not exist.');
  end if;

  return public.km_ok(to_jsonb(v_row));
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin roster. Promotion is a service-role action driven from the console;
-- `km_set_super_admin()` stays the SQL-editor equivalent.
-- -----------------------------------------------------------------------------
create or replace function public.km_admin_list_admins()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  return (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'id', p.id, 'username', p.username, 'display_name', p.display_name,
        'email', p.email, 'created_at', p.created_at, 'is_super_admin', p.is_super_admin
      ) order by p.username),
      '[]'::jsonb
    )
    from public.km_profile p
    where p.is_super_admin
  );
end;
$$;

create or replace function public.km_admin_set_admin(
  p_username text,
  p_enabled  boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_username text := public.km_normalize_username(p_username);
  v_enabled  boolean := coalesce(p_enabled, true);
  v_target   public.km_profile;
  v_remaining int;
begin
  if v_username is null then
    return public.km_err('INVALID_USERNAME', 'Enter the username to promote.');
  end if;

  select * into v_target from public.km_profile where username = v_username;
  if not found then
    return public.km_err('NO_SUCH_USER', format('No member is registered as "%s".', v_username));
  end if;

  -- Never leave the console without an administrator.
  if v_target.is_super_admin and not v_enabled then
    select count(*) into v_remaining from public.km_profile where is_super_admin;
    if v_remaining <= 1 then
      return public.km_err(
        'LAST_ADMIN',
        'This is the last admin account. Promote somebody else before demoting it.'
      );
    end if;
  end if;

  update public.km_profile set is_super_admin = v_enabled where id = v_target.id;

  return public.km_ok(jsonb_build_object(
    'username', v_target.username,
    'display_name', v_target.display_name,
    'is_super_admin', v_enabled
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- Payout queue: same contract as 0007, plus `user_id` so the console can open
-- the member behind a request.
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
        'id', w.id,
        'user_id', p.id,
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
-- Privileges: service_role only. The `/api/admin/*` handlers authenticate the
-- caller before they ever touch these functions.
-- -----------------------------------------------------------------------------
revoke all on function public.km_admin_overview() from public, anon, authenticated;
revoke all on function public.km_admin_list_members(text, text, int, int) from public, anon, authenticated;
revoke all on function public.km_admin_member_detail(uuid) from public, anon, authenticated;
revoke all on function public.km_admin_list_deposits(text, text, int, int) from public, anon, authenticated;
revoke all on function public.km_admin_list_investments(text, text, int, int) from public, anon, authenticated;
revoke all on function public.km_admin_list_ledger(text, text, int, int) from public, anon, authenticated;
revoke all on function public.km_admin_list_products() from public, anon, authenticated;
revoke all on function public.km_admin_update_product(uuid, bigint, bigint, int, bigint, boolean, text, text) from public, anon, authenticated;
revoke all on function public.km_admin_list_notices() from public, anon, authenticated;
revoke all on function public.km_admin_save_notice(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.km_admin_delete_notice(uuid) from public, anon, authenticated;
revoke all on function public.km_admin_list_config() from public, anon, authenticated;
revoke all on function public.km_admin_set_config(text, bigint) from public, anon, authenticated;
revoke all on function public.km_admin_list_admins() from public, anon, authenticated;
revoke all on function public.km_admin_set_admin(text, boolean) from public, anon, authenticated;

grant execute on function public.km_admin_overview() to service_role;
grant execute on function public.km_admin_list_members(text, text, int, int) to service_role;
grant execute on function public.km_admin_member_detail(uuid) to service_role;
grant execute on function public.km_admin_list_deposits(text, text, int, int) to service_role;
grant execute on function public.km_admin_list_investments(text, text, int, int) to service_role;
grant execute on function public.km_admin_list_ledger(text, text, int, int) to service_role;
grant execute on function public.km_admin_list_products() to service_role;
grant execute on function public.km_admin_update_product(uuid, bigint, bigint, int, bigint, boolean, text, text) to service_role;
grant execute on function public.km_admin_list_notices() to service_role;
grant execute on function public.km_admin_save_notice(uuid, text, text, text, boolean) to service_role;
grant execute on function public.km_admin_delete_notice(uuid) to service_role;
grant execute on function public.km_admin_list_config() to service_role;
grant execute on function public.km_admin_set_config(text, bigint) to service_role;
grant execute on function public.km_admin_list_admins() to service_role;
grant execute on function public.km_admin_set_admin(text, boolean) to service_role;

-- 0009 revoked every grant including the service role's, which made the
-- documented SQL-editor promotion path unusable from the API. Restore it.
grant execute on function public.km_set_super_admin(text, boolean) to service_role;

commit;
