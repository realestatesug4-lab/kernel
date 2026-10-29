-- =============================================================================
-- KernelMiners · 0001 schema
-- Single-currency (UGX) mining programme: profiles, balances, mining packs,
-- investments, ledger, invite milestones, withdrawals and notices.
--
-- All reads/writes go through SECURITY DEFINER functions in 0002/0003.
-- Tables are locked down: RLS on, no policies, no direct grants.
-- Run order: 0001 → 0002 → 0003 → 0004.
-- =============================================================================

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users) + two-level referral chain
-- -----------------------------------------------------------------------------
create table if not exists public.km_profile (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text,
  display_name   text,
  referral_code  text not null unique,
  referrer_id    uuid references public.km_profile (id) on delete set null,
  referrer_l2_id uuid references public.km_profile (id) on delete set null,
  pin_hash       text,
  locale         text not null default 'en',
  created_at     timestamptz not null default now()
);

create index if not exists km_profile_referrer_idx on public.km_profile (referrer_id);
create index if not exists km_profile_referrer_l2_idx on public.km_profile (referrer_l2_id);

-- -----------------------------------------------------------------------------
-- Wallet (single UGX balance; `invested` = principal locked in active packs)
-- -----------------------------------------------------------------------------
create table if not exists public.km_balance (
  user_id            uuid primary key references public.km_profile (id) on delete cascade,
  available          bigint not null default 0 check (available >= 0),
  invested           bigint not null default 0 check (invested >= 0),
  earned_total       bigint not null default 0 check (earned_total >= 0),
  pending_withdrawal bigint not null default 0 check (pending_withdrawal >= 0),
  updated_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Mining packs (the earnings table)
-- -----------------------------------------------------------------------------
create table if not exists public.km_product (
  id            uuid primary key default gen_random_uuid(),
  no            int not null unique check (no > 0),
  name          text not null,
  tier          text not null default 'Standard',
  price         bigint not null check (price > 0),
  daily         bigint not null check (daily > 0),
  duration_days int not null check (duration_days > 0),
  total         bigint not null check (total > 0),
  image         text not null default '/assets/product_image.jpg',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Investments: one row per purchased pack, accruing once per 24h cycle
-- -----------------------------------------------------------------------------
create table if not exists public.km_investment (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.km_profile (id) on delete cascade,
  product_id    uuid references public.km_product (id) on delete set null,
  product_name  text not null,
  product_no    int not null,
  amount        bigint not null check (amount > 0),
  daily         bigint not null check (daily > 0),
  duration_days int not null check (duration_days > 0),
  started_at    timestamptz not null default now(),
  ends_at       timestamptz not null,
  paid_cycles   int not null default 0 check (paid_cycles >= 0),
  earned        bigint not null default 0 check (earned >= 0),
  status        text not null default 'active' check (status in ('active', 'completed')),
  created_at    timestamptz not null default now(),
  check (ends_at > started_at)
);

create index if not exists km_investment_user_idx on public.km_investment (user_id, status);
create index if not exists km_investment_accrue_idx on public.km_investment (status, ends_at);

-- -----------------------------------------------------------------------------
-- Ledger (append-only, signed amounts)
-- -----------------------------------------------------------------------------
create table if not exists public.km_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.km_profile (id) on delete cascade,
  kind       text not null check (kind in (
               'deposit', 'investment', 'daily_reward', 'commission_l1',
               'commission_l2', 'task_reward', 'investment_return',
               'withdrawal', 'transfer_in', 'transfer_out', 'bonus'
             )),
  amount     bigint not null,
  memo       text,
  ref_id     uuid,
  created_at timestamptz not null default now()
);

create index if not exists km_ledger_user_idx on public.km_ledger (user_id, created_at desc);
create index if not exists km_ledger_kind_idx on public.km_ledger (user_id, kind);
create index if not exists km_ledger_ref_idx on public.km_ledger (ref_id);

-- -----------------------------------------------------------------------------
-- Deposits (credited instantly in demo mode)
-- -----------------------------------------------------------------------------
create table if not exists public.km_deposit (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.km_profile (id) on delete cascade,
  amount     bigint not null check (amount > 0),
  status     text not null default 'confirmed' check (status in ('pending', 'confirmed', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists km_deposit_user_idx on public.km_deposit (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Invite milestones (task center) + one claim per user per milestone
-- -----------------------------------------------------------------------------
create table if not exists public.km_milestone (
  id             uuid primary key default gen_random_uuid(),
  invite_required int not null unique check (invite_required > 0),
  unlock_amount  bigint not null check (unlock_amount >= 0),
  extra_reward   bigint not null check (extra_reward >= 0),
  sort           int not null default 0
);

create table if not exists public.km_claim (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.km_profile (id) on delete cascade,
  milestone_id uuid not null references public.km_milestone (id) on delete cascade,
  reward       bigint not null check (reward >= 0),
  created_at   timestamptz not null default now(),
  unique (user_id, milestone_id)
);

-- -----------------------------------------------------------------------------
-- Withdrawal requests
-- -----------------------------------------------------------------------------
create table if not exists public.km_withdrawal (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.km_profile (id) on delete cascade,
  amount       bigint not null check (amount > 0),
  fee          bigint not null default 0 check (fee >= 0),
  net          bigint not null check (net >= 0),
  destination  text not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected')),
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists km_withdrawal_user_idx on public.km_withdrawal (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Notices
-- -----------------------------------------------------------------------------
create table if not exists public.km_notice (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  kind       text not null default 'system',
  published  boolean not null default true,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Lock down direct table access: RLS on, no policies, revoke grants.
-- Everything flows through the RPC surface.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'km_profile', 'km_balance', 'km_product', 'km_investment', 'km_ledger',
    'km_deposit', 'km_milestone', 'km_claim', 'km_withdrawal', 'km_notice'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

commit;
