'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Banknote, Check, RefreshCw, Send, X, Zap } from 'lucide-react';
import { AdminHeader } from '@/components/admin/AdminShell';
import { Empty, Loading, Notice, Panel, Segmented, TableScroll, Td, Th, statusTone } from '@/components/admin/kit';
import { Badge, Button } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { adminPayments, type AdminWithdrawal, type PayoutMethod } from '@/lib/payments';
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

const methodLabel = (method: PayoutMethod | null | undefined) =>
  method === 'api' ? 'SHASHURA API' : method === 'manual' ? 'Manual' : null;

export default function AdminWithdrawalsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  // Approving now requires a payout method: the modal collects that decision.
  const [methodRow, setMethodRow] = useState<AdminWithdrawal | null>(null);

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
   * Approve picks the payout method: `api` pushes the disbursement through
   * SHASHURA in the same call; `manual` queues the request until the admin —
   * after sending the money by hand — confirms it with `settle`.
   */
  async function review(row: AdminWithdrawal, action: 'approve' | 'release' | 'settle' | 'reject', method?: PayoutMethod) {
    let reason: string | undefined;

    if (action === 'release') {
      const ok = window.confirm(
        `Retry sending ${fmtUGX(row.net)} UGX to ${formatMsisdn(row.destination)}?\n\n` +
          `This pushes the payout through SHASHURA. Requested ${fmtUGX(row.amount)} UGX · fee ${fmtUGX(row.fee)} UGX.`,
      );
      if (!ok) return;
    } else if (action === 'settle') {
      const ok = window.confirm(
        `Confirm you have sent ${fmtUGX(row.net)} UGX to ${formatMsisdn(row.destination)} by yourself?\n\n` +
          'The request will be marked as paid. This cannot be undone.',
      );
      if (!ok) return;
    } else if (action === 'reject') {
      const input = window.prompt('Reason for rejecting this request', 'Rejected by admin');
      if (input === null) return;
      reason = input.trim() || 'Rejected by admin';
    }

    setBusyId(row.id);
    const res =
      action === 'approve'
        ? await adminPayments.approve(row.id, method!)
        : action === 'release'
          ? await adminPayments.release(row.id)
          : action === 'settle'
            ? await adminPayments.settleManual(row.id)
            : await adminPayments.reject(row.id, reason);
    setBusyId(null);
    setMethodRow(null);

    if (!res.ok) {
      toast.push(res.message, 'err');
      reload();
      return;
    }

    if (action === 'approve' && method === 'manual') {
      toast.push('Approved as a manual payout — open the Approved tab to confirm it once sent.', 'ok');
    } else if (action === 'approve' || action === 'release') {
      toast.push(
        res.data?.status === 'paid'
          ? `Payout of ${fmtUGX(row.net)} UGX sent via SHASHURA to ${formatMsisdn(row.destination)}.`
          : `Payout submitted to SHASHURA — it settles when the network confirms.`,
        'ok',
      );
    } else if (action === 'settle') {
      toast.push(`Marked as paid — manual payout to ${formatMsisdn(row.destination)} closed.`, 'ok');
    } else {
      toast.push('Request rejected — the amount is back in the member’s wallet.', 'ok');
    }
    reload();
  }

  return (
    <>
      <AdminHeader
        title="Payouts"
        description="Approve and pick the method: SHASHURA API pays automatically, manual stays with you until you confirm the transfer."
        actions={
          <Button size="sm" variant="secondary" onClick={reload} icon={<RefreshCw className="size-3.5" />}>
            Refresh
          </Button>
        }
      />

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
              {ready.length} approved · awaiting payout
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
                const manualQueue = row.status === 'approved' && row.payout_method === 'manual';
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
                      {methodLabel(row.payout_method) && (
                        <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
                          {methodLabel(row.payout_method)}
                        </span>
                      )}
                      {row.approved_by && (
                        <span className="mt-1 block max-w-[160px] truncate text-[10px] text-muted" title={row.approved_by}>
                          by {row.approved_by}
                        </span>
                      )}
                      {row.paid_by && (
                        <span className="mt-1 block max-w-[160px] truncate text-[10px] text-muted" title={row.paid_by}>
                          paid by {row.paid_by}
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
                              onClick={() => setMethodRow(row)}
                              disabled={busyId === row.id}
                              className="inline-flex h-7 items-center gap-1 rounded-lg bg-accent-soft px-2 text-[11px] font-bold text-accent-2 transition hover:bg-accent/20 disabled:opacity-50"
                            >
                              <Check className="size-3.5" />
                              Approve
                            </button>
                          ) : manualQueue ? (
                            <button
                              type="button"
                              onClick={() => review(row, 'settle')}
                              disabled={busyId === row.id}
                              className="inline-flex h-7 items-center gap-1 rounded-lg bg-accent-soft px-2 text-[11px] font-bold text-accent-2 transition hover:bg-accent/20 disabled:opacity-50"
                            >
                              <Banknote className="size-3.5" />
                              Mark paid
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

      {methodRow && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose payout method"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setMethodRow(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Payout method</div>
            <h3 className="text-[15px] font-bold text-fg">
              Approve {fmtUGX(methodRow.amount)} UGX for{' '}
              {methodRow.display_name ?? methodRow.username ?? methodRow.email ?? 'this member'}
            </h3>
            <p className="mt-1 text-[11px] text-muted">
              Net {fmtUGX(methodRow.net)} UGX · fee {fmtUGX(methodRow.fee)} UGX · to {formatMsisdn(methodRow.destination)}
            </p>

            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={() => review(methodRow, 'approve', 'api')}
                disabled={busyId === methodRow.id}
                className="flex w-full items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3.5 text-left transition hover:border-accent/50 hover:bg-accent-soft disabled:opacity-50"
              >
                <Zap className="mt-0.5 size-5 shrink-0 text-accent-2" />
                <span>
                  <span className="block text-[13px] font-bold text-fg">SHASHURA API — pay automatically</span>
                  <span className="block text-[11px] leading-relaxed text-muted">
                    The payout is sent to {formatMsisdn(methodRow.destination)} through the gateway right now. If the
                    network refuses, the amount is refunded to the member.
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => review(methodRow, 'approve', 'manual')}
                disabled={busyId === methodRow.id}
                className="flex w-full items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3.5 text-left transition hover:border-accent/50 hover:bg-accent-soft disabled:opacity-50"
              >
                <Banknote className="mt-0.5 size-5 shrink-0 text-accent-2" />
                <span>
                  <span className="block text-[13px] font-bold text-fg">Manual — I will send the money</span>
                  <span className="block text-[11px] leading-relaxed text-muted">
                    Only queues the request. You transfer {fmtUGX(methodRow.net)} UGX by hand, then press “Mark paid”
                    in the Approved tab to close it.
                  </span>
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMethodRow(null)}
              disabled={busyId === methodRow.id}
              className="mt-3 w-full rounded-xl py-2 text-center text-[12px] font-semibold text-muted transition hover:text-fg disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
