-- =============================================================================
-- KernelMiners · 0003 read functions
-- Read RPCs return either a raw jsonb array (for list endpoints consumed by
-- `rpcRows`) or a jsonb envelope {ok,data} (for single-object endpoints).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Milestones for a user (used by the dashboard + task center)
-- -----------------------------------------------------------------------------
create or replace function public.km_milestones_json(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_invites int;
  v_out     jsonb;
begin
  select count(*) into v_invites
    from public.km_profile
   where referrer_id = p_user;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'invite_required', m.invite_required,
        'unlock_amount', m.unlock_amount,
        'extra_reward', m.extra_reward,
        'invites', v_invites,
        'unlocked', v_invites >= m.invite_required,
        'claimed', exists (
          select 1 from public.km_claim c
           where c.user_id = p_user and c.milestone_id = m.id
        )
      )
      order by m.invite_required
    ),
    '[]'::jsonb
  )
  into v_out
  from public.km_milestone m;

  return v_out;
end;
$$;

create or replace function public.km_list_milestones()
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
  return public.km_milestones_json(v_user);
end;
$$;

-- -----------------------------------------------------------------------------
-- Dashboard: account + balance + stats + active investments + milestones
-- Accrues first so figures are live on every load.
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
                and created_at >= date_trunc('day', now())
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
-- Catalogue
-- -----------------------------------------------------------------------------
create or replace function public.km_list_products()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.no), '[]'::jsonb)
    from public.km_product p
   where p.active;
$$;

create or replace function public.km_product_detail(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row jsonb;
begin
  select to_jsonb(p) into v_row
    from public.km_product p
   where p.active
     and (p.id::text = p_key or p.no::text = p_key)
   limit 1;

  if v_row is null then
    return public.km_err('PRODUCT_NOT_FOUND', 'That mining pack is no longer available.');
  end if;
  return public.km_ok(v_row);
end;
$$;

-- -----------------------------------------------------------------------------
-- Investments / ledger
-- -----------------------------------------------------------------------------
create or replace function public.km_list_investments()
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

  perform public.km_accrue_impl(v_user);

  return (
    select coalesce(jsonb_agg(to_jsonb(i) order by i.started_at desc), '[]'::jsonb)
      from public.km_investment i
     where i.user_id = v_user
  );
end;
$$;

create or replace function public.km_list_ledger(p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_limit int;
begin
  if v_user is null then
    return '[]'::jsonb;
  end if;

  v_limit := least(greatest(coalesce(p_limit, 100), 1), 500);

  return (
    select coalesce(
      jsonb_agg(t.row_json order by t.created_at desc),
      '[]'::jsonb
    )
    from (
      select l.created_at, to_jsonb(l) as row_json
        from public.km_ledger l
       where l.user_id = v_user
       order by l.created_at desc
       limit v_limit
    ) t
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Team (two levels)
-- -----------------------------------------------------------------------------
create or replace function public.km_team_summary()
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

  return public.km_ok((
    select jsonb_build_object(
      'code', p.referral_code,
      'level1', (select count(*) from public.km_profile where referrer_id = v_user),
      'level2', (select count(*) from public.km_profile where referrer_l2_id = v_user),
      'commission_l1', (
        select coalesce(sum(amount), 0) from public.km_ledger
         where user_id = v_user and kind = 'commission_l1'
      ),
      'commission_l2', (
        select coalesce(sum(amount), 0) from public.km_ledger
         where user_id = v_user and kind = 'commission_l2'
      )
    )
    from public.km_profile p
    where p.id = v_user
  ));
end;
$$;

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
          'label', public.km_mask_email(m.email),
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

-- -----------------------------------------------------------------------------
-- Notices
-- -----------------------------------------------------------------------------
create or replace function public.km_list_notices()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'title', n.title,
        'body', n.body,
        'kind', n.kind,
        'created_at', n.created_at
      )
      order by n.created_at desc
    ),
    '[]'::jsonb
  )
  from public.km_notice n
  where n.published;
$$;

commit;
