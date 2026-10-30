'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AdminHeader } from '@/components/admin/AdminShell';
import {
  Empty, Loading, Notice, Pager, Panel, SearchBox, TableScroll, Td, Th,
} from '@/components/admin/kit';
import { Button } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { adminApi } from '@/lib/admin';
import { fmtDateTime, fmtSigned, fmtUGX, ledgerLabel } from '@/lib/format';

const PAGE_SIZE = 80;

const KINDS = [
  'all', 'deposit', 'investment', 'daily_reward', 'commission_l1', 'commission_l2',
  'task_reward', 'investment_return', 'withdrawal', 'withdrawal_refund',
  'transfer_in', 'transfer_out', 'bonus',
];

export default function AdminLedgerPage() {
  const [kind, setKind] = useState('all');
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
    () => adminApi.ledger.list({ kind, search: query, limit: PAGE_SIZE, offset }),
    [kind, query, offset],
  );

  const page = data?.ok ? data.data : null;
  const rows = page?.rows ?? [];
  const notice = data && !data.ok ? data.message : null;

  const credits = rows.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
  const debits = rows.filter((row) => row.amount < 0).reduce((sum, row) => sum + row.amount, 0);

  return (
    <>
      <AdminHeader
        title="Ledger"
        description={
          page ? `${fmtUGX(page.total)} entr${page.total === 1 ? 'y' : 'ies'} across every wallet` : 'The full money trail.'
        }
        actions={
          <Button size="sm" variant="secondary" onClick={reload} icon={<RefreshCw className="size-3.5" />}>
            Refresh
          </Button>
        }
      />

      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-card border border-line bg-surface px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Credits on view</p>
          <p className="tnum mt-1 text-base font-extrabold text-pos">+{fmtUGX(credits)}</p>
        </div>
        <div className="rounded-card border border-line bg-surface px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Debits on view</p>
          <p className="tnum mt-1 text-base font-extrabold text-neg">{fmtSigned(debits)}</p>
        </div>
      </div>

      <Panel bodyClassName="p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SearchBox value={search} onChange={onSearch} placeholder="Search member or memo" />
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setOffset(0);
            }}
            className="h-9 rounded-xl border border-line bg-surface-2 px-2.5 text-[12px] font-semibold text-fg outline-none focus:border-accent"
          >
            {KINDS.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'All movement' : ledgerLabel(option)}
              </option>
            ))}
          </select>
        </div>

        {loading && !page ? (
          <Loading label="Loading ledger" />
        ) : notice ? (
          <Notice tone="neg">{notice}</Notice>
        ) : rows.length === 0 ? (
          <Empty title="Nothing on this view" hint="Ledger entries appear as members transact." />
        ) : (
          <>
            <TableScroll>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th>Kind</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Memo</Th>
                  <Th>When</Th>
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
                        {row.display_name ?? `@${row.username}`}
                      </Link>
                      <span className="block truncate text-[10px] text-muted">@{row.username}</span>
                    </Td>
                    <Td className="whitespace-nowrap text-[11px]">{ledgerLabel(row.kind)}</Td>
                    <Td
                      className={`tnum text-right font-semibold ${
                        row.amount >= 0 ? 'text-pos' : 'text-neg'
                      }`}
                    >
                      {fmtSigned(row.amount)}
                    </Td>
                    <Td className="max-w-[280px] truncate text-[11px] text-muted">{row.memo ?? '—'}</Td>
                    <Td className="whitespace-nowrap text-[10px] text-muted">{fmtDateTime(row.created_at)}</Td>
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
