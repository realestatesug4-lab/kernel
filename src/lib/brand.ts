/**
 * KernelMiners — brand, protocol rules and seed data.
 *
 * Single source of truth for the product catalogue, task milestones,
 * referral commissions and copy. Mirrored by the SQL in `supabase/migrations`.
 */

export const brand = {
  name: 'KernelMiners',
  short: 'Kernel',
  logo: '/assets/logo.jpg',
  productImage: '/assets/product_image.jpg',
  tagline: 'Invest Today · Earn Daily · Grow Together',
  description:
    'KernelMiners lets you invest in daily-earning mining packs, track your returns in real time, and grow a referral network that pays two levels deep.',
  version: 'V1.0',
  supportEmail: 'support@kernelminers.local',
  legal: {
    riskNotice:
      'Earnings are not guaranteed and depend on programme terms and eligibility. Invest wisely. Digital assets carry risk.',
  },
} as const;

export const rules = {
  currency: { code: 'UGX', decimals: 0, name: 'Ugandan Shilling' },
  /** Percent of an investment paid to each referral level, on successful invest. */
  referral: { level1: 19, level2: 1 },
  minDeposit: 30_000,
  maxDeposit: 2_000_000,
  minWithdrawal: 30_000,
  withdrawalFeePct: 1,
  /** Earnings credit once per 24h cycle measured from the investment timestamp. */
  cycleHours: 24,
  depositStatus:
    'Deposits are collected through SHASHURA mobile money. Approve the prompt on your phone and your balance is credited the moment the network confirms.',
} as const;

/** The five mining packs from the earnings table. */
export type SeedProduct = {
  no: number;
  name: string;
  tier: string;
  price: number;
  daily: number;
  duration: number;
  total: number;
};

export const products: SeedProduct[] = [
  { no: 1, name: 'KMA1', tier: 'Entry', price: 30_000, daily: 8_000, duration: 6, total: 48_000 },
  { no: 2, name: 'KMA2', tier: 'Growth', price: 50_000, daily: 10_000, duration: 8, total: 80_000 },
  { no: 3, name: 'KMA3', tier: 'Growth', price: 80_000, daily: 15_000, duration: 10, total: 150_000 },
  { no: 4, name: 'KMA4', tier: 'Pro', price: 200_000, daily: 40_500, duration: 8, total: 324_000 },
  { no: 5, name: 'KMA5', tier: 'Elite', price: 400_000, daily: 90_000, duration: 8, total: 720_000 },
];

/** Invite milestones from the task-center poster. */
export type SeedMilestone = { invite: number; unlock: number; extra: number };

export const milestones: SeedMilestone[] = [
  { invite: 8, unlock: 30_000, extra: 10_000 },
  { invite: 28, unlock: 50_000, extra: 40_000 },
  { invite: 68, unlock: 80_000, extra: 100_000 },
  { invite: 128, unlock: 200_000, extra: 500_000 },
];

export const nav = {
  tabs: [
    { href: '/home', label: 'Home', icon: 'home' },
    { href: '/products', label: 'Strategy', icon: 'pick' },
    { href: '/portfolio', label: 'Portfolio', icon: 'chart' },
    { href: '/team', label: 'Team', icon: 'users' },
    { href: '/me', label: 'Me', icon: 'user' },
  ],
} as const;

export const copy = {
  login: { subtitle: 'Sign in to your mining account', noAccount: 'New to KernelMiners?' },
  register: {
    title: 'Create account',
    subtitle: 'Start mining in under a minute',
    inviteLabel: 'Referral code',
    inviteHint: 'Auto-filled from your invite link',
    pinLabel: 'Security PIN',
    pinHint: '4 digits, used to authorise withdrawals',
    haveAccount: 'Already registered?',
  },
  about: {
    how: [
      {
        title: 'Deposit or stake crypto',
        body: 'You put supported cryptocurrency into a staking or restaking protocol.',
      },
      {
        title: 'Help secure blockchain services',
        body: 'Your assets can contribute to the security of supported services.',
      },
      {
        title: 'Potentially earn rewards',
        body: 'You may receive rewards for participating, depending on the protocol and conditions.',
      },
      {
        title: 'Understand the risks',
        body: 'You could lose money because of cryptocurrency price changes, smart-contract problems, or penalties associated with restaking. Rewards are not guaranteed.',
      },
    ],
    highlights: [
      'Five daily-earning mining packs (KMA1–KMA5)',
      'Returns credited every 24 hours',
      'Two-level referral programme',
      'Withdraw any time, 24/7',
      'Live portfolio tracking',
    ],
    facts: [
      `Minimum deposit: ${new Intl.NumberFormat('en-US').format(rules.minDeposit)} ${rules.currency.code}`,
      `Minimum withdrawal: ${new Intl.NumberFormat('en-US').format(rules.minWithdrawal)} ${rules.currency.code}`,
      `Withdrawal fee: ${rules.withdrawalFeePct}%`,
      `Referral commission: ${rules.referral.level1}% (level 1) + ${rules.referral.level2}% (level 2)`,
      'Withdrawal service: 24/7',
    ],
  },
} as const;
