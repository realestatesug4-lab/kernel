'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { ArrowUpRight, CheckCircle2, Clock3, RefreshCw } from 'lucide-react';
import { AppHeader } from '@/components/layout/TopBar';
import { Badge, Button, Card, EmptyState, ProgressBar, Spinner } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';
import { fmtDate, fmtUGX, progressPct, timeLeft } from '@/lib/format';
import type { Investment } from '@/lib/types';

const DAY = 86_400_000;

function nextCycleAt(inv: Investment): string | null {
  const start = new Date(inv.started_at).getTime();
  const end = new Date(inv.ends_at).getTime();
  const idx = Math.floor((Date.now() - start) / DAY) + 1;
  const at = start + idx * DAY;
  return at < end ? new Date(at).toISOString() : null;
}

export default function PortfolioPage() {
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const { data, loading, reload } = useAsync<Investment[]>(() => api.invest.list(), []);

  const all = data ?? [];
  const active = all.filter((i) => i.status === 'active');
  const completed = all.filter((i) => i.status === 'completed');
  const list = tab === 'active' ? active : completed;

  const invested = active.reduce((s, i) => s + i.amount, 0);
  const earned = all.reduce((s, i) => s + i.earned, 0);
  const expected = all.reduce((s, i) => s + i.daily * i.duration_days, 0);

  return (
    <>
      <AppHeader
        right={
          <button
            onClick={reload}
            aria-label="Refresh"
            className="grid size-9 place-items-center rounded-full hover:bg-surface-2"
          >
            <RefreshCw className={`size-4.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      <div className="space-y-4 px-4 pt-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Portfolio</h1>
          <p className="mt-0.5 text-xs text-muted">Live mining progress, credited at midnight every day.</p>
        </div>

        <Card className="grid grid-cols-3 divide-x divide-[var(--line)] p-0">
          <Summary label="In mining" value={fmtUGX(invested)} />
          <Summary label="Earned" value={fmtUGX(earned)} tone />
          <Summary label="Packs" value={`${active.length}/${all.length}`} />
        </Card>

        <div className="grid grid-cols-2 rounded-2xl bg-surface-2 p-1 text-sm font-semibold">
          <button
            onClick={() => setTab('active')}
            className={`h-9 rounded-xl transition ${tab === 'active' ? 'bg-surface text-fg shadow-[var(--shadow)]' : 'text-muted'}`}
          >
            Active ({active.length})
          </button>
          <button
            onClick={() => setTab('completed')}
            className={`h-9 rounded-xl transition ${tab === 'completed' ? 'bg-surface text-fg shadow-[var(--shadow)]' : 'text-muted'}`}
          >
            Completed ({completed.length})
          </button>
        </div>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Spinner className="size-7" />
          </div>
        ) : list.length === 0 ? (
          <div className="space-y-3">
            <EmptyState
              title={tab === 'active' ? 'No active mining yet' : 'Nothing completed yet'}
              hint={tab === 'active' ? 'Pick a pack and your first payout lands at the next midnight.' : 'Finished packs will appear here.'}
            />
            {tab === 'active' && (
              <Link href="/products">
                <Button block>Browse mining packs</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((inv) => (
              <InvestmentCard key={inv.id} inv={inv} />
            ))}
          </div>
        )}

        {expected > 0 && (
          <p className="px-2 text-center text-[11px] text-muted">
            Total projected returns across all packs: {fmtUGX(expected)} UGX
          </p>
        )}
      </div>
    </>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`tnum mt-0.5 truncate text-sm font-extrabold ${tone ? 'text-accent-2' : ''}`}>{value}</p>
    </div>
  );
}

function InvestmentCard({ inv }: { inv: Investment }) {
  const left = timeLeft(inv.ends_at);
  const next = nextCycleAt(inv);
  const nextLeft = next ? timeLeft(next) : null;
  const isActive = inv.status === 'active';

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-3 border-b border-line px-3.5 py-3">
        <div className="relative size-11 shrink-0 overflow-hidden rounded-xl">
          <Image src="/assets/product_image.jpg" alt={inv.product_name} fill sizes="44px" className="object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            #{inv.product_no} {inv.product_name}
          </p>
          <p className="tnum text-[11px] text-muted">
            {fmtUGX(inv.amount)} UGX · {inv.duration_days} days
          </p>
        </div>
        <Badge tone={isActive ? 'accent' : 'pos'}>
          {isActive ? 'Mining' : 'Completed'}
        </Badge>
      </div>

      <div className="space-y-2.5 px-3.5 py-3">
        <div className="flex items-center justify-between text-xs">
          <span className="tnum text-muted">
            Cycle {inv.paid_cycles}/{inv.duration_days}
          </span>
          <span className="tnum font-semibold text-accent-2">+{fmtUGX(inv.daily)} / day</span>
        </div>
        <ProgressBar value={isActive ? progressPct(inv.started_at, inv.ends_at) : 100} />

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-2">
            <p className="text-muted">Earned so far</p>
            <p className="tnum mt-0.5 text-sm font-bold">{fmtUGX(inv.earned)} UGX</p>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-2">
            <p className="text-muted">Total target</p>
            <p className="tnum mt-0.5 text-sm font-bold">{fmtUGX(inv.daily * inv.duration_days)} UGX</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted">
          {isActive && nextLeft && !nextLeft.done ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3.5 text-accent" />
              Next payout in {nextLeft.hours}h {nextLeft.minutes}m
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="size-3.5 text-pos" />
              All cycles settled
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            {left.done ? 'Ended' : `Ends ${fmtDate(inv.ends_at)}`}
            <ArrowUpRight className="size-3" />
          </span>
        </div>
      </div>
    </Card>
  );
}
