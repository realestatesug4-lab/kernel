'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Coins, Gift, TrendingUp, Users } from 'lucide-react';
import { InnerPage } from '@/components/layout/InnerPage';
import { Card, EmptyState, Spinner } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';
import { fmtDateTime, fmtSigned, fmtUGX, ledgerLabel } from '@/lib/format';
import type { Dashboard, LedgerEntry } from '@/lib/types';

const EARN_KINDS = ['daily_reward', 'commission_l1', 'commission_l2', 'task_reward', 'bonus'];

const TABS = {
  all: { label: 'All income', kinds: EARN_KINDS },
  daily: { label: 'Daily', kinds: ['daily_reward'] },
  referral: { label: 'Referral', kinds: ['commission_l1', 'commission_l2'] },
  tasks: { label: 'Rewards', kinds: ['task_reward', 'bonus'] },
};

type TabKey = keyof typeof TABS;

export default function IncomePage() {
  const [tab, setTab] = useState<TabKey>('all');
  const { data: dash, loading: dashLoading } = useAsync<Dashboard | null>(
    () => api.account.dashboard().then((r) => (r.ok ? r.data : null)),
    [],
  );
  const { data: ledger, loading } = useAsync<LedgerEntry[]>(() => api.wallet.ledger(200), []);

  const income = useMemo(
    () => (ledger ?? []).filter((e) => EARN_KINDS.includes(e.kind)),
    [ledger],
  );

  const total = (kinds: string[]) =>
    income.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + e.amount, 0);

  const rows = income.filter((e) => TABS[tab].kinds.includes(e.kind));
  const earned = dash?.balance.earned_total ?? total(EARN_KINDS);

  if (dashLoading) {
    return (
      <InnerPage title="Income">
        <div className="grid min-h-[50vh] place-items-center">
          <Spinner className="size-7" />
        </div>
      </InnerPage>
    );
  }

  return (
    <InnerPage title="Income">
      <div className="space-y-4">
        <Card className="relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-14 -top-16 size-44 rounded-full bg-accent/25 blur-3xl" />
          <div className="relative">
            <p className="text-xs font-medium uppercase tracking-widest text-muted">Total income</p>
            <p className="tnum mt-1 text-[34px] font-extrabold leading-none">
              <span className="mr-1 text-sm font-bold text-accent-2">UGX</span>
              {fmtUGX(earned)}
            </p>
            <p className="mt-1.5 text-[11px] text-muted">
              Today: <span className="tnum font-bold text-accent-2">{fmtUGX(dash?.stats.today_earned ?? 0)} UGX</span>
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Bucket icon={<TrendingUp className="size-4" />} label="Daily earnings" value={total(['daily_reward'])} />
          <Bucket icon={<Users className="size-4" />} label="Level 1 commission" value={total(['commission_l1'])} />
          <Bucket icon={<Users className="size-4" />} label="Level 2 commission" value={total(['commission_l2'])} />
          <Bucket icon={<Gift className="size-4" />} label="Task rewards" value={total(['task_reward', 'bonus'])} />
        </div>

        <div className="grid grid-cols-4 rounded-2xl bg-surface-2 p-1 text-[11px] font-semibold">
          {(Object.keys(TABS) as TabKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`h-9 rounded-xl px-1 transition ${tab === k ? 'bg-surface text-fg shadow-[var(--shadow)]' : 'text-muted'}`}
            >
              {TABS[k].label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid place-items-center py-14">
            <Spinner className="size-6" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No income yet"
            hint="Daily pack earnings and referral commissions land here at midnight every day."
          />
        ) : (
          <Card className="divide-y divide-[var(--line)] p-0">
            {rows.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-2">
                  <Coins className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{ledgerLabel(e.kind)}</p>
                  <p className="truncate text-[11px] text-muted">
                    {e.memo ? `${e.memo} · ` : ''}{fmtDateTime(e.created_at)}
                  </p>
                </div>
                <p className="tnum shrink-0 text-sm font-bold text-pos">{fmtSigned(e.amount)}</p>
              </div>
            ))}
          </Card>
        )}

        <Link href="/wallet/ledger" className="block text-center text-xs font-semibold text-accent-2">
          View full transaction history
        </Link>
      </div>
    </InnerPage>
  );
}

function Bucket({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-2 text-accent-2">
        {icon}
        <span className="text-[11px] text-muted">{label}</span>
      </div>
      <p className="tnum mt-1 text-base font-extrabold">{fmtUGX(value)} UGX</p>
    </Card>
  );
}
