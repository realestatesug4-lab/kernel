import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicShell } from '@/components/layout/PublicShell';
import { SupportLinks } from '@/components/SupportLinks';
import { Card } from '@/components/ui';
import { brand, rules } from '@/lib/brand';
import { fmtUGX } from '@/lib/format';

export const metadata: Metadata = { title: 'Help center' };

const FAQ = [
  {
    q: 'When do I start earning?',
    a: 'Daily earnings are released at midnight East Africa Time, every day. A pack bought in the afternoon pays out the same night, and each following night adds one more cycle until the pack duration ends. The payout clock is the server clock, not your device clock.',
  },
  {
    q: 'Do I get my investment back at the end?',
    a: 'The total earnings shown on each pack already include the principal. You receive the daily amount for the full duration, and the pack completes automatically after the final cycle.',
  },
  {
    q: 'How are referrals paid?',
    a: `You earn ${rules.referral.level1}% of every pack bought by people you invited (level 1) and ${rules.referral.level2}% of every pack bought by their invites (level 2). Commission is credited instantly to your available balance on each successful purchase.`,
  },
  {
    q: 'How do I invite friends?',
    a: 'Open My team or Task center, copy your invite link and share it. The link carries your code so it is filled in automatically when your friend opens the registration page.',
  },
  {
    q: 'What are the task rewards?',
    a: `Reach 8, 28, 68 or 128 level-1 invites to unlock each milestone. Every milestone pays an extra reward you can claim once from the Task center, and task commission is capped at ${fmtUGX(rules.taskCommissionCap)} ${rules.currency.code} per member.`,
  },
  {
    q: 'Is there a welcome bonus?',
    a: `Yes. Every new account starts with a ${fmtUGX(rules.welcomeBonus)} ${rules.currency.code} welcome bonus, credited to your available balance as soon as the account is created.`,
  },
  {
    q: 'What is the minimum deposit and withdrawal?',
    a: `Minimum deposit is ${fmtUGX(rules.minDeposit)} ${rules.currency.code} and minimum withdrawal is ${fmtUGX(rules.minWithdrawal)} ${rules.currency.code}, with a ${rules.withdrawalFeePct}% withdrawal fee.`,
  },
  {
    q: 'Why does a withdrawal need my PIN?',
    a: 'A 4-digit security PIN authorises withdrawals and transfers. You choose it the first time you withdraw or send a transfer, and you can change it any time in Settings → Security.',
  },
  {
    q: 'Can I invest in several packs at once?',
    a: 'Yes. Packs run independently and each has its own midnight payout cycle and progress bar in your portfolio.',
  },
];

export default function HelpPage() {
  return (
    <PublicShell>
      <div className="space-y-4">
        <div className="py-4">
          <h1 className="text-xl font-extrabold tracking-tight">Help center</h1>
          <p className="mt-1 text-xs text-muted">Answers to the questions we get most often.</p>
        </div>

        <Card className="divide-y divide-[var(--line)] p-0">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
                <span className="flex items-start justify-between gap-3">
                  {item.q}
                  <span className="text-accent-2 transition group-open:rotate-45">+</span>
                </span>
              </summary>
              <p className="mt-2 text-xs leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </Card>

        {/* Telegram chat + group, set by an admin in the console. */}
        <SupportLinks />

        <div className="flex justify-center gap-4 py-3 text-xs">
          <Link href="/about" className="text-accent-2">About</Link>
          <Link href="/notice" className="text-accent-2">Notices</Link>
          <Link href="/login" className="text-accent-2">Sign in</Link>
        </div>

        <p className="px-2 pb-4 text-center text-[11px] leading-relaxed text-muted">{brand.legal.riskNotice}</p>
      </div>
    </PublicShell>
  );
}
