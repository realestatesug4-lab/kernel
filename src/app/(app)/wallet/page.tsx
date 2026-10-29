'use client';

import Link from 'next/link';
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ChevronRight, History,
} from 'lucide-react';
import { InnerPage } from '@/components/layout/InnerPage';
import { Card, EmptyState, Spinner } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';
import { fmtDateTime, fmtSigned, fmtUGX, ledgerLabel } from '@/lib/format';
import { rules } from '@/lib/brand';
import type { Dashboard, LedgerEntry } from '@/lib/types';

export default function WalletPage() {
  const { data, loading } = useAsync<Dashboard | null>(
    () => api.account.dashboard().then((r) => (r.ok ? r.data : null)),
    [],
  );
  const { data: ledger } = useAsync<LedgerEntry[]>(() => api.wallet.ledger(6), []);

  if (loading) {
    return (
      <InnerPage title="Wallet">
        <div className="grid min-h-[50vh] place-items-center">
          <Spinner className="size-7" />
        </div>
      </InnerPage>
    );
  }
  if (!data) return <InnerPage title="Wallet"><EmptyState title="Could not load wallet" /></InnerPage>;

  const { balance } = data;

  return (
    <InnerPage title="Wallet" right={<Link href="/wallet/ledger" aria-label="History"><History className="size-5" /></Link>}>
      <div className="space-y-4">
        <Card className="relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-14 -top-16 size-44 rounded-full bg-accent/25 blur-3xl" />
          <div className="relative">
            <p className="text-xs font-medium uppercase tracking-widest text-muted">Available balance</p>
            <p className="tnum mt-1 text-[34px] font-extrabold leading-none">
              <span className="mr-1 text-sm font-bold text-accent-2">UGX</span>
              {fmtUGX(balance.available)}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
              <div className="rounded-xl border border-line bg-surface-2/70 px-2.5 py-2">
                <p className="text-muted">In mining</p>
                <p className="tnum mt-0.5 font-bold">{fmtUGX(balance.invested)}</p>
              </div>
              <div className="rounded-xl border border-line bg-surface-2/70 px-2.5 py-2">
                <p className="text-muted">Earned</p>
                <p className="tnum mt-0.5 font-bold text-accent-2">{fmtUGX(balance.earned_total)}</p>
              </div>
              <div className="rounded-xl border border-line bg-surface-2/70 px-2.5 py-2">
                <p className="text-muted">Pending</p>
                <p className="tnum mt-0.5 font-bold">{fmtUGX(balance.pending_withdrawal)}</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2.5">
          <Action href="/wallet/deposit" icon={<ArrowDownToLine className="size-5" />} label="Deposit" hint="Add funds" />
          <Action href="/wallet/withdraw" icon={<ArrowUpFromLine className="size-5" />} label="Withdraw" hint="Cash out" />
          <Action href="/wallet/transfer" icon={<ArrowLeftRight className="size-5" />} label="Transfer" hint="Send to a member" />
          <Action href="/wallet/ledger" icon={<History className="size-5" />} label="History" hint="All transactions" />
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold">Recent activity</h2>
            <Link href="/wallet/ledger" className="inline-flex items-center gap-0.5 text-xs font-medium text-accent-2">
              All <ChevronRight className="size-3.5" />
            </Link>
          </div>
          <Card className="divide-y divide-[var(--line)] p-0">
            {(ledger ?? []).length === 0 ? (
              <div className="p-3">
                <EmptyState title="No transactions yet" hint="Your deposits, earnings and commissions show here." />
              </div>
            ) : (
              (ledger ?? []).map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{ledgerLabel(e.kind)}</p>
                    <p className="truncate text-[11px] text-muted">
                      {e.memo ? `${e.memo} · ` : ''}{fmtDateTime(e.created_at)}
                    </p>
                  </div>
                  <p className={`tnum shrink-0 text-sm font-bold ${e.amount >= 0 ? 'text-pos' : 'text-fg'}`}>
                    {fmtSigned(e.amount)}
                  </p>
                </div>
              ))
            )}
          </Card>
        </section>

        <p className="px-2 text-center text-[11px] leading-relaxed text-muted">
          Minimum deposit {fmtUGX(rules.minDeposit)} {rules.currency.code} · minimum withdrawal{' '}
          {fmtUGX(rules.minWithdrawal)} {rules.currency.code} · {rules.withdrawalFeePct}% fee.
        </p>
      </div>
    </InnerPage>
  );
}

function Action({ href, icon, label, hint }: { href: string; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <Link href={href}>
      <Card className="flex items-center gap-3 p-3.5 transition hover:border-accent/40">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-2">{icon}</span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{label}</span>
          <span className="block truncate text-[11px] text-muted">{hint}</span>
        </span>
      </Card>
    </Link>
  );
}
