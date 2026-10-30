'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AdminHeader } from '@/components/admin/AdminShell';
import {
  Empty, Loading, Notice, Pager, Panel, SearchBox, Segmented, TableScroll, Td, Th, statusTone,
} from '@/components/admin/kit';
import { Badge, Button } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { adminApi } from '@/lib/admin';
import { fmtDate, fmtUGX } from '@/lib/format';

type Filter = 'active' | 'completed' | 'all';

const PAGE_SIZE = 60;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'Running' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
];

export default function AdminInvestmentsPage() {
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
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
    () => adminApi.investments.list({ status: filter, search: query, limit: PAGE_SIZE, offset }),
    [filter, query, offset],
  );

  const page = data?.ok ? data.data : null;
  const rows = page?.rows ?? [];
  const notice = data && !data.ok ? data.message : null;

  const principal = rows.reduce((sum, row) => sum + row.amount, 0);
  const obligation = rows.filter((row) => row.status === 'active').reduce((sum, row) => sum + row.daily, 0);

  return (
    <>
      <AdminHeader
        title="Mining"
        description={
          page
            ? `${fmtUGX(page.total)} pack${page.total === 1 ? '' : 's'} on this view`
            : 'Packs in circulation and what they owe at midnight.'
        }
        actions={
          <Button size="sm" variant="secondary" onClick={reload} icon={<RefreshCw className="size-3.5" />}>
            Refresh
          </Button>
        }
      />

      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-card border border-line bg-surface px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Principal on view</p>
          <p className="tnum mt-1 text-base font-extrabold text-fg">{fmtUGX(principal)} UGX</p>
        </div>
        <div className="rounded-card border border-line bg-surface px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Daily obligation</p>
          <p className="tnum mt-1 text-base font-extrabold text-accent-2">{fmtUGX(obligation)} UGX</p>
        </div>
      </div>

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
          <SearchBox value={search} onChange={onSearch} placeholder="Search by member or pack" />
        </div>

        {loading && !page ? (
          <Loading label="Loading packs" />
        ) : notice ? (
          <Notice tone="neg">{notice}</Notice>
        ) : rows.length === 0 ? (
          <Empty title="No packs on this view" hint="Packs appear here as soon as a member buys one." />
        ) : (
          <>
            <TableScroll>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th>Pack</Th>
                  <Th className="text-right">Paid</Th>
                  <Th className="text-right">Daily</Th>
                  <Th className="text-right">Cycles</Th>
                  <Th className="text-right">Earned</Th>
                  <Th>Status</Th>
                  <Th>Started</Th>
                  <Th>Ends</Th>
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
                    <Td className="font-semibold">{row.product_name}</Td>
                    <Td className="tnum text-right">{fmtUGX(row.amount)}</Td>
                    <Td className="tnum text-right text-accent-2">{fmtUGX(row.daily)}</Td>
                    <Td className="tnum text-right">
                      {row.paid_cycles}/{row.duration_days}
                    </Td>
                    <Td className="tnum text-right font-semibold">{fmtUGX(row.earned)}</Td>
                    <Td>
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-[10px] text-muted">{fmtDate(row.started_at)}</Td>
                    <Td className="whitespace-nowrap text-[10px] text-muted">{fmtDate(row.ends_at)}</Td>
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
