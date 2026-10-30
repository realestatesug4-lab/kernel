'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { AdminHeader } from '@/components/admin/AdminShell';
import {
  Empty, Loading, Notice, Pager, Panel, SearchBox, TableScroll, Td, Th,
} from '@/components/admin/kit';
import { Badge, Button } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { adminApi, type AdminMemberRow } from '@/lib/admin';
import { fmtDate, fmtUGX } from '@/lib/format';
import { formatMsisdn } from '@/lib/msisdn';

const PAGE_SIZE = 40;

const SORTS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'invested', label: 'Most invested' },
  { key: 'earned', label: 'Top earners' },
  { key: 'balance', label: 'Largest balance' },
];

export default function AdminMembersPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
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
    () => adminApi.members.list({ search: query, sort, limit: PAGE_SIZE, offset }),
    [query, sort, offset],
  );

  const page = data?.ok ? data.data : null;
  const rows: AdminMemberRow[] = page?.rows ?? [];
  const notice = data && !data.ok ? data.message : null;

  return (
    <>
      <AdminHeader
        title="Members"
        description={
          page
            ? `${fmtUGX(page.total)} account${page.total === 1 ? '' : 's'} · search by username, phone, email or referral code`
            : 'Every account, with balances and network size.'
        }
        actions={
          <Button size="sm" variant="secondary" onClick={reload} icon={<RefreshCw className="size-3.5" />}>
            Refresh
          </Button>
        }
      />

      <Panel bodyClassName="p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SearchBox value={search} onChange={onSearch} placeholder="Search members" />
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setOffset(0);
            }}
            className="h-9 rounded-xl border border-line bg-surface-2 px-2.5 text-[12px] font-semibold text-fg outline-none focus:border-accent"
          >
            {SORTS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {loading && !page ? (
          <Loading label="Loading members" />
        ) : notice ? (
          <Notice tone="neg">{notice}</Notice>
        ) : rows.length === 0 ? (
          <Empty
            title={query ? 'No members match that search' : 'No members yet'}
            hint={query ? 'Try a username, phone number or referral code.' : undefined}
          />
        ) : (
          <>
            <TableScroll>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th>Contact</Th>
                  <Th className="text-right">Available</Th>
                  <Th className="text-right">Invested</Th>
                  <Th className="text-right">Earned</Th>
                  <Th className="text-right">Packs</Th>
                  <Th className="text-right">Team</Th>
                  <Th>Joined</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="group hover:bg-surface-2/50">
                    <Td>
                      <Link href={`/admin/members/${row.id}`} className="flex items-center gap-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-[10px] font-bold uppercase text-accent-2">
                          {(row.display_name ?? row.username).slice(0, 2)}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[12px] font-semibold text-fg">
                              {row.display_name ?? `@${row.username}`}
                            </span>
                            {row.is_super_admin && <Badge tone="accent">admin</Badge>}
                          </span>
                          <span className="block truncate text-[10px] text-muted">@{row.username}</span>
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      <span className="tnum block text-[11px] text-fg">
                        {row.phone ? formatMsisdn(row.phone) : '—'}
                      </span>
                      <span className="block max-w-[170px] truncate text-[10px] text-muted">
                        {row.referral_code}
                        {!row.has_pin && ' · no PIN'}
                      </span>
                    </Td>
                    <Td className="tnum text-right font-semibold">{fmtUGX(row.available)}</Td>
                    <Td className="tnum text-right text-muted">{fmtUGX(row.invested)}</Td>
                    <Td className="tnum text-right text-accent-2">{fmtUGX(row.earned)}</Td>
                    <Td className="tnum text-right">
                      {row.active_packs}
                      <span className="text-muted">/{row.total_packs}</span>
                    </Td>
                    <Td className="tnum text-right text-muted">
                      {row.invite_l1}
                      <span className="text-[10px]"> + {row.invite_l2}</span>
                    </Td>
                    <Td className="whitespace-nowrap text-[10px] text-muted">{fmtDate(row.created_at)}</Td>
                    <Td className="text-right">
                      <Link
                        href={`/admin/members/${row.id}`}
                        aria-label={`Open ${row.username}`}
                        className="inline-grid size-6 place-items-center rounded-lg text-muted transition group-hover:text-accent-2"
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>

            {page && (
              <Pager total={page.total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
            )}
          </>
        )}
      </Panel>
    </>
  );
}
