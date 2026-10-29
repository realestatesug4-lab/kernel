-- =============================================================================
-- KernelMiners · 0004 seed data
-- Mirrors `src/lib/brand.ts` (products, milestones) and seeds the notice feed.
-- Idempotent: safe to re-run.
-- =============================================================================

begin;

insert into public.km_product (no, name, tier, price, daily, duration_days, total, image, active)
values
  (1, 'KMA1', 'Entry',  30000,  8000,  6,  48000, '/assets/product_image.jpg', true),
  (2, 'KMA2', 'Growth', 50000, 10000,  8,  80000, '/assets/product_image.jpg', true),
  (3, 'KMA3', 'Growth', 80000, 15000, 10, 150000, '/assets/product_image.jpg', true),
  (4, 'KMA4', 'Pro',   200000, 40500,  8, 324000, '/assets/product_image.jpg', true),
  (5, 'KMA5', 'Elite', 400000, 90000,  8, 720000, '/assets/product_image.jpg', true)
on conflict (no) do update
  set name          = excluded.name,
      tier          = excluded.tier,
      price         = excluded.price,
      daily         = excluded.daily,
      duration_days = excluded.duration_days,
      total         = excluded.total,
      image         = excluded.image,
      active        = excluded.active;

insert into public.km_milestone (invite_required, unlock_amount, extra_reward, sort)
values
  (8,   30000,  10000, 1),
  (28,  50000,  40000, 2),
  (68,  80000, 100000, 3),
  (128, 200000, 500000, 4)
on conflict (invite_required) do update
  set unlock_amount = excluded.unlock_amount,
      extra_reward  = excluded.extra_reward,
      sort          = excluded.sort;

insert into public.km_notice (id, title, body, kind, published)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'Welcome to KernelMiners',
    'Buy a mining pack once and receive a fixed payout every 24 hours for the pack duration. Earnings are credited automatically — no claim step.',
    'update',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'Two-level referral programme',
    'Earn 19% of every pack bought by people you invite, plus 1% of every pack bought by their invites. Commission is credited instantly on a successful purchase.',
    'promotion',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'Task center rewards',
    'Invite 8, 28, 68 or 128 friends on level 1 to unlock each milestone and claim an extra reward from the Task center.',
    'promotion',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    'Withdrawals and security PIN',
    'Withdrawals require your 4-digit security PIN. The minimum is 30,000 UGX and a 17% fee applies. Requests are reviewed before payout.',
    'system',
    true
  )
on conflict (id) do nothing;

commit;
