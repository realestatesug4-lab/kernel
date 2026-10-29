'use client';

import { useMemo, useState } from 'react';
import { InnerPage } from '@/components/layout/InnerPage';
import { Card, EmptyState, Spinner } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';
import { fmtDateTime, fmtSigned, ledgerLabel } from '@/lib/format';
import type { LedgerEntry } from '@/lib/types';

const FILTERS = {
  all: { label: 'All', kinds: null as string[] | null },
  earnings: { label: 'Earnings', kinds: ['daily_reward', 'commission_l1', 'commission_l2', 'task_reward', 'bonus'] },
  wallet: { label: 'Wallet', kinds: ['deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'investment'] },
};

type FilterKey = keyof typeof FILTERS;

export default function LedgerPage() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const { data, loading } = useAsync<LedgerEntry[]>(() => api.wallet.ledger(200), []);

  const rows = useMemo(() => {
    const kinds = FILTERS[filter].kinds;
    return (data ?? []).filter((e) => !kinds || kinds.includes(e.kind));
  }, [data, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of rows) {
      const key = new Date(e.created_at).toDateString();
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [rows]);

  return (
    <InnerPage title="Transaction history">
      <div className="space-y-4">
        <div className="grid grid-cols-3 rounded-2xl bg-surface-2 p-1 text-sm font-semibold">
          {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`h-9 rounded-xl transition ${filter === k ? 'bg-surface text-fg shadow-[var(--shadow)]' : 'text-muted'}`}
            >
              {FILTERS[k].label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Spinner className="size-7" />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState title="Nothing here yet" hint="Earnings, commissions and wallet movements appear here." />
        ) : (
          groups.map(([day, entries]) => (
            <section key={day}>
              <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{day}</h2>
              <Card className="divide-y divide-[var(--line)] p-0">
                {entries.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{ledgerLabel(e.kind)}</p>
                      <p className="truncate text-[11px] text-muted">
                        {e.memo ? `${e.memo} · ` : ''}{fmtDateTime(e.created_at)}
                      </p>
                    </div>
                    <p className={`tnum shrink-0 text-sm font-bold ${e.amount >= 0 ? 'text-pos' : 'text-fg'}`}>
                      {fmtSigned(e.amount)}
                    </p>
                  </div>
                ))}
              </Card>
            </section>
          ))
        )}
      </div>
    </InnerPage>
  );
}
