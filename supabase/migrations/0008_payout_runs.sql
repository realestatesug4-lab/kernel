-- =============================================================================
-- KernelMiners · 0008 midnight payout runs
--
-- 0006 put every pack on the local-midnight clock and left the sweep guarded by
-- an optional pg_cron job. This migration makes the distribution explicit and
-- auditable:
--
--   * km_payout_run    — one row per sweep (members credited, total credited)
--   * km_payout_tick() — the sweep itself; service_role only, idempotent
--
-- Idempotent by construction: `km_accrue_impl` credits whole elapsed cycles
-- only, so running the tick twice in one day credits nothing the second time.
-- The job can therefore be driven by pg_cron, by the Vercel cron route
-- (/api/cron/accrue at 21:00 UTC = 00:00 EAT), or by both.
--
-- Run order: 0001 → … → 0007 → 0008.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Audit trail for the nightly distribution
-- -----------------------------------------------------------------------------
create table if not exists public.km_payout_run (
  id         bigserial primary key,
  cycle_date date        not null,
  members    int         not null default 0,
  credited   bigint      not null default 0,
  source     text        not null default 'cron',
  ran_at     timestamptz not null default now()
);

create index if not exists km_payout_run_ran_at_idx on public.km_payout_run (ran_at desc);

alter table public.km_payout_run enable row level security;
revoke all on public.km_payout_run from anon, authenticated;
revoke all on sequence public.km_payout_run_id_seq from anon, authenticated;

-- -----------------------------------------------------------------------------
-- The sweep: credit every active pack, then record what it paid out
-- -----------------------------------------------------------------------------
create or replace function public.km_payout_tick(p_source text default 'cron')
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
  v_cycle   date;
  v_source  text := coalesce(nullif(trim(both from coalesce(p_source, '')), ''), 'cron');
begin
  -- Local settlement day: 00:00 EAT starts a new cycle_date.
  v_cycle := (now() at time zone 'Africa/Kampala')::date;

  for v_user in
    select distinct user_id
      from public.km_investment
     where status = 'active'
     order by user_id
  loop
    v_credit := public.km_accrue_impl(v_user);
    if v_credit > 0 then
      v_members := v_members + 1;
      v_total   := v_total + v_credit;
    end if;
  end loop;

  insert into public.km_payout_run (cycle_date, members, credited, source)
  values (v_cycle, v_members, v_total, v_source);

  return public.km_ok(jsonb_build_object(
    'cycle_date', v_cycle,
    'members', v_members,
    'credited', v_total,
    'source', v_source,
    'ran_at', now()
  ));
end;
$$;

revoke all on function public.km_payout_tick(text) from public, anon, authenticated;
grant execute on function public.km_payout_tick(text) to service_role;

-- -----------------------------------------------------------------------------
-- Point pg_cron at the audited sweep (still optional)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'km-midnight-accrual';
    perform cron.schedule(
      'km-midnight-accrual',
      '0 21 * * *',
      'select public.km_payout_tick(''pg_cron'')'
    );
  else
    raise notice 'pg_cron unavailable — the Vercel cron route drives the nightly payout.';
  end if;
exception when others then
  raise notice 'Midnight sweep not scheduled in-database: %', sqlerrm;
end $$;

commit;
