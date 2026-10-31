'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Check, RefreshCw, SearchCheck } from 'lucide-react';
import { AdminHeader } from '@/components/admin/AdminShell';
import {
  Empty, Loading, Notice, Pager, Panel, SearchBox, Segmented, TableScroll, Td, Th, statusTone,
} from '@/components/admin/kit';
import { Badge, Button } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { useAsync } from '@/lib/useAsync';
import { adminApi, type AdminDepositRow } from '@/lib/admin';
import { fmtDateTime, fmtUGX } from '@/lib/format';
import { formatMsisdn } from '@/lib/msisdn';

type Filter = 'all' | 'confirmed' | 'pending' | 'failed';

const PAGE_SIZE = 60;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed', label: 'Failed' },
];

export default function AdminDepositsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [reconciling, setReconciling] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Deposits closed during this visit keep their tick even before the refetch
  // lands, so the button never jumps back to "Confirm".
  const [confirmedIds, setConfirmedIds] = useState<Record<string, boolean>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function onSearch(next: string) {
    setSearch(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setQuery(next.trim());
      setOffset(0);
    }, 300);
  }

  const { data, loading, reload } = useAsync(
    () => adminApi.deposits.list({ status: filter, search: query, limit: PAGE_SIZE, offset }),
    [filter, query, offset],
  );

  const page = data?.ok ? data.data : null;
  const rows = page?.rows ?? [];
  const stats = page?.stats ?? null;
  const notice = data && !data.ok ? data.message : null;

  const filterOptions = FILTERS.map((option) => ({
    ...option,
    count: stats
      ? option.key === 'all'
        ? stats.confirmed.count + stats.pending.count + stats.failed.count
        : stats[option.key].count
      : undefined,
  }));

  /**
   * Manual deposit confirmation — the deposit twin of a manual payout. The
   * admin has seen the money at the operator (the gateway callback never came,
   * or a collection was marked failed wrongly); the SQL credits the wallet and
   * writes the ledger row while flipping the status, so this is safe to retry.
   */
  async function confirmDeposit(row: AdminDepositRow) {
    const ok = window.confirm(
      `Confirm this deposit of ${fmtUGX(row.amount)} UGX has actually arrived?\n\n` +
        `The member @${row.username ?? 'unknown'} is credited ${fmtUGX(row.amount)} UGX immediately — ` +
        'use this only when you have verified the money at the operator.\n\n' +
        `Reference: ${row.reference ?? '—'} · ${row.msisdn ? formatMsisdn(row.msisdn) : 'no number captured'}` +
        (row.status === 'failed' ? '\n\nThis collection is currently marked failed.' : ''),
    );
    if (!ok) return;

    setBusyId(row.id);
    const res = await adminApi.deposits.confirm(row.id);
    setBusyId(null);

    if (!res.ok) {
      toast.push(res.message, 'err');
      reload();
      return;
    }
    setConfirmedIds((prev) => ({ ...prev, [row.id]: true }));
    toast.push(
      res.data?.credited
        ? `Deposit confirmed — ${fmtUGX(row.amount)} UGX credited to @${row.username ?? 'member'}.`
        : `Deposit ${row.reference ?? ''} was already confirmed — nothing was credited again.`,
      'ok',
    );
    reload();
  }

  /**
   * Recovery for lost SHASHURA callbacks: the gateway is asked directly about
   * every stuck collection (and pushed payout) older than the grace window,
   * and its answer is replayed through the normal settlement. Idempotent.
   */
  async function reconcile() {
    setReconciling(true);
    const res = await adminApi.deposits.reconcile();
    setReconciling(false);

    if (!res.ok) {
      toast.push(res.message, 'err');
      return;
    }
    const report = res.data;
    if (report.skipped) {
      toast.push('The payment gateway is not configured on this server, so there is nothing to reconcile.', 'info');
    } else if (report.checked === 0) {
      toast.push('Nothing is stuck — every open transaction is younger than the grace window or already closed.', 'info');
    } else {
      toast.push(
        `Checked ${report.checked} stuck transaction${report.checked === 1 ? '' : 's'}: ` +
          `${report.resolved.length} settled, ${report.pending.length} still open at the gateway` +
          `${report.errors.length ? `, ${report.errors.length} gateway errors` : ''}.`,
        report.resolved.length ? 'ok' : 'info',
      );
    }
    reload();
  }

  return (
    <>
      <AdminHeader
        title="Deposits"
        description={
          page
            ? `${fmtUGX(page.total)} collection${page.total === 1 ? '' : 's'} · search by member, reference or number`
            : 'Every mobile-money top-up.'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={reconcile} loading={reconciling} icon={<SearchCheck className="size-3.5" />}>
              Reconcile
            </Button>
            <Button size="sm" variant="secondary" onClick={reload} icon={<RefreshCw className="size-3.5" />}>
              Refresh
            </Button>
          </div>
        }
      />

      <Panel bodyClassName="p-3">
        <div className="mb-3 space-y-2">
          <Segmented
            options={filterOptions}
            value={filter}
            onChange={(next) => {
              setFilter(next);
              setOffset(0);
            }}
          />
          <SearchBox value={search} onChange={onSearch} placeholder="Search deposits" />
          {stats && (
            <div className="flex flex-wrap items-center gap-2">
              <StatChip label="Confirmed" count={stats.confirmed.count} total={stats.confirmed.total} tone="pos" />
              <StatChip label="Pending" count={stats.pending.count} total={stats.pending.total} tone="warn" />
              <StatChip label="Failed" count={stats.failed.count} total={stats.failed.total} tone="neg" />
            </div>
          )}
        </div>

        {loading && !page ? (
          <Loading label="Loading deposits" />
        ) : notice ? (
          <Notice tone="neg">{notice}</Notice>
        ) : rows.length === 0 ? (
          <Empty
            title="No deposits here"
            hint="Collections appear the moment a member starts a mobile-money top-up."
          />
        ) : (
          <>
            <TableScroll>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th>Reference</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                  <Th>From</Th>
                  <Th>Created</Th>
                  <Th>Confirmed</Th>
                  <Th className="text-right">Review</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-2/50">
                    <Td>
                      <Link
                        href={`/admin/members/${row.user_id}`}
                        className="block truncate text-[12px] font-semibold text-fg hover:text-accent-2"
                      >
                        {row.display_name ?? `@${row.username ?? 'unknown'}`}
                      </Link>
                      {row.username && (
                        <span className="block truncate text-[10px] text-muted">@{row.username}</span>
                      )}
                    </Td>
                    <Td className="tnum text-[11px]">{row.reference ?? '—'}</Td>
                    <Td className="tnum text-right font-semibold">{fmtUGX(row.amount)}</Td>
                    <Td>
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    </Td>
                    <Td className="tnum text-[11px]">{row.msisdn ? formatMsisdn(row.msisdn) : '—'}</Td>
                    <Td className="whitespace-nowrap text-[10px] text-muted">{fmtDateTime(row.created_at)}</Td>
                    <Td className="whitespace-nowrap text-[10px] text-muted">
                      {row.confirmed_at ? fmtDateTime(row.confirmed_at) : '—'}
                      {row.confirmed_by && (
                        <span className="block max-w-[160px] truncate" title={row.confirmed_by}>
                          by {row.confirmed_by}
                        </span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <ConfirmCell
                        label={row.reference ?? 'deposit'}
                        confirmed={row.status === 'confirmed' || Boolean(confirmedIds[row.id])}
                        busy={busyId === row.id}
                        onConfirm={() => confirmDeposit(row)}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>

            {page && <Pager total={page.total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />}
          </>
        )}
      </Panel>
    </>
  );
}

/** One number in the status breakdown: how many collections, how much money. */
function StatChip({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: 'pos' | 'warn' | 'neg';
}) {
  const tones: Record<typeof tone, string> = {
    pos: 'border-pos/30 bg-pos/10 text-pos',
    warn: 'border-warn/30 bg-warn/10 text-warn',
    neg: 'border-neg/30 bg-neg/10 text-neg',
  };
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${tones[tone]}`}
    >
      {label}
      <span className="tnum">{count}</span>
      <span className="tnum font-normal opacity-75">{fmtUGX(total)} UGX</span>
    </span>
  );
}

/**
 * The admin's confirmation control. It sits as a wide "Confirm" pill, collapses
 * to a circle while the request is in flight, and then settles as a green tick —
 * the same shape end to end, so the row never jumps while the list refetches.
 */
function ConfirmCell({
  label,
  confirmed,
  busy,
  onConfirm,
}: {
  label: string;
  confirmed: boolean;
  busy: boolean;
  onConfirm: () => void;
}) {
  if (confirmed) {
    return (
      <span
        title="Deposit confirmed"
        className="inline-flex size-7 items-center justify-center rounded-full bg-pos/10 text-pos ring-1 ring-pos/30"
      >
        <Check className="animate-pop size-4" strokeWidth={3} aria-hidden />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onConfirm}
      disabled={busy}
      aria-label={`Confirm deposit ${label}`}
      className={`inline-flex h-7 items-center justify-center overflow-hidden rounded-full border font-bold transition-all duration-300 ease-out disabled:cursor-wait ${
        busy
          ? 'w-7 border-pos/40 bg-pos/10 text-pos'
          : 'w-[86px] gap-1.5 border-accent/40 bg-accent-soft text-[11px] text-accent-2 hover:w-[94px] hover:border-accent/70'
      }`}
    >
      {busy ? (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <>
          <Check className="size-3.5" aria-hidden />
          <span className="whitespace-nowrap">Confirm</span>
        </>
      )}
    </button>
  );
}
