'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, RefreshCw, Send, ShieldCheck, X } from 'lucide-react';
import { AdminHeader } from '@/components/admin/AdminShell';
import { Empty, Loading, Notice, Panel, Segmented, TableScroll, Td, Th, statusTone } from '@/components/admin/kit';
import { Badge, Button } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { adminPayments, type AdminWithdrawal } from '@/lib/payments';
import { useAsync } from '@/lib/useAsync';
import { fmtDateTime, fmtUGX } from '@/lib/format';
import { formatMsisdn } from '@/lib/msisdn';

type Filter = 'pending' | 'approved' | 'paid' | 'failed' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid', label: 'Paid' },
  { key: 'failed', label: 'Failed' },
  { key: 'all', label: 'All' },
];

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

  const awaiting = (rows ?? []).filter((row) => row.status === 'pending');
  const ready = (rows ?? []).filter((row) => row.status === 'approved');
  const sum = (list: AdminWithdrawal[]) => list.reduce((total, row) => total + row.amount, 0);

  /**
   * Two steps, deliberately: approve queues the request without touching the
   * gateway, release pushes it. A gateway failure refunds the member.
   */
  async function review(row: AdminWithdrawal, action: 'approve' | 'release' | 'reject') {
    let reason: string | undefined;

    if (action === 'approve') {
      const ok = window.confirm(
        `Approve ${fmtUGX(row.amount)} UGX for ${row.display_name ?? row.email ?? 'this member'}?\n\n` +
          'This only queues the request — no money moves until you send it.',
      );
      if (!ok) return;
    } else if (action === 'release') {
      const ok = window.confirm(
        `Send ${fmtUGX(row.net)} UGX to ${formatMsisdn(row.destination)}?\n\n` +
          `This pushes the payout through SHASHURA. Requested ${fmtUGX(row.amount)} UGX · fee ${fmtUGX(row.fee)} UGX.`,
      );
      if (!ok) return;
    } else {
      const input = window.prompt('Reason for rejecting this request', 'Rejected by admin');
      if (input === null) return;
      reason = input.trim() || 'Rejected by admin';
    }

    setBusyId(row.id);
    const res =
      action === 'approve'
        ? await adminPayments.approve(row.id)
        : action === 'release'
          ? await adminPayments.release(row.id)
          : await adminPayments.reject(row.id, reason);
    setBusyId(null);

    if (!res.ok) {
      toast.push(res.message, 'err');
      reload();
      return;
    }

    toast.push(
      action === 'approve'
        ? 'Approved — open the Approved tab when you are ready to send it.'
        : action === 'release'
          ? `Payout released to ${formatMsisdn(row.destination)}.`
          : 'Request rejected — the amount is back in the member’s wallet.',
      'ok',
    );
    reload();
  }

  return (
    <>
      <AdminHeader
        title="Payouts"
        description="Approve first, then send. Nothing reaches SHASHURA until an admin has approved the request."
        actions={
          <Button size="sm" variant="secondary" onClick={reload} icon={<RefreshCw className="size-3.5" />}>
            Refresh
          </Button>
        }
      />

      <div className="mb-3 flex items-start gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft">
          <ShieldCheck className="size-4 text-accent-2" />
        </span>
        <p className="text-[11px] leading-relaxed text-muted">
          <span className="font-semibold text-fg">Approve</span> only queues the request — the amount stays held.
          <span className="font-semibold text-fg"> Send</span> pushes the net amount through the gateway; a failed
          payout is refunded to the member automatically. Actions are limited to accounts in{' '}
          <code className="text-fg">ADMIN_EMAILS</code> or holding the <code className="text-fg">is_super_admin</code>{' '}
          flag.
        </p>
      </div>

      {(awaiting.length > 0 || ready.length > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {awaiting.length > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full border border-warn/30 bg-warn/10 px-3 py-1.5 text-[11px] font-semibold text-warn">
              {awaiting.length} awaiting approval
              <span className="tnum">{fmtUGX(sum(awaiting))} UGX</span>
            </span>
          )}
          {ready.length > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5 text-[11px] font-semibold text-accent-2">
              {ready.length} approved · ready to send
              <span className="tnum">{fmtUGX(sum(ready))} UGX</span>
            </span>
          )}
        </div>
      )}

      <Panel bodyClassName="p-3">
        <div className="mb-3">
          <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        </div>

        {loading && !rows ? (
          <Loading label="Loading the payout queue" />
        ) : notice ? (
          <Notice tone="neg">{notice}</Notice>
        ) : !rows?.length ? (
          <Empty
            title={filter === 'pending' ? 'Nothing to approve' : 'No requests here'}
            hint="Withdrawal requests appear the moment a member submits one."
          />
        ) : (
          <TableScroll>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th className="text-right">Requested</Th>
                <Th className="text-right">Net / fee</Th>
                <Th>Destination</Th>
                <Th>Reference</Th>
                <Th>Status</Th>
                <Th>Requested at</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const actionable = row.status === 'pending' || row.status === 'approved';
                return (
                  <tr key={row.id} className="hover:bg-surface-2/50">
                    <Td>
                      <span className="block truncate text-[12px] font-semibold text-fg">
                        {row.display_name ?? (row.username ? `@${row.username}` : (row.email ?? 'Unknown'))}
                      </span>
                      <span className="block truncate text-[10px] text-muted">
                        {row.username ? `@${row.username}` : row.email}
                        {row.phone ? ` · ${formatMsisdn(row.phone)}` : ''}
                      </span>
                    </Td>
                    <Td className="tnum text-right font-semibold">{fmtUGX(row.amount)}</Td>
                    <Td className="tnum text-right">
                      <span className="font-semibold text-fg">{fmtUGX(row.net)}</span>
                      <span className="block text-[10px] text-muted">fee {fmtUGX(row.fee)}</span>
                    </Td>
                    <Td className="tnum text-[11px]">{formatMsisdn(row.destination)}</Td>
                    <Td className="tnum text-[10px] text-muted">
                      {row.reference ?? '—'}
                      {row.provider_ref && <span className="block">tid {row.provider_ref}</span>}
                    </Td>
                    <Td>
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                      {row.approved_by && (
                        <span className="mt-1 block max-w-[160px] truncate text-[10px] text-muted" title={row.approved_by}>
                          by {row.approved_by}
                        </span>
                      )}
                      {row.failure_reason && (
                        <span className="mt-1 block max-w-[160px] truncate text-[10px] text-neg" title={row.failure_reason}>
                          {row.failure_reason}
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-[10px] text-muted">{fmtDateTime(row.created_at)}</Td>
                    <Td>
                      {actionable ? (
                        <div className="flex items-center justify-end gap-1.5">
                          {row.status === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => review(row, 'approve')}
                              disabled={busyId === row.id}
                              className="inline-flex h-7 items-center gap-1 rounded-lg bg-accent-soft px-2 text-[11px] font-bold text-accent-2 transition hover:bg-accent/20 disabled:opacity-50"
                            >
                              <Check className="size-3.5" />
                              Approve
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => review(row, 'release')}
                              disabled={busyId === row.id}
                              className="inline-flex h-7 items-center gap-1 rounded-lg bg-accent-soft px-2 text-[11px] font-bold text-accent-2 transition hover:bg-accent/20 disabled:opacity-50"
                            >
                              <Send className="size-3.5" />
                              Send
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => review(row, 'reject')}
                            disabled={busyId === row.id}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-[11px] font-semibold text-muted transition hover:border-neg/60 hover:text-neg disabled:opacity-50"
                          >
                            <X className="size-3.5" />
                            Reject
                          </button>
                        </div>
                      ) : (
                        row.user_id ? (
                          <Link
                            href={`/admin/members/${row.user_id}`}
                            className="block text-right text-[10px] text-muted hover:text-accent-2"
                          >
                            Member
                          </Link>
                        ) : null
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableScroll>
        )}
      </Panel>
    </>
  );
}
