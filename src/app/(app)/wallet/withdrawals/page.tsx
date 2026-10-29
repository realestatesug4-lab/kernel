'use client';

import Link from 'next/link';
import { ArrowUpFromLine, Clock3 } from 'lucide-react';
import { InnerPage } from '@/components/layout/InnerPage';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';
import { fmtDateTime, fmtUGX } from '@/lib/format';
import { formatMsisdn } from '@/lib/msisdn';
import type { WithdrawalRequest } from '@/lib/types';

const TONE: Record<WithdrawalRequest['status'], 'warn' | 'accent' | 'pos' | 'neg'> = {
  pending: 'warn',
  approved: 'accent',
  paid: 'pos',
  failed: 'neg',
  rejected: 'neg',
};

export default function WithdrawalsPage() {
  const { data, loading } = useAsync<WithdrawalRequest[]>(() => api.wallet.withdrawals(), []);
  const list = data ?? [];
  const pending = list.filter((w) => w.status === 'pending' || w.status === 'approved');
  const pendingTotal = pending.reduce((s, w) => s + w.amount, 0);

  return (
    <InnerPage
      title="Withdraw history"
      right={
        <Link href="/wallet/withdraw" aria-label="New withdrawal">
          <ArrowUpFromLine className="size-5" />
        </Link>
      }
    >
      <div className="space-y-4">
        <Card className="flex items-center gap-3 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-2">
            <Clock3 className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-[11px] text-muted">Pending withdrawals</p>
            <p className="tnum text-lg font-extrabold text-accent-2">{fmtUGX(pendingTotal)} UGX</p>
          </div>
          <span className="text-[11px] text-muted">{pending.length} request(s)</span>
        </Card>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Spinner className="size-7" />
          </div>
        ) : list.length === 0 ? (
          <div className="space-y-3">
            <EmptyState title="No withdrawals yet" hint="Your withdrawal requests and their status appear here." />
            <Link href="/wallet/withdraw">
              <Button block>Request a withdrawal</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {list.map((w) => (
              <Card key={w.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="tnum text-lg font-extrabold">{fmtUGX(w.amount)} UGX</p>
                    <p className="text-[11px] text-muted">{fmtDateTime(w.created_at)}</p>
                  </div>
                  <Badge tone={TONE[w.status]}>{w.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-2">
                    <p className="text-muted">Fee</p>
                    <p className="tnum mt-0.5 font-semibold">{fmtUGX(w.fee)} UGX</p>
                  </div>
                  <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-2">
                    <p className="text-muted">Net payout</p>
                    <p className="tnum mt-0.5 font-semibold text-accent-2">{fmtUGX(w.net)} UGX</p>
                  </div>
                </div>
                <p className="mt-2 truncate text-[11px] text-muted">
                  To {formatMsisdn(w.destination)}
                  {w.reference ? ` · ${w.reference}` : ''}
                </p>
                {w.failure_reason && (
                  <p className="mt-1.5 rounded-lg border border-line bg-surface-2/60 px-2.5 py-1.5 text-[11px] text-neg">
                    {w.failure_reason} · refunded to your wallet
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}

        <p className="px-2 text-center text-[11px] leading-relaxed text-muted">
          Requests are approved by an admin before the mobile-money payout is sent. Pending amounts
          are held from your available balance and refunded automatically if the payout fails.
        </p>
      </div>
    </InnerPage>
  );
}
