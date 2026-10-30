'use client';

import Link from 'next/link';
import {
  ArrowUpFromLine, BadgeCheck, ChevronRight, CircleHelp, FileText, Languages, LogOut, Pickaxe,
  ShieldCheck, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/TopBar';
import { Card, Spinner } from '@/components/ui';
import { useSession } from '@/components/providers/SessionProvider';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';
import { fmtDate, fmtUGX } from '@/lib/format';
import { formatMsisdn } from '@/lib/msisdn';
import type { Dashboard } from '@/lib/types';

const LINKS = [
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/portfolio', label: 'My portfolio', icon: Pickaxe },
  { href: '/income', label: 'Income', icon: TrendingUp },
  { href: '/team', label: 'My team', icon: Users },
  { href: '/wallet/ledger', label: 'Transaction history', icon: FileText },
  { href: '/wallet/withdrawals', label: 'Withdraw history', icon: ArrowUpFromLine },
  { href: '/settings/security', label: 'Security', icon: ShieldCheck },
  { href: '/settings/language', label: 'Language', icon: Languages },
  { href: '/notice', label: 'Notices', icon: FileText },
  { href: '/help', label: 'Help center', icon: CircleHelp },
];

export default function MePage() {
  const { signOut } = useSession();
  const { data, loading } = useAsync<Dashboard | null>(
    () => api.account.dashboard().then((r) => (r.ok ? r.data : null)),
    [],
  );
  // The queue itself is guarded server-side; this only keeps the entry point out
  // of the way of members who cannot use it.
  const { data: isAdmin } = useAsync<boolean>(
    () => api.account.isSuperAdmin().then((r) => r.ok && r.data === true),
    [],
  );

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner className="size-7" />
      </div>
    );
  }

  const account = data?.account;
  const balance = data?.balance;

  return (
    <>
      <AppHeader
        right={
          isAdmin === true ? (
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1.5 text-[11px] font-bold text-accent-2"
            >
              <BadgeCheck className="size-3.5" />
              Console
            </Link>
          ) : undefined
        }
      />
      <div className="space-y-4 px-4 pt-4">
        <Card className="relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-12 -top-16 size-40 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl brand-gradient text-xl font-extrabold text-black">
              {(account?.display_name ?? account?.username ?? 'K').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold">{account?.display_name ?? 'KernelMiner'}</p>
              <p className="truncate text-xs text-muted">
                {account?.username ? `@${account.username}` : '—'}
                {account?.phone ? ` · ${formatMsisdn(account.phone)}` : ''}
              </p>
              <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-accent-2">
                {account?.referral_code ?? '—'}
              </p>
            </div>
          </div>

          <div className="relative mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-xl border border-line bg-surface-2/70 px-2 py-2">
              <p className="text-muted">Available</p>
              <p className="tnum mt-0.5 font-bold">{fmtUGX(balance?.available ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2/70 px-2 py-2">
              <p className="text-muted">In mining</p>
              <p className="tnum mt-0.5 font-bold">{fmtUGX(balance?.invested ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2/70 px-2 py-2">
              <p className="text-muted">Earned</p>
              <p className="tnum mt-0.5 font-bold text-accent-2">{fmtUGX(balance?.earned_total ?? 0)}</p>
            </div>
          </div>

          {account?.created_at && (
            <p className="relative mt-3 text-[11px] text-muted">Member since {fmtDate(account.created_at)}</p>
          )}
        </Card>

        <Card className="divide-y divide-[var(--line)] p-0">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
              <l.icon className="size-4.5 text-accent-2" />
              <span className="flex-1 text-sm font-medium">{l.label}</span>
              <ChevronRight className="size-4 text-muted" />
            </Link>
          ))}
        </Card>

        <button
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-3.5 text-sm font-semibold text-neg hover:bg-surface-2"
        >
          <LogOut className="size-4" />
          Sign out
        </button>

      </div>
    </>
  );
}
