'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, SearchCheck } from 'lucide-react';
import { AdminHeader } from '@/components/admin/AdminShell';
import {
  Empty, Loading, Notice, Pager, Panel, SearchBox, Segmented, TableScroll, Td, Th, statusTone,
} from '@/components/admin/kit';
import { Badge, Button } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { useAsync } from '@/lib/useAsync';
import { adminApi } from '@/lib/admin';
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
  const notice = data && !data.ok ? data.message : null;

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
            options={FILTERS}
            value={filter}
            onChange={(next) => {
              setFilter(next);
              setOffset(0);
            }}
          />
          <SearchBox value={search} onChange={onSearch} placeholder="Search deposits" />
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
                      <span className="block truncate text-[10px] text-muted">@{row.username}</span>
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
