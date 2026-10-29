'use client';

import { useState } from 'react';
import { Check, ShieldCheck, Smartphone, X } from 'lucide-react';
import { InnerPage } from '@/components/layout/InnerPage';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { adminPayments, type AdminWithdrawal } from '@/lib/payments';
import { useAsync } from '@/lib/useAsync';
import { fmtDateTime, fmtUGX } from '@/lib/format';
import { formatMsisdn } from '@/lib/msisdn';

type Filter = 'pending' | 'approved' | 'paid' | 'rejected' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid', label: 'Paid' },
  { key: 'rejected', label: 'Failed' },
  { key: 'all', label: 'All' },
];

const TONE: Record<AdminWithdrawal['status'], 'warn' | 'accent' | 'pos' | 'neg'> = {
  pending: 'warn',
  approved: 'accent',
  paid: 'pos',
  failed: 'neg',
  rejected: 'neg',
};

export default function AdminWithdrawalsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  // The loader tags its result with the filter so a tab switch never shows the
  // previous tab's rows while the new request is in flight.
  const { data, loading, reload } = useAsync(
    async () => ({ filter, result: await adminPayments.withdrawals(filter) }),
    [filter],
  );

  const current = data && data.filter === filter ? data.result : null;
  const rows = current?.ok ? current.data : null;
  const notice = current && !current.ok ? current.message : null;

  async function review(row: AdminWithdrawal, action: 'approve' | 'reject') {
    let reason: string | undefined;

    if (action === 'approve') {
      const ok = window.confirm(
        `Release ${fmtUGX(row.net)} UGX to ${formatMsisdn(row.destination)}?\n\n` +
          `Requested: ${fmtUGX(row.amount)} UGX · fee ${fmtUGX(row.fee)} UGX`,
      );
      if (!ok) return;
    } else {
      const input = window.prompt('Reason for rejecting this request', 'Rejected by admin');
      if (input === null) return;
      reason = input.trim() || 'Rejected by admin';
    }

    setBusyId(row.id);
    const res =
      action === 'approve' ? await adminPayments.approve(row.id) : await adminPayments.reject(row.id, reason);
    setBusyId(null);

    if (!res.ok) {
      toast.push(res.message, 'err');
      reload();
      return;
    }

    toast.push(
      action === 'approve'
        ? `Payout released to ${formatMsisdn(row.destination)}.`
        : 'Request rejected — the amount is back in the member’s wallet.',
      'ok',
    );
    reload();
  }

  const pendingTotal = (rows ?? [])
    .filter((r) => r.status === 'pending')
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <InnerPage title="Payout queue">
      <Card className="flex items-start gap-3 p-4">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft">
          <ShieldCheck className="size-4 text-accent-2" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold">Admin approval required</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            Approving sends the payout from the merchant wallet through SHASHURA. A failed payout is
            refunded to the member automatically. Only accounts in <code>ADMIN_EMAILS</code> can act here.
          </p>
        </div>
      </Card>

      <div className="mt-4 flex items-center gap-1 rounded-2xl border border-line bg-surface-2/60 p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`h-8 flex-1 rounded-xl text-[11px] font-semibold transition ${
              filter === f.key ? 'bg-surface text-fg shadow-[var(--shadow)]' : 'text-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {pendingTotal > 0 && (
        <Card className="mt-3 flex items-center justify-between px-4 py-3">
          <span className="text-xs text-muted">Awaiting release</span>
          <span className="tnum text-sm font-extrabold text-accent-2">{fmtUGX(pendingTotal)} UGX</span>
        </Card>
      )}

      <div className="mt-3 space-y-2">
        {loading && !rows?.length ? (
          <div className="grid min-h-[30vh] place-items-center">
            <Spinner className="size-6" />
          </div>
        ) : notice ? (
          <Card className="p-4 text-xs leading-relaxed text-muted">{notice}</Card>
        ) : !rows?.length ? (
          <EmptyState
            title={filter === 'pending' ? 'Nothing to release' : 'No requests here'}
            hint="Withdrawal requests appear the moment a member submits one."
          />
        ) : (
          rows.map((row) => (
            <Card key={row.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="tnum text-base font-extrabold">{fmtUGX(row.amount)} UGX</p>
                  <p className="truncate text-[11px] text-muted">
                    {row.email ?? row.referral_code} · {row.referral_code}
                  </p>
                </div>
                <Badge tone={TONE[row.status]}>{row.status}</Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <div className="flex items-center gap-1.5 text-muted">
                  <Smartphone className="size-3.5" />
                  <span className="tnum font-semibold text-fg">{formatMsisdn(row.destination)}</span>
                </div>
                <div className="text-right text-muted">
                  Net <span className="tnum font-semibold text-fg">{fmtUGX(row.net)}</span> · fee{' '}
                  <span className="tnum">{fmtUGX(row.fee)}</span>
                </div>
                <div className="text-muted">
                  Ref <span className="tnum text-fg">{row.reference ?? '—'}</span>
                </div>
                <div className="text-right text-muted">{fmtDateTime(row.created_at)}</div>
              </div>

              {row.failure_reason && (
                <p className="mt-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-[11px] text-neg">
                  {row.failure_reason}
                </p>
              )}

              {(row.status === 'pending' || row.status === 'approved') && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    onClick={() => review(row, 'approve')}
                    loading={busyId === row.id}
                    icon={<Check className="size-4" />}
                  >
                    Approve &amp; pay
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => review(row, 'reject')}
                    disabled={busyId === row.id}
                    icon={<X className="size-4" />}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </InnerPage>
  );
}
